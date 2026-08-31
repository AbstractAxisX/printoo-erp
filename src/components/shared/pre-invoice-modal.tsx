"use client";

// Printoo24 ERP — PreInvoiceModal (Phase 7 rebuild — از صفر)
//
// مدیریت عملیاتی پیش‌فاکتور سفارش در سه نما:
//   1) list  → فهرست پیش‌فاکتورهای سفارش + وضعیت + اقدام‌ها + صدور جدید
//   2) issue → فرم صدور: اقلام (قیمت واحد/تخفیف ردیف) + تخفیف کل + مالیات +
//              پیش‌پرداخت + اعتبار + توضیحات — با محاسبهٔ زندهٔ مبالغ
//   3) doc   → سند قابل چاپ (A4) + دکمه‌های چرخهٔ وضعیت و تبدیل به فاکتور
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
import { COMPANY } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  STATUS_META,
  STATUS_TRANSITIONS,
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
    designStartDate?: string | null;
    designEndDate?: string | null;
    printStartDate?: string | null;
    printEndDate?: string | null;
    product?: { name?: string | null } | null;
  } | null;
  orderItems?: {
    id: string;
    designStartDate: string | null;
    designEndDate: string | null;
    printStartDate: string | null;
    printEndDate: string | null;
    designCompletedAt?: string | null;
    printCompletedAt?: string | null;
  }[];
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
  /** Phase 8 — اگر داده شود، مودال مستقیم روی سند چاپی همین پیش‌فاکتور باز می‌شود (چاپ بلافاصله پس از ثبت سفارش) */
  initialDocId?: string | null;
  /** Phase 9 — نمای آغازین: تب پیش‌فاکتورِ مودال سفارش مستقیم فرم صدور را باز می‌کند */
  initialView?: "list" | "issue" | "doc";
  /** Phase 10 — صدور برای آیتم مشخص (سند per-item)؛ null/undefined = کل گروه */
  initialItemId?: string | null;
};

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

export function PreInvoiceModal({ orderId, open, onOpenChange, initialDocId, initialView, initialItemId }: PreInvoiceModalProps) {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  const [view, setView] = React.useState<"list" | "issue" | "doc">("list");
  const [docId, setDocId] = React.useState<string | null>(null);
  // Phase 10 — آیتم هدف صدور (null = کل گروه)
  const [issueItemId, setIssueItemId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      // Phase 8 — شروع مستقیم روی سند (مثلاً پس از ثبت سفارش برای چاپ PDF)
      if (initialDocId) {
        setView("doc");
        setDocId(initialDocId);
        setIssueItemId(null);
      } else if (initialView === "issue") {
        // Phase 9 — تب پیش‌فاکتور: مستقیم فرم صدور
        // Phase 10 — برای آیتم مشخص یا کل گروه
        setView("issue");
        setDocId(null);
        setIssueItemId(initialItemId ?? null);
      } else {
        setView("list");
        setDocId(null);
        setIssueItemId(null);
      }
    }
  }, [open, orderId, initialDocId, initialView, initialItemId]);

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

  // سند انتخاب‌شده
  const { data: docData } = useQuery({
    queryKey: ["pre-invoice", docId],
    queryFn: () => api<{ preInvoice: PreInvoiceRow }>(`/api/pre-invoices/${docId}`),
    enabled: !!docId && view === "doc" && open,
  });

  const refresh = React.useCallback(() => {
    invalidate(["pre-invoices"]);
    invalidate(["order"]);
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
        v.status === "sent" ? "پیش‌فاکتور ارسال شد" :
        v.status === "approved" ? "پیش‌فاکتور تایید شد" :
        v.status === "rejected" ? "پیش‌فاکتور رد شد" :
        "بازگشت به پیش‌نویس"
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
            onOpenDoc={(id) => { setDocId(id); setView("doc"); }}
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

        {view === "doc" && docData && (
          <DocView
            pi={docData.preInvoice}
            onBack={() => { setView("list"); setDocId(null); }}
            onStatus={(status) => statusMut.mutate({ id: docData.preInvoice.id, status })}
            onConvert={() => convertMut.mutate(docData.preInvoice.id)}
            onDelete={() => deleteMut.mutate(docData.preInvoice.id)}
            busy={statusMut.isPending || convertMut.isPending || deleteMut.isPending}
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
              صدور، ارسال، تایید و تبدیل به فاکتور نهایی
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Phase 10 — صدور برای آیتم‌های بدون سند */}
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
            // Phase 10 — سند مرتبط با کدام آیتم؟
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
                        <Icon name="calendar" size={11} /> {jDate.format(new Date(pi.issueDate))}
                      </span>
                      {pi.validUntil && (
                        <span className={cn("flex items-center gap-1",
                          new Date(pi.validUntil) < new Date() && "text-rose-500 font-medium")}>
                          <Icon name="clock" size={11} /> اعتبار تا {jShort.format(new Date(pi.validUntil))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-sm font-bold tabular-nums" dir="ltr">
                      {formatCurrency(pi.totalAmount)}
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      پیش‌پرداخت: <span className="text-emerald-600" dir="ltr">{formatCurrency(pi.paidAmount)}</span>
                      {" · "}
                      مانده: <span className="text-rose-600" dir="ltr">{formatCurrency(remaining)}</span>
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

// ═══════════════════════ 2) ISSUE VIEW ═══════════════════════════════
type IssueItem = { key: string; name: string; unit: string; quantity: number; unitPrice: number; discount: number };

function IssueView({
  order,
  itemId,
  onBack,
  onIssued,
}: {
  order: OrderRow | null;
  /** Phase 10 — سند برای این آیتم صادر می‌شود؛ null = کل گروه؛ "__first__" = اولین آیتم بدون سند */
  itemId: string | null;
  onBack: () => void;
  onIssued: (id: string) => void;
}) {
  // اقلام: برای آیتم مشخص فقط همان آیتم؛ وگرنه همهٔ اقلام سفارش
  const targetItems = React.useMemo(() => {
    if (!order) return [];
    if (itemId && itemId !== "__first__")
      return order.items.filter((it) => it.id === itemId);
    return order.items;
  }, [order, itemId]);
  const targetItem = itemId && itemId !== "__first__" ? targetItems[0] : null;

  const [items, setItems] = React.useState<IssueItem[]>([]);
  const [discountAmount, setDiscountAmount] = React.useState("");
  const [taxRate, setTaxRate] = React.useState("");
  const [paidAmount, setPaidAmount] = React.useState("");
  const [validDays, setValidDays] = React.useState("15");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    setItems(
      targetItems.map((it, i) => ({
        key: `${it.id}-${i}`,
        name: it.product?.name ?? "آیتم",
        unit: it.product?.unit ?? "عدد",
        quantity: it.quantity,
        unitPrice: it.pricePerUnit,
        discount: 0,
      }))
    );
  }, [targetItems]);

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice - i.discount, 0);
  const disc = Math.min(Math.max(0, Number(discountAmount) || 0), subtotal);
  const rate = Math.min(Math.max(0, Number(taxRate) || 0), 100);
  const tax = Math.round((subtotal - disc) * (rate / 100));
  const total = Math.round(subtotal - disc + tax);
  const paid = Math.min(Math.max(0, Number(paidAmount) || 0), total);
  const remaining = total - paid;

  const patchItem = (key: string, patch: Partial<IssueItem>) =>
    setItems((arr) => arr.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const createMut = useMutation({
    mutationFn: () =>
      api<{ preInvoice: { id: string } }>("/api/pre-invoices", {
        method: "POST",
        body: JSON.stringify({
          orderId: order?.id,
          // Phase 10 — لینک به آیتم (per-item) یا null (کل گروه)
          itemId: targetItem?.id ?? null,
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
        }),
      }),
    onSuccess: (d) => {
      toast.success(
        targetItem ? "پیش‌فاکتور آیتم صادر شد" : "پیش‌فاکتور صادر شد"
      );
      onIssued(d.preInvoice.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!order) {
    return <div className="p-10 text-center text-sm text-muted-foreground">در حال بارگذاری سفارش…</div>;
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button onClick={onBack} className="size-8 rounded-lg border grid place-items-center hover:bg-accent">
            <Icon name="arrowRight" size={15} />
          </button>
          <div>
            <h2 className="font-bold">
              صدور پیش‌فاکتور{targetItem ? " آیتم" : ""}
            </h2>
            <p className="text-xs text-muted-foreground">
              سفارش #{order.number} — {order.customer?.name}
              {targetItem && ` — آیتم: ${targetItem.product?.name ?? "—"}`}
            </p>
          </div>
        </div>
      </div>

      {/* Phase 10 — زمان‌بندی طراحی/چاپِ همان آیتم یا کل گروه (خواستهٔ ۳) */}
      <ScheduleChips item={targetItem ?? null} orderItems={order.items} />

      {/* اقلام — قیمت واحد و تخفیف ردیف قابل ویرایش */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-right font-medium px-3 py-2">شرح</th>
              <th className="text-center font-medium px-2 py-2 w-16">تعداد</th>
              <th className="text-center font-medium px-2 py-2 w-28">قیمت واحد</th>
              <th className="text-center font-medium px-2 py-2 w-24">تخفیف ردیف</th>
              <th className="text-center font-medium px-2 py-2 w-28">مبلغ کل</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((i) => (
              <tr key={i.key}>
                <td className="px-3 py-2 font-medium">{i.name}</td>
                <td className="px-2 py-2 text-center tabular-nums">{i.quantity}</td>
                <td className="px-2 py-2">
                  <Input
                    type="number" min={0} dir="ltr" className="h-8 text-center"
                    value={i.unitPrice}
                    onChange={(e) => patchItem(i.key, { unitPrice: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number" min={0} dir="ltr" className="h-8 text-center"
                    value={i.discount || ""}
                    placeholder="0"
                    onChange={(e) => patchItem(i.key, { discount: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="px-2 py-2 text-center font-semibold tabular-nums" dir="ltr">
                  {formatCurrency(i.quantity * i.unitPrice - i.discount)}
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
        <Field label="پیش‌پرداخت دریافتی">
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
        <Button variant="outline" onClick={onBack}>انصراف</Button>
        <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || items.length === 0} className="gap-1.5">
          {createMut.isPending ? <Icon name="loading" size={15} className="animate-spin" /> : <Icon name="check" size={15} />}
          صدور پیش‌فاکتور
        </Button>
      </div>
    </div>
  );
}

function SumBox({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-bold mt-0.5 tabular-nums", tone)} dir="ltr">
        {formatCurrency(value)}
      </div>
    </div>
  );
}

// ═══ Phase 10 — زمان‌بندی طراحی/چاپ روی پیش‌فاکتور (خواستهٔ ۳) ═══
// سند per-item → تاریخ‌های همان آیتم؛ سند گروهی → خلاصهٔ min/max کل گروه.
type SchedItem = {
  designStartDate?: string | null;
  designEndDate?: string | null;
  printStartDate?: string | null;
  printEndDate?: string | null;
  designCompletedAt?: string | null;
  printCompletedAt?: string | null;
};

function piSchedule(
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

/** چیپ‌های زمان‌بندی برای فرم صدور (حالت اپ — نه چاپ) */
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
          {s.designFrom ? jShort.format(new Date(s.designFrom)) : "…"}
          <span className="text-muted-foreground/50">تا</span>
          {s.designTo ? jShort.format(new Date(s.designTo)) : "بدون پایان"}
        </span>
      )}
      {(s.printFrom || s.printTo) && (
        <span className="text-muted-foreground flex items-center gap-1">
          <Icon name="print" size={11} className="text-amber-500" />
          {s.printFrom ? jShort.format(new Date(s.printFrom)) : "…"}
          <span className="text-muted-foreground/50">تا</span>
          {s.printTo ? jShort.format(new Date(s.printTo)) : "بدون پایان"}
        </span>
      )}
    </div>
  );
}

// ═══════════════════════ 3) DOC VIEW (printable) ═════════════════════
function DocView({
  pi,
  onBack,
  onStatus,
  onConvert,
  onDelete,
  busy,
}: {
  pi: PreInvoiceRow;
  onBack: () => void;
  onStatus: (s: PreInvoiceStatus) => void;
  onConvert: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const items: PreInvoiceItem[] = React.useMemo(() => {
    try { return JSON.parse(pi.items); } catch { return []; }
  }, [pi.items]);

  // Phase 10 — زمان‌بندی روی سند (خواستهٔ ۳: «برای پیش‌فاکتور هم زمان طراحی
  // و چاپ اینارو بیاره»): سند per-item → تاریخ همان آیتم؛ سند گروهی → کل گروه.
  const schedule = React.useMemo(
    () => piSchedule(pi.item ?? null, pi.order?.items ?? null),
    [pi.item, pi.order]
  );
  const scheduleHas = !!(
    schedule.designFrom || schedule.designTo ||
    schedule.printFrom || schedule.printTo
  );

  const status = pi.status as PreInvoiceStatus;
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  const remaining = pi.totalAmount - pi.paidAmount;
  const isExpired = pi.validUntil ? new Date(pi.validUntil) < new Date() : false;

  return (
    <div className="flex flex-col">
      {/* نوار اقدام — فقط در اپ، نه چاپ */}
      <div className="no-print sticky top-0 z-10 flex items-center gap-2 px-5 py-3 border-b bg-card/80 backdrop-blur flex-wrap">
        <button onClick={onBack} className="size-8 rounded-lg border grid place-items-center hover:bg-accent shrink-0">
          <Icon name="arrowRight" size={15} />
        </button>
        <span className={cn("text-[11px] font-medium px-2.5 py-1 rounded-full", meta.badge)}>{meta.label}</span>
        <div className="flex-1" />
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

      {/* ─── سند چاپی ─── */}
      <div className="print-doc bg-white text-slate-900 p-6 md:p-8" dir="rtl">
        {/* سربرگ */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="size-14 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-400 grid place-items-center text-white font-black text-xl">
              P24
            </div>
            <div>
              <div className="font-black text-lg">{COMPANY.faName} — {COMPANY.name}</div>
              <div className="text-[11px] text-slate-500">{COMPANY.tagline}</div>
              <div className="text-[11px] text-slate-500 mt-0.5" dir="ltr">{COMPANY.phone} · {COMPANY.email}</div>
            </div>
          </div>
          <div className="text-left">
            <div className="font-black text-xl">پیش‌فاکتور فروش</div>
            <div className="mt-1 text-sm">
              شماره: <span className="font-bold tabular-nums">#{pi.number}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              تاریخ صدور: {jDate.format(new Date(pi.issueDate))}
            </div>
            {pi.validUntil && (
              <div className={cn("text-[11px] mt-0.5", isExpired ? "text-rose-600 font-bold" : "text-slate-500")}>
                اعتبار تا: {jShort.format(new Date(pi.validUntil))}
                {isExpired && " (منقضی)"}
              </div>
            )}
          </div>
        </div>

        {/* اطلاعات طرفین */}
        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-[10px] font-bold text-slate-400 mb-1.5">مشخصات فروشنده</div>
            <div className="font-bold text-sm">{COMPANY.faName}</div>
            <div className="text-[11px] text-slate-500 mt-0.5" dir="ltr">{COMPANY.phone}</div>
            <div className="text-[11px] text-slate-500" dir="ltr">{COMPANY.email}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-[10px] font-bold text-slate-400 mb-1.5">مشخصات خریدار</div>
            <div className="font-bold text-sm">{pi.customer?.name ?? orderCustomerFallback(pi)}</div>
            {pi.customer?.phone && (
              <div className="text-[11px] text-slate-500 mt-0.5" dir="ltr">{pi.customer.phone}</div>
            )}
            {pi.order && (
              <div className="text-[11px] text-slate-500 mt-0.5">
                سفارش مرتبط: <span className="font-medium tabular-nums">#{pi.order.number}</span>
              </div>
            )}
            {pi.item?.product?.name && (
              <div className="text-[11px] text-slate-500 mt-0.5">
                آیتم سفارش: <span className="font-medium">{pi.item.product.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* زمان‌بندی اجرا (خواستهٔ ۳) — روی سند چاپی */}
        {scheduleHas && (
          <div className="mt-4 rounded-lg border border-slate-200 overflow-hidden">
            <div className="bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600">
              {schedule.perItem ? "زمان‌بندی اجرای این آیتم" : "زمان‌بندی اجرای سفارش (کل گروه)"}
            </div>
            <div className="grid grid-cols-2 divide-x divide-x-reverse divide-slate-200 text-[11px] text-center">
              <div className="px-2 py-2">
                <div className="text-slate-400 text-[10px] mb-0.5">طراحی</div>
                <div className="font-medium tabular-nums" dir="rtl">
                  {schedule.designFrom ? jShort.format(new Date(schedule.designFrom)) : "—"}
                  {" تا "}
                  {schedule.designTo ? jShort.format(new Date(schedule.designTo)) : "بدون پایان"}
                </div>
                {!schedule.perItem && schedule.designDone && (
                  <div className="text-[10px] text-emerald-700 mt-0.5">
                    (تکمیل طراحی: {jShort.format(new Date(schedule.designDone))})
                  </div>
                )}
              </div>
              <div className="px-2 py-2">
                <div className="text-slate-400 text-[10px] mb-0.5">چاپ</div>
                <div className="font-medium tabular-nums" dir="rtl">
                  {schedule.printFrom ? jShort.format(new Date(schedule.printFrom)) : "—"}
                  {" تا "}
                  {schedule.printTo ? jShort.format(new Date(schedule.printTo)) : "بدون پایان"}
                </div>
                {!schedule.perItem && schedule.printDone && (
                  <div className="text-[10px] text-emerald-700 mt-0.5">
                    (تکمیل چاپ: {jShort.format(new Date(schedule.printDone))})
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
            <Row label="جمع کل اقلام" value={fmt(pi.subtotal)} />
            {pi.discountAmount > 0 && (
              <Row label="تخفیف" value={`− ${fmt(pi.discountAmount)}`} tone="text-amber-700" />
            )}
            {pi.taxRate > 0 && (
              <Row label={`مالیات بر ارزش افزوده (${pi.taxRate}٪)`} value={fmt(pi.taxAmount)} />
            )}
            <div className="flex items-center justify-between px-3 py-2.5 bg-slate-100 font-black">
              <span>مبلغ قابل پرداخت</span>
              <span className="tabular-nums" dir="ltr">{fmt(pi.totalAmount)} {CURRENCY_LABEL}</span>
            </div>
            <Row label="پیش‌پرداخت دریافتی" value={fmt(pi.paidAmount)} tone="text-emerald-700" />
            <div className="flex items-center justify-between px-3 py-2.5 border-t font-bold">
              <span>باقیمانده</span>
              <span className={cn("tabular-nums", remaining > 0 ? "text-rose-700" : "text-emerald-700")} dir="ltr">
                {fmt(remaining)} {CURRENCY_LABEL}
              </span>
            </div>
          </div>
        </div>

        {/* توضیحات و شرایط */}
        {(pi.notes || pi.terms) && (
          <div className="mt-4 rounded-lg border border-slate-200 border-dashed p-3 text-[11px] text-slate-600 space-y-1">
            {pi.notes && <div><span className="font-bold">توضیحات: </span>{pi.notes}</div>}
            {pi.terms && <div><span className="font-bold">شرایط: </span>{pi.terms}</div>}
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
          این پیش‌فاکتور پس از تایید مشتری به فاکتور نهایی تبدیل می‌شود · {COMPANY.name}
        </div>
      </div>
    </div>
  );
}

function orderCustomerFallback(pi: PreInvoiceRow) {
  return pi.customer?.name ?? "—";
}

const CURRENCY_LABEL = "IQD";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
      <span className="text-slate-600">{label}</span>
      <span className={cn("font-bold tabular-nums", tone)} dir="ltr">{value}</span>
    </div>
  );
}
