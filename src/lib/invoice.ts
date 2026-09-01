// Printoo24 ERP — Invoice domain helpers (Phase 9)
//
// فاکتور نهایی — همان شکل مالیِ پیش‌فاکتور (اقلام با قیمت واحد/تخفیف
// + تخفیف سرجمع + مالیات) با چرخهٔ وضعیت کوتاه‌تر:
//   draft → issued → paid        (صدور → پرداخت)
//            ↘ cancelled
//
// قواعد صدور (Phase 11):
//   فاکتور «آزاد» است — کارفرما هر زمان بخواهد صادر می‌کند (قفل فقط
//   تایید صریح در UI). هر سفارش حداکثر یک فاکتور نهایی دارد
//   (orderId یکتا → 409).
//
// source:
//   manual      — صدور مستقیم از تب فاکتور
//   pre_invoice — تبدیل از پیش‌فاکتور تاییدشده
//
// مبلغ paidAmount (پیش‌پرداخت/پرداخت) به‌صورت افزایشی (delta) روی
// order.paidAmount اعمال می‌شود — قرارداد مشترک با پیش‌فاکتور.

import { normalizeItems, computeTotals, type PreInvoiceItem } from "./pre-invoice";

export type InvoiceItem = PreInvoiceItem;

export const INVOICE_STATUSES = ["draft", "issued", "paid", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export function isInvoiceStatus(v: unknown): v is InvoiceStatus {
  return (
    typeof v === "string" &&
    (INVOICE_STATUSES as readonly string[]).includes(v)
  );
}

/** انتقال‌های مجاز وضعیت — منبع واحد برای PATCH و UI */
export const INVOICE_STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["issued", "cancelled"],
  issued: ["paid", "cancelled", "draft"],
  paid: [],
  cancelled: [],
};

export const INVOICE_STATUS_META: Record<
  InvoiceStatus,
  { label: string; badge: string }
> = {
  draft: {
    label: "پیش‌نویس",
    badge: "bg-muted text-muted-foreground",
  },
  issued: {
    label: "صادرشده",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  },
  paid: {
    label: "پرداخت‌شده",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  cancelled: {
    label: "باطل‌شده",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  },
};

export type InvoiceBody = {
  items: unknown;
  discountAmount?: number;
  taxRate?: number;
  paidAmount?: number;
  dueDays?: number;
  notes?: string | null;
  terms?: string | null;
};

export type InvoiceComputed = {
  items: InvoiceItem[];
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  dueDate: Date | null;
};

/**
 * اعتبارسنجی + محاسبهٔ کامل فاکتور از بدنهٔ ورودی.
 * خطاهای فارسی پرتاب می‌شوند — routeها به 400 ترجمه می‌کنند.
 */
export function computeInvoice(body: InvoiceBody): InvoiceComputed {
  const items = normalizeItems(body.items);
  const totals = computeTotals(items, Number(body.discountAmount) || 0, Number(body.taxRate) || 0);
  const paid = Math.min(Math.max(0, Number(body.paidAmount) || 0), totals.totalAmount);

  let dueDate: Date | null = null;
  const days = Number(body.dueDays);
  if (Number.isFinite(days) && days > 0 && days <= 365) {
    dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + Math.round(days));
  }

  return {
    items,
    ...totals,
    paidAmount: paid,
    dueDate,
  };
}

export { normalizeItems, computeTotals };
