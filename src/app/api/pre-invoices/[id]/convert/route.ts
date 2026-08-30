import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nextNumber, ensureCounters } from "@/lib/counter";
import { jsonError } from "@/lib/api-error";

// ─── Pre-Invoice → Invoice conversion — Phase 7 ─────────────────────
//
// POST /api/pre-invoices/[id]/convert
//   فقط از وضعیت approved. فاکتور نهایی با همان اقلام و مبالغ ساخته
//   می‌شود (شماره‌گذاری اتمیک از Counter)، وضعیت پیش‌فاکتور converted
//   می‌شود و paidAmount پیش‌فاکتور به فاکتور منتقل می‌گردد.
//   Invoice.orderId یکتاست — اگر سفارش فاکتور دارد → 409.

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  // ترمیم شمارنده قبل از تراکنش (idempotent)
  await ensureCounters();

  try {
    const existing = await db.preInvoice.findUnique({ where: { id } });
    if (!existing)
      return NextResponse.json(
        { error: "پیش‌فاکتور یافت نشد" },
        { status: 404 }
      );

    if (existing.status !== "approved") {
      return NextResponse.json(
        { error: "فقط پیش‌فاکتور «تاییدشده» قابل تبدیل به فاکتور است" },
        { status: 409 }
      );
    }

    const conflict = await db.invoice.findUnique({
      where: { orderId: existing.orderId },
      select: { id: true },
    });
    if (conflict) {
      return NextResponse.json(
        { error: "این سفارش قبلاً فاکتور نهایی دارد" },
        { status: 409 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      // شماره‌گذاری اتمیک و خودترمیم — lib/counter
      const num = await nextNumber(tx, "invoice");

      const invoice = await tx.invoice.create({
        data: {
          number: num,
          orderId: existing.orderId,
          customerId: existing.customerId,
          totalAmount: existing.totalAmount,
          paidAmount: existing.paidAmount,
          discountAmount: existing.discountAmount,
          items: existing.items,
        },
      });

      const preInvoice = await tx.preInvoice.update({
        where: { id },
        data: { status: "converted" },
      });

      return { invoice, preInvoice };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return jsonError(e, "خطا در تبدیل به فاکتور");
  }
}
