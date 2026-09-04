import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toISO } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { canUserViewOrder, requireManager, validateAssigneeForModule } from "@/lib/access";
import { TASK_INCLUDE } from "@/lib/task-validation";
import { aggregateStatus, syncItemsToStatus, type OrderStatusStr } from "@/lib/order-flow";
import { jsonError } from "@/lib/api-error";

type ItemDraft = {
  id?: string; // Phase 10: شناسهٔ واقعی DB — آیتم موجود درجا آپدیت می‌شود (نه حذف/بازسازی)
  productId: string;
  quantity: number;
  pricePerUnit: number;
  totalAmount?: number;
  note?: string | null;
  description?: string | null;
  stage?: string;
  needsMaterial?: boolean;
  // Phase 10: تاریخ‌های per-item — فقط وقتی «ارسال» شوند اعمال می‌شوند
  designStartDate?: string | null;
  designEndDate?: string | null;
  printStartDate?: string | null;
  printEndDate?: string | null;
  // Phase 13: مجری per-item — با کلید صریح در payload اعمال می‌شود
  // (undefined = دست‌نخورده؛ null = پاک‌کردن به استخر عمومی/فال‌بک سفارش)
  designAssigneeId?: string | null;
  printAssigneeId?: string | null;
};

type ModuleDates = {
  design?: { start?: string | null; end?: string | null };
  print?: { start?: string | null; end?: string | null };
};

type UpdateBody = {
  note?: string;
  endDate?: string | null;
  noEndDate?: boolean;
  priority?: string;
  totalAmount?: number;
  status?: string;
  customerId?: string;
  splitMode?: string;
  items?: ItemDraft[];
  moduleDates?: ModuleDates;
  // Phase 12/13: تغییر تخصیص مسئوِستان از ویرایش سفارش + مجری‌های per-item
  assignedDesignerId?: string | null;
  assignedPrinterId?: string | null;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Phase 12: auth + scoping — قبلاً این endpoint بدون احراز هویت بود و هر
  // کاربر لاگین‌شده‌ای جزئیات هر سفارشی (قیمت/تلفن/پیش‌فاکتور) را می‌دید.
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    const order = await db.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
            // Phase 13: مجری per-item برای نمایش در مودال جزئیات
            designAssigneeUser: { select: { id: true, name: true } },
            printAssigneeUser: { select: { id: true, name: true } },
          },
        },
        // Phase 9: پیش‌فاکتورها مرتب + فاکتور کامل — تب‌های مودال جزئیات
        // Phase 10: itemId برای تفکیک پیش‌فاکتور per-item / کل گروه
        preInvoices: { orderBy: { number: "desc" }, include: { item: true } },
        invoice: true,
        tasks: { include: { assignedUser: TASK_INCLUDE.assignedUser } },
        // Phase 12: نام مسئوِِستان برای نمایش در مودال‌ها
        assignedDesigner: { select: { id: true, name: true, phone: true } },
        assignedPrinter: { select: { id: true, name: true, phone: true } },
        createdByUser: { select: { id: true, name: true } },
      },
    });
    if (!order) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });

    // غیرمدیر: فقط سفارشِ خودش / استخر عمومی مرحله‌اش / مالکیت تاریخی
    if (!canUserViewOrder(user, order)) {
      return NextResponse.json(
        { error: "این سفارش به شما تخصیص ندارد — دسترسی محدود" },
        { status: 403 }
      );
    }
    return NextResponse.json({ order });
  } catch (e) {
    // این همان endpoint مودال جزئیات سفارش در ماژول طراح/چاپ است —
    // پیام قابل‌اقدام به‌جای «سرور پاسخ نداد» خاموش
    return jsonError(e, "خطا در بارگذاری سفارش");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Phase 12: حذف سفارش = عملیات مدیریتی
  const user = await requireManager();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  try {
    await db.order.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, "حذف ناموفق");
  }
}

// Update order (note, endDate, status, customer, items, etc.)
// Phase 10 — «smart item merge»: قبلاً PUT همهٔ آیتم‌ها را حذف و از نو
// می‌ساخت → مهرهای designCompletedAt/printCompletedAt، تاریخ‌های per-item
// و لینک پیش‌فاکتورها به آیتم‌ها می‌پرید (خواستهٔ صریح: «تاریخ چاپ موقع
// ادیت می‌پره!»). حالا:
//   • آیتم با id واقعی → update درجا (فقط فیلدهای ارسال‌شده؛ تاریخ تهی
//     هرگز تاریخ موجود را پاک نمی‌کند — undefined یعنی دست‌نخورده)
//   • آیتم بدون id → create
//   • آیتم DB که در payload نیست → delete (SetNull: سند PI زنده می‌ماند)
//   • مهرهای تکمیل هرگز از این مسیر نوشته نمی‌شوند (audit فقط از
//     گردش کار طراح/چاپ یا syncItemsToStatus).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Phase 12: ویرایش سفارش = عملیات مدیریتی
  const user = await requireManager();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const body = (await req.json()) as UpdateBody;

  // ─── Phase 13: اعتبارسنجی مجری‌های per-item قبل از تراکنش ──
  const itemDrafts = Array.isArray(body.items) ? (body.items as ItemDraft[]) : [];
  const itemDesignerIds = Array.from(
    new Set(
      itemDrafts
        .map((it) => it.designAssigneeId)
        .filter((v): v is string => typeof v === "string" && v.length > 0)
    )
  );
  for (const uid of itemDesignerIds) {
    const check = await validateAssigneeForModule(uid, "designer");
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  }
  const itemPrinterIds = Array.from(
    new Set(
      itemDrafts
        .map((it) => it.printAssigneeId)
        .filter((v): v is string => typeof v === "string" && v.length > 0)
    )
  );
  for (const uid of itemPrinterIds) {
    const check = await validateAssigneeForModule(uid, "print");
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  }

  // ─── Phase 12/13: اعتبارسنجی تخصیص سطح سفارش (قبل از تراکنش) ──
  const hasDesignKey =
    Object.prototype.hasOwnProperty.call(body, "assignedDesignerId");
  const hasPrintKey =
    Object.prototype.hasOwnProperty.call(body, "assignedPrinterId");
  let newDesigner: string | null | undefined;
  let newPrinter: string | null | undefined;
  if (hasDesignKey) {
    const check = await validateAssigneeForModule(body.assignedDesignerId, "designer");
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    newDesigner = body.assignedDesignerId || null;
  }
  if (hasPrintKey) {
    const check = await validateAssigneeForModule(body.assignedPrinterId, "print");
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    newPrinter = body.assignedPrinterId || null;
  }

  // ─── FK guards (همان P2003-گیری POST) ────────────────────────────
  // customerId کهنه یا productId خالی/نامعتبر → 400 فارسی به‌جای 500.
  if (typeof body.customerId === "string" && body.customerId) {
    const c = await db.customer.findUnique({
      where: { id: body.customerId },
      select: { id: true },
    });
    if (!c) {
      return NextResponse.json(
        { error: "مشتری انتخاب‌شده در سیستم موجود نیست — صفحه را رفرش کنید و دوباره تلاش کنید." },
        { status: 400 }
      );
    }
  }
  if (Array.isArray(body.items)) {
    const drafts = body.items as ItemDraft[];
    const productIds = Array.from(
      new Set(
        drafts
          .map((it) => it.productId)
          .filter((p): p is string => typeof p === "string" && p.length > 0)
      )
    );
    const found = productIds.length
      ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true } })
      : [];
    const foundIds = new Set(found.map((p) => p.id));
    const bad = drafts.find((it) => !it.productId || !foundIds.has(it.productId));
    if (bad) {
      const idx = drafts.indexOf(bad);
      return NextResponse.json(
        { error: `محصول آیتم ${idx + 1} انتخاب نشده است — در ویرایش سفارش، محصول هر ردیف را انتخاب کنید.` },
        { status: 400 }
      );
    }
  }

  try {
    // ─── Phase 13: snapshot قبل از تغییر — برای نوتیفِ تغییر مجری ──
    // «اگر عوض میشه حتما از تو پنل کارمند قبلی برداشته شه و براش نوتیف بیاد»
    // (برداشتن از پنل خودکار با اسکوپ per-item اتفاق می‌افتد؛ اعلان اینجاست)
    const before = await db.order.findUnique({
      where: { id },
      select: {
        number: true,
        customer: { select: { name: true } },
        assignedDesignerId: true,
        assignedPrinterId: true,
        items: {
          select: {
            id: true,
            stage: true,
            designAssigneeId: true,
            printAssigneeId: true,
          },
        },
      },
    });
    if (!before) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
    const effBefore = (stage: "design" | "print") => {
      const m = new Map<string, string | null>();
      for (const it of before.items) {
        if (stage === "design" && it.stage === "design") {
          m.set(it.id, it.designAssigneeId ?? before.assignedDesignerId ?? null);
        }
        if (stage === "print" && (it.stage === "print" || it.stage === "design")) {
          m.set(it.id, it.printAssigneeId ?? before.assignedPrinterId ?? null);
        }
      }
      return m;
    };
    const designBefore = effBefore("design");
    const printBefore = effBefore("print");

    const result = await db.$transaction(async (tx) => {
      // 1) Build base scalar data
      const data: Record<string, unknown> = {};
      if (typeof body.note === "string") data.note = body.note;
      if (typeof body.endDate !== "undefined") data.endDate = toISO(body.endDate);
      if (typeof body.noEndDate === "boolean") data.noEndDate = body.noEndDate;
      if (typeof body.priority === "string") data.priority = body.priority;
      if (typeof body.totalAmount === "number") data.totalAmount = body.totalAmount;
      if (typeof body.status === "string") data.status = body.status;
      if (typeof body.customerId === "string") data.customerId = body.customerId;
      if (typeof body.splitMode === "string") data.splitMode = body.splitMode;
      // Phase 12: تخصیص‌ها (فقط وقتی صریحاً فرستاده شده‌اند)
      if (newDesigner !== undefined) data.assignedDesignerId = newDesigner;
      if (newPrinter !== undefined) data.assignedPrinterId = newPrinter;

      // 2) Smart-merge items if provided
      const hasItems = Array.isArray(body.items);
      const moduleDates = body.moduleDates ?? {};
      const moduleDateFallback = {
        designStart: toISO(moduleDates.design?.start) ?? undefined,
        designEnd: toISO(moduleDates.design?.end) ?? undefined,
        printStart: toISO(moduleDates.print?.start) ?? undefined,
        printEnd: toISO(moduleDates.print?.end) ?? undefined,
      };
      let mergedItems: { id: string; totalAmount: number; stage: string }[] = [];

      if (hasItems) {
        const items = body.items as ItemDraft[];
        const existing = await tx.orderItem.findMany({
          where: { orderId: id },
          select: { id: true },
        });
        const existingIds = new Set(existing.map((i) => i.id));

        // گروه‌بندی: آیتم‌های موجود (id معتبر) در برابر آیتم‌های جدید
        const toUpdate = items.filter((it) => it.id && existingIds.has(it.id));
        const toCreate = items.filter((it) => !it.id || !existingIds.has(it.id));
        const payloadIds = new Set(toUpdate.map((it) => it.id));
        const toDelete = [...existingIds].filter((eid) => !payloadIds.has(eid));

        for (const eid of toDelete) {
          await tx.orderItem.delete({ where: { id: eid } });
        }

        for (const it of toUpdate) {
          const total =
            Number(it.totalAmount) || Number(it.quantity) * Number(it.pricePerUnit);
          const upd = await tx.orderItem.update({
            where: { id: it.id! },
            data: {
              productId: it.productId,
              quantity: Number(it.quantity) || 1,
              pricePerUnit: Number(it.pricePerUnit) || 0,
              totalAmount: total,
              note: it.note || null,
              description: it.description || null,
              stage: it.stage || "design",
              needsMaterial: !!it.needsMaterial,
              // فقط تاریخ‌های ارسال‌شدهٔ غیرتهی اعمال می‌شوند (partial)
              ...(it.designStartDate ? { designStartDate: toISO(it.designStartDate) } : {}),
              ...(it.designEndDate ? { designEndDate: toISO(it.designEndDate) } : {}),
              ...(it.printStartDate ? { printStartDate: toISO(it.printStartDate) } : {}),
              ...(it.printEndDate ? { printEndDate: toISO(it.printEndDate) } : {}),
              // Phase 13: مجری per-item — فقط با کلید صریح (null معتبر = پاک‌کردن)
              ...(Object.prototype.hasOwnProperty.call(it, "designAssigneeId")
                ? { designAssigneeId: it.designAssigneeId || null }
                : {}),
              ...(Object.prototype.hasOwnProperty.call(it, "printAssigneeId")
                ? { printAssigneeId: it.printAssigneeId || null }
                : {}),
            },
          });
          mergedItems.push({ id: upd.id, totalAmount: total, stage: upd.stage });
        }

        for (const it of toCreate) {
          const total =
            Number(it.totalAmount) || Number(it.quantity) * Number(it.pricePerUnit);
          const created = await tx.orderItem.create({
            data: {
              orderId: id,
              productId: it.productId,
              quantity: Number(it.quantity) || 1,
              pricePerUnit: Number(it.pricePerUnit) || 0,
              totalAmount: total,
              note: it.note || null,
              description: it.description || null,
              stage: it.stage || "design",
              needsMaterial: !!it.needsMaterial,
              designStartDate: toISO(
                it.designStartDate ?? moduleDateFallback.designStart ?? null
              ),
              designEndDate: toISO(
                it.designEndDate ?? moduleDateFallback.designEnd ?? null
              ),
              printStartDate: toISO(
                it.printStartDate ?? moduleDateFallback.printStart ?? null
              ),
              printEndDate: toISO(
                it.printEndDate ?? moduleDateFallback.printEnd ?? null
              ),
              // Phase 13: مجری per-item با فال‌بک به مجری جدید سفارش
              designAssigneeId: it.designAssigneeId ?? newDesigner ?? null,
              printAssigneeId: it.printAssigneeId ?? newPrinter ?? null,
            },
          });
          mergedItems.push({ id: created.id, totalAmount: total, stage: created.stage });
        }

        // auto-update totalAmount if not explicitly provided
        if (typeof body.totalAmount !== "number") {
          data.totalAmount = mergedItems.reduce((s, i) => s + i.totalAmount, 0);
        }

        // auto-update status if not explicitly provided — Phase 9: تجمیع
        // مرحله‌های آیتم‌ها (نه فقط آیتم اول). اگر status صریحاً آمده باشد،
        // آیتم‌ها بعداً با syncItemsToStatus همگام می‌شوند.
        if (typeof body.status !== "string" && mergedItems.length > 0) {
          data.status = aggregateStatus(mergedItems);
        }
      }

      // 3) Update the order
      const order = await tx.order.update({ where: { id }, data });

      // 4) Phase 9: تغییر وضعیت دستی → همگام‌سازی stage آیتم‌ها (اگر آیتم‌ها
      // در همین درخواست جایگزین نشده‌اند، وضعیت فعلی آیتم‌ها ملاک sync است)
      if (typeof body.status === "string") {
        await syncItemsToStatus(tx, id, body.status as OrderStatusStr);
      }

      return { order, items: mergedItems };
    });

    // ─── Phase 13: اعلان تغییر مجری — «براش نوتیف بیاد» ──────────────
    // مقایسهٔ مجری مؤثر هر آیتم قبل/بعد → کاربرِ جدید «واگذار شد»،
    // کاربرِ قبلی «از شما گرفته شد». best-effort (خطا ویرایش را خراب نمی‌کند).
    try {
      const after = await db.order.findUnique({
        where: { id },
        select: {
          number: true,
          assignedDesignerId: true,
          assignedPrinterId: true,
          items: {
            select: { id: true, stage: true, designAssigneeId: true, printAssigneeId: true },
          },
        },
      });
      if (after) {
        const effAfter = (stage: "design" | "print") => {
          const m = new Map<string, string | null>();
          for (const it of after.items) {
            if (stage === "design" && it.stage === "design") {
              m.set(it.id, it.designAssigneeId ?? after.assignedDesignerId ?? null);
            }
            if (stage === "print" && (it.stage === "print" || it.stage === "design")) {
              m.set(it.id, it.printAssigneeId ?? after.assignedPrinterId ?? null);
            }
          }
          return m;
        };
        const designAfter = effAfter("design");
        const printAfter = effAfter("print");
        const removed = new Map<string, string>(); // userId → stage label
        const added = new Map<string, string>();
        for (const [itemId, oldU] of designBefore) {
          const newU = designAfter.get(itemId) ?? null;
          if (oldU && newU !== oldU) {
            removed.set(oldU, removed.get(oldU) ?? "design");
            if (newU) added.set(newU, added.get(newU) ?? "design");
          } else if (!oldU && newU) {
            added.set(newU, added.get(newU) ?? "design");
          }
        }
        for (const [itemId, oldU] of printBefore) {
          const newU = printAfter.get(itemId) ?? null;
          if (oldU && newU !== oldU) {
            removed.set(oldU, removed.get(oldU) ?? "print");
            if (newU) added.set(newU, added.get(newU) ?? "print");
          } else if (!oldU && newU) {
            added.set(newU, added.get(newU) ?? "print");
          }
        }
        const num = before.number;
        const custName = before.customer?.name;
        const notifs: {
          userId: string;
          title: string;
          message: string;
          type: string;
          link: string;
        }[] = [];
        for (const [uid, stage] of added) {
          notifs.push({
            userId: uid,
            title: "سفارش به شما واگذار شد",
            message: `تخصیص ${stage === "design" ? "طراحی" : "چاپ"} سفارش #${num}${
              custName ? ` (${custName})` : ""
            } در ویرایش به شما تغییر کرد.`,
            type: "info",
            link: stage === "design" ? "designer:orders" : "print:orders",
          });
        }
        for (const [uid, stage] of removed) {
          if (added.has(uid)) continue; // جایگزینی، نه حذف — کاربر جدید خودش نوتیف دارد
          notifs.push({
            userId: uid,
            title: "تخصیص سفارش از شما گرفته شد",
            message: `سفارش #${num}${
              custName ? ` (${custName})` : ""
            } دیگر به شما تخصیص ندارد — از پنل شما برداشته شد.`,
            type: "warning",
            link: stage === "design" ? "designer:orders" : "print:orders",
          });
        }
        if (notifs.length) await db.notification.createMany({ data: notifs });
      }
    } catch {
      // best-effort
    }

    return NextResponse.json({ order: result.order, items: result.items });
  } catch (e) {
    return jsonError(e, "به‌روزرسانی ناموفق");
  }
}
