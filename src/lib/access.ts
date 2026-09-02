// Printoo24 ERP — Phase 12: RBAC چند-ماژوله (دسترسی + تخصیص)
//
// منبع حقیقتِ دسترسی: ردیف‌های UserModule (many-to-many).
//   master          → دسترسی ضمنی به همه‌چیز + تنظیمات سیستم (کاربران/کارمندان)
//   ماژول admin     → «مدیر داخلی»: همهٔ بُردها/داشبورد کامل را می‌بیند (بدون فیلتر تخصیص)
//   بقیه            → دقیقاً ماژول‌های تیک‌خورده‌شان
//
// این فایل تنها نقطهٔ تصمیم‌گیری دسترسی است — sidebar، پالت فرمان،
// ModuleRouter و همهٔ گاردهای API از همین توابع تغذیه می‌شوند تا هرگز
// دو قاعدهٔ ناهمخوان وجود نداشته باشد (single source of truth).

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, touchLastSeen } from "@/lib/auth";

export { touchLastSeen }; // برای routeهای presence (heartbeat/login)

// هم‌ارز ModuleKey در lib/constants.ts — خودآگاهانه duplicate تا import cycle نداشته باشیم
export const MODULE_KEYS = [
  "admin",
  "designer",
  "print",
  "warehouse",
  "finance",
  "qc",
  "crm",
  "srm",
] as const;

export type ModuleKeyStr = (typeof MODULE_KEYS)[number];

export function isModuleKey(v: unknown): v is ModuleKeyStr {
  return typeof v === "string" && (MODULE_KEYS as readonly string[]).includes(v);
}

/** حضور آنلاین: lastSeenAt جدیدتر از این پنجره = آنلاین (heartbeat هر ۴۵ث). */
export const ONLINE_WINDOW_MS = 3 * 60 * 1000;

export function isOnline(lastSeenAt: Date | string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const t = typeof lastSeenAt === "string" ? new Date(lastSeenAt).getTime() : lastSeenAt.getTime();
  return Date.now() - t < ONLINE_WINDOW_MS;
}

/** آیا این کاربر «مدیر» است؟ (master یا ماژول admin) — بدون فیلتر تخصیص می‌بیند. */
export function isManager(user: { role: string; modules: string[] }): boolean {
  return user.role === "master" || user.modules.includes("admin");
}

/** دسترسی به یک ماژول مشخص؟ (master ضمناً همه). */
export function hasModule(
  user: { role: string; modules: string[] },
  module: string
): boolean {
  return user.role === "master" || user.modules.includes(module);
}

/** کاربرِ لاگین‌شده + دسترسی ماژول — ۴۰۳ فارسی در غیر این صورت. */
export async function requireModuleAccess(module: string) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!hasModule(user, module)) {
    return NextResponse.json(
      { error: "شما به این بخش دسترسی ندارید" },
      { status: 403 }
    );
  }
  return user;
}

/** کاربرِ لاگین‌شده + نقش مدیریتی — ۴۰۳ فارسی در غیر این صورت. */
export async function requireManager() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!isManager(user)) {
    return NextResponse.json(
      { error: "این عملیات مخصوص مدیریت است" },
      { status: 403 }
    );
  }
  return user;
}

// ─── تخصیص سفارش: فیلتر دیدِ بُرد ماژول (implicit board scoping) ───────────
//
// قاعدهٔ کاربر: «سفارشِ تخصیص‌یافته به کاربر دیگر، در پنل او نمی‌آید».
// برای غیرمدیرها، لیست سفارش‌ها به این شکل فیلتر می‌شود:
//   • سفارش‌هایی که طراح/چاپشان خودِ اوست (هر وضعیتی — تاریخچه هم می‌ماند)
//   • سفارش‌های تخصیص‌نیافتهٔ «همان مرحله‌ای که ماژولش را دارد» (استخر عمومی)
//   • سفارش‌هایی که آیتمی از آن‌ها را خودش تکمیل کرده (مالکیت تاریخی)
export function orderScopeWhere(user: {
  id: string;
  role: string;
  modules: string[];
}): Prisma.OrderWhereInput | null {
  if (isManager(user)) return null; // مدیر: بدون فیلتر

  const or: Prisma.OrderWhereInput[] = [
    { assignedDesignerId: user.id },
    { assignedPrinterId: user.id },
    { items: { some: { designCompletedBy: user.id } } },
    { items: { some: { printCompletedBy: user.id } } },
  ];
  // استخر عمومی: فقط برای ماژول‌هایی که واقعاً دارد
  if (user.modules.includes("designer")) {
    or.push({ status: "pending_design", assignedDesignerId: null });
  }
  if (user.modules.includes("print")) {
    or.push({ status: "in_printing", assignedPrinterId: null });
  }
  if (or.length === 0) return { id: "__none__" }; // هیچ ماژول مرتبط → لیست خالی
  return { OR: or };
}

/** دیدن جزئیات یک سفارش مشخص برای غیرمدیر (defense-in-depth روی [id] GET). */
export function canUserViewOrder(
  user: { id: string; role: string; modules: string[] },
  order: {
    status: string;
    assignedDesignerId: string | null;
    assignedPrinterId: string | null;
    items: { designCompletedBy: string | null; printCompletedBy: string | null }[];
  }
): boolean {
  if (isManager(user)) return true;
  if (order.assignedDesignerId === user.id || order.assignedPrinterId === user.id) return true;
  if (order.items.some((i) => i.designCompletedBy === user.id || i.printCompletedBy === user.id)) return true;
  if (order.status === "pending_design" && !order.assignedDesignerId && user.modules.includes("designer")) return true;
  if (order.status === "in_printing" && !order.assignedPrinterId && user.modules.includes("print")) return true;
  return false;
}

/** ناظر وضعیت: مدیر → تخصیص دیگری اشکال ندارد؛ کاربرِ تخصیص‌یافته → مجاز. */
export function isOrderAssigneeAllowed(
  user: { id: string; role: string; modules: string[] },
  order: { assignedDesignerId: string | null; assignedPrinterId: string | null },
  stage: "design" | "print"
): { ok: true } | { ok: false; message: string } {
  if (isManager(user)) return { ok: true };
  const assigned = stage === "design" ? order.assignedDesignerId : order.assignedPrinterId;
  if (assigned && assigned !== user.id) {
    return {
      ok: false,
      message: "این سفارش به کارمند دیگری تخصیص یافته است — شما مجاز به اقدام روی آن نیستید",
    };
  }
  return { ok: true };
}

// ─── اعتبارسنجی تخصیص (wizard / PUT سفارش) ───────────────────────────
//
/** کاربرِ تخصیص باید وجود داشته باشد، فعال باشد و ماژول مربوطه را داشته باشد. */
export async function validateAssigneeForModule(
  userId: unknown,
  module: "designer" | "print"
): Promise<{ ok: true; user: { id: string; name: string } } | { ok: false; error: string }> {
  if (userId === null || userId === undefined || userId === "") {
    return { ok: true, user: { id: "", name: "" } }; // بدون تخصیص = استخر عمومی
  }
  if (typeof userId !== "string") {
    return { ok: false, error: "شناسهٔ کاربر نامعتبر است" };
  }
  const found = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, status: true, role: true, modules: { select: { module: true } } },
  });
  if (!found) return { ok: false, error: "کاربر انتخاب‌شده وجود ندارد (ممکن است حذف شده باشد)" };
  if (found.status !== "active") return { ok: false, error: "کاربر انتخاب‌شده غیرفعال است" };
  if (found.role !== "master" && !found.modules.some((m) => m.module === module)) {
    return { ok: false, error: `کاربر «${found.name}» دسترسی ماژول ${module === "designer" ? "طراحی" : "چاپ"} ندارد` };
  }
  return { ok: true, user: { id: found.id, name: found.name } };
}
