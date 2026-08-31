import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toISO } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import {
  normalizeItems,
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
  preInvoice?: {
    // Phase 10: اقلام از خود آیتم‌های واقعی سفارش در سرور ساخته می‌شوند
    // (payload مشتری فقط پارامترهای مالی است — باگ «payload مشترک آیتم‌های
    // مشتری اول به همهٔ سفارش‌ها» رفع شد). آرایهٔ items فقط برای compat است.
    items?: { name: string; quantity: number; unit?: string; unitPrice: number; discount?: number }[];
    discountAmount?: number;
    taxRate?: number;
    paidAmount?: number;
    validDays?: number;
    notes?: string | null;
    terms?: string | null;
  } | null;
  invoice?: {
    items: { name: string; quantity: number; total: number; paid: number }[];
    totalAmount: number;
    paidAmount: number;
    discountAmount: number;
  } | null;
  markCompleted?: boolean;
  createdBy?: string | null;
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

  const orders = await db.order.findMany({
    where,
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
  const user = await requireUser();
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
      invoice,
      markCompleted,
      createdBy,
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

    // ─── R4 fix: atomic all-or-nothing via a single transaction ──────────
    // Pre-Phase-3, if createPreInvoice/createInvoice failed AFTER order.create,
    // the order was orphaned (paidAmount never bumped, invoice missing).
    // Now the entire creation (order + pre-invoice + invoice + paidAmount
    // bump) happens inside one Prisma transaction → any failure rolls back
    // everything. nextNumber also runs inside tx → R3 race fixed.
    const created = await db.$transaction(async (tx) => {
      const result: { id: string; number: number; customerId: string }[] = [];
      // اولین پیش‌فاکتور ساخته‌شده — برای «چاپ بلافاصله پس از ثبت» به کلاینت برمی‌گردد
      let firstPreInvoice: { id: string; number: number } | null = null;
      // Phase 10: شمارش کل پیش‌فاکتورهای صادرشده + کنترل تخصیص پیش‌پرداخت
      // (پیش‌پرداخت فقط روی «اولین» سند این ثبت اعمال می‌شود — نه به‌ازای هر سند).
      let piCount = 0;
      let prepaidAssigned = false;
      // قرارداد Phase 10: مجزا یا چند-مشتری → پیش‌فاکتور per-item؛
      // گروهیِ تک-مشتری → یک پیش‌فاکتور برای کل گروه.
      const perItemPI = isPerItemInvoice(splitMode, customers.length);

      for (const customerId of customers) {
        const items = itemsByCustomer[customerId] || [];
        const md = moduleDates ?? {};
        // تاریخ per-item با fallback به moduleDates مشترک (compat)
        const itemDates = (it: ItemDraft) => ({
          designStartDate: toISO(it.designStartDate ?? md.design?.start),
          designEndDate: toISO(it.designEndDate ?? md.design?.end),
          printStartDate: toISO(it.printStartDate ?? md.print?.start),
          printEndDate: toISO(it.printEndDate ?? md.print?.end),
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
              createdBy: createdBy || null,
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
          if (preInvoice) {
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
                piCount++;
                prepaidAssigned = prepaidAssigned || pi.paid > 0;
                if (!firstPreInvoice) firstPreInvoice = { id: pi.id, number: pi.number };
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
              piCount++;
              if (!firstPreInvoice) firstPreInvoice = { id: pi.id, number: pi.number };
            }
          }
          if (invoice && markCompleted)
            await createInvoice(tx, order.id, customerId, invoice);
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
                createdBy: createdBy || null,
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
            if (preInvoice) {
              // مجزا: هر آیتم = سفارش خودش = پیش‌فاکتور تک-آیتمیِ خودش
              const pi = await createPreInvoice(
                tx,
                order,
                customerId,
                itemsFromOrderItems(order.items),
                preInvoice,
                { itemId: order.items[0]?.id ?? null, assignPrepaid: !prepaidAssigned }
              );
              piCount++;
              prepaidAssigned = prepaidAssigned || pi.paid > 0;
              if (!firstPreInvoice) firstPreInvoice = { id: pi.id, number: pi.number };
            }
            if (invoice && markCompleted)
              await createInvoice(tx, order.id, customerId, invoice);
          }
        }
      }

      return { orders: result, preInvoice: firstPreInvoice, preInvoiceCount: piCount };
    });

    return NextResponse.json(
      {
        created: created.orders,
        count: created.orders.length,
        preInvoice: created.preInvoice,
        preInvoiceCount: created.preInvoiceCount,
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
  pi: NonNullable<CreateBody["preInvoice"]>,
  opts: { itemId: string | null; assignPrepaid: boolean }
): Promise<{ id: string; number: number; paid: number }> {
  const items = piItems.length ? piItems : normalizeItems(pi.items ?? []);
  const totals = computeTotals(items, pi.discountAmount ?? 0, pi.taxRate ?? 0);
  const paid = opts.assignPrepaid
    ? Math.min(Math.max(0, Number(pi.paidAmount) || 0), totals.totalAmount)
    : 0;

  const num = await nextNumber(tx, "preInvoice");
  const days = Math.max(1, Math.min(365, Number(pi.validDays) || 15));
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
      notes: pi.notes || null,
      terms: pi.terms || null,
    },
  });
  // همگام‌سازی افزایشی paidAmount سفارش (چند پیش‌فاکتور جمع می‌شود)
  if (paid > 0) {
    await tx.order.update({
      where: { id: order.id },
      data: { paidAmount: { increment: paid } },
    });
  }
  return { id: row.id, number: row.number, paid };
}

async function createInvoice(
  tx: Prisma.TransactionClient,
  orderId: string,
  customerId: string,
  inv: NonNullable<CreateBody["invoice"]>
) {
  const num = await nextNumber(tx, "invoice");
  // Phase 9: فاکتور با قرارداد جدید (اقلام نرمال + تخفیف + مالیات).
  // ورودی legacy فقط total/paid دارد — اقلام از خود سفارش ساخته می‌شوند
  // تا سند همیشه محتوای واقعی داشته باشد.
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } } },
  });
  const items =
    Array.isArray(inv.items) && inv.items.length
      ? inv.items.map((it) => ({
          name: String((it as { name?: string }).name ?? "قلم فاکتور"),
          quantity: Number((it as { quantity?: number }).quantity ?? 1),
          unit: "عدد",
          unitPrice: Number((it as { unitPrice?: number }).unitPrice ?? 0),
          discount: 0,
          total:
            Number((it as { total?: number }).total ?? 0) ||
            Number((it as { quantity?: number }).quantity ?? 1) * 0,
        }))
      : (order?.items ?? []).map((it) => ({
          name: it.product?.name ?? "قلم سفارش",
          quantity: it.quantity,
          unit: "عدد",
          unitPrice: it.pricePerUnit,
          discount: 0,
          total: it.totalAmount,
        }));

  const totals = computeTotals(items, 0, 0);
  const paid = Math.min(Math.max(0, Number(inv.paidAmount) || 0), totals.totalAmount);

  await tx.invoice.create({
    data: {
      number: num,
      orderId,
      customerId,
      status: "issued",
      items: JSON.stringify(items),
      subtotal: totals.subtotal,
      discountAmount: Number(inv.discountAmount) || 0,
      taxRate: 0,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      paidAmount: paid,
      source: "manual",
    },
  });
  // paidAmount افزایشی — قرارداد مشترک با پیش‌فاکتور
  if (paid > 0) {
    await tx.order.update({
      where: { id: orderId },
      data: { paidAmount: { increment: paid } },
    });
  }
}
