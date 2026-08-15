"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { formatCurrency, formatDate, daysRemaining } from "@/lib/format";
import { ORDER_STATUS, ITEM_STAGE, type OrderStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAppStore } from "@/stores/app-store";
import { PreInvoiceModal } from "./pre-invoice-modal";

export type OrderDetail = {
  id: string; number: number; status: OrderStatus; endDate: string | null; noEndDate: boolean;
  totalAmount: number; paidAmount: number; priority: string; splitMode: string; note: string | null;
  createdAt: string; createdBy: string | null;
  customer: { id: string; name: string; phone: string };
  items: {
    id: string; productId: string; product: { name: string };
    quantity: number; pricePerUnit: number; totalAmount: number;
    note: string | null; description: string | null; stage: string; needsMaterial: boolean;
    designStartDate: string | null; designEndDate: string | null;
    printStartDate: string | null; printEndDate: string | null;
  }[];
  preInvoices: { id: string; number: number; totalAmount: number; paidAmount: number }[];
  invoice: { id: string; number: number; totalAmount: number; paidAmount: number } | null;
};

export function OrderDetailModal({
  order, open, onOpenChange,
}: {
  order: OrderDetail | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const invalidate = useInvalidate();
  const navigate = useAppStore((s) => s.navigate);
  const [status, setStatus] = React.useState<OrderStatus>("pending_design");
  const [designStart, setDesignStart] = React.useState<Date | null>(null);
  const [designEnd, setDesignEnd] = React.useState<Date | null>(null);
  const [printStart, setPrintStart] = React.useState<Date | null>(null);
  const [printEnd, setPrintEnd] = React.useState<Date | null>(null);
  const [note, setNote] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<"items" | "status" | "note">("items");
  const [preInvoiceOpen, setPreInvoiceOpen] = React.useState(false);

  React.useEffect(() => {
    if (order) {
      setStatus(order.status);
      setDesignStart(order.items[0]?.designStartDate ? new Date(order.items[0].designStartDate) : null);
      setDesignEnd(order.items[0]?.designEndDate ? new Date(order.items[0].designEndDate) : null);
      setPrintStart(order.items[0]?.printStartDate ? new Date(order.items[0].printStartDate) : null);
      setPrintEnd(order.items[0]?.printEndDate ? new Date(order.items[0].printEndDate) : null);
      setNote(order.note || "");
      setActiveTab("items");
    }
  }, [order]);

  const statusMut = useMutation({
    mutationFn: () => api(`/api/orders/${order?.id}/status`, {
      method: "PUT",
      body: JSON.stringify({
        status,
        designStart: designStart ? designStart.toISOString() : null,
        designEnd: designEnd ? designEnd.toISOString() : null,
        printStart: printStart ? printStart.toISOString() : null,
        printEnd: printEnd ? printEnd.toISOString() : null,
      }),
    }),
    onSuccess: () => { invalidate(["orders", "dashboard", "notifications"]); toast.success("وضعیت به‌روزرسانی شد"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const noteMut = useMutation({
    mutationFn: () => api(`/api/orders/${order?.id}`, { method: "PUT", body: JSON.stringify({ note }) }),
    onSuccess: () => { invalidate(["orders"]); toast.success("یادداشت ذخیره شد"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!order) return null;

  const dr = daysRemaining(order.endDate);
  const s = ORDER_STATUS[order.status];
  const hasPreInvoice = order.preInvoices.length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0 gap-0">
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-l from-primary/5 to-transparent">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-12 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                  <span className="font-mono font-bold text-sm">#{order.number}</span>
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-bold truncate">{order.customer?.name ?? "—"}</DialogTitle>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    {order.customer?.phone && <span dir="ltr">{order.customer.phone}</span>}
                    <span>•</span>
                    <span>{formatDate(order.createdAt)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", s.badge)}>{s.label}</span>
                {order.priority === "urgent" && (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 flex items-center gap-1">
                    <Icon name="alertTriangle" size={11} /> فوری
                  </span>
                )}
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-4 gap-2 mt-4">
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground">مبلغ کل</div>
                <div className="text-sm font-bold mt-0.5 tabular-nums" dir="ltr">{formatCurrency(order.totalAmount)}</div>
              </div>
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground">پرداختی</div>
                <div className="text-sm font-bold mt-0.5 text-emerald-600 tabular-nums" dir="ltr">{formatCurrency(order.paidAmount)}</div>
              </div>
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground">موعد تحویل</div>
                <div className="text-sm font-bold mt-0.5">{order.noEndDate ? "بدون زمان" : (order.endDate ? formatDate(order.endDate) : "—")}</div>
              </div>
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground">باقی‌مانده</div>
                <div className={cn("text-sm font-bold mt-0.5 tabular-nums", dr.status === "overdue" ? "text-rose-600" : dr.status === "remaining" ? "text-emerald-600" : "text-amber-600")}>
                  {dr.status === "none" ? "—" : `${dr.days} روز`}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b px-6">
          {([
              { id: "items", label: "آیتم‌ها", icon: "orders" as const, count: order.items.length },
              { id: "status", label: "تغییر وضعیت", icon: "route" as const },
              { id: "note", label: "یادداشت", icon: "info" as const },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition border-b-2 -mb-px",
                  activeTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon name={t.icon} size={14} />
                {t.label}
                {t.count !== undefined && (
                  <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="overflow-y-auto scrollbar-thin px-6 py-4" style={{ maxHeight: "45vh" }}>
            {activeTab === "items" && (
              <div className="space-y-2">
                {order.items.map((it, i) => (
                  <div key={it.id} className="rounded-lg border p-3 hover:bg-accent/30 transition">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="size-6 rounded-md bg-muted text-muted-foreground grid place-items-center text-xs font-bold shrink-0">{i + 1}</span>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{it.product.name}</div>
                          {it.description && <div className="text-xs text-muted-foreground truncate">{it.description}</div>}
                        </div>
                      </div>
                      <div className="text-left shrink-0">
                        <div className="text-sm font-semibold tabular-nums" dir="ltr">{formatCurrency(it.totalAmount)}</div>
                        <div className="text-[11px] text-muted-foreground tabular-nums" dir="ltr">{it.quantity} × {formatCurrency(it.pricePerUnit)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted">{ITEM_STAGE[it.stage as keyof typeof ITEM_STAGE]?.label ?? it.stage}</span>
                      {it.needsMaterial && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 flex items-center gap-0.5">
                          <Icon name="check" size={10} /> متریال
                        </span>
                      )}
                      {it.note && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                          <Icon name="info" size={10} /> {it.note}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "status" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">وضعیت جدید</label>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(ORDER_STATUS).map(([k, v]) => (
                      <button
                        key={k}
                        onClick={() => setStatus(k as OrderStatus)}
                        className={cn("px-3 py-1.5 rounded-lg border text-xs font-medium transition", status === k ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background text-muted-foreground border-input hover:border-foreground/30")}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
                {(status === "pending_design" || status === "in_printing") && (
                  <div className="grid grid-cols-2 gap-3">
                    {status === "pending_design" && (
                      <div className="rounded-lg border p-3 space-y-2">
                        <div className="text-xs font-medium flex items-center gap-1"><Icon name="design" size={13} className="text-violet-500" /> بازه طراحی</div>
                        <div className="flex items-center gap-1.5">
                          <DatePicker value={designStart} onChange={setDesignStart} placeholder="شروع" />
                          <Icon name="arrowLeft" size={12} className="text-muted-foreground" />
                          <DatePicker value={designEnd} onChange={setDesignEnd} placeholder="پایان" />
                        </div>
                      </div>
                    )}
                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="text-xs font-medium flex items-center gap-1"><Icon name="print" size={13} className="text-amber-500" /> بازه چاپ</div>
                      <div className="flex items-center gap-1.5">
                        <DatePicker value={printStart} onChange={setPrintStart} placeholder="شروع" />
                        <Icon name="arrowLeft" size={12} className="text-muted-foreground" />
                        <DatePicker value={printEnd} onChange={setPrintEnd} placeholder="پایان" />
                      </div>
                    </div>
                  </div>
                )}
                <Button size="sm" onClick={() => statusMut.mutate()} disabled={statusMut.isPending} className="gap-1.5">
                  {statusMut.isPending ? <Icon name="loading" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
                  ثبت تغییرات
                </Button>
              </div>
            )}

            {activeTab === "note" && (
              <div className="space-y-3">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="یادداشت سفارش..."
                />
                <Button size="sm" variant="outline" onClick={() => noteMut.mutate()} disabled={noteMut.isPending} className="gap-1.5">
                  {noteMut.isPending ? <Icon name="loading" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
                  ذخیره یادداشت
                </Button>
              </div>
            )}
          </div>

          {/* Footer with actions */}
          <div className="px-6 py-3 border-t bg-muted/30 flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setPreInvoiceOpen(true)} className="gap-1.5">
              <Icon name="receipt" size={14} /> {hasPreInvoice ? "ویرایش پیش‌فاکتور" : "صدور پیش‌فاکتور"}
            </Button>
            {order.invoice && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => toast.info(`فاکتور #${order.invoice.number}`)}>
                <Icon name="invoice" size={14} /> فاکتور
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5 mr-auto" onClick={() => { onOpenChange(false); navigate("admin", "orders-new"); }}>
              <Icon name="edit" size={14} /> ویرایش کامل
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pre-invoice modal */}
      <PreInvoiceModal
        orderId={order.id}
        customerName={order.customer?.name}
        open={preInvoiceOpen}
        onOpenChange={setPreInvoiceOpen}
      />
    </>
  );
}
