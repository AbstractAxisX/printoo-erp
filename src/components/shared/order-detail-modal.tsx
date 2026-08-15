"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { ToggleButton } from "@/components/ui/toggle-button";
import { formatCurrency, formatDate, daysRemaining } from "@/lib/format";
import { ORDER_STATUS, ITEM_STAGE, type OrderStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAppStore } from "@/stores/app-store";

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

  React.useEffect(() => {
    if (order) {
      setStatus(order.status);
      setDesignStart(order.items[0]?.designStartDate ? new Date(order.items[0].designStartDate) : null);
      setDesignEnd(order.items[0]?.designEndDate ? new Date(order.items[0].designEndDate) : null);
      setPrintStart(order.items[0]?.printStartDate ? new Date(order.items[0].printStartDate) : null);
      setPrintEnd(order.items[0]?.printEndDate ? new Date(order.items[0].printEndDate) : null);
      setNote(order.note || "");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="font-mono">#{order.number}</span>
            <span className="text-muted-foreground">—</span>
            <span>{order.customer.name}</span>
            <span className="text-xs text-muted-foreground" dir="ltr">{order.customer.phone}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatBox label="وضعیت" value={ORDER_STATUS[order.status]?.label} />
            <StatBox label="اولویت" value={order.priority === "urgent" ? "فوری" : "معمولی"} valueClass={order.priority === "urgent" ? "text-rose-600" : ""} />
            <StatBox label="مبلغ کل" value={formatCurrency(order.totalAmount)} />
            <StatBox label="موعد تحویل" value={order.noEndDate ? "بدون زمان" : (order.endDate ? formatDate(order.endDate) : "—")} subText={dr.status !== "none" ? dr.text : undefined} subClass={dr.status === "overdue" ? "text-rose-600" : dr.status === "remaining" ? "text-emerald-600" : ""} />
          </div>

          {/* Status change */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="text-sm font-medium flex items-center gap-1.5"><Icon name="route" size={15} className="text-primary" /> تغییر وضعیت</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(ORDER_STATUS).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setStatus(k as OrderStatus)}
                  className={cn("px-2.5 py-1.5 rounded-lg border text-xs font-medium transition", status === k ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background text-muted-foreground border-input hover:border-foreground/30")}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {/* Module dates */}
            {(status === "pending_design" || status === "in_printing") && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                {status === "pending_design" && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium flex items-center gap-1"><Icon name="design" size={13} className="text-violet-500" /> طراحی</div>
                    <div className="flex items-center gap-1.5">
                      <DatePicker value={designStart} onChange={setDesignStart} placeholder="شروع" />
                      <Icon name="arrowLeft" size={12} className="text-muted-foreground" />
                      <DatePicker value={designEnd} onChange={setDesignEnd} placeholder="پایان" />
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="text-xs font-medium flex items-center gap-1"><Icon name="print" size={13} className="text-amber-500" /> چاپ</div>
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
              ثبت وضعیت
            </Button>
          </div>

          {/* Items */}
          <div className="rounded-lg border overflow-hidden">
            <div className="bg-muted/40 px-3 py-2 text-sm font-medium flex items-center gap-1.5"><Icon name="orders" size={15} /> آیتم‌های سفارش</div>
            <table className="w-full text-xs">
              <thead className="bg-muted/20 text-muted-foreground">
                <tr>
                  <th className="text-right font-medium px-3 py-2">محصول</th>
                  <th className="text-right font-medium px-3 py-2">تعداد</th>
                  <th className="text-right font-medium px-3 py-2">مرحله</th>
                  <th className="text-right font-medium px-3 py-2">متریال</th>
                  <th className="text-right font-medium px-3 py-2">مبلغ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {order.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-3 py-2 font-medium">{it.product.name}</td>
                    <td className="px-3 py-2 tabular-nums" dir="ltr">{it.quantity}</td>
                    <td className="px-3 py-2"><span className="rounded bg-muted px-1.5 py-0.5">{ITEM_STAGE[it.stage as keyof typeof ITEM_STAGE]?.label ?? it.stage}</span></td>
                    <td className="px-3 py-2">{it.needsMaterial ? <Icon name="check" size={12} className="text-emerald-600" /> : <Icon name="cancel" size={12} className="text-muted-foreground" />}</td>
                    <td className="px-3 py-2 tabular-nums" dir="ltr">{formatCurrency(it.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Note */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="text-sm font-medium flex items-center gap-1.5"><Icon name="info" size={15} className="text-primary" /> یادداشت سفارش</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="یادداشت..."
            />
            <Button size="sm" variant="outline" onClick={() => noteMut.mutate()} disabled={noteMut.isPending} className="gap-1.5">
              {noteMut.isPending ? <Icon name="loading" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
              ذخیره یادداشت
            </Button>
          </div>

          {/* Invoices */}
          <div className="flex flex-wrap gap-2">
            {order.preInvoices.length > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info(`پیش‌فاکتور #${order.preInvoices[0].number}`)}>
                <Icon name="receipt" size={14} /> پیش‌فاکتور #{order.preInvoices[0].number}
              </Button>
            )}
            {order.invoice && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info(`فاکتور #${order.invoice.number}`)}>
                <Icon name="invoice" size={14} /> فاکتور #{order.invoice.number}
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 mr-auto" onClick={() => { onOpenChange(false); navigate("admin", "orders-new"); }}>
              <Icon name="edit" size={14} /> ویرایش سفارش
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatBox({ label, value, subText, subClass, valueClass }: { label: string; value: string; subText?: string; subClass?: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold mt-0.5", valueClass)}>{value}</div>
      {subText && <div className={cn("text-[10px] mt-0.5", subClass)}>{subText}</div>}
    </div>
  );
}
