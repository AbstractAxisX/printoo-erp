import { t } from "@/lib/i18n";
// Printoo24 ERP — app constants

// هویت چاپی شرکت — مطابق سایت printoo24.com (طرح ارجاعی سند A4).
// این مقادیر روی سربرگ پیش‌فاکتور/فاکتور چاپی درج می‌شوند.
export const COMPANY = {
  name: "Printoo24",
  faName: t("پرینتو 24"),
  tagline: t("سامانه یکپارچه مدیریت چاپ"),
  phone: "776 227 8666",
  email: "info@printoo24.com",
  website: "printoo24.com",
  address: "Sulaymaniyah, Kurdistan Region",
};

export const CURRENCY = "IQD";

// Order status flow
export type OrderStatus =
  | "pending_design"
  | "in_printing"
  | "warehouse_logistics"
  | "completed"
  | "archived"
  | "cancelled";

export const ORDER_STATUS: Record<
  OrderStatus,
  { label: string; color: string; badge: string }
> = {
  pending_design: {
    label: t("در حال طراحی"),
    color: "violet",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  in_printing: {
    label: t("در حال چاپ"),
    color: "amber",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  warehouse_logistics: {
    label: t("انبار و لجستیک"),
    color: "cyan",
    badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  },
  completed: {
    label: t("پایان یافته"),
    color: "emerald",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  archived: {
    label: t("آرشیو"),
    color: "slate",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  cancelled: {
    label: t("لغو شده"),
    color: "rose",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  },
};

// Order item stage (where the item is routed)
export type ItemStage =
  | "design"
  | "print"
  | "warehouse"
  | "completed"
  | "archive";

export const ITEM_STAGE: Record<ItemStage, { label: string }> = {
  design: { label: t("طراح") },
  print: { label: t("چاپ") },
  warehouse: { label: t("انبار و لجستیک") },
  completed: { label: t("تکمیل شده") },
  archive: { label: t("آرشیو") },
};

export const PRIORITY = {
  normal: { label: t("معمولی"), badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  urgent: { label: t("فوری"), badge: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
} as const;

export type Priority = keyof typeof PRIORITY;

export const SPLIT_MODE = {
  grouped: { label: t("گروهی") },
  separated: { label: t("تفکیک شده") },
} as const;

export type SplitMode = keyof typeof SPLIT_MODE;

// Modules
export type ModuleKey =
  | "admin"
  | "designer"
  | "print"
  | "warehouse"
  | "finance"
  | "qc"
  | "crm"
  | "srm";

// Phase 4 — Persian labels for User.role (task assignee pickers, user menus).
// Values mirror ModuleKey + master/admin (User.role comment in schema.prisma).
export const USER_ROLE: Record<string, { label: string }> = {
  master: { label: t("مدیر ارشد") },
  admin: { label: t("ادمین") },
  designer: { label: t("طراح") },
  print: { label: t("اپراتور چاپ") },
  warehouse: { label: t("انبار و لجستیک") },
  finance: { label: t("مالی") },
  qc: { label: t("کنترل کیفی") },
  crm: { label: t("ارتباط با مشتری") },
  srm: { label: t("ارتباط با تامین‌کننده") },
};

export const MODULES: Record<
  ModuleKey,
  { label: string; faLabel: string; color: string }
> = {
  admin: { label: "Admin", faLabel: t("ادمین داخلی"), color: "emerald" },
  designer: { label: "Designer", faLabel: t("طراح"), color: "violet" },
  print: { label: "Print", faLabel: t("چاپ"), color: "amber" },
  warehouse: { label: "Warehouse", faLabel: t("انبار و لجستیک"), color: "cyan" },
  finance: { label: "Finance", faLabel: t("مالی"), color: "rose" },
  qc: { label: "QC", faLabel: t("کنترل کیفی"), color: "blue" },
  crm: { label: "CRM", faLabel: t("مدیریت مشتریان"), color: "teal" },
  srm: { label: "SRM", faLabel: t("مدیریت تامین‌کنندگان"), color: "orange" },
};

export const TASK_STATUS = {
  todo: { label: t("در صف"), badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  in_progress: { label: t("در حال انجام"), badge: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  done: { label: t("انجام شده"), badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
} as const;

export type TaskStatus = keyof typeof TASK_STATUS;
