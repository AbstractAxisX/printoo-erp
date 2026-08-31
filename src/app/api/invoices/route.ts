import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { computeInvoice, isInvoiceStatus } from "@/lib/invoice";
import { canIssueInvoice, INVOICE_ELIGIBLE_STATUSES } from "@/lib/order-flow";
import { nextNumber, ensureCounters } from "@/lib/counter";
import { jsonError } from "@/lib/api-error";

// ─── Invoices API — Phase 9 ────────────────────────────────────────
//
// GET  /api/invoices?orderId=&customerId=&status=
// POST /api/invoices  — صدور فاکتور نهایی برای سفارش
//
// گیت صدور: سفارش باید در «انبار و لجستیک» یا «پایان‌یافته» باشد
// (INVOICE_ELIGIBLE_STATUSES). هر سفارش فقط یک فاکتور نهایی دارد
// (orderId یکتا → 409). paidAmount به‌صورت افزایشی روی order.paidAmount.

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

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");
    const customerId = searchParams.get("customerId");
    const status = searchParams.get("status");

    if (status !== null && !isInvoiceStatus(status)) {
      return NextResponse.json(
        { error: `وضعیت نامعتبر: ${status}` },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = {};
    if (orderId) where.orderId = orderId;
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;

    const invoices = await db.invoice.findMany({
      where,
      orderBy: { number: "desc" },
      include: INCLUDE,
    });
    return NextResponse.json({ invoices });
  } catch (e) {
    return jsonError(e, "خطا در دریافت فاکتورها");
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  // ترمیم شمارنده قبل از تراکنش (idempotent)
  await ensureCounters();

  try {
    const body = await req.json();
    const {
      orderId,
      customerId,
      status,
      items,
      discountAmount,
      taxRate,
      paidAmount,
      dueDays,
      notes,
      terms,
    } = body ?? {};

    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json(
        { error: "شناسه سفارش الزامی است" },
        { status: 400 }
      );
    }

    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, status: true, number: true },
    });
    if (!order) {
      return NextResponse.json(
        { error: "سفارش مرتبط یافت نشد" },
        { status: 404 }
      );
    }

    // گیت مرحله: فقط انبار/لجستیک به بعد
    if (!canIssueInvoice(order.status)) {
      return NextResponse.json(
        {
          error: `صدور فاکتور فقط در مرحلهٔ «انبار و لجستیک» یا «پایان‌یافته» ممکن است — وضعیت فعلی: ${order.status}`,
          eligible: INVOICE_ELIGIBLE_STATUSES,
        },
        { status: 409 }
      );
    }

    // یکتایی: هر سفارش یک فاکتور
    const conflict = await db.invoice.findUnique({
      where: { orderId },
      select: { id: true, number: true },
    });
    if (conflict) {
      return NextResponse.json(
        { error: `این سفارش قبلاً فاکتور #${conflict.number} دارد` },
        { status: 409 }
      );
    }

    let computed;
    try {
      computed = computeInvoice({ items, discountAmount, taxRate, paidAmount, dueDays, notes, terms });
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 400 }
      );
    }

    if (status !== undefined && status !== null && !isInvoiceStatus(status)) {
      return NextResponse.json(
        { error: `وضعیت نامعتبر: ${status}` },
        { status: 400 }
      );
    }
    const initialStatus = isInvoiceStatus(status) ? status : "issued";

    const invoice = await db.$transaction(async (tx) => {
      const num = await nextNumber(tx, "invoice");
      const inv = await tx.invoice.create({
        data: {
          number: num,
          orderId,
          customerId: customerId || order.customerId,
          status: initialStatus,
          items: JSON.stringify(computed.items),
          subtotal: computed.subtotal,
          discountAmount: computed.discountAmount,
          taxRate: computed.taxRate,
          taxAmount: computed.taxAmount,
          totalAmount: computed.totalAmount,
          paidAmount: computed.paidAmount,
          dueDate: computed.dueDate,
          notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
          terms: typeof terms === "string" && terms.trim() ? terms.trim() : null,
          source: "manual",
        },
        include: INCLUDE,
      });

      // قرارداد افزایشی paidAmount (مشترک با پیش‌فاکتور)
      if (computed.paidAmount > 0) {
        await tx.order.update({
          where: { id: orderId },
          data: { paidAmount: { increment: computed.paidAmount } },
        });
      }

      await tx.notification.create({
        data: {
          title: `فاکتور #${num} صادر شد`,
          message: `فاکتور نهایی سفارش #${order.number} صادر شد.`,
          type: "success",
          link: "admin:orders",
        },
      });

      return inv;
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (e) {
    return jsonError(e, "خطا در صدور فاکتور");
  }
}
