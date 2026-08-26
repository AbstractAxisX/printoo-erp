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
} from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────
export type MaterialCost = {
  id: string;
  orderId: string;
  supplierId: string | null;
  expenseTypeId: string | null;
  description: string | null;
  amount: number;
  fileUrl1: string | null;
  fileUrl2: string | null;
  status: string;
  module: string;
  createdAt: string;
  supplier: { name: string } | null;
  expenseType: { name: string } | null;
  order: { id: string; number: number; customer: { name: string } } | null;
};

// ─── Module & status meta ─────────────────────────────────────────────
const MODULE_META: Record<
  string,
  { label: string; icon: IconName; color: string }
> = {
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

// ─── Helper: extract file name from a URL/path ────────────────────────
function fileName(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.split("/").pop() || url;
  } catch {
    return url.split("/").pop() || url;
  }
}

// ─── Component ────────────────────────────────────────────────────────
export function FinanceCostDetailModal({
  costId,
  open,
  onOpenChange,
}: {
  costId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const invalidate = useInvalidate();
  const qc = useQueryClient();

  // Fetch the material cost
  const { data, isLoading } = useQuery({
    queryKey: ["material-cost", costId],
    queryFn: () => api<{ cost: MaterialCost }>(`/api/material-costs/${costId}`),
    enabled: !!costId && open,
    refetchInterval: 30000,
  });

  const cost = data?.cost ?? null;

  // ── Action: approve ───────────────────────────────────────────────
  const approveMut = useMutation({
    mutationFn: () =>
      api(`/api/material-costs/${costId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "approved" }),
      }),
    onSuccess: () => {
      toast.success("هزینه تأیید شد");
      invalidate(["material-costs", "dashboard"]);
      qc.invalidateQueries({ queryKey: ["material-cost", costId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Action: reject ────────────────────────────────────────────────
  const rejectMut = useMutation({
    mutationFn: () =>
      api(`/api/material-costs/${costId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "rejected" }),
      }),
    onSuccess: () => {
      toast.success("هزینه رد شد");
      invalidate(["material-costs", "dashboard"]);
      qc.invalidateQueries({ queryKey: ["material-cost", costId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Loading / empty ───────────────────────────────────────────────
  if (!cost) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined} className="max-w-2xl p-0 gap-0">
          <DialogTitle className="sr-only">جزئیات هزینه</DialogTitle>
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            {isLoading ? (
              <>
                <Icon name="loading" size={28} className="animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  در حال بارگذاری هزینه...
                </span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">هزینه یافت نشد</span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const moduleMeta =
    MODULE_META[cost.module] ?? {
      label: cost.module,
      icon: "wallet" as IconName,
      color: "bg-muted text-muted-foreground",
    };
  const statusMeta =
    STATUS_META[cost.status] ?? {
      label: cost.status,
      cls: "bg-muted text-muted-foreground",
      icon: "info" as IconName,
    };

  const canAct = cost.status === "pending";
  const actionPending = approveMut.isPending || rejectMut.isPending;

  // File attachments
  const files = [cost.fileUrl1, cost.fileUrl2].filter(
    (f): f is string => !!f && f.trim() !== ""
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[90vh] overflow-hidden p-0 gap-0">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-l from-rose-500/5 to-transparent">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  "size-12 rounded-xl grid place-items-center shrink-0",
                  moduleMeta.color
                )}
              >
                <Icon name="money" size={22} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold truncate">
                  جزئیات هزینه
                </DialogTitle>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="font-mono font-bold">
                    #{cost.order?.number ?? "—"}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Icon name="customers" size={12} />
                    {cost.order?.customer?.name ?? "—"}
                  </span>
                  <span>•</span>
                  <span className="tabular-nums">
                    {formatDate(cost.createdAt)}
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

          {/* Amount banner */}
          <div className="mt-4 rounded-lg border bg-background/60 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 grid place-items-center">
                <Icon name="coins" size={16} />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">مبلغ هزینه</div>
                <div className="text-base font-bold tabular-nums" dir="ltr">
                  {formatCurrency(cost.amount)}
                </div>
              </div>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                moduleMeta.color
              )}
            >
              <Icon name={moduleMeta.icon} size={11} />
              ماژول {moduleMeta.label}
            </span>
          </div>
        </div>

        {/* Body — scrollable */}
        <div
          className="overflow-y-auto scrollbar-thin px-6 py-4 space-y-4"
          style={{ maxHeight: "55vh" }}
        >
          {/* Quick info grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border p-3">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Icon name="suppliers" size={11} /> تامین‌کننده
              </div>
              <div className="text-sm font-medium mt-1 truncate">
                {cost.supplier?.name ?? "—"}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Icon name="tag" size={11} /> نوع هزینه
              </div>
              <div className="text-sm font-medium mt-1 truncate">
                {cost.expenseType?.name ?? "—"}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Icon name="orders" size={11} /> شماره سفارش
              </div>
              <div className="text-sm font-medium mt-1 font-mono">
                #{cost.order?.number ?? "—"}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Icon name="calendar" size={11} /> تاریخ ثبت
              </div>
              <div className="text-sm font-medium mt-1 tabular-nums">
                {formatDate(cost.createdAt)}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Icon name="info" size={13} /> توضیحات
            </div>
            <div
              className={cn(
                "rounded-lg border p-3 text-sm whitespace-pre-wrap leading-6",
                cost.description
                  ? "bg-muted/20"
                  : "bg-muted/10 text-muted-foreground italic"
              )}
            >
              {cost.description || "بدون توضیحات"}
            </div>
          </div>

          {/* File attachments */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Icon name="file" size={13} /> پیوست‌ها
              {files.length > 0 && (
                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
                  {files.length}
                </span>
              )}
            </div>
            {files.length === 0 ? (
              <div className="text-xs text-muted-foreground py-3 text-center border rounded-lg bg-muted/10">
                پیوستی برای این هزینه ثبت نشده است.
              </div>
            ) : (
              <div className="space-y-1.5">
                {files.map((f, i) => (
                  <a
                    key={i}
                    href={f}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border p-2.5 hover:bg-accent/40 transition group"
                  >
                    <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                      <Icon name="file" size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" dir="ltr">
                        {fileName(f)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        پیوست {i + 1}
                      </div>
                    </div>
                    <Icon
                      name="download"
                      size={14}
                      className="text-muted-foreground group-hover:text-primary shrink-0"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* If already approved/rejected: status notice */}
          {cost.status !== "pending" && (
            <div
              className={cn(
                "rounded-lg border p-3",
                cost.status === "approved"
                  ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/10"
                  : "border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/10"
              )}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={cn(
                    "size-8 rounded-lg grid place-items-center shrink-0",
                    cost.status === "approved"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                  )}
                >
                  <Icon
                    name={cost.status === "approved" ? "checkCircle" : "cancel"}
                    size={16}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">
                    {cost.status === "approved"
                      ? "هزینه تأیید شده است"
                      : "هزینه رد شده است"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    این هزینه توسط واحد مالی{" "}
                    {cost.status === "approved" ? "تأیید" : "رد"} شده است.
                  </p>
                  <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                    تاریخ ثبت: {formatDate(cost.createdAt)}
                  </div>
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
              onClick={() => approveMut.mutate()}
              disabled={actionPending}
            >
              {approveMut.isPending ? (
                <Icon name="loading" size={14} className="animate-spin" />
              ) : (
                <Icon name="check" size={14} />
              )}
              تأیید هزینه
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
              رد هزینه
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
