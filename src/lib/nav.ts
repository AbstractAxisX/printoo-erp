// Printoo24 ERP — sidebar navigation config
// Each module has grouped menus; groups can have sub-items (collapsible).
// Icon names refer to keys in src/lib/icons.ts

import type { IconName } from "@/lib/icons";

export type NavItem = {
  id: string; // page id, unique within module
  label: string;
  icon: IconName;
  page: string;
  badge?: string; // dynamic badge key
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
};

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
          { id: "debts", label: "بدهی‌ها", icon: "wallet", page: "debts" },
        ],
      },
    ],
  },
];

export function findModule(key: string) {
  return NAV.find((m) => m.key === key) ?? NAV[0];
}
