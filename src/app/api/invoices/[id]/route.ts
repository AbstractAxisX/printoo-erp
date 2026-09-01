import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  computeInvoice,
  isInvoiceStatus,
  INVOICE_STATUS_TRANSITIONS,
} from "@/lib/invoice";
import { redistributePiPaid, recomputeOrderPaidFromPIs } from "@/lib/paid-sync";
import { jsonError } from "@/lib/api-error";

// ─── Invoices API — Phase 9 ────────────────────────────────────────
//
// GET    /api/invoices/[id]     — فاکتور + سفارش + مشتری
// PUT    /api/invoices/[id]     — ویرایش (فقط draft/issued)
// PATCH  /api/invoices/[id]     — انتقال وضعیت با ماتریس مجاز
//                                  (paid → تسویه کامل + همگام‌سازی سفارش)
// DELETE /api/invoices/[id]     — حذف (فقط draft/cancelled) + برگشت پول

const INCLUDE = {
  customer: true,
  order: {
    select: {
      id: true,
      number: true,
      status: true,
      endDate: true,
      paidAmount: true,
      totalAmount: true,
    },
  },
} as const;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    const invoice = await db.invoice.findUnique({ where: { id }, include: INCLUDE });
    if (!invoice)
      return NextResponse.json({ error: "فاکتور یافت نشد" }, { status: 404 });
    return NextResponse.json({ invoice });
  } catch (e) {
    return jsonError(e, "خطا در دریافت فاکتور");
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    const body = await req.json();
    const { items, discountAmount, taxRate, paidAmount, dueDays, notes, terms } =
      body ?? {};

    const existing = await db.invoice.findUnique({ where: { id } });
    if (!existing)
      return NextResponse.json({ error: "فاکتور یافت نشد" }, { status: 404 });

    if (existing.status === "paid" || existing.status === "cancelled") {
      return NextResponse.json(
        {
          error:
            existing.status === "paid"
              ? "فاکتور پرداخت‌شده قابل ویرایش نیست"
              : "فاکتور باطل‌شده قابل ویرایش نیست",
        },
        { status: 409 }
      );
    }

    // اگر اقلام/مبالغ ارسال شده → محاسبهٔ کامل جدید؛ وگرنه مقدار فعلی
    let computed;
    try {
      const rawItems = items ?? JSON.parse(existing.items);
      computed = computeInvoice({
        items: rawItems,
        discountAmount: discountAmount ?? existing.discountAmount,
        taxRate: taxRate ?? existing.taxRate,
        paidAmount: paidAmount ?? existing.paidAmount,
        dueDays:
          dueDays ??
          (existing.dueDate
            ? Math.ceil(
                (new Date(existing.dueDate).getTime() - Date.now()) / 86_400_000
              )
            : undefined),
      });
    } catch (e) {
      // خطای parse اقلام فعلی → خطای اعتبارسنجی ورودی جدید
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const inv = await tx.invoice.update({
        where: { id },
        data: {
          items: JSON.stringify(computed.items),
          subtotal: computed.subtotal,
          discountAmount: computed.discountAmount,
          taxRate: computed.taxRate,
          taxAmount: computed.taxAmount,
          totalAmount: computed.totalAmount,
          paidAmount: computed.paidAmount,
          dueDate: computed.dueDate,
          notes: typeof notes === "string" ? (notes.trim() || null) : existing.notes,
          terms: typeof terms === "string" ? (terms.trim() || null) : existing.terms,
        },
        include: INCLUDE,
      });

      // Phase 11 — مدل آینه‌ای: مبلغ پرداخت فاکتور = کل دریافتی.
      // سفارش و پیش‌فاکتورها همین عدد را می‌گیرند
      // («اگر تو فاکتور مبلغ پرداختی ادیت شد، تو پیش‌فاکتورم سینک بشه»).
      await tx.order.update({
        where: { id: existing.orderId },
        data: { paidAmount: computed.paidAmount },
      });
      await redistributePiPaid(tx, existing.orderId, computed.paidAmount);
      return inv;
    });

    return NextResponse.json({ invoice: result });
  } catch (e) {
    return jsonError(e, "خطا در ویرایش فاکتور");
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    const body = await req.json();
    const { status } = body ?? {};

    if (!isInvoiceStatus(status)) {
      return NextResponse.json(
        { error: `وضعیت نامعتبر: ${status ?? "—"}` },
        { status: 400 }
      );
    }

    const existing = await db.invoice.findUnique({ where: { id } });
    if (!existing)
      return NextResponse.json({ error: "فاکتور یافت نشد" }, { status: 404 });

    const allowed = INVOICE_STATUS_TRANSITIONS[existing.status as "draft"];
    if (!allowed.includes(status)) {
      return NextResponse.json(
        {
          error: `انتقال از «${existing.status}» به «${status}» مجاز نیست`,
        },
        { status: 409 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const data: Record<string, unknown> = { status };

      if (status === "paid") {
        // تسویهٔ کامل (Phase 11 مدل آینه‌ای): paidAmount → totalAmount و
        // کل دریافتی سفارش و پیش‌فاکتورها هم همین می‌شوند
        const diff = existing.totalAmount - existing.paidAmount;
        if (diff > 0) {
          data.paidAmount = existing.totalAmount;
          await tx.order.update({
            where: { id: existing.orderId },
            data: { paidAmount: { increment: diff } },
          });
          await redistributePiPaid(tx, existing.orderId, existing.totalAmount);
        }
        await tx.notification.create({
          data: {
            title: `فاکتور #${existing.number} پرداخت شد`,
            message: `فاکتور سفارش به‌طور کامل تسویه شد.`,
            type: "success",
            link: "admin:orders",
          },
        });
      }

      if (status === "cancelled") {
        // باطل (Phase 11): فاکتور دیگر آینه نیست — کل دریافتی
        // سفارش به حالت «پیش از فاکتور» برمی‌گردد (Σ پرداخت پیش‌فاڣتورها)
        data.paidAmount = 0;
        await recomputeOrderPaidFromPIs(tx, existing.orderId);
      }

      const inv = await tx.invoice.update({ where: { id }, data, include: INCLUDE });
      return inv;
    });

    return NextResponse.json({ invoice: result });
  } catch (e) {
    return jsonError(e, "خطا در تغییر وضعیت فاکتور");
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    const existing = await db.invoice.findUnique({ where: { id } });
    if (!existing)
      return NextResponse.json({ error: "فاکتور یافت نشد" }, { status: 404 });

    if (existing.status === "issued" || existing.status === "paid") {
      return NextResponse.json(
        { error: "فاکتور صادرشده/پرداخت‌شده حذف نمی‌شود — ابتدا باطل کنید" },
        { status: 409 }
      );
    }

    await db.$transaction(async (tx) => {
      await tx.invoice.delete({ where: { id } });
      // Phase 11: برگشت به حالت «پیش از فاکتور» — کل دریافتی = Σ پیش‌فاڣتورها
      await recomputeOrderPaidFromPIs(tx, existing.orderId);
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, "خطا در حذف فاکتور");
  }
}
