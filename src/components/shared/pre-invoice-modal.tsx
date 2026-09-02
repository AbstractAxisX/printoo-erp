"use client";

// Printoo24 ERP — PreInvoiceModal (Phase 11 rebuild)
//
// مودال مدیریت پیش‌فاکتور سفارش در چهار نما:
//   1) list  → فهرست سندهای سفارش + وضعیت + اقدام‌ها + صدور جدید (fallback)
//   2) issue → فرم صدور جدید (per-item یا کل گروه)
//   3) edit  → ویرایش سند موجود (draft/sent/rejected) — «مودال تمیز و عریض
//              با جزئیات پیش‌فاکتور که پر می‌شود و ثبت می‌شود» (خواستهٔ ۱)
//   4) doc   → سند چاپی A4 با تم P24 + چرخهٔ وضعیت + چاپ/ذخیره PDF
//
// پیش‌فاکتور «همیشگی» است: با ثبت سفارش خودکار ساخته می‌شود (POST
// /api/orders فاز ۱۱) — این مودال همان اولی را چاپ/ادیت می‌کند یا
// بعد از ادیت چاپ می‌کند. از جدول سفارشات (آیکون) و تب «پیش‌فاکتور»
// مودال جزئیات هم همین مودال باز می‌شود.
//
// چرخهٔ وضعیت: draft → sent → approved → converted (یا rejected)
// چاپ: window.print() + کلاس print-doc در globals.css (فقط سند چاپ می‌شود)

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { P24Doc, type P24DocItem } from "@/components/shared/p24-doc";
import { COMPANY } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import {
  STATUS_META,
  type PreInvoiceStatus,
  type PreInvoiceItem,
} from "@/lib/pre-invoice";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────
export type PreInvoiceRow = {
  id: string;
  number: number;
  status: string;
  issueDate: string;
  validUntil: string | null;
  items: string; // JSON
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  notes: string | null;
  terms: string | null;
  customer?: { name: string; phone?: string | null } | null;
  order?: {
    number: number;
    items?: {
      id: string;
      note?: string | null;
      description?: string | null;
      designStartDate: string | null;
      designEndDate: string | null;
      printStartDate: string | null;
      printEndDate: string | null;
      designCompletedAt?: string | null;
      printCompletedAt?: string | null;
    }[];
  } | null;
  /** Phase 10 — آیتم مرتبط (null = کل گروه) + تاریخ‌های آن */
  itemId?: string | null;
  item?: {
    id: string;
    note?: string | null;
    description?: string | null;
    designStartDate?: string | null;
    designEndDate?: string | null;
    printStartDate?: string | null;
    printEndDate?: string | null;
    product?: { name?: string | null } | null;
  } | null;
};

type OrderRow = {
  id: string;
  number: number;
  totalAmount: number;
  paidAmount: number;
  splitMode?: string;
  customer: { name: string; phone?: string | null } | null;
  items: {
    id: string;
    note?: string | null;
    description?: string | null;
    quantity: number;
    pricePerUnit: number;
    designStartDate?: string | null;
    designEndDate?: string | null;
    printStartDate?: string | null;
    printEndDate?: string | null;
    product: { name: string; unit?: string | null } | null;
  }[];
};

type PreInvoiceModalProps = {
  orderId: string | null;
  customerName?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** مستقیم روی سند چاپی این پیش‌فاکتور باز می‌شود */
  initialDocId?: string | null;
  /** نمای آغازین — Phase 11: "edit" برای دکمهٔ «ویرایش پیش‌فاکتور» صفحهٔ موفقیت */
  initialView?: "list" | "issue" | "doc" | "edit";
  /** صدور برای آیتم مشخص (سند per-item)؛ null/undefined = کل گروه */
  initialItemId?: string | null;
};

// ─── Gregorian date fmt (کل سیستم میلادی است) ────────────────────
// formatDate از lib/format: yyyy/MM/dd میلادی با ارقام لاتین.

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);
}

export function PreInvoiceModal({
  orderId,
  open,
  onOpenChange,
  initialDocId,
  initialView,
  initialItemId,
}: PreInvoiceModalProps) {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  const [view, setView] = React.useState<"list" | "issue" | "doc" | "edit">("list");
  const [docId, setDocId] = React.useState<string | null>(null);
  // آیتم هدف صدور (null = کل گروه)
  const [issueItemId, setIssueItemId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      if (initialDocId) {
        setView(initialView === "edit" ? "edit" : "doc");
        setDocId(initialDocId);
        setIssueItemId(null);
      } else if (initialView === "issue") {
        setView("issue");
        setDocId(null);
        setIssueItemId(initialItemId ?? null);
      } else {
        setView("list");
        setDocId(null);
        setIssueItemId(null);
      }
    }
  }, [open, orderId]);

  // سفارش + اقلام برای فرم صدور
  const { data: orderData } = useQuery({
    queryKey: ["order", orderId, "pre-invoice-modal"],
    queryFn: () => api<{ order: OrderRow }>(`/api/orders/${orderId}`),
    enabled: !!orderId && open,
  });

  // فهرست پیش‌فاکتورهای سفارش
  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ["pre-invoices", "order", orderId],
    queryFn: () =>
      api<{ preInvoices: PreInvoiceRow[] }>(`/api/pre-invoices?orderId=${orderId}`),
    enabled: !!orderId && open && view === "list",
  });

  // سند انتخاب‌شده (doc + edit)
  const { data: docData } = useQuery({
    queryKey: ["pre-invoice", docId],
    queryFn: () => api<{ preInvoice: PreInvoiceRow }>(`/api/pre-invoices/${docId}`),
    enabled: !!docId && open,
  });

  const refresh = React.useCallback(() => {
    invalidate(["pre-invoices"]);
    invalidate(["order"]);
    invalidate(["orders"]);
    queryClient.invalidateQueries({ queryKey: ["pre-invoice", docId] });
  }, [invalidate, queryClient, docId]);

  // ─── Status transition ────────────────────────────────────────────
  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PreInvoiceStatus }) =>
      api(`/api/pre-invoices/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_d, v) => {
      toast.success(
        v.status === "sent"
          ? "پیش‌فاکتور ارسال شد"
          : v.status === "approved"
          ? "پیش‌فاکتور تایید شد"
          : v.status === "rejected"
          ? "پیش‌فاکتور رد شد"
          : "بازگشت به پیش‌نویس"
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convertMut = useMutation({
    mutationFn: (id: string) =>
      api(`/api/pre-invoices/${id}/convert`, { method: "POST" }),
    onSuccess: () => {
      toast.success("فاکتور نهایی صادر شد");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api(`/api/pre-invoices/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("پیش‌فاکتور حذف شد");
      setView("list");
      setDocId(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const order = orderData?.order;
  const list = listData?.preInvoices ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="sm:max-w-4xl w-[calc(100%-1.5rem)] max-h-[92vh] overflow-y-auto scrollbar-thin p-0 gap-0 rounded-xl"
      >
        <DialogTitle className="sr-only">پیش‌فاکتور</DialogTitle>

        {view === "list" && (
          <ListView
            orderId={orderId}
            loading={listLoading}
            rows={list}
            order={order ?? null}
            onIssue={(itemId) => {
              setIssueItemId(itemId);
              setView("issue");
            }}
            onOpenDoc={(id) => {
              setDocId(id);
              setView("doc");
            }}
          />
        )}

        {view === "issue" && (
          <IssueView
            order={order ?? null}
            itemId={issueItemId}
            onBack={() => setView("list")}
            onIssued={(id) => {
              setDocId(id);
              setView("doc");
              refresh();
            }}
          />
        )}

        {view === "edit" && docData && (
          <EditView
            pi={docData.preInvoice}
            onBack={() => {
              setView("doc");
              refresh();
            }}
          />
        )}

        {view === "doc" && docData && (
          <DocView
            pi={docData.preInvoice}
            onBack={() => {
              setView("list");
              setDocId(null);
            }}
            onEdit={() => setView("edit")}
            onStatus={(status) => statusMut.mutate({ id: docData.preInvoice.id, status })}
            onConvert={() => convertMut.mutate(docData.preInvoice.id)}
            onDelete={() => deleteMut.mutate(docData.preInvoice.id)}
            busy={
              statusMut.isPending || convertMut.isPending || deleteMut.isPending
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════ 1) LIST VIEW ════════════════════════════════
function ListView({
  orderId,
  loading,
  rows,
  order,
  onIssue,
  onOpenDoc,
}: {
  orderId: string | null;
  loading: boolean;
  rows: PreInvoiceRow[];
  order: OrderRow | null;
  onIssue: (itemId: string | null) => void;
  onOpenDoc: (id: string) => void;
}) {
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-primary/10 text-primary grid place-items-center">
            <Icon name="receipt" size={19} />
          </div>
          <div>
            <h2 className="font-bold">پیش‌فاکتورهای سفارش</h2>
            <p className="text-xs text-muted-foreground">
              ویرایش، چاپ، ارسال، تایید و تبدیل به فاکتور نهایی
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* صدور برای آیتم‌های بدون سند (fallback — پیش‌فاکتور همیشگی است) */}
          {(order?.items ?? []).some(
            (it) => !rows.some((pi) => (pi as { itemId?: string | null }).itemId === it.id)
          ) && (
            <Button size="sm" variant="outline" onClick={() => onIssue("__first__")} className="gap-1.5" disabled={!orderId}>
              <Icon name="plus" size={14} /> آیتم بدون سند
            </Button>
          )}
          <Button size="sm" onClick={() => onIssue(null)} className="gap-1.5" disabled={!orderId}>
            <Icon name="plus" size={14} /> صدور (کل سفارش)
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">در حال بارگذاری…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 flex flex-col items-center gap-2 text-muted-foreground">
          <Icon name="receipt" size={32} className="opacity-30" />
          <span className="text-sm">هنوز پیش‌فاکتوری برای این سفارش صادر نشده است</span>
          <Button size="sm" variant="outline" onClick={() => onIssue(null)} className="mt-1 gap-1.5">
            <Icon name="plus" size={13} /> صدور اولین پیش‌فاکتور
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((pi) => {
            const meta = STATUS_META[pi.status as PreInvoiceStatus] ?? STATUS_META.draft;
            const remaining = pi.totalAmount - pi.paidAmount;
            const piItemId = (pi as { itemId?: string | null }).itemId ?? null;
            const linkedItem = piItemId
              ? (order?.items ?? []).find((it) => it.id === piItemId)
              : null;
            return (
              <button
                key={pi.id}
                onClick={() => onOpenDoc(pi.id)}
                className="w-full text-right rounded-xl border p-3.5 hover:border-primary/40 hover:shadow-sm transition group"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center font-black text-sm shrink-0">
                    {pi.number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">پیش‌فاکتور #{pi.number}</span>
                      {linkedItem ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                          آیتم: {linkedItem.product?.name ?? "—"}
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">کل گروه</span>
                      )}
                      <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", meta.badge)}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Icon name="calendar" size={11} /> <span className="tabular-nums" dir="ltr">{formatDate(pi.issueDate)}</span>
                      </span>
                      {pi.validUntil && (
                        <span className={cn("flex items-center gap-1",
                          new Date(pi.validUntil) < new Date() && "text-rose-500 font-medium")}>
                          <Icon name="clock" size={11} /> اعتبار تا <span className="tabular-nums" dir="ltr">{formatDate(pi.validUntil)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-sm font-bold tabular-nums" dir="ltr">
                      {fmt(pi.totalAmount)}
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      پیش‌پرداخت: <span className="text-emerald-600" dir="ltr">{fmt(pi.paidAmount)}</span>
                      {" · "}
                      مانده: <span className="text-rose-600" dir="ltr">{fmt(Math.max(0, remaining))}</span>
                    </div>
                  </div>
                  <Icon name="chevronLeft" size={15} className="text-muted-foreground group-hover:text-primary transition shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════ 2/3) FORM (issue + edit) ═══════════════════════
type IssueItem = { key: string; name: string; unit: string; quantity: number; unitPrice: number; discount: number };

/** فرم مشترک صدور/ویرایش — «مودال تمیز و عریض با جزئیات پیش‌فاکتور» */
function PiForm({
  title,
  subtitle,
  initial,
  scheduleHint,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  title: string;
  subtitle: string;
  initial: {
    items: IssueItem[];
    discountAmount: string;
    taxRate: string;
    paidAmount: string;
    validDays: string;
    notes: string;
  };
  scheduleHint?: React.ReactNode;
  submitLabel: string;
  pending: boolean;
  onSubmit: (v: {
    items: { name: string; quantity: number; unit: string; unitPrice: number; discount: number }[];
    discountAmount: number;
    taxRate: number;
    paidAmount: number;
    validDays: number;
    notes: string | null;
  }) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = React.useState<IssueItem[]>(initial.items);
  const [discountAmount, setDiscountAmount] = React.useState(initial.discountAmount);
  const [taxRate, setTaxRate] = React.useState(initial.taxRate);
  const [paidAmount, setPaidAmount] = React.useState(initial.paidAmount);
  const [validDays, setValidDays] = React.useState(initial.validDays);
  const [notes, setNotes] = React.useState(initial.notes);

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice - i.discount, 0);
  const disc = Math.min(Math.max(0, Number(discountAmount) || 0), subtotal);
  const rate = Math.min(Math.max(0, Number(taxRate) || 0), 100);
  const tax = Math.round((subtotal - disc) * (rate / 100));
  const total = Math.round(subtotal - disc + tax);
  const paid = Math.min(Math.max(0, Number(paidAmount) || 0), total);
  const remaining = total - paid;

  const patchItem = (key: string, patch: Partial<IssueItem>) =>
    setItems((arr) => arr.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-primary/10 text-primary grid place-items-center">
            <Icon name="receipt" size={19} />
          </div>
          <div>
            <h2 className="font-bold">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </div>

      {scheduleHint}

      {/* اقلام — نام/تعداد/قیمت واحد/تخفیف ردیف قابل ویرایش */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-right font-medium px-3 py-2">شرح</th>
              <th className="text-center font-medium px-2 py-2 w-20">تعداد</th>
              <th className="text-center font-medium px-2 py-2 w-28">قیمت واحد</th>
              <th className="text-center font-medium px-2 py-2 w-24">تخفیف ردیف</th>
              <th className="text-center font-medium px-2 py-2 w-28">مبلغ کل</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((i) => (
              <tr key={i.key}>
                <td className="px-3 py-2">
                  <Input
                    value={i.name}
                    onChange={(e) => patchItem(i.key, { name: e.target.value })}
                    className="h-8"
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number" min={1} dir="ltr" className="h-8 text-center tabular-nums"
                    value={i.quantity}
                    onChange={(e) => patchItem(i.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number" min={0} dir="ltr" className="h-8 text-center tabular-nums"
                    value={i.unitPrice}
                    onChange={(e) => patchItem(i.key, { unitPrice: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number" min={0} dir="ltr" className="h-8 text-center tabular-nums"
                    value={i.discount || ""}
                    placeholder="0"
                    onChange={(e) => patchItem(i.key, { discount: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="px-2 py-2 text-center font-semibold tabular-nums" dir="ltr">
                  {fmt(i.quantity * i.unitPrice - i.discount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* شرایط مالی */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="تخفیف کل">
          <Input type="number" min={0} dir="ltr" value={discountAmount} placeholder="0"
            onChange={(e) => setDiscountAmount(e.target.value)} />
        </Field>
        <Field label="مالیات (٪)">
          <Input type="number" min={0} max={100} dir="ltr" value={taxRate} placeholder="0"
            onChange={(e) => setTaxRate(e.target.value)} />
        </Field>
        <Field label="پیش‌پرداخت دریافتی" hint="با فاکتور و سفارش سینک می‌شود">
          <Input type="number" min={0} dir="ltr" value={paidAmount} placeholder="0"
            onChange={(e) => setPaidAmount(e.target.value)} />
        </Field>
        <Field label="اعتبار (روز)">
          <Input type="number" min={1} max={365} dir="ltr" value={validDays}
            onChange={(e) => setValidDays(e.target.value)} />
        </Field>
      </div>

      <Field label="توضیحات پیش‌فاکتور" hint="روی سند چاپی نمایش داده می‌شود">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="مثلاً: تحویل ۵ روز کاری پس از تایید طرح" />
      </Field>

      {/* محاسبهٔ زنده */}
      <div className="rounded-xl border bg-muted/20 p-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
        <SumBox label="جمع اقلام" value={subtotal} />
        <SumBox label="تخفیف" value={disc} tone="text-amber-600" />
        <SumBox label={`مالیات ${rate ? `(${rate}٪)` : ""}`} value={tax} tone="text-muted-foreground" />
        <SumBox label="قابل پرداخت" value={total} tone="text-primary font-black" />
        <SumBox label="باقیمانده" value={remaining} tone={remaining > 0 ? "text-rose-600" : "text-emerald-600"} />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onCancel}>انصراف</Button>
        <Button
          onClick={() =>
            onSubmit({
              items: items.map((i) => ({
                name: i.name,
                quantity: i.quantity,
                unit: i.unit,
                unitPrice: i.unitPrice,
                discount: i.discount,
              })),
              discountAmount: disc,
              taxRate: rate,
              paidAmount: paid,
              validDays: Number(validDays) || 15,
              notes: notes || null,
            })
          }
          disabled={pending || items.length === 0}
          className="gap-1.5"
        >
          {pending ? <Icon name="loading" size={15} className="animate-spin" /> : <Icon name="check" size={15} />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

// ─── 2) ISSUE — صدور جدید ───────────────────────────────────────────
function IssueView({
  order,
  itemId,
  onBack,
  onIssued,
}: {
  order: OrderRow | null;
  /** سند برای این آیتم صادر می‌شود؛ null = کل گروه؛ "__first__" = اولین آیتم بدون سند */
  itemId: string | null;
  onBack: () => void;
  onIssued: (id: string) => void;
}) {
  const targetItems = React.useMemo(() => {
    if (!order) return [];
    if (itemId && itemId !== "__first__")
      return order.items.filter((it) => it.id === itemId);
    return order.items;
  }, [order, itemId]);
  const targetItem = itemId && itemId !== "__first__" ? targetItems[0] : null;

  const createMut = useMutation({
    mutationFn: (v: {
      items: { name: string; quantity: number; unit: string; unitPrice: number; discount: number }[];
      discountAmount: number;
      taxRate: number;
      paidAmount: number;
      validDays: number;
      notes: string | null;
    }) =>
      api<{ preInvoice: { id: string } }>("/api/pre-invoices", {
        method: "POST",
        body: JSON.stringify({
          orderId: order?.id,
          itemId: targetItem?.id ?? null,
          ...v,
        }),
      }),
    onSuccess: (d) => {
      toast.success(targetItem ? "پیش‌فاکتور آیتم صادر شد" : "پیش‌فاکتور صادر شد");
      onIssued(d.preInvoice.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!order) {
    return <div className="p-10 text-center text-sm text-muted-foreground">در حال بارگذاری سفارش…</div>;
  }

  return (
    <PiForm
      title={`صدور پیش‌فاکتور${targetItem ? " آیتم" : ""}`}
      subtitle={`سفارش #${order.number} — ${order.customer?.name ?? "—"}${targetItem ? ` — آیتم: ${targetItem.product?.name ?? "—"}` : ""}`}
      initial={{
        items: targetItems.map((it, i) => ({
          key: `${it.id}-${i}`,
          name: it.product?.name ?? "آیتم",
          unit: it.product?.unit ?? "عدد",
          quantity: it.quantity,
          unitPrice: it.pricePerUnit,
          discount: 0,
        })),
        discountAmount: "",
        taxRate: "",
        paidAmount: "",
        validDays: "15",
        notes: "",
      }}
      scheduleHint={<ScheduleChips item={targetItem ?? null} orderItems={order.items} />}
      submitLabel="صدور پیش‌فاکتور"
      pending={createMut.isPending}
      onSubmit={(v) => createMut.mutate(v)}
      onCancel={onBack}
    />
  );
}

// ─── 3) EDIT — ویرایش سند موجود (Phase 11) ──────────────────────────
function EditView({ pi, onBack }: { pi: PreInvoiceRow; onBack: () => void }) {
  const parsed: PreInvoiceItem[] = React.useMemo(() => {
    try {
      return JSON.parse(pi.items);
    } catch {
      return [];
    }
  }, [pi.items]);

  const saveMut = useMutation({
    mutationFn: (v: {
      items: { name: string; quantity: number; unit: string; unitPrice: number; discount: number }[];
      discountAmount: number;
      taxRate: number;
      paidAmount: number;
      validDays: number;
      notes: string | null;
    }) =>
      api(`/api/pre-invoices/${pi.id}`, {
        method: "PUT",
        body: JSON.stringify(v),
      }),
    onSuccess: () => {
      toast.success("پیش‌فاکتور به‌روزرسانی شد");
      onBack();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PiForm
      title={`ویرایش پیش‌فاکتور #${pi.number}`}
      subtitle={`${pi.customer?.name ?? "—"} — سفارش #${pi.order?.number ?? "—"}${
        pi.item?.product?.name ? ` — آیتم: ${pi.item.product.name}` : ""
      }`}
      initial={{
        items: parsed.map((it, i) => ({
          key: `${pi.id}-${i}`,
          name: it.name,
          unit: it.unit,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discount: it.discount,
        })),
        discountAmount: pi.discountAmount ? String(pi.discountAmount) : "",
        taxRate: pi.taxRate ? String(pi.taxRate) : "",
        paidAmount: pi.paidAmount ? String(pi.paidAmount) : "",
        validDays: "15",
        notes: pi.notes ?? "",
      }}
      scheduleHint={<ScheduleChips item={pi.item ?? null} orderItems={pi.order?.items ?? null} />}
      submitLabel="ثبت تغییرات"
      pending={saveMut.isPending}
      onSubmit={(v) => saveMut.mutate(v)}
      onCancel={onBack}
    />
  );
}

function SumBox({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-bold mt-0.5 tabular-nums", tone)} dir="ltr">
        {fmt(value)}
      </div>
    </div>
  );
}

// ─── زمان‌بندی برای فرم (چیپ‌های حالت اپ) ────────────────────────────
type SchedItem = {
  designStartDate?: string | null;
  designEndDate?: string | null;
  printStartDate?: string | null;
  printEndDate?: string | null;
  designCompletedAt?: string | null;
  printCompletedAt?: string | null;
};

export function piSchedule(
  item: SchedItem | null,
  orderItems: readonly SchedItem[] | null | undefined
): {
  designFrom: string | null; designTo: string | null;
  printFrom: string | null; printTo: string | null;
  perItem: boolean; designDone: string | null; printDone: string | null;
} {
  if (item) {
    return {
      designFrom: item.designStartDate ?? null,
      designTo: item.designEndDate ?? null,
      printFrom: item.printStartDate ?? null,
      printTo: item.printEndDate ?? null,
      perItem: true,
      designDone: null,
      printDone: null,
    };
  }
  const items = orderItems ?? [];
  const min = (arr: (string | null | undefined)[]) =>
    (arr.filter(Boolean) as string[]).sort()[0] ?? null;
  const max = (arr: (string | null | undefined)[]) =>
    (arr.filter(Boolean) as string[]).sort().slice(-1)[0] ?? null;
  const doneMax = (arr: (string | null | undefined)[]) =>
    (arr.filter(Boolean) as string[]).sort().slice(-1)[0] ?? null;
  return {
    designFrom: min(items.map((i) => i.designStartDate)),
    designTo: max(items.map((i) => i.designEndDate)),
    printFrom: min(items.map((i) => i.printStartDate)),
    printTo: max(items.map((i) => i.printEndDate)),
    perItem: false,
    designDone: doneMax(items.map((i) => i.designCompletedAt)),
    printDone: doneMax(items.map((i) => i.printCompletedAt)),
  };
}

function ScheduleChips({
  item,
  orderItems,
}: {
  item: SchedItem | null;
  orderItems: readonly SchedItem[] | null | undefined;
}) {
  const s = piSchedule(item, orderItems);
  const has = !!(s.designFrom || s.designTo || s.printFrom || s.printTo);
  if (!has) return null;
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2 flex items-center gap-3 flex-wrap text-[11px]">
      <span className="font-medium text-muted-foreground flex items-center gap-1 shrink-0">
        <Icon name="calendar" size={12} className="text-primary" />
        {s.perItem ? "زمان‌بندی این آیتم:" : "زمان‌بندی کل گروه:"}
      </span>
      {(s.designFrom || s.designTo) && (
        <span className="text-muted-foreground flex items-center gap-1">
          <Icon name="design" size={11} className="text-violet-500" />
          {s.designFrom ? <span className="tabular-nums" dir="ltr">{formatDate(s.designFrom)}</span> : "…"}
          <span className="text-muted-foreground/50">تا</span>
          {s.designTo ? <span className="tabular-nums" dir="ltr">{formatDate(s.designTo)}</span> : "بدون پایان"}
        </span>
      )}
      {(s.printFrom || s.printTo) && (
        <span className="text-muted-foreground flex items-center gap-1">
          <Icon name="print" size={11} className="text-amber-500" />
          {s.printFrom ? <span className="tabular-nums" dir="ltr">{formatDate(s.printFrom)}</span> : "…"}
          <span className="text-muted-foreground/50">تا</span>
          {s.printTo ? <span className="tabular-nums" dir="ltr">{formatDate(s.printTo)}</span> : "بدون پایان"}
        </span>
      )}
    </div>
  );
}

// ═══════════════════ 4) DOC VIEW (printable — P24 design) ═══════════
function DocView({
  pi,
  onBack,
  onEdit,
  onStatus,
  onConvert,
  onDelete,
  busy,
}: {
  pi: PreInvoiceRow;
  onBack: () => void;
  onEdit: () => void;
  onStatus: (s: PreInvoiceStatus) => void;
  onConvert: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const items: PreInvoiceItem[] = React.useMemo(() => {
    try {
      return JSON.parse(pi.items);
    } catch {
      return [];
    }
  }, [pi.items]);

  // زمان‌بندی روی سند: per-item → تاریخ همان آیتم؛ گروهی → min/max کل گروه
  const schedule = React.useMemo(
    () => piSchedule(pi.item ?? null, pi.order?.items ?? null),
    [pi.item, pi.order]
  );

  // جزئیات هر ردیف: توضیح/یادداشت آیتم مرتبط (per-item با لینک مستقیم،
  // گروهی با تطبیق ایندکسی اقلام سند با آیتم‌های سفارش)
  const docItems: P24DocItem[] = React.useMemo(() => {
    const oi = pi.order?.items ?? [];
    return items.map((it, idx) => {
      const linked = pi.item ?? (oi.length === items.length ? oi[idx] : null);
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
  }, [items, pi.item, pi.order]);

  const status = pi.status as PreInvoiceStatus;
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  const editable = status === "draft" || status === "sent" || status === "rejected";

  return (
    <div className="flex flex-col">
      {/* نوار اقدام — فقط در اپ، نه چاپ */}
      <div className="no-print sticky top-0 z-10 flex items-center gap-2 px-5 py-3 border-b bg-card/80 backdrop-blur flex-wrap">
        <button onClick={onBack} className="size-8 rounded-lg border grid place-items-center hover:bg-accent shrink-0">
          <Icon name="arrowRight" size={15} />
        </button>
        <span className={cn("text-[11px] font-medium px-2.5 py-1 rounded-full", meta.badge)}>{meta.label}</span>
        <div className="flex-1" />
        {/* ویرایش (خواستهٔ ۱: «دکمه ویرایش پیش فاکتور… پر کنه و ثبت کنه») */}
        {editable && (
          <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5 h-8">
            <Icon name="edit" size={13} /> ویرایش
          </Button>
        )}
        {/* چرخهٔ وضعیت */}
        {status === "draft" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus("sent")} className="gap-1.5 h-8">
            <Icon name="mail" size={13} /> ارسال به مشتری
          </Button>
        )}
        {status === "sent" && (
          <>
            <Button size="sm" disabled={busy} onClick={() => onStatus("approved")} className="gap-1.5 h-8">
              <Icon name="check" size={13} /> تایید مشتری
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus("rejected")} className="gap-1.5 h-8 text-rose-600 hover:text-rose-700">
              <Icon name="cancel" size={13} /> رد
            </Button>
          </>
        )}
        {status === "approved" && (
          <Button size="sm" disabled={busy} onClick={onConvert} className="gap-1.5 h-8">
            <Icon name="receipt" size={13} /> تبدیل به فاکتور نهایی
          </Button>
        )}
        {(status === "sent" || status === "approved") && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus("draft")} className="h-8 text-xs">
            بازگشت به پیش‌نویس
          </Button>
        )}
        {(status === "draft" || status === "sent" || status === "rejected") && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onDelete} className="h-8 text-rose-600 hover:text-rose-700 gap-1">
            <Icon name="trash" size={13} /> حذف
          </Button>
        )}
        <Button size="sm" onClick={() => window.print()} className="gap-1.5 h-8 shadow-sm">
          <Icon name="print" size={13} /> چاپ / ذخیره PDF
        </Button>
      </div>

      {/* ─── سند چاپی A4 — تم P24 ─── */}
      <div className="doc-frame bg-muted/30 p-4" dir="rtl">
        <P24Doc
          title="Quotation"
          faTitle="پیش‌فاکتور فروش"
          number={pi.number}
          issueDate={pi.issueDate}
          customerName={pi.customer?.name ?? "—"}
          customerPhone={pi.customer?.phone ?? null}
          orderNumber={pi.order?.number ?? null}
          validUntil={pi.validUntil ?? null}
          items={docItems}
          subtotal={pi.subtotal}
          discount={pi.discountAmount}
          taxRate={pi.taxRate}
          taxAmount={pi.taxAmount}
          total={pi.totalAmount}
          paid={pi.paidAmount}
          paidLabel="پیش‌پرداخت دریافتی"
          schedule={
            schedule.designFrom || schedule.designTo || schedule.printFrom || schedule.printTo
              ? schedule
              : null
          }
          notes={pi.notes ?? null}
          terms={pi.terms ?? null}
          closingNote={`این پیش‌فاکتور پس از تایید مشتری به فاکتور نهایی تبدیل می‌شود · ${COMPANY.name}`}
        />
      </div>
    </div>
  );
}
