// Phase 22 (خواستهٔ ۱۰) — بک‌فیل یک‌بارهٔ سینک فاکتور → total سفارش
//
// برای هر سفارشی که فاکتورِ «غیر باطل» دارد (قدیمی یا جدید)،
// order.totalAmount = invoice.totalAmount می‌شود — تا بدهی مشتری،
// بستانکار مالی، نمای ۳۶۰ و فاکتور جمعی همه هم‌عدد فاکتور باشند
// (تخفیف/مالیات/هزینهٔ فاکتوری روی همه‌جا اعمال شده باشد).
//
// اجرا (یک بار بعد از دیپلوی فاز ۲۲):
//   node scripts/backfill-phase22.mjs
//
// خروجی: گزارش تعداد ردیف‌های اصلاح‌شده + نمونه.

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const invoices = await db.invoice.findMany({
    where: { status: { not: "cancelled" } },
    select: {
      id: true,
      number: true,
      orderId: true,
      totalAmount: true,
      order: { select: { totalAmount: true, number: true } },
    },
  });

  let fixed = 0;
  const samples = [];
  for (const inv of invoices) {
    if (!inv.order) continue;
    const diff = Math.round(inv.totalAmount - inv.order.totalAmount);
    if (Math.abs(diff) <= 0.001) continue;
    await db.order.update({
      where: { id: inv.orderId },
      data: { totalAmount: Math.max(0, Math.round(inv.totalAmount)) },
    });
    fixed += 1;
    if (samples.length < 10) {
      samples.push(
        `order #${inv.order.number} (فاکتور #${inv.number}): ${inv.order.totalAmount} → ${inv.totalAmount} (${diff >= 0 ? "+" : ""}${diff})`
      );
    }
  }

  console.log(`بک‌فیل فاز ۲۲ — سفارش‌های سینک‌شده با فاکتور: ${fixed} از ${invoices.length}`);
  for (const s of samples) console.log("  • " + s);
  if (fixed === 0) console.log("همه‌چیز از قبل هم‌عدد بود ✓");
}

main()
  .catch((e) => {
    console.error("بک‌فیل شکست خورد:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
