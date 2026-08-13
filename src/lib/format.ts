// Printoo24 ERP — formatting helpers
// All dates Gregorian (English numerals), currency in Toman.

import { format, formatDistanceToNow, differenceInCalendarDays, isValid } from "date-fns";

export function formatCurrency(amount: number | null | undefined): string {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n) + " " + "تومان";
}

export function formatNumber(amount: number | null | undefined): string {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

export function formatDate(date: Date | string | null | undefined, withTime = false): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isValid(d)) return "—";
  return format(d, withTime ? "yyyy/MM/dd HH:mm" : "yyyy/MM/dd");
}

export function formatDateTime(date: Date | string | null | undefined): string {
  return formatDate(date, true);
}

export function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isValid(d)) return "—";
  return formatDistanceToNow(d, { addSuffix: true });
}

export function daysRemaining(endDate: Date | string | null | undefined): {
  text: string;
  status: "remaining" | "overdue" | "today" | "none";
  days: number;
} {
  if (!endDate) return { text: "بدون زمان پایان", status: "none", days: 0 };
  const d = typeof endDate === "string" ? new Date(endDate) : endDate;
  if (!isValid(d)) return { text: "—", status: "none", days: 0 };
  const diff = differenceInCalendarDays(d, new Date());
  if (diff > 0) return { text: `${diff} روز باقی مانده`, status: "remaining", days: diff };
  if (diff === 0) return { text: "موعد امروز", status: "today", days: 0 };
  return { text: `${Math.abs(diff)} روز گذشته`, status: "overdue", days: Math.abs(diff) };
}

export function toISO(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isValid(d)) return null;
  return d.toISOString();
}
