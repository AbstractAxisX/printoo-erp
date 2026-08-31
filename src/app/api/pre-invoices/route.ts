import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  normalizeItems,
  computeTotals,
  isPreInvoiceStatus,
  itemsFromOrderItems,
} from "@/lib/pre-invoice";
import { nextNumber, ensureCounters } from "@/lib/counter";
import { jsonError } from "@/lib/api-error";

// ─── Pre-Invoices API — Phase 7 rebuild ─────────────────────────────
//
// GET  /api/pre-invoices?orderId=&customerId=&status=   → لیست با فیلتر
// POST /api/pre-invoices                                → صدور پیش‌فاکتور
//
// قرارداد جدید (بازسازی کامل — مدل قبلی تستی بود):
//   POST body: {
//     orderId, customerId?, status? ("draft" پیش‌فرض),
//     items: [{name, quantity, unit?, unitPrice, discount?}],
//     discountAmount?, taxRate?, paidAmount?,
//     validDays? (پیش‌فرض ۱۵), notes?, terms?
//   }
// مبلغ paidAmount به‌صورت افزایشی روی order.paidAmount اعمال می‌شود
// (مدل قبلی مقدار را بازنویسی می‌کرد — با چند پیش‌فاکتور غلط بود).
// شماره‌گذاری اتمیک از Counter (R3). همهٔ مسیرها requireUser دارند.

const INCLUDE = {
  customer: true,
  order: { select: { id: true, number: true, status: true, endDate: true } },
} as const;

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");
    const customerId = searchParams.get("customerId");
    const status = searchParams.get("status");

    if (status !== null && !isPreInvoiceStatus(status)) {
      return NextResponse.json(
        { error: `وضعیت نامعتبر: ${status}` },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = {};
    if (orderId) where.orderId = orderId;
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;

    const preInvoices = await db.preInvoice.findMany({
      where,
      orderBy: { number: "desc" },
      include: INCLUDE,
    });
    return NextResponse.json({ preInvoices });
  } catch (e) {
    return jsonError(e, "خطا در دریافت پیش‌فاکتورها");
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
      itemId,
      discountAmount,
      taxRate,
      paidAmount,
      validDays,
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
      select: {
        id: true,
        customerId: true,
        items: {
          where: itemId ? { id: itemId } : undefined,
          include: { product: true },
        },
      },
    });
    if (!order) {
      return NextResponse.json(
        { error: "سفارش مرتبط یافت نشد" },
        { status: 404 }
      );
    }

    // Phase 10: اگر itemId آمده، آیتم باید متعلق به همین سفارش باشد
    if (itemId && order.items.length === 0) {
      return NextResponse.json(
        { error: "آیتم موردنظر در این سفارش یافت نشد" },
        { status: 404 }
      );
    }

    let normalized;
    try {
      // اقلام: یا از payload یا (Phase 10) از خود آیتم‌های واقعی سفارش
      normalized = Array.isArray(items) && items.length > 0
        ? normalizeItems(items)
        : itemsFromOrderItems(order.items);
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 400 }
      );
    }
    if (normalized.length === 0) {
      return NextResponse.json(
        { error: "حداقل یک قلم برای پیش‌فاکتور الزامی است" },
        { status: 400 }
      );
    }

    const totals = computeTotals(
      normalized,
      Number(discountAmount) || 0,
      Number(taxRate) || 0
    );

    const paid = Math.min(
      Math.max(0, Number(paidAmount) || 0),
      totals.totalAmount
    );

    if (status !== undefined && status !== null && !isPreInvoiceStatus(status)) {
      return NextResponse.json(
        { error: `وضعیت نامعتبر: ${status}` },
        { status: 400 }
      );
    }
    if (status === "converted") {
      return NextResponse.json(
        { error: "پیش‌فاکتور جدید نمی‌تواند از ابتدا «تبدیل‌شده» باشد" },
        { status: 400 }
      );
    }

    const days = Math.max(1, Math.min(365, Number(validDays) || 15));
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + days);

    const preInvoice = await db.$transaction(async (tx) => {
      // R3: شماره‌گذاری اتمیک و خودترمیم — lib/counter
      const num = await nextNumber(tx, "preInvoice");

      const pi = await tx.preInvoice.create({
        data: {
          number: num,
          orderId,
          customerId: customerId || order.customerId,
          itemId: itemId || null,
          status: status || "draft",
          validUntil,
          items: JSON.stringify(normalized),
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxRate: totals.taxRate,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          paidAmount: paid,
          notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
          terms: typeof terms === "string" && terms.trim() ? terms.trim() : null,
        },
        include: INCLUDE,
      });

      // همگام‌سازی افزایشی paidAmount سفارش (نه بازنویسی)
      if (paid > 0) {
        await tx.order.update({
          where: { id: orderId },
          data: { paidAmount: { increment: paid } },
        });
      }
      return pi;
    });

    return NextResponse.json({ preInvoice }, { status: 201 });
  } catch (e) {
    return jsonError(e, "خطا در صدور پیش‌فاکتور");
  }
}
