// Printoo24 ERP — Phase 26 QC: سناریوی موقت برای مرورگر
// مشتری با ۵ سفارش باز (۴ بدهکار IQD + ۱ تسویه‌شده + ۱ بدهی USD) —
// دقیقاً سناریوی کاربر: «مشتری مثلا ۵ سفارش تسویه‌نشده/نیمه‌تسویه دارد،
// یک‌جا پول می‌دهد».
// setup:    node scripts/qc26.mjs setup
// teardown: node scripts/qc26.mjs teardown

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const PHONE = "07709990026";
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

async function cleanup() {
  const custs = await db.customer.findMany({ where: { phone: PHONE }, select: { id: true } });
  if (!custs.length) return;
  const ids = custs.map((c) => c.id);
  await db.preInvoice.deleteMany({ where: { customerId: { in: ids } } });
  await db.invoice.deleteMany({ where: { customerId: { in: ids } } });
  await db.order.deleteMany({ where: { customerId: { in: ids } } });
  await db.customer.deleteMany({ where: { id: { in: ids } } });
}

async function setup() {
  await cleanup();
  const maxNumber = (await db.order.aggregate({ _max: { number: true } }))._max.number ?? 0;
  const cust = await db.customer.create({
    data: { name: "کیو‌سی تسویه گروهی — علی حسن", phone: PHONE },
  });
  const mk = (i, days, total, paid, currency = "IQD") =>
    db.order.create({
      data: {
        number: maxNumber + i,
        customerId: cust.id,
        currency,
        totalAmount: total,
        paidAmount: paid,
        createdAt: new Date(now - days * DAY),
      },
    });
  // ۴ سفارش بدهکار IQD (مجموع بدهی 1,250,000) + ۱ تسویه‌شده + ۱ USD
  await mk(1, 8, 450_000, 0);        // قدیمی‌ترین — کامل بدهکار
  await mk(2, 7, 300_000, 100_000);  // نیمه‌تسویه
  await mk(3, 5, 250_000, 0);        // بدهکار
  await mk(4, 3, 600_000, 250_000);  // نیمه‌تسویه
  await mk(5, 2, 150_000, 150_000);  // تسویه‌شده — نباید بیاید
  await mk(6, 1, 200, 0, "USD");     // ارز دیگر
  console.log("QC26 SETUP OK — customer:", cust.id, "maxNumber:", maxNumber);
}

const cmd = process.argv[2];
if (cmd === "setup") {
  setup().finally(() => db.$disconnect());
} else if (cmd === "teardown") {
  cleanup()
    .then(() => console.log("QC26 TEARDOWN OK"))
    .finally(() => db.$disconnect());
} else {
  console.log("usage: node scripts/qc26.mjs setup|teardown");
  db.$disconnect();
}
