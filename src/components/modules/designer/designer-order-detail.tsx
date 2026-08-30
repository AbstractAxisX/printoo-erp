"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { formatDate, daysRemaining } from "@/lib/format";
import { PRIORITY, ITEM_STAGE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────
export type DesignerOrder = {
  id: string;
  number: number;
  status: string;
  priority: string;
  designerNote: string | null;
  createdAt: string;
  customer: { id: string; name: string };
  items: {
    id: string;
    product: { name: string };
    description: string | null;
    note: string | null;
    needsMaterial: boolean;
    stage: string;
    designStartDate: string | null;
    designEndDate: string | null;
  }[];
};

// Reuse the shape returned by GET /api/orders/[id]
type FullOrder = {
  id: string;
  number: number;
  status: string;
  priority: string;
  designerNote: string | null;
  createdAt: string;
  customer: { id: string; name: string };
  items: {
    id: string;
    product: { name: string };
    description: string | null;
    note: string | null;
    needsMaterial: boolean;
    stage: string;
    designStartDate: string | null;
    designEndDate: string | null;
  }[];
};

// ─── Designer-safe projection ─────────────────────────────────────────
// The designer must NOT see prices, customer phone, or overall endDate.
// We strip those fields here even if the API returns them.
function toDesignerOrder(o: FullOrder | null | undefined): DesignerOrder | null {
  if (!o) return null;
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    priority: o.priority,
    designerNote: o.designerNote ?? null,
    createdAt: o.createdAt,
    customer: { id: o.customer?.id ?? "", name: o.customer?.name ?? "—" },
    items: (o.items ?? []).map((it) => ({
      id: it.id,
      product: { name: it.product?.name ?? "—" },
      description: it.description ?? null,
      note: it.note ?? null,
      needsMaterial: !!it.needsMaterial,
      stage: it.stage,
      designStartDate: it.designStartDate ?? null,
      designEndDate: it.designEndDate ?? null,
    })),
  };
}

// ─── Component ────────────────────────────────────────────────────────
export function DesignerOrderDetailModal({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const invalidate = useInvalidate();

  // Local designer note state (order.designerNote)
  const [designerNote, setDesignerNote] = React.useState("");
  // QC report description
  const [qcDescription, setQcDescription] = React.useState("");
  // Sub-dialog open state for "report to QC"
  const [qcOpen, setQcOpen] = React.useState(false);

  // Fetch the order via the existing GET /api/orders/[id] endpoint.
  // The designer-safe projection strips out financial + phone fields.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api<{ order: FullOrder }>(`/api/orders/${orderId}`),
    enabled: !!orderId && open,
    refetchInterval: 30000,
  });

  const order = toDesignerOrder(data?.order);

  // Reset local note when order changes
  React.useEffect(() => {
    if (order) {
      setDesignerNote(order.designerNote ?? "");
    }
  }, [order?.id, order?.designerNote]);

  // Reset QC dialog state when closed
  React.useEffect(() => {
    if (!qcOpen) {
      setQcDescription("");
    }
  }, [qcOpen]);

  // ── Action: send to print (next stage) ───────────────────────────
  const sendNextMut = useMutation({
    mutationFn: () =>
      api(`/api/orders/${orderId}/designer-action`, {
        method: "POST",
        body: JSON.stringify({ action: "send_next", note: designerNote }),
      }),
    onSuccess: () => {
      toast.success("سفارش به مرحله چاپ ارسال شد");
      invalidate(["orders", "dashboard"]);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Action: report to QC ─────────────────────────────────────────
  const reportQcMut = useMutation({
    mutationFn: () =>
      api(`/api/orders/${orderId}/designer-action`, {
        method: "POST",
        body: JSON.stringify({
          action: "report_qc",
          description: qcDescription,
        }),
      }),
    onSuccess: () => {
      toast.success("گزارش به کنترل کیفیت ارسال شد");
      invalidate(["orders", "dashboard"]);
      setQcOpen(false);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Loading / empty ──────────────────────────────────────────────
  if (!order) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined} className="max-w-2xl p-0 gap-0">
          <DialogTitle className="sr-only">جزئیات سفارش طراحی</DialogTitle>
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            {isLoading ? (
              <>
                <Icon name="loading" size={28} className="animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  در حال بارگذاری سفارش...
                </span>
              </>
            ) : isError ? (
              <>
                <Icon name="alertTriangle" size={28} className="text-rose-500" />
                <span className="text-sm font-medium text-rose-600">
                  خطا در بارگذاری سفارش — سرور پاسخ نداد
                </span>
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  تلاش دوباره
                </Button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">سفارش یافت نشد</span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Pull the first item's design dates for the "design range" card.
  const firstItem = order.items?.[0];
  const designStart = firstItem?.designStartDate ?? null;
  const designEnd = firstItem?.designEndDate ?? null;
  const dr = daysRemaining(designEnd);
  const priorityInfo =
    PRIORITY[order.priority as keyof typeof PRIORITY] ?? PRIORITY.normal;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[90vh] overflow-hidden p-0 gap-0">
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-l from-violet-500/5 to-transparent">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-12 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 grid place-items-center shrink-0">
                  <Icon name="design" size={22} />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-bold truncate">
                    سفارش #{order.number}
                  </DialogTitle>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Icon name="customers" size={12} />
                      {order.customer?.name ?? "—"}
                    </span>
                    <span>•</span>
                    <span className="tabular-nums">{formatDate(order.createdAt)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={cn(
                    "text-xs font-medium px-2.5 py-1 rounded-full",
                    priorityInfo.badge
                  )}
                >
                  {priorityInfo.label}
                </span>
              </div>
            </div>

            {/* Design dates card */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground">شروع طراحی</div>
                <div className="text-sm font-bold mt-0.5 tabular-nums">
                  {formatDate(designStart)}
                </div>
              </div>
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground">پایان طراحی</div>
                <div className="text-sm font-bold mt-0.5 tabular-nums">
                  {formatDate(designEnd)}
                </div>
              </div>
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground">باقی‌مانده</div>
                <div
                  className={cn(
                    "text-sm font-bold mt-0.5 tabular-nums",
                    dr.status === "overdue" && "text-rose-600",
                    dr.status === "remaining" && "text-emerald-600",
                    dr.status === "today" && "text-amber-600",
                    dr.status === "none" && "text-muted-foreground"
                  )}
                >
                  {dr.status === "none" ? "—" : `${dr.days} روز`}
                </div>
              </div>
            </div>
          </div>

          {/* Body — scrollable */}
          <div className="overflow-y-auto scrollbar-thin px-6 py-4" style={{ maxHeight: "55vh" }}>
            {/* Items list */}
            <div className="mb-4">
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Icon name="orders" size={13} /> آیتم‌های سفارش
              </div>
              <div className="space-y-2">
                {(order.items ?? []).map((it, i) => (
                  <div
                    key={it.id}
                    className="rounded-lg border p-3 hover:bg-accent/30 transition"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="size-6 rounded-md bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 grid place-items-center text-xs font-bold shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">
                          {it.product?.name ?? "—"}
                        </div>
                        {it.description && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {it.description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted">
                          {ITEM_STAGE[it.stage as keyof typeof ITEM_STAGE]?.label ?? it.stage}
                        </span>
                        {it.needsMaterial && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 flex items-center gap-0.5">
                            <Icon name="check" size={10} /> متریال
                          </span>
                        )}
                      </div>
                    </div>
                    {it.note && (
                      <div className="mt-2 pt-2 border-t text-xs text-muted-foreground flex items-start gap-1">
                        <Icon name="info" size={11} className="mt-0.5 shrink-0" />
                        <span>{it.note}</span>
                      </div>
                    )}
                  </div>
                ))}
                {(order.items ?? []).length === 0 && (
                  <div className="text-xs text-muted-foreground py-3 text-center">
                    آیتمی برای این سفارش ثبت نشده است.
                  </div>
                )}
              </div>
            </div>

            {/* Designer note */}
            <Field
              label="یادداشت طراح"
              hint="این یادداشت پس از ارسال به چاپ، برای همه ماژول‌ها قابل مشاهده خواهد بود."
            >
              <Textarea
                id="designer-note"
                value={designerNote}
                onChange={(e) => setDesignerNote(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </Field>
          </div>

          {/* Footer with actions */}
          <DialogFooter className="px-6 py-3 border-t bg-muted/30 flex items-center gap-2 sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQcOpen(true)}
              className="gap-1.5"
              disabled={sendNextMut.isPending || reportQcMut.isPending}
            >
              <Icon name="shield" size={14} />
              گزارش به کنترل کیفیت
            </Button>
            <Button
              size="sm"
              onClick={() => sendNextMut.mutate()}
              disabled={sendNextMut.isPending || reportQcMut.isPending}
              className="gap-1.5"
            >
              {sendNextMut.isPending ? (
                <Icon name="loading" size={14} className="animate-spin" />
              ) : (
                <Icon name="arrowLeft" size={14} />
              )}
              ارسال به چاپ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sub-dialog: report to QC */}
      <Dialog open={qcOpen} onOpenChange={setQcOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md p-0 gap-0">
          <div className="px-6 pt-5 pb-3 border-b">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 grid place-items-center shrink-0">
                <Icon name="shield" size={18} />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  گزارش به کنترل کیفیت
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  سفارش #{order.number}
                </p>
              </div>
            </div>
          </div>
          <div className="px-6 py-4">
            <Field
              label="توضیح گزارش"
              required
              hint={
                <span className="flex items-start gap-1">
                  <Icon name="info" size={11} className="mt-0.5 shrink-0" />
                  این گزارش به ماژول کنترل کیفیت ارسال می‌شود و سفارش در وضعیت فعلی
                  (طراحی) باقی می‌ماند.
                </span>
              }
            >
              <Textarea
                id="qc-description"
                value={qcDescription}
                onChange={(e) => setQcDescription(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </Field>
          </div>
          <DialogFooter className="px-6 py-3 border-t bg-muted/30 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQcOpen(false)}
              disabled={reportQcMut.isPending}
            >
              انصراف
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => reportQcMut.mutate()}
              disabled={reportQcMut.isPending || !qcDescription.trim()}
              className="gap-1.5"
            >
              {reportQcMut.isPending ? (
                <Icon name="loading" size={14} className="animate-spin" />
              ) : (
                <Icon name="check" size={14} />
              )}
              ارسال گزارش
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
