"use client";

// Printoo24 ERP — InvoiceTab (Phase 9)
//
// تب «فاکتور» در مودال جزئیات سفارش:
//   • سفارش به انبار/لجستیک (یا بعدتر) نرسیده → گیت با توضیح تحلیلی
//   • رسیده و فاکتور ندارد → فرم صدور همان‌جا (اقلام سفارش + تخفیف ردیف
//     + تخفیف کل + مالیات + پرداخت + سررسید) با محاسبهٔ زنده
//   • فاکتور دارد → سند چاپی A4 + چرخهٔ وضعیت (issued → paid / cancelled)
//     + ویرایش (فقط draft/issued) + چاپ PDF
//
// چاپ: window.print() + کلاس print-doc در globals.css (مثل پیش‌فاکتور).

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { COMPANY } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { INVOICE_STATUS_META, type InvoiceStatus, type InvoiceItem } from "@/lib/invoice";
import { canIssueInvoice } from "@/lib/order-flow";
import { ORDER_STATUS, type OrderStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Jalali date fmt ─────────────────────────────────────────────────
const jDate = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "long",
  day: "numeric",
});
const jShort = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const CURRENCY_LABEL = "IQD";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);
}

export type InvoiceFull = {
  id: string;
  number: number;
  status: string;
  issueDate: string;
  dueDate: string | null;
  items: string; // JSON
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  notes: string | null;
  terms: string | null;
  source: string;
};

export type OrderForInvoice = {
  id: string;
  number: number;
  status: string;
  totalAmount: number;
  paidAmount: number;
  customer: { id: string; name: string; phone: string };
  items: {
    id: string;
    product: { name: string; unit?: string | null };
    quantity: number;
    pricePerUnit: number;
    totalAmount: number;
  }[];
  invoice: InvoiceFull | null;
};

// ═══════════════════ Entry ═════════════════════════════════════════
export function InvoiceTab({ order }: { order: OrderForInvoice }) {
  const eligible = canIssueInvoice(order.status);

  if (order.invoice) {
    return <InvoiceDocPanel order={order} invoice={order.invoice} />;
  }

  if (!eligible) {
    return <InvoiceGatedCard order={order} />;
  }

  return <IssueInvoiceForm order={order} />;
}

// ═══════════════ Gated state ══════════════════════════════════════
function InvoiceGatedCard({ order }: { order: OrderForInvoice }) {
  const statusMeta = ORDER_STATUS[order.status as OrderStatus] ?? null;
  return (
    <div className="rounded-xl border border-dashed p-8 flex flex-col items-center gap-3 text-center">
      <div className="size-12 rounded-2xl bg-muted text-muted-foreground grid place-items-center">
        <Icon name="invoice" size={24} />
      </div>
      <div className="font-semibold text-sm">صدور فاکتور نهایی هنوز فعال نیست</div>
      <div className="text-xs text-muted-foreground leading-relaxed max-w-sm">
        فاکتور نهایی فقط برای سفارش‌هایی صادر می‌شود که به مرحلهٔ
        «انبار و لجستیک» رسیده باشند — تا آن لحظه پیش‌فاکتور ملاک است.
        {statusMeta && (
          <>
            <br />
            وضعیت فعلی این سفارش: <span className="font-medium text-foreground">{statusMeta.label}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════ Issue form ═══════════════════════════════════════
type DraftItem = {
  key: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

function IssueInvoiceForm({ order }: { order: OrderForInvoice }) {
  const invalidate = useInvalidate();

  // اقلام از خود سفارش پیش‌پر می‌شوند
  const [items, setItems] = React.useState<DraftItem[]>(() =>
    (order.items ?? []).map((it) => ({
      key: it.id,
      name: it.product?.name ?? "قلم سفارش",
      unit: it.product?.unit ?? "عدد",
      quantity: it.quantity,
      unitPrice: it.pricePerUnit,
      discount: 0,
    }))
  );
  const [discountAmount, setDiscountAmount] = React.useState(0);
  const [taxRate, setTaxRate] = React.useState(0);
  const [paidAmount, setPaidAmount] = React.useState(0);
  const [dueDays, setDueDays] = React.useState(30);
  const [notes, setNotes] = React.useState("");

  // محاسبهٔ زنده
  const lineTotals = items.map((it) =>
    Math.max(0, (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0) - (Number(it.discount) || 0))
  );
  const subtotal = lineTotals.reduce((s, t) => s + t, 0);
  const disc = Math.min(Math.max(0, discountAmount || 0), subtotal);
  const rate = Math.min(Math.max(0, taxRate || 0), 100);
  const taxAmount = Math.round((subtotal - disc) * (rate / 100));
  const totalAmount = Math.round(subtotal - disc + taxAmount);
  const remaining = Math.max(0, totalAmount - Math.min(paidAmount || 0, totalAmount));

  const patchItem = (key: string, patch: Partial<DraftItem>) =>
    setItems((arr) => arr.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const createMut = useMutation({
    mutationFn: () =>
      api<{ invoice: InvoiceFull }>("/api/invoices", {
        method: "POST",
        body: JSON.stringify({
          orderId: order.id,
          items: items.map((it) => ({
            name: it.name,
            quantity: it.quantity,
            unit: it.unit,
            unitPrice: it.unitPrice,
            discount: it.discount,
          })),
          discountAmount: disc,
          taxRate: rate,
          paidAmount: Math.min(Math.max(0, paidAmount || 0), totalAmount),
          dueDays: dueDays > 0 ? dueDays : undefined,
          notes: notes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      invalidate(["orders", "order", "open-orders", "dashboard"]);
      toast.success("فاکتور نهایی صادر شد");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* هدر */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 grid place-items-center">
            <Icon name="invoice" size={19} />
          </div>
          <div>
            <h3 className="font-bold text-sm">صدور فاکتور نهایی</h3>
            <p className="text-[11px] text-muted-foreground">
              سفارش #{order.number} — {order.customer?.name}
            </p>
          </div>
        </div>
      </div>

      {/* اقلام */}
      <div className="rounded-xl border divide-y">
        <div className="px-3 py-2 bg-muted/40 text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
          <Icon name="orders" size={12} /> اقلام فاکتور (از سفارش)
        </div>
        {items.map((it, i) => (
          <div key={it.key} className="p-3 grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
            <Field label="شرح" className="sm:col-span-5">
              <Input
                value={it.name}
                onChange={(e) => patchItem(it.key, { name: e.target.value })}
                className="h-9"
              />
            </Field>
            <Field label="تعداد" className="sm:col-span-2">
              <Input
                type="number"
                min={1}
                dir="ltr"
                value={it.quantity}
                onChange={(e) => patchItem(it.key, { quantity: Number(e.target.value) })}
                className="h-9 tabular-nums"
              />
            </Field>
            <Field label="قیمت واحد" className="sm:col-span-2">
              <Input
                type="number"
                min={0}
                dir="ltr"
                value={it.unitPrice}
                onChange={(e) => patchItem(it.key, { unitPrice: Number(e.target.value) })}
                className="h-9 tabular-nums"
              />
            </Field>
            <Field label="تخفیف" className="sm:col-span-2">
              <Input
                type="number"
                min={0}
                dir="ltr"
                value={it.discount}
                onChange={(e) => patchItem(it.key, { discount: Number(e.target.value) })}
                className="h-9 tabular-nums"
              />
            </Field>
            <div className="sm:col-span-1 text-center">
              <div className="text-[10px] text-muted-foreground">ردیف {i + 1}</div>
              <div className="text-xs font-bold tabular-nums" dir="ltr">
                {fmt(lineTotals[i])}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* تنظیمات مالی */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="تخفیف کل">
          <Input
            type="number"
            min={0}
            dir="ltr"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(Number(e.target.value))}
            className="h-9 tabular-nums"
          />
        </Field>
        <Field label="مالیات (٪)">
          <Input
            type="number"
            min={0}
            max={100}
            dir="ltr"
            value={taxRate}
            onChange={(e) => setTaxRate(Number(e.target.value))}
            className="h-9 tabular-nums"
          />
        </Field>
        <Field label="پرداخت (IQD)">
          <Input
            type="number"
            min={0}
            dir="ltr"
            value={paidAmount}
            onChange={(e) => setPaidAmount(Number(e.target.value))}
            className="h-9 tabular-nums"
          />
        </Field>
        <Field label="سررسید (روز)">
          <Input
            type="number"
            min={0}
            max={365}
            dir="ltr"
            value={dueDays}
            onChange={(e) => setDueDays(Number(e.target.value))}
            className="h-9 tabular-nums"
          />
        </Field>
      </div>

      <Field label="توضیحات">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="resize-none"
          placeholder="(اختیاری)"
        />
      </Field>

      {/* جمع‌بندی زنده */}
      <div className="rounded-xl border bg-muted/20 p-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
        <SumCell label="جمع اقلام" value={fmt(subtotal)} />
        <SumCell label="تخفیف" value={`− ${fmt(disc)}`} tone="text-amber-600" />
        <SumCell label={`مالیات (${rate}٪)`} value={fmt(taxAmount)} />
        <SumCell label="قابل پرداخت" value={fmt(totalAmount)} tone="text-foreground" bold />
        <SumCell label="باقیمانده" value={fmt(remaining)} tone={remaining > 0 ? "text-rose-600" : "text-emerald-600"} />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending || items.length === 0}
          className="gap-1.5"
        >
          {createMut.isPending ? (
            <Icon name="loading" size={15} className="animate-spin" />
          ) : (
            <Icon name="check" size={15} />
          )}
          صدور فاکتور نهایی
        </Button>
      </div>
    </div>
  );
}

function SumCell({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone?: string;
  bold?: boolean;
}) {
  return (
    <div className="rounded-lg bg-background border p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn("text-xs mt-0.5 tabular-nums", tone ?? "text-muted-foreground", bold && "font-bold")} dir="ltr">
        {value}
      </div>
    </div>
  );
}

// ═══════════════ Doc panel (existing invoice) ═════════════════════
function InvoiceDocPanel({
  order,
  invoice,
}: {
  order: OrderForInvoice;
  invoice: InvoiceFull;
}) {
  const invalidate = useInvalidate();

  const items: InvoiceItem[] = React.useMemo(() => {
    try {
      return JSON.parse(invoice.items);
    } catch {
      return [];
    }
  }, [invoice.items]);

  const status = invoice.status as InvoiceStatus;
  const meta = INVOICE_STATUS_META[status] ?? INVOICE_STATUS_META.issued;
  const remaining = invoice.totalAmount - invoice.paidAmount;
  const isOverdue = invoice.dueDate ? new Date(invoice.dueDate) < new Date() : false;

  const statusMut = useMutation({
    mutationFn: (next: InvoiceStatus) =>
      api(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      }),
    onSuccess: (_d, next) => {
      invalidate(["orders", "order", "open-orders", "dashboard"]);
      toast.success(next === "paid" ? "فاکتور تسویه شد" : next === "cancelled" ? "فاکتور باطل شد" : "وضعیت فاکتور به‌روزرسانی شد");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col">
      {/* نوار اقدام */}
      <div className="no-print flex items-center gap-2 flex-wrap mb-3">
        <span className={cn("text-[11px] font-medium px-2.5 py-1 rounded-full", meta.badge)}>
          {meta.label}
        </span>
        {invoice.source === "pre_invoice" && (
          <span className="text-[11px] px-2 py-1 rounded-full bg-muted text-muted-foreground">
            تبدیل‌شده از پیش‌فاکتور
          </span>
        )}
        <div className="flex-1" />
        {status === "draft" && (
          <Button size="sm" disabled={statusMut.isPending} onClick={() => statusMut.mutate("issued")} className="gap-1.5 h-8">
            <Icon name="mail" size={13} /> صدور و ارسال
          </Button>
        )}
        {status === "issued" && (
          <Button size="sm" disabled={statusMut.isPending} onClick={() => statusMut.mutate("paid")} className="gap-1.5 h-8">
            <Icon name="check" size={13} /> ثبت تسویه کامل
          </Button>
        )}
        {(status === "draft" || status === "issued") && (
          <Button
            size="sm"
            variant="outline"
            disabled={statusMut.isPending}
            onClick={() => statusMut.mutate("cancelled")}
            className="gap-1.5 h-8 text-rose-600 hover:text-rose-700"
          >
            <Icon name="cancel" size={13} /> ابطال
          </Button>
        )}
        <Button size="sm" onClick={() => window.print()} className="gap-1.5 h-8 shadow-sm">
          <Icon name="print" size={13} /> چاپ / ذخیره PDF
        </Button>
      </div>

      {/* ─── سند چاپی A4 ─── */}
      <div className="print-doc bg-white text-slate-900 p-6 md:p-8 rounded-lg" dir="rtl">
        {/* سربرگ */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="size-14 rounded-xl bg-gradient-to-br from-slate-800 to-slate-600 grid place-items-center text-white font-black text-xl">
              P24
            </div>
            <div>
              <div className="font-black text-lg">{COMPANY.faName} — {COMPANY.name}</div>
              <div className="text-[11px] text-slate-500">{COMPANY.tagline}</div>
              <div className="text-[11px] text-slate-500 mt-0.5" dir="ltr">{COMPANY.phone} · {COMPANY.email}</div>
            </div>
          </div>
          <div className="text-left">
            <div className="font-black text-xl">فاکتور فروش</div>
            <div className="mt-1 text-sm">
              شماره: <span className="font-bold tabular-nums">#{invoice.number}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              تاریخ صدور: {jDate.format(new Date(invoice.issueDate))}
            </div>
            {invoice.dueDate && (
              <div className={cn("text-[11px] mt-0.5", isOverdue && status !== "paid" ? "text-rose-600 font-bold" : "text-slate-500")}>
                سررسید پرداخت: {jShort.format(new Date(invoice.dueDate))}
                {isOverdue && status !== "paid" ? " (معوق)" : ""}
              </div>
            )}
          </div>
        </div>

        {/* طرفین */}
        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-[10px] font-bold text-slate-400 mb-1.5">مشخصات فروشنده</div>
            <div className="font-bold text-sm">{COMPANY.faName}</div>
            <div className="text-[11px] text-slate-500 mt-0.5" dir="ltr">{COMPANY.phone}</div>
            <div className="text-[11px] text-slate-500" dir="ltr">{COMPANY.email}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-[10px] font-bold text-slate-400 mb-1.5">مشخصات خریدار</div>
            <div className="font-bold text-sm">{order.customer?.name ?? "—"}</div>
            {order.customer?.phone && (
              <div className="text-[11px] text-slate-500 mt-0.5" dir="ltr">{order.customer.phone}</div>
            )}
            <div className="text-[11px] text-slate-500 mt-0.5">
              سفارش مرتبط: <span className="font-medium tabular-nums">#{order.number}</span>
            </div>
          </div>
        </div>

        {/* اقلام */}
        <table className="w-full mt-5 text-sm border border-slate-200 border-collapse">
          <thead>
            <tr className="bg-slate-100 text-[11px]">
              <th className="border border-slate-200 px-2 py-2 w-8">#</th>
              <th className="border border-slate-200 px-2 py-2 text-right">شرح کالا / خدمات</th>
              <th className="border border-slate-200 px-2 py-2 w-14">تعداد</th>
              <th className="border border-slate-200 px-2 py-2 w-14">واحد</th>
              <th className="border border-slate-200 px-2 py-2 w-24">قیمت واحد</th>
              <th className="border border-slate-200 px-2 py-2 w-20">تخفیف</th>
              <th className="border border-slate-200 px-2 py-2 w-24">مبلغ کل</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="border border-slate-200 px-2 py-2 text-center text-[11px] text-slate-500">{i + 1}</td>
                <td className="border border-slate-200 px-2 py-2 font-medium">{it.name}</td>
                <td className="border border-slate-200 px-2 py-2 text-center tabular-nums">{it.quantity}</td>
                <td className="border border-slate-200 px-2 py-2 text-center text-[11px] text-slate-500">{it.unit}</td>
                <td className="border border-slate-200 px-2 py-2 text-center tabular-nums" dir="ltr">{fmt(it.unitPrice)}</td>
                <td className="border border-slate-200 px-2 py-2 text-center tabular-nums text-amber-700" dir="ltr">{it.discount ? fmt(it.discount) : "—"}</td>
                <td className="border border-slate-200 px-2 py-2 text-center font-bold tabular-nums" dir="ltr">{fmt(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* جمع‌بندی */}
        <div className="flex justify-start mt-4">
          <div className="w-full sm:w-80 rounded-lg border border-slate-200 overflow-hidden text-sm">
            <DocRow label="جمع کل اقلام" value={fmt(invoice.subtotal)} />
            {invoice.discountAmount > 0 && (
              <DocRow label="تخفیف" value={`− ${fmt(invoice.discountAmount)}`} tone="text-amber-700" />
            )}
            {invoice.taxRate > 0 && (
              <DocRow label={`مالیات بر ارزش افزوده (${invoice.taxRate}٪)`} value={fmt(invoice.taxAmount)} />
            )}
            <div className="flex items-center justify-between px-3 py-2.5 bg-slate-100 font-black">
              <span>مبلغ قابل پرداخت</span>
              <span className="tabular-nums" dir="ltr">{fmt(invoice.totalAmount)} {CURRENCY_LABEL}</span>
            </div>
            <DocRow label="پرداخت‌شده" value={fmt(invoice.paidAmount)} tone="text-emerald-700" />
            <div className="flex items-center justify-between px-3 py-2.5 border-t font-bold">
              <span>باقیمانده</span>
              <span className={cn("tabular-nums", remaining > 0 ? "text-rose-700" : "text-emerald-700")} dir="ltr">
                {fmt(Math.max(0, remaining))} {CURRENCY_LABEL}
              </span>
            </div>
          </div>
        </div>

        {/* توضیحات */}
        {invoice.notes && (
          <div className="mt-4 rounded-lg border border-slate-200 border-dashed p-3 text-[11px] text-slate-600">
            <span className="font-bold">توضیحات: </span>{invoice.notes}
          </div>
        )}

        {/* امضا */}
        <div className="grid grid-cols-2 gap-8 mt-10 text-center text-[11px] text-slate-500">
          <div>
            <div className="border-t border-slate-300 pt-2 mx-8">مهر و امضای فروشنده</div>
          </div>
          <div>
            <div className="border-t border-slate-300 pt-2 mx-8">مهر و امضای خریدار</div>
          </div>
        </div>

        <div className="text-center text-[10px] text-slate-400 mt-6">
          این فاکتور پس از صدور به‌عنوان سند مالی نهایی تلقی می‌شود · {COMPANY.name}
        </div>
      </div>
    </div>
  );
}

function DocRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
      <span className="text-slate-600">{label}</span>
      <span className={cn("font-bold tabular-nums", tone)} dir="ltr">{value}</span>
    </div>
  );
}
