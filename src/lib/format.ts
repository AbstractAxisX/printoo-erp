// Printoo24 ERP — formatting helpers
// All dates Gregorian (English numerals), currency in IQD (Iraqi Dinar).

import { format, formatDistanceToNow, differenceInCalendarDays, isValid } from "date-fns";
import { t } from "@/lib/i18n";

export function formatCurrency(amount: number | null | undefined): string {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n) + " IQD";
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

// وضعیت‌های «بسته» — سفارش تمام‌شده/آرشیو/لغو دیگر موعد و زمان ندارد
// (خواستهٔ فاز 24: برای سفارش تموم‌شده کلاً زمان نشان داده نمی‌شود).
export const CLOSED_ORDER_STATUSES = new Set(["completed", "archived", "cancelled"]);

/** آیا سفارش بسته شده؟ (تمام/آرشیو/لغو) — بدون موعد و شمارش معکوس */
export function isOrderClosed(status: string | null | undefined): boolean {
  return CLOSED_ORDER_STATUSES.has(String(status ?? ""));
}

export function daysRemaining(endDate: Date | string | null | undefined): {
  text: string;
  status: "remaining" | "overdue" | "today" | "none";
  days: number;
} {
  if (!endDate) return { text: t("بدون زمان پایان"), status: "none", days: 0 };
  const d = typeof endDate === "string" ? new Date(endDate) : endDate;
  if (!isValid(d)) return { text: "—", status: "none", days: 0 };
  const diff = differenceInCalendarDays(d, new Date());
  if (diff > 0) return { text: t("{p0} روز باقی مانده", { p0: diff }), status: "remaining", days: diff };
  if (diff === 0) return { text: t("موعد امروز"), status: "today", days: 0 };
  return { text: t("{p0} روز گذشته", { p0: Math.abs(diff) }), status: "overdue", days: Math.abs(diff) };
}

export function toISO(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isValid(d)) return null;
  return d.toISOString();
}
