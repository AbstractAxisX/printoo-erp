"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { PRIORITY } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────
export type DesignerOrderItem = {
  id: string;
  product: { name: string };
  description: string | null;
  note: string | null;
  needsMaterial: boolean;
  stage: string;
  designStartDate: string | null;
  designEndDate: string | null;
  designCompletedAt: string | null;
};

export type DesignerOrder = {
  id: string;
  number: number;
  status: string;
  splitMode: string;
  priority: string;
  designerNote: string | null;
  createdAt: string;
  customer: { id: string; name: string };
  items: DesignerOrderItem[];
};

// Reuse the shape returned by GET /api/orders/[id]
type FullOrder = DesignerOrder;

// ─── Designer-safe projection ─────────────────────────────────────────
// The designer must NOT see prices, customer phone, or overall endDate.
// Phase 9: طراح فقط آیتم‌های مرحلهٔ طراحی را «فعال» می‌بیند؛ آیتم‌های
// تکمیل‌شدهٔ طراحی به‌صورت فشرده با مهر زمان، بقیه فقط یک شمارنده.
function toDesignerOrder(o: FullOrder | null | undefined): DesignerOrder | null {
  if (!o) return null;
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    splitMode: o.splitMode ?? "grouped",
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
      designCompletedAt: it.designCompletedAt ?? null,
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
  const qc = useQueryClient();

  const [designerNote, setDesignerNote] = React.useState("");
  const [qcDescription, setQcDescription] = React.useState("");
  const [qcOpen, setQcOpen] = React.useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api<{ order: FullOrder }>(`/api/orders/${orderId}`),
    enabled: !!orderId && open,
    refetchInterval: 30000,
  });

  const order = toDesignerOrder(data?.order);

  React.useEffect(() => {
    if (order) setDesignerNote(order.designerNote ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.designerNote]);

  React.useEffect(() => {
    if (!qcOpen) setQcDescription("");
  }, [qcOpen]);

  // ── موتور گردش کار: دسته‌بندی آیتم‌ها ──
  const allItems = order?.items ?? [];
  const designItems = allItems.filter((i) => i.stage === "design"); // فعال
  const completedDesign = allItems.filter(
    (i) => i.stage !== "design" && i.designCompletedAt // طراحی‌شده
  );
  const otherItems = allItems.filter(
    (i) => i.stage !== "design" && !i.designCompletedAt // طراحی نمی‌خواهد
  );
  const designScope = designItems.length + completedDesign.length;
  const progress = designScope > 0 ? completedDesign.length / designScope : 0;
  const isGrouped = order?.splitMode === "grouped" && allItems.length > 1;

  // ── Action: تکمیل طراحی یک آیتم ─────────────────────────────────
  const completeItemMut = useMutation({
    mutationFn: (itemId: string) =>
      api<{ ok: boolean; advanced: boolean; remainingDesign: number; orderStatus: string }>(
        `/api/orders/${orderId}/designer-action`,
        {
          method: "POST",
          body: JSON.stringify({ action: "complete_item", itemId, note: designerNote || undefined }),
        }
      ),
    onSuccess: (res) => {
      invalidate(["orders", "dashboard", "open-orders"]);
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      if (res.advanced) {
        // آخرین آیتم طراحی شد → سفارش خودکار به چاپ رفت
        toast.success("طراحی سفارش کامل شد — سفارش به مرحلهٔ چاپ ارسال شد");
        setTimeout(() => onOpenChange(false), 900);
      } else {
        toast.success(
          `طراحی آیتم تکمیل شد — ${res.remainingDesign} آیتم طراحی باقی مانده`
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Action: ارسال گروهی (تکمیل همه + انتقال) ───────────────────
  const sendNextMut = useMutation({
    mutationFn: () =>
      api(`/api/orders/${orderId}/designer-action`, {
        method: "POST",
        body: JSON.stringify({ action: "send_next", note: designerNote }),
      }),
    onSuccess: () => {
      toast.success("طراحی سفارش کامل شد — سفارش به مرحلهٔ چاپ ارسال شد");
      invalidate(["orders", "dashboard", "open-orders"]);
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

  const busy = completeItemMut.isPending || sendNextMut.isPending || reportQcMut.isPending;

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
                <span className="text-sm font-medium text-rose-600 text-center leading-relaxed max-w-md">
                  {(error as Error)?.message || "خطا در بارگذاری سفارش — سرور پاسخ نداد"}
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

  // بازهٔ طراحی (از آیتم‌های فعال؛ در نبود، اولین آیتم)
  const dateSource = designItems[0] ?? allItems[0];
  const designStart = dateSource?.designStartDate ?? null;
  const designEnd = dateSource?.designEndDate ?? null;
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
                  <DialogTitle className="text-lg font-bold truncate flex items-center gap-2">
                    سفارش #{order.number}
                    {isGrouped && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                        گروهی
                      </span>
                    )}
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

            {/* Phase 9: نوار پیشرفت طراحی گروهی */}
            {designScope > 1 && (
              <div className="mt-3 rounded-lg border bg-violet-500/5 p-2.5">
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="font-medium flex items-center gap-1">
                    <Icon name="layers" size={12} className="text-violet-600 dark:text-violet-400" />
                    پیشرفت طراحی سفارش گروهی
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {completedDesign.length.toLocaleString("fa-IR")} از{" "}
                    {designScope.toLocaleString("fa-IR")} آیتم
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                {designItems.length > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
                    تا طراحی همهٔ آیتم‌ها تمام نشود، سفارش به چاپ نمی‌رود و هیچ
                    ماژول دیگری حق کار روی آن را ندارد.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Body — scrollable */}
          <div className="overflow-y-auto scrollbar-thin px-6 py-4 space-y-4" style={{ maxHeight: "55vh" }}>
            {/* آیتم‌های در صف طراحی (فعال) */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Icon name="design" size={13} />
                آیتم‌های نیازمند طراحی
                <span className="text-[10px] font-normal text-muted-foreground/70">
                  ({designItems.length.toLocaleString("fa-IR")})
                </span>
              </div>
              <div className="space-y-2">
                {designItems.map((it, i) => (
                  <div
                    key={it.id}
                    className="rounded-lg border border-violet-200 dark:border-violet-900/50 bg-violet-500/[0.03] p-3 transition"
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
                        {it.designEndDate && (
                          <div className="text-[10px] text-muted-foreground mt-1 tabular-nums flex items-center gap-1">
                            <Icon name="clock" size={10} />
                            موعد این آیتم: {formatDate(it.designEndDate)}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => completeItemMut.mutate(it.id)}
                        disabled={busy}
                        className="gap-1.5 shrink-0 border-violet-300 dark:border-violet-800 hover:bg-violet-500/10 hover:text-violet-700 dark:hover:text-violet-300"
                      >
                        {completeItemMut.isPending && completeItemMut.variables === it.id ? (
                          <Icon name="loading" size={13} className="animate-spin" />
                        ) : (
                          <Icon name="checkCircle" size={13} />
                        )}
                        تکمیل طراحی
                      </Button>
                    </div>
                    {it.note && (
                      <div className="mt-2 pt-2 border-t text-xs text-muted-foreground flex items-start gap-1">
                        <Icon name="info" size={11} className="mt-0.5 shrink-0" />
                        <span>{it.note}</span>
                      </div>
                    )}
                  </div>
                ))}
                {designItems.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    آیتمی در صف طراحی باقی نمانده است.
                  </div>
                )}
              </div>
            </div>

            {/* آیتم‌های طراحی‌شده (فشرده) */}
            {completedDesign.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Icon name="checkCircle" size={13} className="text-emerald-600" />
                  طراحی‌شده‌ها
                  <span className="text-[10px] font-normal text-muted-foreground/70">
                    ({completedDesign.length.toLocaleString("fa-IR")})
                  </span>
                </div>
                <div className="space-y-1">
                  {completedDesign.map((it) => (
                    <div
                      key={it.id}
                      className="rounded-lg border bg-muted/20 px-3 py-2 flex items-center gap-2"
                    >
                      <Icon name="check" size={13} className="text-emerald-600 shrink-0" />
                      <span className="text-sm truncate flex-1">{it.product?.name ?? "—"}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {it.designCompletedAt
                          ? formatDate(it.designCompletedAt)
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* بقیهٔ آیتم‌ها (طراحی نمی‌خواهند) */}
            {otherItems.length > 0 && (
              <div className="text-[11px] text-muted-foreground rounded-lg border border-dashed px-3 py-2 flex items-center gap-1.5">
                <Icon name="info" size={12} className="shrink-0" />
                {otherItems.length.toLocaleString("fa-IR")} آیتم دیگرِ این سفارش
                طراحی نمی‌خواهند (مرحلهٔ چاپ/انبار) — پس از تکمیل طراحیِ
                آیتم‌های بالا، سفارش با همهٔ آیتم‌ها به مرحلهٔ بعد می‌رود.
              </div>
            )}

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
              disabled={busy}
            >
              <Icon name="shield" size={14} />
              گزارش به کنترل کیفیت
            </Button>
            <Button
              size="sm"
              onClick={() => sendNextMut.mutate()}
              disabled={busy || designItems.length === 0}
              className="gap-1.5"
            >
              {sendNextMut.isPending ? (
                <Icon name="loading" size={14} className="animate-spin" />
              ) : (
                <Icon name="arrowLeft" size={14} />
              )}
              {designItems.length > 1
                ? `تکمیل همه و ارسال به چاپ (${designItems.length} آیتم)`
                : "تکمیل و ارسال به چاپ"}
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
