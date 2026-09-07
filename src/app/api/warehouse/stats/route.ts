import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// ─── Phase 16: GET /api/warehouse/stats ─────────────────────────
// KPI داشبورد انبار/لجستیک:
//   pendingPackItems → اقلام انبارِ بسته‌نشده (منتظر بسته‌بندی)
//   packagesPacking/Ready/Sent/DeliveredToday → جریان بسته‌ها
//   codMonth → درآمد لجستیک (ماه جاری — RevenueLog module=logistics)
//   lowStock[] → مواد کم‌موجود
//   inWarehouseOrders → سفارش‌های در مرحلهٔ انبار

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const gate = await requireModuleAccess("warehouse");
  if (gate instanceof NextResponse) return gate;

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [
      whItems,
      packing,
      ready,
      sent,
      deliveredToday,
      codMonth,
      lowStock,
      inWarehouseOrders,
    ] = await Promise.all([
      // اقلام در مرحلهٔ انبار
      db.orderItem.findMany({
        where: { stage: "warehouse" },
        select: { id: true, orderId: true },
      }),
      db.package.count({ where: { status: "packing" } }),
      db.package.count({ where: { status: "ready" } }),
      db.package.count({ where: { status: "sent" } }),
      db.package.count({
        where: { status: "delivered", deliveredAt: { gte: dayStart, lt: dayEnd } },
      }),
      db.revenueLog.aggregate({
        where: { module: "logistics", createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      db.material.findMany({
        where: { isActive: true, quantity: { lt: db.material.fields.minQuantity } },
        orderBy: { quantity: "asc" },
        take: 6,
        select: { id: true, name: true, unit: true, quantity: true, minQuantity: true },
      }),
      db.order.count({ where: { status: "warehouse_logistics" } }),
    ]);

    // اقلام بسته‌نشده = انبارِ نبودن در بستهٔ فعال
    const itemIds = whItems.map((i) => i.id);
    const packedItems = itemIds.length
      ? await db.packageItem.findMany({
          where: { orderItemId: { in: itemIds }, package: { status: { not: "cancelled" } } },
          select: { orderItemId: true },
        })
      : [];
    const packedSet = new Set(packedItems.map((p) => p.orderItemId));
    const pendingPackItems = whItems.filter((i) => !packedSet.has(i.id)).length;

    return NextResponse.json({
      pendingPackItems,
      packagesPacking: packing,
      packagesReady: ready,
      packagesSent: sent,
      deliveredToday,
      codMonth: codMonth._sum.amount ?? 0,
      inWarehouseOrders,
      lowStock: lowStock.map((m) => ({
        id: m.id,
        name: m.name,
        unit: m.unit,
        quantity: m.quantity,
        minQuantity: m.minQuantity,
      })),
    });
  } catch (e) {
    return jsonError(e, "خطا در آمار انبار");
  }
}
