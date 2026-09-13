// Printoo24 ERP — Phase 18 seed: استان‌ها و شهرهای عراق
//
// Idempotent upsert — برای سندباکس و سرور تولید هر دو قابل اجراست:
//   node scripts/seed-locations.mjs
// استان/شهر موجود skip می‌شود؛ جداول خالی از فهرست پایه پر می‌شوند.
// مدیر بعداً از صفحهٔ «شهرها و استان‌ها» (ادمین داخلی) افزودن/حذف می‌کند.

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// ۱۹ استان عراق + شهرهای شاخص هر کدام (نام‌ها فارسی‌نویس)
const IRAQ = [
  { province: "اربیل", cities: ["اربیل", "شقلاوه", "سوران", "کوی سنجق", "مخمور", "قلات", "سالاح‌الدین"] },
  { province: "دهوک", cities: ["دهوک", "زاخو", "سیمیل", "عقره", "بردی", "فیش‌خابور"] },
  { province: "سلیمانیه", cities: ["سلیمانیه", "رانیه", "دربندیخان", "چوارقورن", "مریوان", "قلعه‌دیزه", "کفرین"] },
  { province: "حلبچه", cities: ["حلبچه", "سیروان", "خورمال"] },
  { province: "کرکوک", cities: ["کرکوک", "حویجه", "داقوق", "آلتون‌کوپری"] },
  { province: "نینوا", cities: ["موصل", "تلعفر", "سنجار", "بادوش", "حمام العلیل", "شیخان"] },
  { province: "صلاح‌الدین", cities: ["تکریت", "سامرا", "بلد", "الدور", "طوزخورماتو"] },
  { province: "بغداد", cities: ["بغداد", "الکرخ", "الرصافة", "الاعظمیه", "کاظمیه", "مدینة الصدر", "ابو غریب", "الحریة"] },
  { province: "دیاله", cities: ["بعقوبه", "المقدادیه", "خانقین", "بلدروز", "کفری"] },
  { province: "انبار", cities: ["رمادی", "فلوجه", "هیت", "حدیثه", "القائم", "حدیثه‌رطبه"] },
  { province: "بابل", cities: ["حله", "المسیب", "محمدیه", "الشامیه"] },
  { province: "کربلا", cities: ["کربلا", "عین التمر", "الحیرة"] },
  { province: "نجف", cities: ["نجف", "الکوفه", "المناذره", "المشخاب"] },
  { province: "قادسیه", cities: ["دیوانیه", "الشامیه", "عفک", "الحمزه"] },
  { province: "مثنی", cities: ["سماوه", "الخضر", "رumaitha"] },
  { province: "ذی‌قار", cities: ["ناصریه", "الرفاعی", "الشطره", "سوک الشیوخ", "الجبایش"] },
  { province: "میسان", cities: ["عماره", "المجر الکبیر", "قلعه‌صالح", "علی‌الغربی"] },
  { province: "واسط", cities: ["کوت", "بدرة", "النعمانیه", "الحی"] },
  { province: "بصره", cities: ["بصره", "الزبیر", "القرنة", "الفاو", "ابو الخصیب", "شط‌العرب"] },
];

// پاک‌سازی اشتباه تایپی سید قبلی (رumaitha → رومیثه)
const FIXUPS = [
  { province: "مثنی", from: "رumaitha", to: "رومیثه" },
  { province: "انبار", from: "حدیثه‌رطبه", to: "رطبه" },
];

async function main() {
  let p = 0, c = 0;
  for (const { province, cities } of IRAQ) {
    const prov = await db.province.upsert({
      where: { name: province },
      update: {},
      create: { name: province },
    });
    p++;
    for (const name of cities) {
      const existing = await db.city.findFirst({
        where: { name, provinceId: prov.id },
      });
      if (!existing) {
        await db.city.create({ data: { name, provinceId: prov.id } });
        c++;
      }
    }
  }
  for (const { province, from, to } of FIXUPS) {
    const prov = await db.province.findUnique({ where: { name: province } });
    if (!prov) continue;
    await db.city.deleteMany({ where: { name: from, provinceId: prov.id } });
    const exists = await db.city.findFirst({ where: { name: to, provinceId: prov.id } });
    if (!exists) await db.city.create({ data: { name: to, provinceId: prov.id } });
  }
  const [tp, tc] = await Promise.all([
    db.province.count(),
    db.city.count(),
  ]);
  console.log(`✓ locations seeded: created ${p} provinces / ${c} new cities → total ${tp} provinces, ${tc} cities`);
}

main()
  .catch((e) => {
    console.error("seed-locations failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
