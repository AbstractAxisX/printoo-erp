import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  normalizeItems,
  computeTotals,
  isPreInvoiceStatus,
  STATUS_TRANSITIONS,
} from "@/lib/pre-invoice";
import { mirrorInvoicePaid } from "@/lib/paid-sync";

// ─── Pre-Invoice [id] API — Phase 7 rebuild ─────────────────────────
//
// GET    → پیش‌فاکتور با اقلام و سفارش
// PUT    → ویرایش (فقط در وضعیت draft/sent/rejected — بعد از تایید قفل است)
// PATCH  → انتقال وضعیت با ماتریس مجاز (STATUS_TRANSITIONS)
// DELETE → حذف (فقط draft/sent/rejected) + برگشت paidAmount از سفارش
//
// همگام‌سازی پول: order.paidAmount با delta تنظیم می‌شود، هرگز بازنویسی
// نمی‌شود (چون سفارش ممکن است چند پیش‌فاکتور یا فاکتور نهایی داشته باشد).

const INCLUDE = {
  customer: true,
  // Phase 10: آیتمِ مرتبط (per-item) با تاریخ‌های طراحی/چاپ + همهٔ آیتم‌های
  // سفارش برای خلاصهٔ زمان‌بندی گروه (min start / max end).
  item: {
    include: {
      product: { select: { name: true, unit: true } },
    },
  },
  order: {
    select: {
      id: true,
      number: true,
      status: true,
      endDate: true,
      totalAmount: true,
      paidAmount: true,
      splitMode: true,
      customer: { select: { id: true, name: true, phone: true } },
      items: {
        select: {
          id: true,
          note: true,
          description: true,
          designStartDate: true,
          designEndDate: true,
          printStartDate: true,
          printEndDate: true,
          designCompletedAt: true,
          printCompletedAt: true,
        },
      },
    },
  },
} as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const preInvoice = await db.preInvoice.findUnique({
    where: { id },
    include: INCLUDE,
  });
  if (!preInvoice)
    return NextResponse.json({ error: "پیش‌فاکتور یافت نشد" }, { status: 404 });
  return NextResponse.json({ preInvoice });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  try {
    const existing = await db.preInvoice.findUnique({ where: { id } });
    if (!existing)
      return NextResponse.json({ error: "پیش‌فاکتور یافت نشد" }, { status: 404 });

    if (existing.status === "approved" || existing.status === "converted") {
      return NextResponse.json(
        { error: "پیش‌فاکتور تاییدشده قابل ویرایش نیست — ابتدا به «ارسال‌شده» بازگردانید" },
        { status: 409 }
      );
    }

    const body = await req.json();
    const { items, discountAmount, taxRate, paidAmount, validDays, notes, terms } =
      body ?? {};

    // اگر اقلام جدید نیامده، اقلام فعلی را مبنا قرار بده
    let normalized;
    try {
      normalized = Array.isArray(items)
        ? normalizeItems(items)
        : normalizeItems(JSON.parse(existing.items));
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 400 }
      );
    }

    const totals = computeTotals(
      normalized,
      discountAmount !== undefined ? discountAmount : existing.discountAmount,
      taxRate !== undefined ? taxRate : existing.taxRate
    );

    const newPaid = Math.min(
      Math.max(
        0,
        paidAmount !== undefined ? Number(paidAmount) || 0 : existing.paidAmount
      ),
      totals.totalAmount
    );

    let validUntil = existing.validUntil;
    if (validDays !== undefined && validDays !== null) {
      const days = Math.max(1, Math.min(365, Number(validDays) || 15));
      validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + days);
    }

    const preInvoice = await db.$transaction(async (tx) => {
      const pi = await tx.preInvoice.update({
        where: { id },
        data: {
          items: JSON.stringify(normalized),
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxRate: totals.taxRate,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          paidAmount: newPaid,
          validUntil,
          notes:
            notes !== undefined
              ? typeof notes === "string" && notes.trim()
                ? notes.trim()
                : null
              : existing.notes,
          terms:
            terms !== undefined
              ? typeof terms === "string" && terms.trim()
                ? terms.trim()
                : null
              : existing.terms,
        },
        include: INCLUDE,
      });

      // همگام‌سازی delta مبلغ پرداختی سفارش
      // Phase 11: فاکتور صادرشدهٔ همین سفارش نیز آینه می‌شود
      const delta = newPaid - existing.paidAmount;
      if (delta !== 0) {
        await tx.order.update({
          where: { id: existing.orderId },
          data: { paidAmount: { increment: delta } },
        });
        await mirrorInvoicePaid(tx, existing.orderId);
      }
      return pi;
    });

    return NextResponse.json({ preInvoice });
  } catch {
    return NextResponse.json(
      { error: "خطا در ویرایش پیش‌فاکتور" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  try {
    const body = await req.json();
    const { status } = body ?? {};

    if (!isPreInvoiceStatus(status)) {
      return NextResponse.json(
        { error: `وضعیت نامعتبر: ${status}` },
        { status: 400 }
      );
    }

    const existing = await db.preInvoice.findUnique({ where: { id } });
    if (!existing)
      return NextResponse.json({ error: "پیش‌فاکتور یافت نشد" }, { status: 404 });

    const allowed = STATUS_TRANSITIONS[existing.status as keyof typeof STATUS_TRANSITIONS] ?? [];
    if (!allowed.includes(status)) {
      return NextResponse.json(
        {
          error: `انتقال وضعیت از «${existing.status}» به «${status}» مجاز نیست`,
        },
        { status: 409 }
      );
    }

    if (status === "converted") {
      return NextResponse.json(
        { error: "تبدیل به فاکتور فقط از طریق مسیر convert انجام می‌شود" },
        { status: 400 }
      );
    }

    const preInvoice = await db.preInvoice.update({
      where: { id },
      data: { status },
      include: INCLUDE,
    });
    return NextResponse.json({ preInvoice });
  } catch {
    return NextResponse.json(
      { error: "خطا در تغییر وضعیت پیش‌فاکتور" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  try {
    const existing = await db.preInvoice.findUnique({ where: { id } });
    if (!existing)
      return NextResponse.json({ error: "پیش‌فاکتور یافت نشد" }, { status: 404 });

    if (existing.status === "approved" || existing.status === "converted") {
      return NextResponse.json(
        { error: "پیش‌فاکتور تاییدشده/تبدیل‌شده قابل حذف نیست" },
        { status: 409 }
      );
    }

    await db.$transaction(async (tx) => {
      await tx.preInvoice.delete({ where: { id } });
      // برگشت پیش‌پرداخت از سفارش (حداقل صفر)
      if (existing.paidAmount > 0) {
        const order = await tx.order.findUnique({
          where: { id: existing.orderId },
          select: { paidAmount: true },
        });
        const dec = Math.min(existing.paidAmount, order?.paidAmount ?? 0);
        if (dec > 0) {
          await tx.order.update({
            where: { id: existing.orderId },
            data: { paidAmount: { decrement: dec } },
          });
        }
        // Phase 11: فاکتور صادرشده هم آینه شود
        await mirrorInvoicePaid(tx, existing.orderId);
      }
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "حذف ناموفق" }, { status: 500 });
  }
}
