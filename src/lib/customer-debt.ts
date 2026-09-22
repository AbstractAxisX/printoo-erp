// Printoo24 ERP — بدهی زندهٔ مشتریان (Phase 17-D + Phase 25 چندارزی)
//
// فیلد Customer.balanceDue یک snapshot قدیمی است و با واقعیت فاکتورها
// هم‌خوان نیست؛ عدد واقعی «مانده حساب» باید زنده از سفارش‌ها محاسبه شود:
//
//   unsettled(customer) = Σ over orders (status ∉ {cancelled, archived})
//                          of max(0, totalAmount − paidAmount)
//
// نکته‌ها:
//  - سفارشِ لغو/آرشیو بدهی ندارد (حسابش بسته است).
//  - کسرِ بدهی per-order است: اضافه‌پرداختِ یک سفارش ماندهٔ سفارش دیگرِ
//    همان مشتری را جبران نمی‌کند — تا جمع با منطق تسویهٔ فاکتورها
//    (lib/paid-sync) هم‌خوان بماند.
//  - این تابع مشترک بین GET /api/customers و GET /api/dashboard است
//    تا «کارت مشتریان تسویه‌نکرده»ی داشبورد دقیقاً همان عدد لیست را نشان دهد.
//
// ─── فاز ۲۵: چندارزی ──────────────────────────────────────────────
//  - unsettledByCustomer(): جمع به «معادل دیناری» با نرخ لحظه‌ای
//    (سازگار با همهٔ UIهای فعلی که IQD فرض می‌کنند).
//  - unsettledPerCurrencyByCustomer(): تفکیک ارزی + معادل — برای
//    نمایش چیپ ارز کنار ماندهٔ مشتری.

import { db } from "@/lib/db";
import { sumByCurrency, toIqdEquivalent, type Currency } from "@/lib/money";
import { getLiveRates } from "@/lib/fx";

type DueRow = { customerId: string; due: number; currency: string };

async function loadDueRows(): Promise<DueRow[]> {
  const orders = await db.order.findMany({
    where: { status: { notIn: ["cancelled", "archived"] } },
    select: { customerId: true, totalAmount: true, paidAmount: true, currency: true },
  });
  const rows: DueRow[] = [];
  for (const o of orders) {
    const due = Math.max(0, o.totalAmount - o.paidAmount);
    if (due <= 0) continue;
    rows.push({
      customerId: o.customerId,
      due,
      currency: o.currency === "USD" || o.currency === "IRT" ? o.currency : "IQD",
    });
  }
  return rows;
}

/** مبلغ بدهی زندهٔ هر مشتری — کلید = customerId، مقدار = معادل دیناری (نرخ لحظه‌ای). */
export async function unsettledByCustomer(): Promise<Map<string, number>> {
  const [rows, rates] = await Promise.all([loadDueRows(), getLiveRates()]);
  // اول تفکیک ارزی per-customer، بعد تبدیل به دینار
  const perCustomer = new Map<string, Record<Currency, number>>();
  for (const r of rows) {
    const m = perCustomer.get(r.customerId) ?? { IQD: 0, USD: 0, IRT: 0 };
    m[r.currency as Currency] += r.due;
    perCustomer.set(r.customerId, m);
  }
  const map = new Map<string, number>();
  for (const [cid, per] of perCustomer) {
    map.set(cid, toIqdEquivalent(per, rates));
  }
  return map;
}

/** بدهی تفکیکی هر مشتری — کلید = customerId، مقدار = { per, iqdEq, mixed }. */
export async function unsettledPerCurrencyByCustomer(): Promise<
  Map<string, { per: Record<Currency, number>; iqdEq: number; mixed: boolean }>
> {
  const [rows, rates] = await Promise.all([loadDueRows(), getLiveRates()]);
  const perCustomer = new Map<string, Record<Currency, number>>();
  for (const r of rows) {
    const m = perCustomer.get(r.customerId) ?? { IQD: 0, USD: 0, IRT: 0 };
    m[r.currency as Currency] += r.due;
    perCustomer.set(r.customerId, m);
  }
  const map = new Map<string, { per: Record<Currency, number>; iqdEq: number; mixed: boolean }>();
  for (const [cid, per] of perCustomer) {
    const mixed = (["IQD", "USD", "IRT"] as Currency[]).filter((c) => per[c] > 0.0001).length > 1;
    map.set(cid, { per, iqdEq: toIqdEquivalent(per, rates), mixed });
  }
  return map;
}
