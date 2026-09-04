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
          { id: "dashboard", label: "داشبورد", icon: "dashboard", page: "dashboard" },
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
          { id: "orders", label: "سفارشات انبار", icon: "orders", page: "orders" },
          { id: "inventory", label: "موجودی انبار", icon: "boxes", page: "inventory" },
          { id: "materials", label: "مواد اولیه", icon: "layers", page: "materials" },
        ],
      },
    ],
  },

  // ─────────── FINANCE ───────────
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
          { id: "costs", label: "هزینه‌ها", icon: "money", page: "costs" },
        ],
      },
      {
        id: "money",
        label: "مالی",
        icon: "coins",
        items: [
          { id: "invoices", label: "فاکتورها", icon: "invoice", page: "invoices" },
          { id: "payments", label: "پرداخت‌ها", icon: "creditCard", page: "payments" },
          { id: "expenses", label: "هزینه‌های عمومی", icon: "coins", page: "expenses" },
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
 *   «فقط باید همون نقشی که بهم داده وارد شه» — خواستهٔ صریح کاربر.
 */
export type NavUser = { role: string; modules?: string[] } | null | undefined;

export function visibleModules(user?: NavUser): ModuleNav[] {
  if (!user) return [];
  if (user.role === "master") {
    return NAV.filter((m) => !m.masterOnly || user.role === "master");
  }
  const mods = new Set(user.modules ?? []);
  return NAV.filter((m) => !m.masterOnly && mods.has(m.key));
}

/** کلیدهای ماژول‌های مجاز برای گاردهای سمت کلاینت (ModuleRouter/palette). */
export function allowedModuleKeys(user?: NavUser): string[] {
  // Phase 13: «profile» همیشه مجاز است — پروفایلِ خود، حقِ همه است.
  return [...visibleModules(user).map((m) => m.key), PROFILE_MODULE];
}

export function findModule(key: string) {
  return NAV.find((m) => m.key === key) ?? NAV[0];
}
