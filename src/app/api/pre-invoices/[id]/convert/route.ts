import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { computeTotals, itemsFromOrderItems } from "@/lib/pre-invoice";
import { syncOrderTotalFromInvoice } from "@/lib/paid-sync";
import { nextNumber, ensureCounters } from "@/lib/counter";
import { jsonError } from "@/lib/api-error";

// ─── Pre-Invoice → Invoice conversion — Phase 7 → بازسازی Phase 10 ──
//
// POST /api/pre-invoices/[id]/convert
//   فقط از وضعیت approved. Invoice.orderId یکتاست — تکرار → 409.
//
//   Phase 10 — قرارداد تلفیق با سندهای per-item:
//   • سفارش با «یک» سند (گروهی) → همان رفتار قبلی: اقلام/مبالغ همان PI
//     منتقل می‌شود و paidAmount آن به فاکتور می‌رود.
//   • سفارش با «چند» سند (per-item) → فاکتور نهایی برای «کل سفارش»
//     صادر می‌شود: اقلام از خود آیتم‌های واقعی سفارش (سرور) + تخفیف/مالیات
//     جمعِ PIs + paidAmount = مجموع پرداخت‌های همهٔ PIs (که قبلاً روی
//     order.paidAmount اعمال شده — بدون دوبرابر شدن). همهٔ PIs تاییدشدهٔ
//     همین سفارش converted می‌شوند (چون فاکتور جایگزین همه شده است).

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

      // Phase 22 (خواستهٔ 6+10): هدیهٔ فعال سفارش — داخل تخفیف فاکتورِ
      // تبدیل‌شده تاخته می‌شود تا مشتری هدیه‌شده بدهکار نشود و total
      // سفارش هم‌عدد سند بماند (همان قرارداد صدور مستقیم فاکتور).
      const giftRow = await tx.order.findUnique({
        where: { id: existing.orderId },
        select: { giftAmount: true, currency: true },
      });
      const gift = Math.max(0, Math.round(giftRow?.giftAmount || 0));

      // همهٔ سندهای همین سفارش (برای تشخیص حالت per-item و تلفیق)
      const allPIs = await tx.preInvoice.findMany({
        where: { orderId: existing.orderId },
        orderBy: { number: "asc" },
      });
      const isMulti = allPIs.length > 1;

      let itemsJson: string;
      let subtotal: number;
      let discountAmount: number;
      let taxRate: number;
      let taxAmount: number;
      let totalAmount: number;
      let paidAmount: number;
      let notes: string | null;
      let terms: string | null;

      if (isMulti) {
        // حالت per-item → فاکتور کل سفارش از آیتم‌های واقعی
        const order = await tx.order.findUnique({
          where: { id: existing.orderId },
          include: { items: { include: { product: true } } },
        });
        const invItems = itemsFromOrderItems(order?.items ?? []);
        const totals = computeTotals(invItems, 0, 0);
        // تخفیف/مالیات/پرداخت = جمعِ همهٔ سندها (سقف‌دار)
        const sumPaid = allPIs.reduce((s, p) => s + (p.paidAmount || 0), 0);
        const sumDisc = allPIs.reduce((s, p) => s + (p.discountAmount || 0), 0);
        const avgRate =
          allPIs.length > 0
            ? allPIs.reduce((s, p) => s + (p.taxRate || 0), 0) / allPIs.length
            : 0;
        itemsJson = JSON.stringify(invItems);
        subtotal = totals.subtotal;
        // تخفیف سند = جمعِ تخفیف PIs + هدیهٔ فعال (سقف‌دار)
        discountAmount = Math.min(sumDisc + gift, subtotal);
        taxRate = Math.round(avgRate);
        taxAmount = Math.round((subtotal - discountAmount) * (taxRate / 100));
        totalAmount = Math.round(subtotal - discountAmount + taxAmount);
        paidAmount = Math.min(sumPaid, totalAmount);
        notes = allPIs.find((p) => p.notes)?.notes ?? null;
        terms = allPIs.find((p) => p.terms)?.terms ?? null;
      } else {
        // حالت تک‌سند (گروهی) → همان PI منتقل می‌شود + هدیهٔ فعال
        itemsJson = existing.items;
        subtotal = existing.subtotal;
        discountAmount = Math.min(existing.discountAmount + gift, subtotal);
        taxRate = existing.taxRate;
        // با تخت‌شدن هدیه، مالیات/جمع از نو محاسبه می‌شود
        taxAmount = Math.round((subtotal - discountAmount) * (taxRate / 100));
        totalAmount = Math.round(subtotal - discountAmount + taxAmount);
        paidAmount = Math.min(existing.paidAmount, totalAmount);
        notes = existing.notes;
        terms = existing.terms;
      }

      const invoice = await tx.invoice.create({
        data: {
          number: num,
          orderId: existing.orderId,
          customerId: existing.customerId,
          currency: giftRow?.currency ?? existing.currency ?? "IQD", // Phase 25: ارز سند = ارز سفارش
          status: "issued",
          items: itemsJson,
          subtotal,
          discountAmount,
          taxRate,
          taxAmount,
          totalAmount,
          paidAmount,
          dueDate: (() => {
            const d = new Date();
            d.setDate(d.getDate() + 30);
            return d;
          })(),
          notes,
          terms,
          source: "pre_invoice",
        },
      });

      // همهٔ سندهای تاییدشدهٔ همین سفارش converted می‌شوند (فاکتور
      // جایگزین همه است — باقی‌ماندهٔ سندهای per-item بی‌معنا می‌شود)
      await tx.preInvoice.updateMany({
        where: { orderId: existing.orderId, status: "approved" },
        data: { status: "converted" },
      });

      // Phase 22 (خواستهٔ 10): تخفیف/مالیات سند تبدیل‌شده روی دادهٔ مالی
      // سفارش هم بنشیند (هم‌عدد شدن بدهی/360/فاکتور جمعی با فاکتور).
      await syncOrderTotalFromInvoice(tx, existing.orderId, totalAmount);

      const preInvoice = await tx.preInvoice.findUnique({ where: { id } });

      return { invoice, preInvoice };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return jsonError(e, "خطا در تبدیل به فاکتور");
  }
}
