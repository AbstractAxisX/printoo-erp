"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon, type IconName } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────
export type QcReport = {
  id: string;
  orderId: string;
  fromModule: string;
  description: string;
  status: string;
  returnStage: string | null;
  reviewedAt: string | null;
  reportedBy: string | null;
  createdAt: string;
  order: {
    id: string;
    number: number;
    customer: { name: string };
    items: { product: { name: string } }[];
  };
};

// ─── Module & status meta ─────────────────────────────────────────────
const MODULE_META: Record<
  string,
  { label: string; icon: IconName; color: string }
> = {
  designer: {
    label: "طراح",
    icon: "design",
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  print: {
    label: "چاپ",
    icon: "print",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  warehouse: {
    label: "انبار",
    icon: "warehouse",
    color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  },
};

const STATUS_META: Record<
  string,
  { label: string; cls: string; icon: IconName }
> = {
  pending: {
    label: "در انتظار",
    cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    icon: "clock",
  },
  reviewing: {
    label: "در حال بررسی",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    icon: "eye",
  },
  approved: {
    label: "تأیید شده",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    icon: "checkCircle",
  },
  rejected: {
    label: "رد شده",
    cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    icon: "cancel",
  },
};

const STAGE_OPTIONS: { value: "design" | "print" | "warehouse"; label: string; icon: IconName }[] = [
  { value: "design", label: "طراحی", icon: "design" },
  { value: "print", label: "چاپ", icon: "print" },
  { value: "warehouse", label: "انبار", icon: "warehouse" },
];

// ─── Component ────────────────────────────────────────────────────────
export function QcReportDetailModal({
  reportId,
  open,
  onOpenChange,
}: {
  reportId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const invalidate = useInvalidate();
  const qc = useQueryClient();

  // Sub-dialog: choose return stage on approve
  const [returnStageOpen, setReturnStageOpen] = React.useState(false);
  const [selectedStage, setSelectedStage] = React.useState<
    "design" | "print" | "warehouse" | null
  >(null);

  // Fetch the QC report
  const { data, isLoading } = useQuery({
    queryKey: ["qc-report", reportId],
    queryFn: () => api<{ report: QcReport }>(`/api/qc-reports/${reportId}`),
    enabled: !!reportId && open,
    refetchInterval: 30000,
  });

  const report = data?.report ?? null;

  // Reset stage selector when dialog closes
  React.useEffect(() => {
    if (!returnStageOpen) setSelectedStage(null);
  }, [returnStageOpen]);

  // ── Action: approve (with returnStage) ────────────────────────────
  const approveMut = useMutation({
    mutationFn: (stage: "design" | "print" | "warehouse") =>
      api(`/api/qc-reports/${reportId}`, {
        method: "PUT",
        body: JSON.stringify({ action: "approve", returnStage: stage }),
      }),
    onSuccess: () => {
      toast.success("گزارش تأیید شد و سفارش به مرحله انتخابی بازگشت");
      invalidate(["qc-reports", "orders", "dashboard"]);
      qc.invalidateQueries({ queryKey: ["qc-report", reportId] });
      setReturnStageOpen(false);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Action: reject ────────────────────────────────────────────────
  const rejectMut = useMutation({
    mutationFn: () =>
      api(`/api/qc-reports/${reportId}`, {
        method: "PUT",
        body: JSON.stringify({ action: "reject" }),
      }),
    onSuccess: () => {
      toast.success("گزارش رد شد");
      invalidate(["qc-reports", "orders", "dashboard"]);
      qc.invalidateQueries({ queryKey: ["qc-report", reportId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Loading / empty ───────────────────────────────────────────────
  if (!report) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          <DialogTitle className="sr-only">جزئیات گزارش کنترل کیفیت</DialogTitle>
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            {isLoading ? (
              <>
                <Icon name="loading" size={28} className="animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  در حال بارگذاری گزارش...
                </span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">گزارش یافت نشد</span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const moduleMeta =
    MODULE_META[report.fromModule] ?? {
      label: report.fromModule,
      icon: "shield" as IconName,
      color: "bg-muted text-muted-foreground",
    };
  const statusMeta =
    STATUS_META[report.status] ?? {
      label: report.status,
      cls: "bg-muted text-muted-foreground",
      icon: "info" as IconName,
    };

  const canAct = report.status === "pending" || report.status === "reviewing";
  const actionPending = approveMut.isPending || rejectMut.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0 gap-0">
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-l from-primary/5 to-transparent">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    "size-12 rounded-xl grid place-items-center shrink-0",
                    moduleMeta.color
                  )}
                >
                  <Icon name={moduleMeta.icon} size={22} />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-bold truncate">
                    گزارش کنترل کیفیت
                  </DialogTitle>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="font-mono font-bold">
                      #{report.order?.number ?? "—"}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Icon name="customers" size={12} />
                      {report.order?.customer?.name ?? "—"}
                    </span>
                    <span>•</span>
                    <span className="tabular-nums">
                      {formatDate(report.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={cn(
                    "text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1",
                    statusMeta.cls
                  )}
                >
                  <Icon name={statusMeta.icon} size={11} />
                  {statusMeta.label}
                </span>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground">ماژول گزارش‌دهنده</div>
                <div className="text-sm font-bold mt-0.5 flex items-center gap-1.5">
                  <Icon name={moduleMeta.icon} size={13} />
                  {moduleMeta.label}
                </div>
              </div>
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground">تاریخ گزارش</div>
                <div className="text-sm font-bold mt-0.5 tabular-nums">
                  {formatDate(report.createdAt)}
                </div>
              </div>
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground">گزارش‌دهنده</div>
                <div className="text-sm font-bold mt-0.5 truncate">
                  {report.reportedBy ?? "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Body — scrollable */}
          <div
            className="overflow-y-auto scrollbar-thin px-6 py-4 space-y-4"
            style={{ maxHeight: "55vh" }}
          >
            {/* Report description — prominent */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Icon name="info" size={13} /> متن گزارش
              </div>
              <div className="rounded-lg border bg-amber-50/40 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900 p-3 text-sm whitespace-pre-wrap leading-6">
                {report.description || "—"}
              </div>
            </div>

            {/* Order items (name only — no prices) */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Icon name="orders" size={13} /> آیتم‌های سفارش
              </div>
              {(report.order?.items ?? []).length === 0 ? (
                <div className="text-xs text-muted-foreground py-3 text-center border rounded-lg">
                  آیتمی برای این سفارش ثبت نشده است.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(report.order?.items ?? []).map((it, i) => (
                    <div
                      key={i}
                      className="rounded-lg border p-2.5 flex items-center gap-2"
                    >
                      <span className="size-6 rounded-md bg-muted text-muted-foreground grid place-items-center text-xs font-bold shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium truncate">
                        {it.product?.name ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* If already approved: show returnStage + reviewedAt */}
            {report.status === "approved" && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/10 p-3">
                <div className="flex items-start gap-2.5">
                  <div className="size-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 grid place-items-center shrink-0">
                    <Icon name="checkCircle" size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">گزارش تأیید شده است</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      سفارش به مرحله{" "}
                      <span className="font-medium text-emerald-700 dark:text-emerald-300">
                        {report.returnStage
                          ? STAGE_OPTIONS.find((s) => s.value === report.returnStage)?.label ??
                            report.returnStage
                          : "نامشخص"}
                      </span>{" "}
                      بازگردانده شد.
                    </p>
                    {report.reviewedAt && (
                      <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                        تاریخ بررسی: {formatDate(report.reviewedAt)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* If rejected: show rejection notice */}
            {report.status === "rejected" && (
              <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/10 p-3">
                <div className="flex items-start gap-2.5">
                  <div className="size-8 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 grid place-items-center shrink-0">
                    <Icon name="cancel" size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">گزارش رد شده است</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      این گزارش توسط کنترل کیفیت رد شده است.
                    </p>
                    {report.reviewedAt && (
                      <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                        تاریخ بررسی: {formatDate(report.reviewedAt)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer — action buttons */}
          {canAct && (
            <div className="px-6 py-3 border-t bg-muted/30 flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setReturnStageOpen(true)}
                disabled={actionPending}
              >
                {approveMut.isPending ? (
                  <Icon name="loading" size={14} className="animate-spin" />
                ) : (
                  <Icon name="check" size={14} />
                )}
                تأیید و بازگشت به مرحله
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                onClick={() => rejectMut.mutate()}
                disabled={actionPending}
              >
                {rejectMut.isPending ? (
                  <Icon name="loading" size={14} className="animate-spin" />
                ) : (
                  <Icon name="cancel" size={14} />
                )}
                رد گزارش
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sub-dialog: choose return stage */}
      <Dialog open={returnStageOpen} onOpenChange={setReturnStageOpen}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogTitle className="sr-only">انتخاب مرحله بازگشت</DialogTitle>
          <div className="px-6 pt-5 pb-3 border-b">
            <div className="flex items-center gap-2">
              <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
                <Icon name="route" size={18} />
              </div>
              <div>
                <div className="font-semibold text-sm">انتخاب مرحله بازگشت</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  سفارش پس از تأیید گزارش به کدام مرحله بازگردد؟
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 space-y-2">
            {STAGE_OPTIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => setSelectedStage(s.value)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg border p-3 transition text-right",
                  selectedStage === s.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-input hover:border-foreground/30 hover:bg-accent/40"
                )}
              >
                <div
                  className={cn(
                    "size-9 rounded-lg grid place-items-center shrink-0",
                    selectedStage === s.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon name={s.icon} size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{s.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    سفارش به مرحله {s.label} بازمی‌گردد
                  </div>
                </div>
                {selectedStage === s.value && (
                  <Icon name="check" size={16} className="text-primary shrink-0" />
                )}
              </button>
            ))}
          </div>

          <DialogFooter className="px-6 py-3 border-t bg-muted/30">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReturnStageOpen(false)}
              disabled={actionPending}
            >
              انصراف
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                if (selectedStage) approveMut.mutate(selectedStage);
                else toast.error("لطفاً یک مرحله انتخاب کنید");
              }}
              disabled={!selectedStage || actionPending}
            >
              {approveMut.isPending ? (
                <Icon name="loading" size={14} className="animate-spin" />
              ) : (
                <Icon name="check" size={14} />
              )}
              تأیید و بازگشت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
