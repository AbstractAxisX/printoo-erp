import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toISO } from "@/lib/format";
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
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const order = await db.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { product: true } },
        // Phase 9: پیش‌فاکتورها مرتب + فاکتور کامل — تب‌های مودال جزئیات
        // Phase 10: itemId برای تفکیک پیش‌فاکتور per-item / کل گروه
        preInvoices: { orderBy: { number: "desc" }, include: { item: true } },
        invoice: true,
        tasks: { include: { assignedUser: TASK_INCLUDE.assignedUser } },
      },
    });
    if (!order) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
    return NextResponse.json({ order });
  } catch (e) {
    // این همان endpoint مودال جزئیات سفارش در ماژول طراح/چاپ است —
    // پیام قابل‌اقدام به‌جای «سرور پاسخ نداد» خاموش
    return jsonError(e, "خطا در بارگذاری سفارش");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const { id } = await params;
  const body = (await req.json()) as UpdateBody;

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

    return NextResponse.json({ order: result.order, items: result.items });
  } catch (e) {
    return jsonError(e, "به‌روزرسانی ناموفق");
  }
}
