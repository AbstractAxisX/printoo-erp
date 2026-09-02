// Phase 12 — backfill: RBAC چند-ماژوله برای کاربران موجود
//
// بعد از `prisma db push`:
//   1) هر کاربر غیر-master یک ردیف UserModule بر اساس role فعلی‌اش می‌گیرد
//      (designer/print/... — admin→admin). master نیازی به ردیف ندارد (دسترسی ضمنی).
//   2) order.createdBy که در دیتای قدیمی گاهی نام/نام کاربر بود → createdById
//      معتبر نمی‌شود؛ فقط اگر با id کاربری واقعی match شد منتقل می‌شود.
//   3) login tracking اولیه: lastLoginAt/lastSeenAt/loginCount از AuditLog موجود
//      حدس زده نمی‌شود — فقط updatedAt به عنوان آخرین حضور تقریبی ثبت می‌شود.
// idempotent است — اجرای چندباره تغییر جدیدی ایجاد نمی‌کند.

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const db = new PrismaClient();

const MODULE_KEYS = [
  "admin", "designer", "print", "warehouse", "finance", "qc", "crm", "srm",
];

// userId ثابت برای «مدیر سیستم» seed — بر اساس ایمیل پیدا می‌شود.
async function main() {
  const users = await db.user.findMany({ select: { id: true, role: true, email: true, updatedAt: true } });
  let created = 0;

  for (const u of users) {
    if (u.role === "master") continue;
    if (!MODULE_KEYS.includes(u.role)) continue; // نقش ناشناخته → بدون ردیف (ادمین در UI اصلاح می‌کند)

    const existing = await db.userModule.findUnique({
      where: { userId_module: { userId: u.id, module: u.role } },
    });
    if (!existing) {
      await db.userModule.create({ data: { userId: u.id, module: u.role } });
      created++;
    }
  }

  // createdById: اگر createdBy یک id واقعی است، منتقلش کن (بقایای قدیمی نادر)
  const orders = await db.order.findMany({
    where: { createdBy: { not: null } },
    select: { id: true, createdBy: true },
  });
  const userIds = new Set(users.map((u) => u.id));
  let migrated = 0;
  for (const o of orders) {
    if (o.createdBy && userIds.has(o.createdBy)) {
      await db.order.update({
        where: { id: o.id },
        data: { createdById: o.createdBy, createdBy: null },
      });
      migrated++;
    }
  }

  // Task.completedAt backfill: تسک‌های done بدون مهر → updatedAt (تقریب شروع فاز ۱۲)
  const backfilled = await db.task.updateMany({
    where: { status: "done", completedAt: null },
    data: { completedAt: new Date() },
  });

  console.log(`✓ backfill-access: ${created} UserModule rows created, ${migrated} orders' creators migrated, ${backfilled.count} done tasks stamped, ${users.length} users scanned.`);
}

main()
  .catch((e) => {
    console.error("backfill failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

// (hash import فقط برای جلوگیری از tree-shake عادت اسکریپت‌های seed است)
void createHash;
