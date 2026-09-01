"use client";

// Printoo24 ERP — Invoice views (Phase 11)
//
// اجزای مشترک فاکتور — هم در «مودال مستقل فاکتور» (آیکون ردیف جدول
// سفارشات) و هم «تب فاکتور» مودال جزئیات استفاده می‌شوند:
//
//   InvoiceLockCard  → قفل تاییدی: «بله، فاکتور را می‌خواهم بسازم» —
//                      پس از تایید صریح کارفرما فرم باز می‌شود
//                      (خواستهٔ صریح: «بگه اره فاکتور رو میخوام بسازم
//                      و بعد قفلش باز میشه»). صدور در هر مرحله‌ای آزاد است.
//   InvoiceIssueForm → فرم صدور: اقلام سفارش + تخفیف + مالیات +
//                      پرداخت (کل دریافتی — با سفارش/پیش‌فاکتور سینک
//                      می‌شود) + سررسید + توضیحات
//   InvoiceDocPanel → سند چاپی A4 (تم P24 — «Invoice») + ویرایش +
//                      چرخهٔ وضعیت (issued → paid / cancelled) + چاپ PDF
//
// قرارداد پول (مدل آینه‌ای — lib/paid-sync): مبلغ پرداخت فاکتور =
// «کل دریافتی»؛ سرور آن را روی order.paidAmount می‌نویسد و
// پیش‌فاکتورهای سفارش را بازتوزیع می‌کند.

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { P24Doc, type P24DocItem } from "@/components/shared/p24-doc";
import { COMPANY } from "@/lib/constants";
import { INVOICE_STATUS_META, type InvoiceStatus, type InvoiceItem } from "@/lib/invoice";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
    description?: string | null;
    note?: string | null;
    product: { name: string; unit?: string | null };
    quantity: number;
    pricePerUnit: number;
    totalAmount: number;
  }[];
  invoice: InvoiceFull | null;
};

// ═══════════════ 1) Lock card — تایید صریح صدور ═════════════════════
export function InvoiceLockCard({
  order,
  onConfirm,
}: {
  order: OrderForInvoice;
  onConfirm: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed p-8 flex flex-col items-center gap-4 text-center">
      <div className="size-14 rounded-2xl bg-blue-500/10 text-blue-600 grid place-items-center">
        <Icon name="invoice" size={28} />
      </div>
      <div className="font-bold">صدور فاکتور نهایی</div>
      <div className="text-xs text-muted-foreground leading-relaxed max-w-sm">
        برای سفارش <span className="font-bold text-foreground tabular-nums">#{order.number}</span>{" "}
        ({order.customer?.name}) هنوز فاکتوری صادر نشده است. فاکتور رسمی، سند مالی نهایی
        این سفارش است — هر زمان که بخواهید می‌توانید آن را صادر، ویرایش و چاپ کنید.
        <div className="mt-2 text-[11px] text-muted-foreground/80">
          مبلغ پرداختی فاکتور با پیش‌فاکتور و سفارش همگام می‌شود.
        </div>
      </div>
      <Button size="lg" onClick={onConfirm} className="gap-2">
        <Icon name="check" size={16} /> بله، فاکتور را می‌خواهم بسازم
      </Button>
    </div>
  );
}

// ═══════════════ 2) Issue form ══════════════════════════════════════
type DraftItem = {
  key: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

export function InvoiceIssueForm({
  order,
  onIssued,
  onCancel,
}: {
  order: OrderForInvoice;
  onIssued: (inv: InvoiceFull) => void;
  onCancel: () => void;
}) {
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
  // مبلغ پرداخت = «کل دریافتی» — با order.paidAmount پیش‌پر می‌شود
  const [discountAmount, setDiscountAmount] = React.useState(0);
  const [taxRate, setTaxRate] = React.useState(0);
  const [paidAmount, setPaidAmount] = React.useState(order.paidAmount ?? 0);
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
    onSuccess: (d) => {
      invalidate(["orders", "order", "open-orders", "dashboard"]);
      toast.success("فاکتور نهایی صادر شد");
      onIssued(d.invoice);
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
        <Field label="مبلغ پرداختی (کل دریافتی)" hint="با سفارش و پیش‌فاکتور سینک می‌شود">
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
        <Button variant="outline" onClick={onCancel}>
          انصراف
        </Button>
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

// ═══════════════ 3) Doc panel (existing invoice) ════════════════════
export function InvoiceDocPanel({
  order,
  invoice,
  onEdit,
  onBack,
}: {
  order: OrderForInvoice;
  invoice: InvoiceFull;
  onEdit: () => void;
  /** در مودال مستقل: دکمهٔ بازگشت؛ در تب: undefined */
  onBack?: () => void;
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
  const editable = status === "draft" || status === "issued";

  const statusMut = useMutation({
    mutationFn: (next: InvoiceStatus) =>
      api(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      }),
    onSuccess: (_d, next) => {
      invalidate(["orders", "order", "open-orders", "dashboard", "pre-invoices"]);
      toast.success(
        next === "paid"
          ? "فاکتور تسویه شد (پیش‌فاکتور و سفارش هم سینک شدند)"
          : next === "cancelled"
          ? "فاکتور باطل شد"
          : "وضعیت فاکتور به‌روزرسانی شد"
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // جزئیات هر ردیف: توضیح/یادداشت آیتم سفارش (تطبیق ایندکسی)
  const docItems: P24DocItem[] = React.useMemo(() => {
    const oi = order.items ?? [];
    return items.map((it, idx) => {
      const linked = oi.length === items.length ? oi[idx] : null;
      const details: string[] = [];
      if (linked?.description?.trim()) details.push(linked.description.trim());
      if (linked?.note?.trim()) details.push(`یادداشت: ${linked.note.trim()}`);
      return {
        name: it.name,
        details,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        discount: it.discount,
        total: it.total,
      };
    });
  }, [items, order.items]);

  return (
    <div className="flex flex-col">
      {/* نوار اقدام */}
      <div className="no-print flex items-center gap-2 flex-wrap mb-3">
        {onBack ? (
          <button onClick={onBack} className="size-8 rounded-lg border grid place-items-center hover:bg-accent shrink-0">
            <Icon name="arrowRight" size={15} />
          </button>
        ) : null}
        <span className={cn("text-[11px] font-medium px-2.5 py-1 rounded-full", meta.badge)}>
          {meta.label}
        </span>
        {invoice.source === "pre_invoice" && (
          <span className="text-[11px] px-2 py-1 rounded-full bg-muted text-muted-foreground">
            تبدیل‌شده از پیش‌فاکتور
          </span>
        )}
        <div className="flex-1" />
        {editable && (
          <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5 h-8">
            <Icon name="edit" size={13} /> ویرایش
          </Button>
        )}
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

      {/* ─── سند چاپی A4 — تم P24 ─── */}
      <div className="doc-frame bg-muted/30 p-4" dir="rtl">
        <P24Doc
          title="Invoice"
          faTitle="فاکتور فروش"
          number={invoice.number}
          issueDate={invoice.issueDate}
          customerName={order.customer?.name ?? "—"}
          customerPhone={order.customer?.phone ?? null}
          orderNumber={order.number}
          dueDate={invoice.dueDate ?? null}
          items={docItems}
          subtotal={invoice.subtotal}
          discount={invoice.discountAmount}
          taxRate={invoice.taxRate}
          taxAmount={invoice.taxAmount}
          total={invoice.totalAmount}
          paid={invoice.paidAmount}
          paidLabel="پرداخت‌شده"
          notes={invoice.notes ?? null}
          terms={invoice.terms ?? null}
          schedule={null}
          closingNote={`این فاکتور پس از صدور، سند مالی نهایی سفارش #${order.number} است · ${COMPANY.name}`}
        />
      </div>

      {isOverdue && status !== "paid" && (
        <div className="no-print mt-2 text-[11px] text-rose-600 flex items-center gap-1.5">
          <Icon name="clock" size={12} /> سررسید گذشته — مانده: {fmt(Math.max(0, remaining))}
        </div>
      )}
    </div>
  );
}

// ═══════════════ 4) Edit form (وضعیت draft/issued) ═════════════════
export function InvoiceEditForm({
  order,
  invoice,
  onSaved,
  onCancel,
}: {
  order: OrderForInvoice;
  invoice: InvoiceFull;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const invalidate = useInvalidate();

  const parsed: InvoiceItem[] = React.useMemo(() => {
    try {
      return JSON.parse(invoice.items);
    } catch {
      return [];
    }
  }, [invoice.items]);

  const [items, setItems] = React.useState<DraftItem[]>(() =>
    parsed.map((it, i) => ({
      key: `${invoice.id}-${i}`,
      name: it.name,
      unit: it.unit,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discount: it.discount,
    }))
  );
  const [discountAmount, setDiscountAmount] = React.useState(invoice.discountAmount || 0);
  const [taxRate, setTaxRate] = React.useState(invoice.taxRate || 0);
  const [paidAmount, setPaidAmount] = React.useState(invoice.paidAmount || 0);
  const [dueDays, setDueDays] = React.useState(
    invoice.dueDate
      ? Math.max(1, Math.ceil((new Date(invoice.dueDate).getTime() - Date.now()) / 86_400_000))
      : 30
  );
  const [notes, setNotes] = React.useState(invoice.notes ?? "");

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

  const saveMut = useMutation({
    mutationFn: () =>
      api(`/api/invoices/${invoice.id}`, {
        method: "PUT",
        body: JSON.stringify({
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
      invalidate(["orders", "order", "open-orders", "dashboard", "pre-invoices"]);
      toast.success("فاکتور به‌روزرسانی شد — سفارش و پیش‌فاکتور هم سینک شدند");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="size-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 grid place-items-center">
          <Icon name="edit" size={18} />
        </div>
        <div>
          <h3 className="font-bold text-sm">ویرایش فاکتور #{invoice.number}</h3>
          <p className="text-[11px] text-muted-foreground">
            سفارش #{order.number} — {order.customer?.name} — تغییر مبلغ پرداختی روی سفارش و
            پیش‌فاکتور هم اعمال می‌شود
          </p>
        </div>
      </div>

      <div className="rounded-xl border divide-y">
        <div className="px-3 py-2 bg-muted/40 text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
          <Icon name="orders" size={12} /> اقلام فاکتور
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
                type="number" min={1} dir="ltr" value={it.quantity}
                onChange={(e) => patchItem(it.key, { quantity: Number(e.target.value) })}
                className="h-9 tabular-nums"
              />
            </Field>
            <Field label="قیمت واحد" className="sm:col-span-2">
              <Input
                type="number" min={0} dir="ltr" value={it.unitPrice}
                onChange={(e) => patchItem(it.key, { unitPrice: Number(e.target.value) })}
                className="h-9 tabular-nums"
              />
            </Field>
            <Field label="تخفیف" className="sm:col-span-2">
              <Input
                type="number" min={0} dir="ltr" value={it.discount}
                onChange={(e) => patchItem(it.key, { discount: Number(e.target.value) })}
                className="h-9 tabular-nums"
              />
            </Field>
            <div className="sm:col-span-1 text-center">
              <div className="text-[10px] text-muted-foreground">ردیف {i + 1}</div>
              <div className="text-xs font-bold tabular-nums" dir="ltr">{fmt(lineTotals[i])}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="تخفیف کل">
          <Input type="number" min={0} dir="ltr" value={discountAmount}
            onChange={(e) => setDiscountAmount(Number(e.target.value))} className="h-9 tabular-nums" />
        </Field>
        <Field label="مالیات (٪)">
          <Input type="number" min={0} max={100} dir="ltr" value={taxRate}
            onChange={(e) => setTaxRate(Number(e.target.value))} className="h-9 tabular-nums" />
        </Field>
        <Field label="مبلغ پرداختی (کل دریافتی)" hint="با سفارش و پیش‌فاکتور سینک می‌شود">
          <Input type="number" min={0} dir="ltr" value={paidAmount}
            onChange={(e) => setPaidAmount(Number(e.target.value))} className="h-9 tabular-nums" />
        </Field>
        <Field label="سررسید (روز)">
          <Input type="number" min={0} max={365} dir="ltr" value={dueDays}
            onChange={(e) => setDueDays(Number(e.target.value))} className="h-9 tabular-nums" />
        </Field>
      </div>

      <Field label="توضیحات">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="resize-none" />
      </Field>

      <div className="rounded-xl border bg-muted/20 p-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
        <SumCell label="جمع اقلام" value={fmt(subtotal)} />
        <SumCell label="تخفیف" value={`− ${fmt(disc)}`} tone="text-amber-600" />
        <SumCell label={`مالیات (${rate}٪)`} value={fmt(taxAmount)} />
        <SumCell label="قابل پرداخت" value={fmt(totalAmount)} tone="text-foreground" bold />
        <SumCell label="باقیمانده" value={fmt(remaining)} tone={remaining > 0 ? "text-rose-600" : "text-emerald-600"} />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>انصراف</Button>
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-1.5">
          {saveMut.isPending ? <Icon name="loading" size={15} className="animate-spin" /> : <Icon name="check" size={15} />}
          ثبت تغییرات
        </Button>
      </div>
    </div>
  );
}
