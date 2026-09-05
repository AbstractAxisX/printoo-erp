// Phase 13 backfill — idempotent
// 1) OrderItem.designAssigneeId / printAssigneeId:
//    آیتم‌های موجود از تخصیص سفارش ارث می‌برند تا مسیر روتینگ per-item
//    روی دیتای قدیمی هم کار کند (طراحیِ ناتمام → طراح سفارش).
// 2) نمونه مرخصی برای دمو (اگر جدول خالی است).
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const orders = await db.order.findMany({
  select: { id: true, assignedDesignerId: true, assignedPrinterId: true },
});
let touchedD = 0, touchedP = 0;
for (const o of orders) {
  if (o.assignedDesignerId) {
    const r = await db.orderItem.updateMany({
      where: { orderId: o.id, stage: "design", designAssigneeId: null },
      data: { designAssigneeId: o.assignedDesignerId },
    });
    touchedD += r.count;
  }
  if (o.assignedPrinterId) {
    const r = await db.orderItem.updateMany({
      where: { orderId: o.id, stage: { in: ["design", "print"] }, printAssigneeId: null },
      data: { printAssigneeId: o.assignedPrinterId },
    });
    touchedP += r.count;
  }
}
console.log(`backfill: designAssignee×${touchedD}, printAssignee×${touchedP}`);

const leaveCount = await db.userLeave.count();
if (leaveCount === 0) {
  // دمو: سارا (طراح) مرخصی همین هفته — ادمین در مانیتورینگ می‌بیند
  const sara = await db.user.findFirst({ where: { email: "sara@printoo24.com" } });
  if (sara) {
    const today = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const plus = (n) => { const x = new Date(today); x.setDate(x.getDate() + n); return iso(x); };
    await db.userLeave.create({
      data: {
        userId: sara.id,
        startDate: plus(2),
        endDate: plus(4),
        note: "مرخصی استعلاجی (دمو)",
      },
    });
    console.log("demo leave created for سارا:", plus(2), "→", plus(4));
  }
}
await db.$disconnect();
