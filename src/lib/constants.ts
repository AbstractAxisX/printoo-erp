// Printoo24 ERP — app constants

export const COMPANY = {
  name: "Printoo24",
  faName: "پرینتو ۲۴",
  tagline: "سامانه یکپارچه مدیریت چاپ",
  phone: "+98 21 0000 0000",
  email: "info@printoo24.com",
};

export const CURRENCY = "تومان";

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
    label: "در حال طراحی",
    color: "violet",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  in_printing: {
    label: "در حال چاپ",
    color: "amber",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  warehouse_logistics: {
    label: "انبار و لجستیک",
    color: "cyan",
    badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  },
  completed: {
    label: "پایان یافته",
    color: "emerald",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  archived: {
    label: "آرشیو",
    color: "slate",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  cancelled: {
    label: "لغو شده",
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
  design: { label: "طراح" },
  print: { label: "چاپ" },
  warehouse: { label: "انبار و لجستیک" },
  completed: { label: "تکمیل شده" },
  archive: { label: "آرشیو" },
};

export const PRIORITY = {
  normal: { label: "معمولی", badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  urgent: { label: "فوری", badge: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
} as const;

export type Priority = keyof typeof PRIORITY;

export const SPLIT_MODE = {
  grouped: { label: "گروهی" },
  separated: { label: "تفکیک شده" },
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

export const MODULES: Record<
  ModuleKey,
  { label: string; faLabel: string; color: string }
> = {
  admin: { label: "Admin", faLabel: "ادمین داخلی", color: "emerald" },
  designer: { label: "Designer", faLabel: "طراح", color: "violet" },
  print: { label: "Print", faLabel: "چاپ", color: "amber" },
  warehouse: { label: "Warehouse", faLabel: "انبار و لجستیک", color: "cyan" },
  finance: { label: "Finance", faLabel: "مالی", color: "rose" },
  qc: { label: "QC", faLabel: "کنترل کیفی", color: "blue" },
  crm: { label: "CRM", faLabel: "مدیریت مشتریان", color: "teal" },
  srm: { label: "SRM", faLabel: "مدیریت تامین‌کنندگان", color: "orange" },
};

export const TASK_STATUS = {
  todo: { label: "در صف", badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  in_progress: { label: "در حال انجام", badge: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  done: { label: "انجام شده", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
} as const;

export type TaskStatus = keyof typeof TASK_STATUS;
