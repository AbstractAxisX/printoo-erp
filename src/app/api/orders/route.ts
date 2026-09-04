import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toISO } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import {
  boardScopeWhere,
  orderScopeWhere,
  requireManager,
  validateAssigneeForModule,
} from "@/lib/access";
import {
  computeTotals,
  itemsFromOrderItems,
  isPerItemInvoice,
  type PreInvoiceItem,
} from "@/lib/pre-invoice";
import { aggregateStatus } from "@/lib/order-flow";
import { nextNumber, ensureCounters } from "@/lib/counter";
import { jsonError } from "@/lib/api-error";

type ItemDraft = {
  productId: string;
  quantity: number;
  pricePerUnit: number;
  totalAmount: number;
  note?: string | null;
  description?: string | null;
  stage: string;
  needsMaterial?: boolean;
  // Phase 10: تاریخ‌های per-item (خواستهٔ ۳: «تاریخ طراحی و چاپ برای هر
  // ایتم مجزا ثبت شه») — fallback به moduleDates مشترک (compat).
  designStartDate?: string | null;
  designEndDate?: string | null;
  printStartDate?: string | null;
  printEndDate?: string | null;
  // ─── Phase 13: مجری اختصاصی همین آیتم ──
  // «هر ایتم جدا کارمند بهش تنظیم شه» — طراح/چاپ این آیتم specifically.
  designAssigneeId?: string | null;
  printAssigneeId?: string | null;
};

type ModuleDates = {
  design?: { start?: string | null; end?: string | null };
  print?: { start?: string | null; end?: string | null };
};

type CreateBody = {
  customers: string[];
  itemsByCustomer: Record<string, ItemDraft[]>;
  splitMode: "grouped" | "separated";
  priority: "normal" | "urgent";
  endDate?: string | null;
  noEndDate?: boolean;
  note?: string | null;
  moduleDates?: ModuleDates;
  // Phase 11: پیش‌فاکتور «همیشگی» است — همیشه با سفارش ساخته می‌شود.
  // پارامترهای مالی اختیاری‌اند (پیش‌فرض صفر/۱۵ روز) و پس از ثبت از
  // صفحهٔ موفقیت قابل ویرایش/چاپ‌اند. فاکتور دیگر از ویزارد صادر نمی‌شود
  // (هر زمان کارفرما بخواهد، از تب فاکتور/آیکون جدول).
  preInvoice?: {
    discountAmount?: number;
    taxRate?: number;
    paidAmount?: number;
    validDays?: number;
    notes?: string | null;
    terms?: string | null;
  } | null;
  markCompleted?: boolean;
  createdBy?: string | null;
  // Phase 13: فال‌بک آیتم‌های بدون مجری صریح — هر آیتم مجری خودش را
  // می‌تواند بفرستد (ItemDraft.designAssigneeId / printAssigneeId).
  assignedDesignerId?: string | null;
  assignedPrinterId?: string | null;
};

// ─── R3 fix: atomic Counter upsert (replaces aggregate _max + 1) ───────────
// شماره‌گذاری و ترمیم شمارنده در lib/counter متمرکز شده است —
// nextNumber اتمیک است و حتی با شمارندهٔ خراب هرگز شمارهٔ تکراری نمی‌دهد
// (عکس‌العمل به باگ «خطا در ساخت سفارش» در دیتابیس‌های محلی ناهمگام).

export async function GET(req: NextRequest) {
  // Defense-in-depth: proxy.ts gates by cookie presence; requireUser verifies
  // the HMAC signature. Returns 401 NextResponse if invalid.
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const customerId = searchParams.get("customerId");
  const productId = searchParams.get("productId");
  const priority = searchParams.get("priority");
  const search = searchParams.get("search") || "";
  const excludeArchived = searchParams.get("excludeArchived") === "true";
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const amountMin = searchParams.get("amountMin");
  const amountMax = searchParams.get("amountMax");

  const where: Prisma.OrderWhereInput = {};
  if (status) where.status = status;
  if (customerId) where.customerId = customerId;
  if (excludeArchived) where.status = { not: "archived" };
  if (priority) where.priority = priority;
  if (productId) where.items = { some: { productId } };
  if (search) {
    where.OR = [
      { customer: { name: { contains: search } } },
      { customer: { phone: { contains: search } } },
    ];
  }
  if (dateFrom || dateTo) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (dateFrom) createdAt.gte = new Date(dateFrom);
    if (dateTo) createdAt.lte = new Date(dateTo);
    where.createdAt = createdAt;
  }
  if (amountMin || amountMax) {
    const totalAmount: Prisma.FloatFilter = {};
    if (amountMin) totalAmount.gte = Number(amountMin);
    if (amountMax) totalAmount.lte = Number(amountMax);
    where.totalAmount = totalAmount;
  }

  // ─── Phase 12: implicit board scoping ──
  // برای غیرمدیرها (طراح/چاپ بدون ماژول admin): سفارش فقط اگر «مال او»
  // باشد (تخصیص/تکمیل) یا در استخر عمومیِ مرحله‌ای باشد که ماژولش را دارد.
  // مدیر (master/admin) همه‌چیز را می‌بیند — بدون تغییر رفتار پنل مدیریت.
  // ─── Phase 13: board param ──
  // board=designer|print → اسکوپ «همان برد» حتی برای مدیر داخلی:
  // در برد طراحی فقط آیتم‌های طراحیِ خودت می‌آید (مستر همه را می‌بیند).
  // این ریشهٔ «هر دو طراح سفارش را می‌دیدند» را می‌بندد.
  const board = searchParams.get("board");
  let scoped: Prisma.OrderWhereInput;
  if (board === "designer" || board === "print") {
    const bscope = boardScopeWhere(user, board);
    scoped = { AND: [where, bscope] };
  } else {
    const scope = orderScopeWhere(user);
    scoped = scope ? { AND: [where, scope] } : where;
  }

  const orders = await db.order.findMany({
    where: scoped,
    orderBy: { createdAt: "desc" },
    include: {
      customer: true,
      items: { include: { product: true } },
      _count: { select: { items: true } },
    },
  });
  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  // Phase 12: ثبت سفارش = عملیات مدیریتی (ویزارد در پنل ادمین است).
  const user = await requireManager();
  if (user instanceof NextResponse) return user;

  // R3: شمارنده‌ها قبل از تراکنش ترمیم/سید می‌شوند (idempotent)
  await ensureCounters();

  try {
    const body = (await req.json()) as CreateBody;
    const {
      customers,
      itemsByCustomer,
      splitMode,
      priority,
      endDate,
      noEndDate,
      note,
      moduleDates,
      preInvoice,
      markCompleted,
      assignedDesignerId,
      assignedPrinterId,
    } = body;

    if (!customers?.length) {
      return NextResponse.json(
        { error: "حداقل یک مشتری انتخاب کنید" },
        { status: 400 }
      );
    }

    // Validate every customer has items
    for (const cid of customers) {
      const items = itemsByCustomer[cid];
      if (!items || items.length === 0) {
        return NextResponse.json(
          { error: "هر مشتری باید حداقل یک آیتم سفارش داشته باشد" },
          { status: 400 }
        );
      }
    }

    // ─── FK guards (رفع P2003 «Foreign key constraint violated») ───────
    // ریشهٔ خطای 500 در ساخت سفارش: productId خالی/نامعتبر در یکی از آیتم‌ها
    // یا مشتری‌ای که ID‌اش در دیتابیس نیست (صفحهٔ باز + reseed دیتابیس).
    // قبل از تراکنش اعتبارسنجی می‌شوند تا به‌جای کرش Prisma، 400 فارسی
    // و قابل‌اقدام برگردد.
    const foundCustomers = await db.customer.findMany({
      where: { id: { in: customers } },
      select: { id: true, name: true },
    });
    const foundCustomerIds = new Set(foundCustomers.map((c) => c.id));
    if (foundCustomerIds.size !== customers.length) {
      return NextResponse.json(
        {
          error:
            "مشتری انتخاب‌شده در سیستم موجود نیست (داده‌ها تغییر کرده‌اند) — صفحه را رفرش کنید و مشتری را دوباره انتخاب کنید.",
        },
        { status: 400 }
      );
    }

    const allDrafts = customers.flatMap((cid) =>
      (itemsByCustomer[cid] ?? []).map((it, i) => ({ cid, i, it }))
    );
    const productIds = Array.from(
      new Set(
        allDrafts
          .map(({ it }) => it.productId)
          .filter((p): p is string => typeof p === "string" && p.length > 0)
      )
    );
    const foundProducts = productIds.length
      ? await db.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true },
        })
      : [];
    const foundProductIds = new Set(foundProducts.map((p) => p.id));
    const badItem = allDrafts.find(
      ({ it }) => !it.productId || !foundProductIds.has(it.productId)
    );
    if (badItem) {
      const custName =
        foundCustomers.find((c) => c.id === badItem.cid)?.name ?? badItem.cid;
      return NextResponse.json(
        {
          error: `محصول آیتم ${badItem.i + 1} برای مشتری «${custName}» انتخاب نشده است — در مرحلهٔ «آیتم‌های سفارش» محصول آن ردیف را انتخاب کنید.`,
        },
        { status: 400 }
      );
    }

    // ─── Phase 13: اعتبارسنجی مجری‌های per-item + سطح سفارش ──────
    // «هر آیتم مجری خودش را دارد» — همهٔ مجری‌ها باید: موجود + فعال +
    // دارندهٔ ماژول مربوطه باشند (صرفه‌جویی: فقط شناسه‌های یکتا چک می‌شوند).
    const itemDesignerIds = Array.from(
      new Set(
        allDrafts
          .map(({ it }) => it.designAssigneeId)
          .filter((v): v is string => typeof v === "string" && v.length > 0)
      )
    );
    for (const uid of itemDesignerIds) {
      const check = await validateAssigneeForModule(uid, "designer");
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    }
    const itemPrinterIds = Array.from(
      new Set(
        allDrafts
          .map(({ it }) => it.printAssigneeId)
          .filter((v): v is string => typeof v === "string" && v.length > 0)
      )
    );
    for (const uid of itemPrinterIds) {
      const check = await validateAssigneeForModule(uid, "print");
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    }
    const designerCheck = await validateAssigneeForModule(assignedDesignerId, "designer");
    if (!designerCheck.ok) {
      return NextResponse.json({ error: designerCheck.error }, { status: 400 });
    }
    const printerCheck = await validateAssigneeForModule(assignedPrinterId, "print");
    if (!printerCheck.ok) {
      return NextResponse.json({ error: printerCheck.error }, { status: 400 });
    }
    const assignDesignerId =
      assignedDesignerId && designerCheck.user.id ? designerCheck.user.id : null;
    const assignPrinterId =
      assignedPrinterId && printerCheck.user.id ? printerCheck.user.id : null;

    // Phase 13: مجری سطح-سفارش وقتی نفرستاده شده از آیتم‌ها مشتق می‌شود
    // (نمایش در لیست‌ها + فال‌بک آیتم‌های بی‌مسئول). مسیر روتینگ per-item است.
    const firstItemDesignerId =
      allDrafts.find(({ it }) => it.designAssigneeId)?.it.designAssigneeId ?? null;
    const firstItemPrinterId =
      allDrafts.find(({ it }) => it.printAssigneeId)?.it.printAssigneeId ?? null;
    const finalDesignerId = assignDesignerId ?? firstItemDesignerId;
    const finalPrinterId = assignPrinterId ?? firstItemPrinterId;

    // ─── R4 fix: atomic all-or-nothing via a single transaction ──────────
    // Pre-Phase-3, if createPreInvoice/createInvoice failed AFTER order.create,
    // the order was orphaned (paidAmount never bumped, invoice missing).
    // Now the entire creation (order + pre-invoices + paidAmount bump)
    // happens inside one Prisma transaction → any failure rolls back
    // everything. nextNumber also runs inside tx → R3 race fixed.
    const created = await db.$transaction(async (tx) => {
      const result: { id: string; number: number; customerId: string }[] = [];
      // Phase 11: همهٔ پیش‌فاکتورهای صادرشده با متادیتای کامل — صفحهٔ
      // موفقیت با همین لیست مدیریت per-item/per-customer/گروهی را می‌سازد.
      const preInvoices: {
        id: string;
        number: number;
        orderId: string;
        orderNumber: number;
        customerId: string;
        customerName: string;
        itemId: string | null;
        itemLabel: string;
        totalAmount: number;
      }[] = [];
      // Phase 10: شمارش کل پیش‌فاکتورهای صادرشده + کنترل تخصیص پیش‌پرداخت
      // (پیش‌پرداخت فقط روی «اولین» سند این ثبت اعمال می‌شود — نه به‌ازای هر سند).
      let prepaidAssigned = false;
      // قرارداد Phase 10: مجزا یا چند-مشتری → پیش‌فاکتور per-item؛
      // گروهیِ تک-مشتری → یک پیش‌فاکتور برای کل گروه.
      const perItemPI = isPerItemInvoice(splitMode, customers.length);
      // نام مشتری‌ها برای پاسخ (از tx)
      const customerNames = new Map<string, string>();
      for (const cid of customers) {
        const c = await tx.customer.findUnique({
          where: { id: cid },
          select: { name: true },
        });
        if (c) customerNames.set(cid, c.name);
      }

      for (const customerId of customers) {
        const items = itemsByCustomer[customerId] || [];
        const md = moduleDates ?? {};
        // تاریخ per-item با fallback به moduleDates مشترک (compat) +
        // Phase 13: مجری per-item با fallback به مجری سفارش
        const itemDates = (it: ItemDraft) => ({
          designStartDate: toISO(it.designStartDate ?? md.design?.start),
          designEndDate: toISO(it.designEndDate ?? md.design?.end),
          printStartDate: toISO(it.printStartDate ?? md.print?.start),
          printEndDate: toISO(it.printEndDate ?? md.print?.end),
          designAssigneeId: it.designAssigneeId ?? finalDesignerId,
          printAssigneeId: it.printAssigneeId ?? finalPrinterId,
        });

        if (splitMode === "grouped") {
          // single order with all items
          const num = await nextNumber(tx, "order");
          const total = items.reduce(
            (s, i) => s + (i.totalAmount || i.quantity * i.pricePerUnit),
            0
          );
          const order = await tx.order.create({
            data: {
              number: num,
              customerId,
              // Phase 12: تخصیص مسئوِستان + ثبت‌کنندهٔ واقعی
              assignedDesignerId: assignDesignerId,
              assignedPrinterId: assignPrinterId,
              createdById: user.id,
              // Phase 9: وضعیت سفارش = تجمیع مرحله‌های آیتم‌ها — سفارش گروهی
              // با هر آیتم طراحی → در گیت طراحی می‌ماند (خواستهٔ صریح:
              // «حتی اگر یکی از آیتم‌ها مال چاپ باشد، تا طراحی همه تمام
              // نشده کسی حق کار روی سفارش را ندارد»).
              status: markCompleted
                ? "completed"
                : items[0]?.stage === "archive" && items.every((i) => i.stage === "archive")
                ? "archived"
                : aggregateStatus(items),
              splitMode,
              priority,
              endDate: noEndDate ? null : toISO(endDate),
              noEndDate: !!noEndDate,
              totalAmount: total,
              paidAmount: 0,
              note: note || null,
              items: {
                create: items.map((it) => ({
                  productId: it.productId,
                  quantity: Number(it.quantity) || 1,
                  pricePerUnit: Number(it.pricePerUnit) || 0,
                  totalAmount:
                    Number(it.totalAmount) ||
                    Number(it.quantity) * Number(it.pricePerUnit) ||
                    0,
                  note: it.note || null,
                  description: it.description || null,
                  stage: it.stage || "design",
                  needsMaterial: !!it.needsMaterial,
                  ...itemDates(it),
                })),
              },
            },
            include: { items: { include: { product: true } } },
          });
          result.push({ id: order.id, number: order.number, customerId });
          // Phase 11: پیش‌فاکتور همیشگی — بدون تابعیت به فلگ کاربر
          if (perItemPI) {
            // چند-مشتری گروهی: هر آیتمِ این مشتری پیش‌فاکتور خودش را می‌گیرد
            for (const it of order.items) {
              const pi = await createPreInvoice(
                tx,
                order,
                customerId,
                [itemsFromOrderItems([it])[0]],
                preInvoice,
                { itemId: it.id, assignPrepaid: !prepaidAssigned }
              );
              prepaidAssigned = prepaidAssigned || pi.paid > 0;
              preInvoices.push({
                id: pi.id,
                number: pi.number,
                orderId: order.id,
                orderNumber: order.number,
                customerId,
                customerName: customerNames.get(customerId) ?? "—",
                itemId: it.id,
                itemLabel: it.product?.name ?? "آیتم",
                totalAmount: pi.total,
              });
            }
          } else {
            // تک-مشتری گروهی: یک پیش‌فاکتور برای کل گروه
            const pi = await createPreInvoice(
              tx,
              order,
              customerId,
              itemsFromOrderItems(order.items),
              preInvoice,
              { itemId: null, assignPrepaid: true }
            );
            preInvoices.push({
              id: pi.id,
              number: pi.number,
              orderId: order.id,
              orderNumber: order.number,
              customerId,
              customerName: customerNames.get(customerId) ?? "—",
              itemId: null,
              itemLabel: `کل گروه (${order.items.length} آیتم)`,
              totalAmount: pi.total,
            });
          }
        } else {
          // separated: one order per item
          for (const it of items) {
            const num = await nextNumber(tx, "order");
            const total =
              Number(it.totalAmount) || Number(it.quantity) * Number(it.pricePerUnit);
            const order = await tx.order.create({
              data: {
                number: num,
                customerId,
                // Phase 12: تخصیص مسئوِستان + ثبت‌کنندهٔ واقعی
                assignedDesignerId: finalDesignerId,
                assignedPrinterId: finalPrinterId,
                createdById: user.id,
                status: markCompleted
                  ? "completed"
                  : it.stage === "archive"
                  ? "archived"
                  : stageToStatus(it.stage),
                splitMode,
                priority,
                endDate: noEndDate ? null : toISO(endDate),
                noEndDate: !!noEndDate,
                totalAmount: total,
                paidAmount: 0,
                note: note || null,
                items: {
                  create: [
                    {
                      productId: it.productId,
                      quantity: Number(it.quantity) || 1,
                      pricePerUnit: Number(it.pricePerUnit) || 0,
                      totalAmount: total,
                      note: it.note || null,
                      description: it.description || null,
                      stage: it.stage || "design",
                      needsMaterial: !!it.needsMaterial,
                      ...itemDates(it),
                    },
                  ],
                },
              },
              include: { items: { include: { product: true } } },
            });
            result.push({ id: order.id, number: order.number, customerId });
            // مجزا: هر آیتم = سفارش خودش = پیش‌فاکتور تک‌آیتمیِ خودش
            // (Phase 11: همیشه ساخته می‌شود — «پیش‌فاکتور همیشگی»)
            const pi = await createPreInvoice(
              tx,
              order,
              customerId,
              itemsFromOrderItems(order.items),
              preInvoice,
              { itemId: order.items[0]?.id ?? null, assignPrepaid: !prepaidAssigned }
            );
            prepaidAssigned = prepaidAssigned || pi.paid > 0;
            preInvoices.push({
              id: pi.id,
              number: pi.number,
              orderId: order.id,
              orderNumber: order.number,
              customerId,
              customerName: customerNames.get(customerId) ?? "—",
              itemId: order.items[0]?.id ?? null,
              itemLabel: order.items[0]?.product?.name ?? "آیتم",
              totalAmount: pi.total,
            });
          }
        }
      }

      return { orders: result, preInvoices };
    });

    // ─── Phase 12: اعلان هدفمند برای مسئوِِِستان‌ها ──────────────────
    // «سفارش #N به شما رسید» — فقط در پنل همان کاربر (Notification.userId).
    try {
      const firstNum = created.orders[0]?.number;
      const numTail =
        created.orders.length > 1
          ? ` و ${created.orders.length - 1} سفارش دیگر`
          : "";
      const notifs: { userId: string; title: string; message: string; type: string; link: string }[] = [];
      // Phase 13: اعلان به «همهٔ» مجری‌های per-item (نه فقط سطح سفارش) —
      // هر آیتم فقط در پنل مجری خودش می‌آید، پس او باید بداند.
      const designerTargets = new Set<string>(
        allDrafts
          .map(({ it }) => it.designAssigneeId)
          .filter((v): v is string => typeof v === "string" && v.length > 0)
      );
      if (finalDesignerId) designerTargets.add(finalDesignerId);
      for (const uid of designerTargets) {
        notifs.push({
          userId: uid,
          title: "سفارش جدید به شما تخصیص یافت",
          message: `سفارش #${firstNum}${numTail} برای طراحی به شما واگذار شد.`,
          type: "info",
          link: "designer:orders",
        });
      }
      const printerTargets = new Set<string>(
        allDrafts
          .map(({ it }) => it.printAssigneeId)
          .filter((v): v is string => typeof v === "string" && v.length > 0)
      );
      if (finalPrinterId) printerTargets.add(finalPrinterId);
      for (const uid of printerTargets) {
        notifs.push({
          userId: uid,
          title: "سفارش جدید به شما تخصیص یافت",
          message: `سفارش #${firstNum}${numTail} پس از طراحی برای چاپ به شما واگذار شد.`,
          type: "info",
          link: "print:orders",
        });
      }
      if (notifs.length) {
        await db.notification.createMany({ data: notifs });
      }
    } catch {
      // اعلان نباید ثبت سفارش را خراب کند — best-effort
    }

    return NextResponse.json(
      {
        created: created.orders,
        count: created.orders.length,
        preInvoices: created.preInvoices,
        preInvoiceCount: created.preInvoices.length,
      },
      { status: 201 }
    );
  } catch (e) {
    return jsonError(e, "خطا در ایجاد سفارش");
  }
}

function stageToStatus(stage?: string) {
  switch (stage) {
    case "design":
      return "pending_design";
    case "print":
      return "in_printing";
    case "warehouse":
      return "warehouse_logistics";
    case "completed":
      return "completed";
    case "archive":
      return "archived";
    default:
      return "pending_design";
  }
}

// Helpers now take the tx client → run inside the caller's transaction.
// Phase 10: createPreInvoice اقلامش را از خودِ آیتم‌های واقعی سفارش می‌گیرد
// (server-derived) و می‌تواند به یک آیتم خاص لینک شود (per-item) یا کل
// گروه باشد (itemId=null). paidAmount فقط وقتی assignPrepaid=true روی
// سند اعمال می‌شود (جلوگیری از چندبرابر شدن پیش‌پرداخت در حالت per-item).
async function createPreInvoice(
  tx: Prisma.TransactionClient,
  order: { id: string; items: unknown[] },
  customerId: string,
  piItems: PreInvoiceItem[],
  pi: CreateBody["preInvoice"],
  opts: { itemId: string | null; assignPrepaid: boolean }
): Promise<{ id: string; number: number; paid: number; total: number }> {
  const items = piItems.length
    ? piItems
    : itemsFromOrderItems(order.items as Parameters<typeof itemsFromOrderItems>[0]);
  const totals = computeTotals(items, Number(pi?.discountAmount) || 0, Number(pi?.taxRate) || 0);
  const paid = opts.assignPrepaid
    ? Math.min(Math.max(0, Number(pi?.paidAmount) || 0), totals.totalAmount)
    : 0;

  const num = await nextNumber(tx, "preInvoice");
  const days = Math.max(1, Math.min(365, Number(pi?.validDays) || 15));
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + days);

  const row = await tx.preInvoice.create({
    data: {
      number: num,
      orderId: order.id,
      customerId,
      itemId: opts.itemId,
      status: "draft",
      validUntil,
      items: JSON.stringify(items),
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxRate: totals.taxRate,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      paidAmount: paid,
      notes: pi?.notes || null,
      terms: pi?.terms || null,
    },
  });
  // همگام‌سازی افزایشی paidAmount سفارش (چند پیش‌فاکتور جمع می‌شود)
  if (paid > 0) {
    await tx.order.update({
      where: { id: order.id },
      data: { paidAmount: { increment: paid } },
    });
  }
  return { id: row.id, number: row.number, paid, total: totals.totalAmount };
}
