// CRM shared constants & helpers

import type { IconName } from "@/lib/icons";

export type DealStage = "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
export type ActivityType = "call" | "email" | "meeting" | "note" | "visit";
export type DealSource = "walk-in" | "phone" | "referral" | "online" | "other";

export const DEAL_STAGES: DealStage[] = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
];

export const STAGE_LABELS: Record<DealStage, string> = {
  lead: "سرنخ",
  qualified: "واجد شرایط",
  proposal: "پیشنهاد",
  negotiation: "مذاکره",
  won: "برنده",
  lost: "بازنده",
};

export const STAGE_COLORS: Record<DealStage, { bg: string; text: string; bar: string; dot: string; border: string }> = {
  lead: {
    bg: "bg-slate-100 dark:bg-slate-800/60",
    text: "text-slate-700 dark:text-slate-300",
    bar: "bg-slate-400",
    dot: "bg-slate-400",
    border: "border-slate-200 dark:border-slate-700",
  },
  qualified: {
    bg: "bg-sky-100 dark:bg-sky-950/60",
    text: "text-sky-700 dark:text-sky-300",
    bar: "bg-sky-500",
    dot: "bg-sky-500",
    border: "border-sky-200 dark:border-sky-800",
  },
  proposal: {
    bg: "bg-violet-100 dark:bg-violet-950/60",
    text: "text-violet-700 dark:text-violet-300",
    bar: "bg-violet-500",
    dot: "bg-violet-500",
    border: "border-violet-200 dark:border-violet-800",
  },
  negotiation: {
    bg: "bg-amber-100 dark:bg-amber-950/60",
    text: "text-amber-700 dark:text-amber-300",
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    border: "border-amber-200 dark:border-amber-800",
  },
  won: {
    bg: "bg-emerald-100 dark:bg-emerald-950/60",
    text: "text-emerald-700 dark:text-emerald-300",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  lost: {
    bg: "bg-rose-100 dark:bg-rose-950/60",
    text: "text-rose-700 dark:text-rose-300",
    bar: "bg-rose-500",
    dot: "bg-rose-500",
    border: "border-rose-200 dark:border-rose-800",
  },
};

export const DEFAULT_PROBABILITY: Record<DealStage, number> = {
  lead: 10,
  qualified: 25,
  proposal: 50,
  negotiation: 75,
  won: 100,
  lost: 0,
};

export const ACTIVITY_TYPES: ActivityType[] = ["call", "email", "meeting", "note", "visit"];

export const ACTIVITY_META: Record<
  ActivityType,
  { label: string; icon: IconName; color: string; bg: string }
> = {
  call: { label: "تماس تلفنی", icon: "customers", color: "text-sky-600 dark:text-sky-300", bg: "bg-sky-100 dark:bg-sky-950/60" },
  email: { label: "ایمیل", icon: "mail", color: "text-violet-600 dark:text-violet-300", bg: "bg-violet-100 dark:bg-violet-950/60" },
  meeting: { label: "جلسه", icon: "userGroup", color: "text-amber-600 dark:text-amber-300", bg: "bg-amber-100 dark:bg-amber-950/60" },
  note: { label: "یادداشت", icon: "file", color: "text-slate-600 dark:text-slate-300", bg: "bg-slate-100 dark:bg-slate-800" },
  visit: { label: "ویزیت حضوری", icon: "mapPin", color: "text-emerald-600 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-950/60" },
};

export const SOURCE_LABELS: Record<DealSource, string> = {
  "walk-in": "مراجعه حضوری",
  phone: "تماس تلفنی",
  referral: "معرفی",
  online: "آنلاین",
  other: "سایر",
};

export const SOURCE_OPTIONS: { value: DealSource; label: string }[] = [
  { value: "walk-in", label: "مراجعه حضوری" },
  { value: "phone", label: "تماس تلفنی" },
  { value: "referral", label: "معرفی" },
  { value: "online", label: "آنلاین" },
  { value: "other", label: "سایر" },
];

export const STAGE_OPTIONS: { value: DealStage; label: string }[] = DEAL_STAGES.map((s) => ({
  value: s,
  label: STAGE_LABELS[s],
}));

export type Deal = {
  id: string;
  title: string;
  customerId: string;
  customer: { id: string; name: string; phone: string };
  value: number;
  stage: DealStage;
  probability: number;
  expectedCloseDate: string | null;
  source: DealSource | null;
  description: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { activities: number };
};

export type Activity = {
  id: string;
  type: ActivityType;
  title: string;
  description: string | null;
  customerId: string | null;
  customer: { id: string; name: string; phone: string } | null;
  dealId: string | null;
  deal: { id: string; title: string } | null;
  date: string;
  createdAt: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  isFavorite: boolean;
  balanceDue: number;
  note: string | null;
  createdAt: string;
  _count?: { orders: number; deals: number; activities: number };
};
