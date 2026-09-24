// Printoo24 ERP — Phase 24 backfill: تبدیل ارقام فارسی ذخیره‌شده به لاتین
//
// داده‌های قدیمی (اعلان‌ها، رویدادهای سفارش) با toLocaleString("fa-IR")
// ساخته شده بودند و متنشان ارقام فارسی دارد — در UI نمایش داده می‌شوند.
// این اسکریپت همهٔ متن‌های «سیستم‌ساخت» را به ارقام لاتین مهاجرت می‌دهد.
// (توضیحاتِ واردشده توسط کاربر دست نمی‌خورد — فقط فیلدهای سیستم.)
//
// Run: node scripts/backfill-phase24.mjs

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const FA = "۰۱۲۳۴۵۶۷۸۹";
const EN = "0123456789";
const MAP = {};
for (let i = 0; i < 10; i++) MAP[FA[i]] = EN[i];
// جداکنندهٔ هزارگان فارسی «٬» → ","
const toLatin = (s) =>
  String(s ?? "")
    .replace(/[۰-۹]/g, (d) => MAP[d] ?? d)
    .replace(/٬/g, ",");

async function main() {
  let nNotif = 0;
  let nEvents = 0;

  const notifications = await db.notification.findMany({
    select: { id: true, message: true, title: true },
  });
  for (const n of notifications) {
    const message = toLatin(n.message);
    const title = toLatin(n.title);
    if (message !== n.message || title !== n.title) {
      await db.notification.update({ where: { id: n.id }, data: { message, title } });
      nNotif++;
    }
  }

  const events = await db.orderEvent.findMany({
    select: { id: true, title: true, description: true },
  });
  for (const e of events) {
    const title = toLatin(e.title);
    const description = toLatin(e.description);
    if (title !== e.title || description !== e.description) {
      await db.orderEvent.update({ where: { id: e.id }, data: { title, description } });
      nEvents++;
    }
  }

  console.log(`backfill-phase24: notifications=${nNotif} orderEvents=${nEvents}`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("backfill failed:", e);
  await db.$disconnect();
  process.exit(1);
});
