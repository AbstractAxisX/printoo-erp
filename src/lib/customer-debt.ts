// Printoo24 ERP — بدهی زندهٔ مشتریان (Phase 17-D)
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

import { db } from "@/lib/db";

/** مبلغ بدهی زندهٔ هر مشتری — کلید = customerId، مقدار = دینار */
export async function unsettledByCustomer(): Promise<Map<string, number>> {
  const orders = await db.order.findMany({
    where: { status: { notIn: ["cancelled", "archived"] } },
    select: { customerId: true, totalAmount: true, paidAmount: true },
  });
  const map = new Map<string, number>();
  for (const o of orders) {
    const due = Math.max(0, o.totalAmount - o.paidAmount);
    if (due <= 0) continue;
    map.set(o.customerId, (map.get(o.customerId) ?? 0) + due);
  }
  return map;
}
