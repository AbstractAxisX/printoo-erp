// Printoo24 ERP — پیکربندی ناوبری سایدبار
// هر ماژول دارای گروه‌های منو است؛ گروه‌ها می‌توانند آیتم‌های فرعی (کشویی) داشته باشند.
// نام آیکون‌ها به کلیدهای src/lib/icons.tsx ارجاع می‌دهد.

import type { IconName } from "@/lib/icons";

export type NavItem = {
  id: string; // شناسهٔ صفحه، یکتا درون ماژول
  label: string;
  icon: IconName;
  page: string;
  badge?: string; // کلید badge پویا
};

export type NavGroup = {
  id: string;
  label: string;
  icon: IconName;
  items: NavItem[];
};

export type ModuleNav = {
  key: string;
  label: string;
  faLabel: string;
  icon: IconName;
  groups: NavGroup[];
  /** فقط «ادمین سراسری» (master) این ماژول را می‌بیند — تنظیمات سیستم. */
  masterOnly?: boolean;
};

// کلید ماژول (admin, designer, print, warehouse, finance, qc, crm, srm)
// نوع string برای سازگاری با Zustand store که module را به‌صورت string نگه می‌دارد.
export type ModuleKey = string;

export const NAV: ModuleNav[] = [
  // ─────────── ADMIN (Internal operator) ───────────
  {
    key: "admin",
    label: "Admin",
    faLabel: "ادمین داخلی",
    icon: "dashboard",
    groups: [
      {
        id: "main",
        label: "اصلی",
        icon: "home",
        items: [
          { id: "dashboard", label: "داشبورد", icon: "dashboard", page: "dashboard" },
          { id: "open-orders", label: "سفارشات باز", icon: "clock", page: "open-orders" },
          { id: "tasks", label: "تسک‌ها", icon: "task", page: "tasks" },
          { id: "calendar", label: "تقویم", icon: "calendar", page: "calendar" },
        ],
      },
      {
        id: "orders-group",
        label: "سفارشات",
        icon: "orders",
        items: [
          { id: "orders", label: "همه سفارشات", icon: "orders", page: "orders" },
          { id: "orders-new", label: "سفارش جدید", icon: "plusCircle", page: "orders-new" },
          { id: "archive", label: "آرشیو سفارشات", icon: "archive", page: "archive" },
        ],
      },
      {
        id: "relations",
        label: "ارتباطات",
        icon: "customers",
        items: [
          { id: "customers", label: "مشتریان (CRM)", icon: "customers", page: "customers" },
          { id: "suppliers", label: "تامین‌کنندگان (SRM)", icon: "suppliers", page: "suppliers" },
          { id: "products", label: "محصولات", icon: "package", page: "products" },
          { id: "expense-types", label: "انواع هزینه", icon: "tag", page: "expense-types" },
        ],
      },
      {
        id: "settings",
        label: "تنظیمات پایه",
        icon: "grid2",
        items: [
          // Phase 18: فهرست مجاز شهر/استان — منبع دراپ‌داون‌های مشتری
          { id: "locations", label: "شهرها و استان‌ها", icon: "mapPin", page: "locations" },
        ],
      },
    ],
  },

  // ─────────── DESIGNER ───────────
  {
    key: "designer",
    label: "Designer",
    faLabel: "طراح",
    icon: "design",
    groups: [
      {
        id: "main",
        label: "اصلی",
        icon: "home",
        items: [
          { id: "dashboard", label: "داشبورد", icon: "dashboard", page: "dashboard" },
          { id: "orders", label: "سفارشات طراحی", icon: "orders", page: "orders" },
          { id: "calendar", label: "تقویم", icon: "calendar", page: "calendar" },
          { id: "tasks", label: "تسک‌ها", icon: "task", page: "tasks" },
        ],
      },
    ],
  },

  // ─────────── PRINT ───────────
  // Phase 17: داشبورد چاپ حذف شد — کارت‌های آماری به بالای «سفارشات چاپ»
  // منتقل شدند؛ سفارشات اولین (و مقصد پیش‌فرضِ ورود) کاربر چاپ است.
  {
    key: "print",
    label: "Print",
    faLabel: "چاپ",
    icon: "print",
    groups: [
      {
        id: "main",
        label: "اصلی",
        icon: "home",
        items: [
          { id: "orders", label: "سفارشات چاپ", icon: "orders", page: "orders" },
          { id: "tasks", label: "تسک‌های چاپ", icon: "task", page: "tasks" },
          { id: "calendar", label: "تقویم", icon: "calendar", page: "calendar" },
        ],
      },
    ],
  },

  // ─────────── WAREHOUSE & LOGISTICS ───────────
  {
    key: "warehouse",
    label: "Warehouse",
    faLabel: "انبار و لجستیک",
    icon: "warehouse",
    groups: [
      {
        id: "main",
        label: "اصلی",
        icon: "home",
        items: [
          { id: "dashboard", label: "داشبورد", icon: "dashboard", page: "dashboard" },
          { id: "tasks", label: "تسک‌ها", icon: "task", page: "tasks" },
          { id: "calendar", label: "تقویم", icon: "calendar", page: "calendar" },
        ],
      },
      {
        id: "stock",
        label: "انبار",
        icon: "boxes",
        items: [
          // Phase 16: چرخهٔ کامل — دریافت از چاپ → بسته‌بندی/بج QR → ارسال/تحویل
          { id: "orders", label: "دریافت و تحویل", icon: "truck", page: "orders" },
          { id: "packages", label: "بسته‌بندی و ارسال", icon: "package", page: "packages" },
          { id: "inventory", label: "موجودی و مواد", icon: "boxes", page: "inventory" },
        ],
      },
    ],
  },

  // ─────────── FINANCE ───────────
  // Phase 15: بازطراحی کامل — داشبورد (اوورویو + فرم هزینه)،
  // تاریخچهٔ هزینه‌ها، درآمدها (دفتر درآمد)، تسویه‌نشده (بستانکار)،
  // سفارش‌ها (نمای مالی هر سفارش).
  {
    key: "finance",
    label: "Finance",
    faLabel: "مالی",
    icon: "wallet",
    groups: [
      {
        id: "main",
        label: "اصلی",
        icon: "home",
        items: [
          { id: "dashboard", label: "داشبورد", icon: "dashboard", page: "dashboard" },
          { id: "costs", label: "تاریخچه هزینه‌ها", icon: "money", page: "costs" },
          { id: "orders", label: "سفارش‌ها", icon: "orders", page: "orders" },
        ],
      },
      {
        id: "money",
        label: "گردش مالی",
        icon: "coins",
        items: [
          { id: "revenues", label: "درآمدها", icon: "trending", page: "revenues" },
          { id: "unsettled", label: "تسویه‌نشده", icon: "wallet", page: "unsettled" },
        ],
      },
      // Phase 16: حقوق و دستمزد — سکشن اختصاصی با صفحات خودش
      {
        id: "payroll",
        label: "حقوق و دستمزد",
        icon: "wallet",
        items: [
          { id: "payroll", label: "حقوق و دستمزد", icon: "wallet", page: "payroll" },
          { id: "payroll-analytics", label: "تحلیل حقوق", icon: "chartColumn", page: "payroll-analytics" },
        ],
      },
    ],
  },

  // ─────────── QUALITY CONTROL ───────────
  {
    key: "qc",
    label: "QC",
    faLabel: "کنترل کیفی",
    icon: "shield",
    groups: [
      {
        id: "main",
        label: "اصلی",
        icon: "home",
        items: [
          { id: "dashboard", label: "داشبورد", icon: "dashboard", page: "dashboard" },
          { id: "reports", label: "گزارشات", icon: "checkList", page: "reports" },
          { id: "calendar", label: "تقویم", icon: "calendar", page: "calendar" },
        ],
      },
    ],
  },

  // ─────────── CRM ───────────
  {
    key: "crm",
    label: "CRM",
    faLabel: "مدیریت مشتریان",
    icon: "customers",
    groups: [
      {
        id: "main",
        label: "اصلی",
        icon: "home",
        items: [
          { id: "dashboard", label: "داشبورد CRM", icon: "dashboard", page: "dashboard" },
          { id: "pipeline", label: "قیف فروش", icon: "layers", page: "pipeline" },
          { id: "customers", label: "مشتریان", icon: "customers", page: "customers" },
        ],
      },
      {
        id: "sales",
        label: "فروش",
        icon: "wallet",
        items: [
          { id: "deals", label: "معاملات", icon: "orders", page: "deals" },
          { id: "activities", label: "فعالیت‌ها", icon: "task", page: "activities" },
        ],
      },
    ],
  },

  // ─────────── SRM ───────────
  {
    key: "srm",
    label: "SRM",
    faLabel: "مدیریت تامین‌کنندگان",
    icon: "suppliers",
    groups: [
      {
        id: "main",
        label: "اصلی",
        icon: "home",
        items: [
          { id: "dashboard", label: "داشبورد", icon: "dashboard", page: "dashboard" },
          { id: "suppliers", label: "تامین‌کنندگان", icon: "suppliers", page: "suppliers" },
          { id: "costs", label: "هزینه‌ها", icon: "coins", page: "costs" },
        ],
      },
      {
        id: "manage",
        label: "مدیریت",
        icon: "grid",
        items: [
          { id: "categories", label: "دسته‌بندی‌ها", icon: "grid", page: "categories" },
          { id: "services", label: "خدمات", icon: "task", page: "services" },
          { id: "compare", label: "مقایسه قیمت", icon: "analytics", page: "compare" },
        ],
      },
    ],
  },
  // ─────────── SYSADMIN (مدیر سیستم — master only) ───────────
  // Phase 13: ماژول جدید «مدیر سیستم» — همان ادمین مستر. تنظیمات
  // زیرمجموعهٔ این ماژول است؛ «مدیریت کاربران» از تنظیمات به بخش
  // «مانیتورینگ» منتقل شد (مانیتورینگ کاربران + مانیتورینگ ماژول).
  {
    key: "sysadmin",
    label: "SysAdmin",
    faLabel: "مدیر سیستم",
    icon: "shield",
    masterOnly: true,
    groups: [
      {
        id: "monitoring",
        label: "مانیتورینگ",
        icon: "analytics",
        items: [
          // Phase 13: کاربران + مدیریت کاربران (ساخت/ویرایش/ماژول‌ها) +
          // حضور و آمار — دابل‌کلیک روی هر کاربر → صفحهٔ اختصاصی او.
          { id: "users", label: "مانیتورینگ کاربران", icon: "userGroup", page: "users" },
          // Phase 13: برد هر ماژول — «کی سرش شلوغ‌تره، کی تا کی کار داره،
          // کی خلوت میشه، کی کم‌کاری کرده» برای انتخاب مسئول جدید.
          { id: "modules", label: "مانیتورینگ ماژول", icon: "chartColumn", page: "modules" },
        ],
      },
      {
        id: "settings",
        label: "تنظیمات",
        icon: "gear",
        items: [
          { id: "settings", label: "تنظیمات سیستم", icon: "settings", page: "settings" },
        ],
      },
      // Phase 16: حقوق کارمندان — ساده (بدون پیچیدگی مالی/تحلیل)
      {
        id: "payroll",
        label: "حقوق و دستمزد",
        icon: "wallet",
        items: [
          { id: "payroll", label: "حقوق کارمندان", icon: "wallet", page: "payroll" },
        ],
      },
    ],
  },
];

// ─── Phase 13: ماژول مجازی «پروفایل» ───────────────────────────────
// هر کاربری پروفایل دارد و می‌تواند خودش را ببیند (+ مانیتورینگ خودش).
// در NAV نیست (سایدبار ماژولی ندارد) — از فوتر سایدبار/پالت باز می‌شود.
export const PROFILE_MODULE = "profile";

// صفحات «مخفی» — برنامه‌ای قابل پیمایش‌اند ولی در سایدبار نیستند.
// (برچسب/آیکون تب‌ها از اینجا تغذیه می‌شود)
export const HIDDEN_PAGES: Record<string, { label: string; icon: IconName }> = {
  "sysadmin:user": { label: "مانیتورینگ کاربر", icon: "userCircle" },
  "profile:view": { label: "پروفایل", icon: "userCircle" },
};

/** ماژول‌های قابل مشاهده برای کاربر فعلی.
 *
 * Phase 12 — RBAC چند-ماژوله:
 *   master      → همهٔ ماژول‌ها + مدیر سیستم (sysadmin)
 *   غیر-master → دقیقاً ماژول‌های تیک‌خوردهٔ او (UserModule) — نه یک مورد بیشتر
 *
 * Phase 18 — دسترسی صفحه‌محور (module + pages):
 *   UserModule.pages = JSON آرایهٔ صفحات مجاز آن ماژول (null = همه).
 *   آیتم‌های سایدبار ماژول به همان صفحات فیلتر می‌شوند؛ ماژولی که بعد از
 *   فیلتر هیچ صفحه‌ای ندارد کلاً از سایدبار حذف می‌شود (پنل بی‌صفحه = بی‌دسترسی).
 *   master همچنان همه‌چیز را می‌بیند.
 */
export type NavUser = {
  role: string;
  modules?: string[];
  /** Phase 18: صفحات مجاز هر ماژول — null/غایب = بدون محدودیت صفحه */
  modulePages?: Record<string, string[] | null> | null;
} | null | undefined;

/** صفحات مجازِ کاربر در یک ماژول — null = بدون محدودیت (همه). */
export function allowedPagesOf(user: NavUser, moduleKey: string): string[] | null {
  if (!user || user.role === "master") return null;
  const pages = user.modulePages?.[moduleKey];
  if (!pages || !Array.isArray(pages) || pages.length === 0) return null;
  return pages;
}

/** نسخهٔ فیلترشدهٔ یک ماژول بر اساس صفحات مجاز (خودش بدون تغییر). */
function filterModulePages(m: ModuleNav, user: NavUser): ModuleNav {
  const allowed = allowedPagesOf(user, m.key);
  if (allowed === null) return m;
  const groups = m.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed.includes(i.page)) }))
    .filter((g) => g.items.length > 0);
  return { ...m, groups };
}

export function visibleModules(user?: NavUser): ModuleNav[] {
  if (!user) return [];
  if (user.role === "master") {
    return NAV.filter((m) => !m.masterOnly || user.role === "master");
  }
  const mods = new Set(user.modules ?? []);
  return NAV
    .filter((m) => !m.masterOnly && mods.has(m.key))
    .map((m) => filterModulePages(m, user))
    .filter((m) => m.groups.some((g) => g.items.length > 0)); // ماژول بی‌صفحه → حذف
}

/** کلیدهای ماژول‌های مجاز برای گاردهای سمت کلاینت (ModuleRouter/palette). */
export function allowedModuleKeys(user?: NavUser): string[] {
  // Phase 13: «profile» همیشه مجاز است — پروفایلِ خود، حقِ همه است.
  // Phase 18: ماژول‌های بی‌صفحه (بعد از فیلتر صفحه‌ای) حذف می‌شوند.
  return [...visibleModules(user).map((m) => m.key), PROFILE_MODULE];
}

export function findModule(key: string) {
  return NAV.find((m) => m.key === key) ?? NAV[0];
}

/** آیا این صفحه در ماژول موجود است؟ (آیتم‌های سایدبار + صفحات مخفی)
 * Phase 17 — برای پاک‌سازی تب‌های ماندگارِ صفحات حذف‌شده (مثل داشبورد چاپ)
 * تا کاربر پس از حذف صفحه، روی placeholder ننشیند.
 * Phase 18 — پارامتر اختیاری user: با وجود محدودیت صفحه‌ای (modulePages)،
 * فقط صفحات مجاز آن ماژول true می‌دهند. بدون user = چک ساختاری خالص
 * (سازگاری کامل با call site‌های موجود).
 */
export function moduleHasPage(key: string, page: string, user?: NavUser): boolean {
  if (key === PROFILE_MODULE) {
    return HIDDEN_PAGES[`${key}:${page}`] !== undefined;
  }
  const m = NAV.find((x) => x.key === key);
  if (!m) return false;
  if (HIDDEN_PAGES[`${key}:${page}`]) {
    // صفحات مخفی فقط با نقش master (sysadmin) قابل دسترس‌اند — بدون محدودیت
    return user ? allowedPagesOf(user, key) === null || allowedPagesOf(user, key)!.includes(page) : true;
  }
  const inNav = m.groups.some((g) => g.items.some((i) => i.page === page));
  if (!inNav) return false;
  const allowed = allowedPagesOf(user, key);
  if (allowed === null) return true;
  return allowed.includes(page);
}

/** صفحهٔ فرود ماژول = مورد اول سایدبار آن (چاپ: «سفارشات»، بقیه: «داشبورد»).
 *  Phase 18 — با محدودیت صفحه‌ای، اولین صفحهٔ «مجاز» برمی‌گردد. */
export function firstPageOfModule(key: string, user?: NavUser): string {
  const m = NAV.find((x) => x.key === key);
  if (!m) return "dashboard";
  const allowed = allowedPagesOf(user, key);
  if (allowed === null) return m.groups[0]?.items[0]?.page ?? "dashboard";
  for (const g of m.groups) {
    const item = g.items.find((i) => allowed.includes(i.page));
    if (item) return item.page;
  }
  return "dashboard";
}
