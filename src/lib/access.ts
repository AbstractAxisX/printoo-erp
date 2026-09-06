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

// ─── Phase 13: «مدیر سیستم» = مستر (صاحب سیستم) ─────────────────
// ماژول sysadmin (مانیتورینگ + تنظیمات) فقط برای master است — مدیر
// داخلی (ماژول admin) دسترسی عملیاتی دارد ولی نه مانیتورینگ سیستم.
export function isSysAdmin(user: { role: string }): boolean {
  return user.role === "master";
}

/** Phase 13: کلید روزِ لوکال yyyy-MM-dd (بدون تایم‌زون — مثل DayNote). */
export function localDayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type LeaveSpan = { startDate: string; endDate: string; note?: string | null };

/** آیا امروز (لوکال) در بازهٔ مرخصی است؟ — برای «امروز فلان طراح نیست». */
export function activeLeaveToday(leaves: LeaveSpan[]): LeaveSpan | null {
  const today = localDayKey();
  return leaves.find((l) => l.startDate <= today && today <= l.endDate) ?? null;
}

/** نزدیک‌ترین مرخصی پیش‌رو یا جاری (برای هشدار picker). */
export function upcomingLeave(leaves: LeaveSpan[], withinDays = 30): LeaveSpan | null {
  const today = localDayKey();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + withinDays);
  const hz = localDayKey(horizon);
  return (
    leaves.find((l) => l.startDate <= today && today <= l.endDate) ??
    leaves
      .filter((l) => l.startDate > today && l.startDate <= hz)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ??
    null
  );
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

// ─── Phase 13: روتینگ per-item — منبع حقیقت تخصیص ───────────────
//
// زنجیرهٔ حلّ مجری «یک آیتم»:
//   item.designAssigneeId → order.assignedDesignerId → استخر عمومی(null)
// قاعدهٔ کاربر (خواستهٔ صریح): «هر آیتم مجری خودش را دارد؛ سفارش فقط در
// پنل همان کاربر می‌آید — نه هیچ‌کس دیگر» + مالکیت تاریخی (آیتم‌هایی که
// قبلاً خودش زده) می‌ماند.

export type ItemAssigneeFields = { designAssigneeId: string | null; printAssigneeId: string | null };
export type OrderAssigneeFields = { assignedDesignerId: string | null; assignedPrinterId: string | null };

export function effectiveDesignAssigneeId(
  item: ItemAssigneeFields,
  order: OrderAssigneeFields
): string | null {
  return item.designAssigneeId ?? order.assignedDesignerId ?? null;
}

export function effectivePrintAssigneeId(
  item: ItemAssigneeFields,
  order: OrderAssigneeFields
): string | null {
  return item.printAssigneeId ?? order.assignedPrinterId ?? null;
}

/** آیا کاربر مجریِ «فعلی» این مرحلهٔ آیتم است؟ (null = استخر عمومی = مجاز) */
export function isItemActionAllowed(
  user: { id: string; role: string; modules: string[] },
  item: ItemAssigneeFields,
  order: OrderAssigneeFields,
  stage: "design" | "print"
): { ok: true } | { ok: false; message: string } {
  if (isManager(user)) return { ok: true };
  const eff =
    stage === "design"
      ? effectiveDesignAssigneeId(item, order)
      : effectivePrintAssigneeId(item, order);
  if (eff && eff !== user.id) {
    return {
      ok: false,
      message:
        stage === "design"
          ? "این آیتم به طراح دیگری تخصیص یافته است — از پنل او قابل اقدام است"
          : "این آیتم به چاپ‌کار دیگری تخصیص یافته است — از پنل او قابل اقدام است",
    };
  }
  return { ok: true };
}

// فیلتر Prisma «ردیف‌های آیتمِ قابل‌دیدن در برد طراحی» برای یک کاربر:
//   آیتم در مرحلهٔ طراحی + (مجری مستقیم من است، یا فال‌بک سفارش من است،
//   یا کاملاً بی‌مسئول = استخر عمومی)
function designerVisibleItemsFilter(userId: string): Prisma.OrderItemWhereInput {
  return {
    stage: "design",
    OR: [
      { designAssigneeId: userId },
      { designAssigneeId: null, order: { assignedDesignerId: userId } },
      { designAssigneeId: null, order: { assignedDesignerId: null } },
    ],
  };
}

function printerVisibleItemsFilter(userId: string): Prisma.OrderItemWhereInput {
  return {
    stage: "print",
    OR: [
      { printAssigneeId: userId },
      { printAssigneeId: null, order: { assignedPrinterId: userId } },
      { printAssigneeId: null, order: { assignedPrinterId: null } },
    ],
  };
}

/** اسکوپ یک «برد ماژول» (طراحی/چاپ) — مستقل از اینکه کاربر مدیر داخلی
 *  هم هست یا نه: در برد طراحی فقط آیتم‌های طراحیِ خودت را می‌بینی.
 *  مستر (صاحب سیستم) همه‌چیز را می‌بیند. */
export function boardScopeWhere(
  user: { id: string; role: string; modules: string[] },
  board: "designer" | "print"
): Prisma.OrderWhereInput {
  if (user.role === "master") return {};
  const or: Prisma.OrderWhereInput[] =
    board === "designer"
      ? [
          { items: { some: designerVisibleItemsFilter(user.id) } },
          { items: { some: { designCompletedBy: user.id } } }, // مالکیت تاریخی
        ]
      : [
          { items: { some: printerVisibleItemsFilter(user.id) } },
          { items: { some: { printCompletedBy: user.id } } },
        ];
  return { OR: or };
}

// ─── اسکوپ عمومی لیست سفارش (implicit board scoping) ───────────
//
// برای مدیرها بدون board → همه‌چیز. برای بقیه: برد هر ماژولی که دارند
// + مالکیت تاریخی — حالت item-level (فاز ۱۳).
export function orderScopeWhere(user: {
  id: string;
  role: string;
  modules: string[];
}): Prisma.OrderWhereInput | null {
  if (isManager(user)) return null; // مدیر داخلی: همه (از پنل ادمین)

  const or: Prisma.OrderWhereInput[] = [
    { items: { some: { designCompletedBy: user.id } } },
    { items: { some: { printCompletedBy: user.id } } },
  ];
  if (user.modules.includes("designer")) {
    or.push({ items: { some: designerVisibleItemsFilter(user.id) } });
  }
  if (user.modules.includes("print")) {
    or.push({ items: { some: printerVisibleItemsFilter(user.id) } });
  }
  if (or.length === 0) return { id: "__none__" }; // هیچ ماژول مرتبط → لیست خالی
  return { OR: or };
}

/** دیدن جزئیات یک سفارش مشخص (defense-in-depth روی [id] GET). */
export function canUserViewOrder(
  user: { id: string; role: string; modules: string[] },
  order: {
    status: string;
    assignedDesignerId: string | null;
    assignedPrinterId: string | null;
    items: (ItemAssigneeFields & {
      stage: string;
      designCompletedBy: string | null;
      printCompletedBy: string | null;
    })[];
  }
): boolean {
  if (isManager(user)) return true;
  // مالکیت تاریخی
  if (order.items.some((i) => i.designCompletedBy === user.id || i.printCompletedBy === user.id)) return true;
  // برد طراحی: آیتم فعلیِ طراحیِ من / استخر عمومی
  if (user.modules.includes("designer")) {
    if (
      order.items.some(
        (i) =>
          i.stage === "design" &&
          (i.designAssigneeId === user.id ||
            (!i.designAssigneeId &&
              (order.assignedDesignerId === user.id || order.assignedDesignerId === null)))
      )
    )
      return true;
  }
  if (user.modules.includes("print")) {
    if (
      order.items.some(
        (i) =>
          i.stage === "print" &&
          (i.printAssigneeId === user.id ||
            (!i.printAssigneeId &&
              (order.assignedPrinterId === user.id || order.assignedPrinterId === null)))
      )
    )
      return true;
  }
  return false;
}

/** Gate کلی اقدام روی سفارش (compat رفتار قدیمی + پیام روشن).
 *  فاز ۱۳: چک per-item در خود اکشن‌ها انجام می‌شود (isItemActionAllowed). */
export function isOrderAssigneeAllowed(
  user: { id: string; role: string; modules: string[] },
  order: OrderAssigneeFields & {
    items: (ItemAssigneeFields & { stage: string })[];
  },
  stage: "design" | "print"
): { ok: true } | { ok: false; message: string } {
  if (isManager(user)) return { ok: true };
  const stageItems = order.items.filter((i) => i.stage === stage);
  if (stageItems.length === 0) return { ok: true };
  const blocked = stageItems.filter((i) => {
    const r = isItemActionAllowed(user, i, order, stage);
    return !r.ok;
  });
  if (blocked.length === stageItems.length) {
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
