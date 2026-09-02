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
  // ─────────── SETTINGS (System-wide — master only) ───────────
  // «کاربران و نقش‌ها» مال کل سیستم است، نه پنل ادمین داخلی:
  // ساخت/حذف کاربر و تغییر نقش = اختیارات ادمین سراسری (master).
  {
    key: "settings",
    label: "Settings",
    faLabel: "تنظیمات سیستم",
    icon: "settings",
    masterOnly: true,
    groups: [
      {
        id: "main",
        label: "مدیریت سیستم",
        icon: "gear",
        items: [
          { id: "users", label: "کاربران و نقش‌ها", icon: "user", page: "users" },
          // Phase 12: حضور و غیاب واقعی + آمار عملکرد هر کارمند
          { id: "employees", label: "مدیریت کارمندان", icon: "checkList", page: "employees" },
        ],
      },
    ],
  },
];

/** ماژول‌های قابل مشاهده برای کاربر فعلی.
 *
 * Phase 12 — RBAC چند-ماژوله:
 *   master      → همهٔ ماژول‌ها + تنظیمات سیستم
 *   غیر-master → دقیقاً ماژول‌های تیک‌خوردهٔ او (UserModule) — نه یک مورد بیشتر
 *   «فقط باید همون نقشی که بهم داده وارد شه» — خواستهٔ صریح کاربر.
 */
export type NavUser = { role: string; modules?: string[] } | null | undefined;

export function visibleModules(user?: NavUser): ModuleNav[] {
  if (!user) return [];
  if (user.role === "master") {
    // master: همه + تنظیمات (masterOnly)
    return NAV.filter((m) => !m.masterOnly || user.role === "master");
  }
  const mods = new Set(user.modules ?? []);
  return NAV.filter((m) => !m.masterOnly && mods.has(m.key));
}

/** کلیدهای ماژول‌های مجاز برای گاردهای سمت کلاینت (ModuleRouter/palette). */
export function allowedModuleKeys(user?: NavUser): string[] {
  return visibleModules(user).map((m) => m.key);
}

export function findModule(key: string) {
  return NAV.find((m) => m.key === key) ?? NAV[0];
}
