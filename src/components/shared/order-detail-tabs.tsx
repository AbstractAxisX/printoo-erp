"use client";

// Printoo24 ERP — Order Detail Modal tabs (Phase 2)
//
// Presentational components (one file, 6 tabs — honors the 3-file atomic rule;
// Open-Closed: a future tab = a new export here, no modal rewrite).
// Each tab receives `order` + focused callbacks. Heavy tabs (Costs) lazy-fetch
// their own data — only mounted when active (natural code-splitting).

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  ORDER_STATUS,
  ITEM_STAGE,
  TASK_STATUS,
  PRIORITY,
  type OrderStatus,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import type { OrderDetail } from "./order-detail-modal";

// ─── 1. Overview tab ────────────────────────────────────────────
// Context-First: identity, next-action CTA, status timeline, note.
const NEXT_ACTION: Partial<Record<OrderStatus, { to: OrderStatus; label: string; icon: Parameters<typeof Icon>[0]["name"]; }>> = {
  pending_design: { to: "in_printing", label: "ارسال به چاپ", icon: "print" },
  in_printing: { to: "warehouse_logistics", label: "ارسال به انبار", icon: "truck" },
  warehouse_logistics: { to: "completed", label: "تکمیل سفارش", icon: "checkCircle" },
  completed: { to: "archived", label: "آرشیو سفارش", icon: "archive" },
};

export function OverviewTab({
  order,
  status,
  onAdvance,
  advancing,
  note,
  onNoteChange,
  onSaveNote,
  savingNote,
  onGoTab,
}: {
  order: OrderDetail;
  status: OrderStatus;
  onAdvance: (s: OrderStatus) => void;
  advancing: boolean;
  note: string;
  onNoteChange: (v: string) => void;
  onSaveNote: () => void;
  savingNote: boolean;
  onGoTab: (t: "items" | "tasks" | "costs" | "finance" | "history") => void;
}) {
  const next = NEXT_ACTION[status];
  const unpaid = Math.max(0, order.totalAmount - order.paidAmount);
  const tasksCount = order.tasks?.length ?? 0;
  const doneTasks = order.tasks?.filter((t) => t.status === "done").length ?? 0;
  const blockingItems =
    order.items?.filter(
      (i) => i.needsMaterial && !i.materialConfirmed && i.stage !== "completed"
    ).length ?? 0;

  return (
    <div className="space-y-4">
      {/* Next-action CTA — Action-Forward principle */}
      {next ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
          <div className="size-10 rounded-lg bg-primary/15 text-primary grid place-items-center shrink-0">
            <Icon name={next.icon} size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">گام بعدی</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              این سفارش در وضعیت «{ORDER_STATUS[status].label}» است.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => onAdvance(next.to)}
            disabled={advancing}
            className="gap-1.5 shrink-0"
          >
            {advancing ? (
              <Icon name="loading" size={14} className="animate-spin" />
            ) : (
              <Icon name="arrowLeft" size={14} />
            )}
            {next.label}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-muted/30 p-4 flex items-center gap-3">
          <div className="size-10 rounded-lg bg-muted text-muted-foreground grid place-items-center shrink-0">
            <Icon name="checkBadge" size={20} />
          </div>
          <div className="text-sm">
            این سفارش در وضعیت نهایی (
            {ORDER_STATUS[status].label}) قرار دارد.
          </div>
        </div>
      )}

      {/* Quick stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          onClick={() => onGoTab("items")}
          className="rounded-lg border p-3 text-right hover:bg-accent/30 transition"
        >
          <div className="text-[10px] text-muted-foreground">آیتم‌ها</div>
          <div className="text-lg font-bold mt-0.5 tabular-nums">
            {order.items?.length ?? 0}
          </div>
        </button>
        <button
          onClick={() => onGoTab("tasks")}
          className="rounded-lg border p-3 text-right hover:bg-accent/30 transition"
        >
          <div className="text-[10px] text-muted-foreground">تسک‌ها</div>
          <div className="text-lg font-bold mt-0.5 tabular-nums">
            {tasksCount}
            {tasksCount > 0 && (
              <span className="text-[11px] font-normal text-muted-foreground mr-1">
                ({doneTasks} انجام‌شده)
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => onGoTab("finance")}
          className="rounded-lg border p-3 text-right hover:bg-accent/30 transition"
        >
          <div className="text-[10px] text-muted-foreground">باقی‌مانده</div>
          <div
            className={cn(
              "text-lg font-bold mt-0.5 tabular-nums",
              unpaid > 0 ? "text-rose-600" : "text-emerald-600"
            )}
            dir="ltr"
          >
            {formatCurrency(unpaid)}
          </div>
        </button>
        <div className="rounded-lg border p-3">
          <div className="text-[10px] text-muted-foreground">اولویت</div>
          <div className="text-lg font-bold mt-0.5">
            {PRIORITY[order.priority as keyof typeof PRIORITY]?.label ?? "—"}
          </div>
        </div>
      </div>

      {/* Blocking items callout */}
      {blockingItems > 0 && (
        <button
          onClick={() => onGoTab("items")}
          className="w-full rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 flex items-center gap-2 text-right hover:opacity-80 transition"
        >
          <Icon name="alert" size={16} className="text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800 dark:text-amber-200">
            {blockingItems} آیتم نیازمند تأمین متریال است — قبل از چاپ بررسی شود.
          </span>
        </button>
      )}

      {/* Note — Progressive Disclosure: a section, not a tab peer */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
          <span className="text-xs font-medium flex items-center gap-1.5">
            <Icon name="info" size={13} /> یادداشت سفارش
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={onSaveNote}
            disabled={savingNote || note === (order.note ?? "")}
            className="h-7 gap-1 text-xs"
          >
            {savingNote ? (
              <Icon name="loading" size={12} className="animate-spin" />
            ) : (
              <Icon name="check" size={12} />
            )}
            ذخیره
          </Button>
        </div>
        <Textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={3}
          placeholder="یادداشت داخلی درباره این سفارش..."
          className="border-0 rounded-none focus-visible:ring-0 resize-none text-sm"
        />
      </div>
    </div>
  );
}

// ─── 2. Items tab ───────────────────────────────────────────────
export function ItemsTab({ order }: { order: OrderDetail }) {
  if (!order.items?.length) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        این سفارش آیتمی ندارد.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {order.items.map((it, i) => {
        const stage = ITEM_STAGE[it.stage as keyof typeof ITEM_STAGE];
        const designLate =
          it.designEndDate &&
          it.stage === "design" &&
          new Date(it.designEndDate) < new Date();
        const printLate =
          it.printEndDate &&
          it.stage === "print" &&
          new Date(it.printEndDate) < new Date();
        return (
          <div
            key={it.id}
            className="rounded-lg border p-3 hover:bg-accent/30 transition"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="size-6 rounded-md bg-muted text-muted-foreground grid place-items-center text-xs font-bold shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">
                    {it.product?.name ?? "—"}
                  </div>
                  {it.description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {it.description}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-left shrink-0">
                <div className="text-sm font-semibold tabular-nums" dir="ltr">
                  {formatCurrency(it.totalAmount)}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums" dir="ltr">
                  {it.quantity} × {formatCurrency(it.pricePerUnit)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px]">
              <span className="px-1.5 py-0.5 rounded bg-muted">
                {stage?.label ?? it.stage}
              </span>
              {it.needsMaterial && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded flex items-center gap-0.5",
                    it.materialConfirmed
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                  )}
                >
                  <Icon name={it.materialConfirmed ? "check" : "alert"} size={10} />
                  {it.materialConfirmed ? "متریال تأمین شد" : "نیازمند متریال"}
                </span>
              )}
              {it.designStartDate && (
                <span className="text-muted-foreground flex items-center gap-0.5">
                  <Icon name="design" size={10} /> طراحی:{" "}
                  {formatDate(it.designStartDate)}
                  {it.designEndDate && ` تا ${formatDate(it.designEndDate)}`}
                  {designLate && (
                    <span className="text-rose-600 mr-0.5">(معوق)</span>
                  )}
                </span>
              )}
              {it.printStartDate && (
                <span className="text-muted-foreground flex items-center gap-0.5">
                  <Icon name="print" size={10} /> چاپ:{" "}
                  {formatDate(it.printStartDate)}
                  {it.printEndDate && ` تا ${formatDate(it.printEndDate)}`}
                  {printLate && (
                    <span className="text-rose-600 mr-0.5">(معوق)</span>
                  )}
                </span>
              )}
              {it.note && (
                <span className="text-muted-foreground flex items-center gap-0.5 truncate max-w-[200px]">
                  <Icon name="info" size={10} /> {it.note}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── 3. Tasks tab (read-only; assignment logic lands in Phase 4) ──
export function TasksTab({ order }: { order: OrderDetail }) {
  const navigate = useAppStore((s) => s.navigate);
  const tasks = order.tasks ?? [];
  if (tasks.length === 0) {
    return (
      <div className="py-8 text-center space-y-2">
        <Icon name="task" size={28} className="mx-auto text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          این سفارش هنوز تسکی ندارد.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate("admin", "tasks")}
          className="gap-1.5"
        >
          <Icon name="plus" size={14} /> ایجاد تسک در صفحه تسک‌ها
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {tasks.map((t) => {
        const ts = TASK_STATUS[t.status as keyof typeof TASK_STATUS];
        const isOverdue =
          t.dueDate && t.status !== "done" && new Date(t.dueDate) < new Date();
        return (
          <div
            key={t.id}
            className="rounded-lg border p-3 flex items-start gap-2.5"
          >
            <span
              className={cn(
                "size-2 rounded-full mt-1.5 shrink-0",
                t.status === "done"
                  ? "bg-emerald-500"
                  : t.status === "in_progress"
                  ? "bg-amber-500"
                  : "bg-slate-400"
              )}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{t.title}</div>
              {t.description && (
                <div className="text-xs text-muted-foreground truncate">
                  {t.description}
                </div>
              )}
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-muted">
                  {ts?.label ?? t.status}
                </span>
                <span>
                  {PRIORITY[t.priority as keyof typeof PRIORITY]?.label ?? t.priority}
                </span>
                {t.dueDate && (
                  <span
                    className={cn(
                      "flex items-center gap-0.5",
                      isOverdue && "text-rose-600"
                    )}
                  >
                    <Icon name="clock" size={10} />
                    {formatDate(t.dueDate)}
                    {isOverdue && " (معوق)"}
                  </span>
                )}
                {t.assignedTo && (
                  <span className="flex items-center gap-0.5">
                    <Icon name="user" size={10} /> {t.assignedTo}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => navigate("admin", "tasks")}
        className="gap-1.5 text-xs"
      >
        <Icon name="arrowLeft" size={12} /> مدیریت همه تسک‌ها
      </Button>
    </div>
  );
}

// ─── 4. Costs tab (lazy-fetch — only mounts when active) ────────
type MaterialCostRow = {
  id: string;
  amount: number;
  status: string;
  module: string;
  description: string | null;
  supplier: { id: string; name: string } | null;
  expenseType: { id: string; name: string } | null;
  createdAt: string;
};

const COST_STATUS: Record<string, { label: string; badge: string }> = {
  pending: { label: "در انتظار", badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  approved: { label: "تأیید شده", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  rejected: { label: "رد شده", badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
};

export function CostsTab({ order }: { order: OrderDetail }) {
  const navigate = useAppStore((s) => s.navigate);
  const { data, isLoading } = useQuery({
    queryKey: ["order-costs", order.id],
    queryFn: () => api<{ costs: MaterialCostRow[] }>(`/api/material-costs?orderId=${order.id}`),
  });
  const costs = data?.costs ?? [];
  const total = costs.reduce((s, c) => s + c.amount, 0);
  const approved = costs.filter((c) => c.status === "approved").reduce((s, c) => s + c.amount, 0);
  const pending = costs.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }
  if (costs.length === 0) {
    return (
      <div className="py-8 text-center space-y-2">
        <Icon name="coins" size={28} className="mx-auto text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          هزینه متریال/چاپ برای این سفارش ثبت نشده است.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">کل هزینه‌ها</div>
          <div className="text-sm font-bold mt-0.5 tabular-nums" dir="ltr">
            {formatCurrency(total)}
          </div>
        </div>
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">تأیید شده</div>
          <div className="text-sm font-bold mt-0.5 text-emerald-600 tabular-nums" dir="ltr">
            {formatCurrency(approved)}
          </div>
        </div>
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">در انتظار</div>
          <div className="text-sm font-bold mt-0.5 text-amber-600 tabular-nums" dir="ltr">
            {formatCurrency(pending)}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {costs.map((c) => {
          const st = COST_STATUS[c.status] ?? { label: c.status, badge: "bg-muted text-muted-foreground" };
          return (
            <div key={c.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {c.expenseType?.name ?? "هزینه"} — {c.supplier?.name ?? "بدون تأمین‌کننده"}
                  </div>
                  {c.description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {c.description}
                    </div>
                  )}
                </div>
                <div className="text-left shrink-0">
                  <div className="text-sm font-semibold tabular-nums" dir="ltr">
                    {formatCurrency(c.amount)}
                  </div>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded inline-block mt-0.5", st.badge)}>
                    {st.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => navigate("admin", "suppliers")}
        className="gap-1.5 text-xs"
      >
        <Icon name="arrowLeft" size={12} /> مدیریت در ماژول تأمین‌کنندگان
      </Button>
    </div>
  );
}

// ─── 5. Finance tab (replaces the no-op "فاکتور" button — R5 fix) ──
export function FinanceTab({
  order,
  onPreInvoice,
}: {
  order: OrderDetail;
  onPreInvoice: () => void;
}) {
  const unpaid = Math.max(0, order.totalAmount - order.paidAmount);
  const hasPreInvoice = (order.preInvoices?.length ?? 0) > 0;
  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">مبلغ کل سفارش</div>
          <div className="text-sm font-bold mt-0.5 tabular-nums" dir="ltr">
            {formatCurrency(order.totalAmount)}
          </div>
        </div>
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">پرداخت‌شده</div>
          <div className="text-sm font-bold mt-0.5 text-emerald-600 tabular-nums" dir="ltr">
            {formatCurrency(order.paidAmount)}
          </div>
        </div>
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">باقی‌مانده</div>
          <div className={cn("text-sm font-bold mt-0.5 tabular-nums", unpaid > 0 ? "text-rose-600" : "text-emerald-600")} dir="ltr">
            {formatCurrency(unpaid)}
          </div>
        </div>
      </div>

      {/* Pre-invoices */}
      <div className="rounded-lg border">
        <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
          <span className="text-xs font-medium flex items-center gap-1.5">
            <Icon name="receipt" size={13} /> پیش‌فاکتورها
          </span>
          <Button size="sm" variant="outline" onClick={onPreInvoice} className="h-7 gap-1 text-xs">
            <Icon name={hasPreInvoice ? "edit" : "plus"} size={12} />
            {hasPreInvoice ? "ویرایش" : "صدور"}
          </Button>
        </div>
        <div className="divide-y">
          {order.preInvoices?.length ? (
            order.preInvoices.map((pi) => (
              <div key={pi.id} className="px-3 py-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">پیش‌فاکتور #{pi.number}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {pi.date ? formatDate(pi.date) : ""}
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold tabular-nums" dir="ltr">
                    {formatCurrency(pi.totalAmount)}
                  </div>
                  <div className="text-[11px] text-emerald-600 tabular-nums" dir="ltr">
                    پرداخت: {formatCurrency(pi.paidAmount)}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              پیش‌فاکتوری صادر نشده است.
            </div>
          )}
        </div>
      </div>

      {/* Invoice (real display — was a no-op button, R5 fixed) */}
      <div className="rounded-lg border">
        <div className="px-3 py-2 border-b bg-muted/30">
          <span className="text-xs font-medium flex items-center gap-1.5">
            <Icon name="invoice" size={13} /> فاکتور رسمی
          </span>
        </div>
        <div className="px-3 py-2">
          {order.invoice ? (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">فاکتور #{order.invoice.number}</div>
                <div className="text-[11px] text-muted-foreground">
                  {order.invoice.date ? formatDate(order.invoice.date) : ""}
                </div>
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold tabular-nums" dir="ltr">
                  {formatCurrency(order.invoice.totalAmount)}
                </div>
                <div className="text-[11px] text-emerald-600 tabular-nums" dir="ltr">
                  پرداخت: {formatCurrency(order.invoice.paidAmount)}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-1">
              فاکتور رسمی صادر نشده. (صدور فاکتور در ماژول مالی فعال خواهد شد.)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 6. History tab (reconstructed timeline; AuditLog deferred) ──
type TimelineEvent = {
  date: string;
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  subtitle?: string;
  tone: "neutral" | "emerald" | "amber" | "rose" | "violet";
};

export function HistoryTab({ order }: { order: OrderDetail }) {
  const events: TimelineEvent[] = [];

  events.push({
    date: order.createdAt,
    icon: "plus",
    title: `سفارش #${order.number} ایجاد شد`,
    subtitle: order.createdBy ? `توسط ${order.createdBy}` : undefined,
    tone: "neutral",
  });

  for (const t of order.tasks ?? []) {
    events.push({
      date: t.createdAt,
      icon: "task",
      title: `تسک «${t.title}» ثبت شد`,
      subtitle: t.assignedTo ? `ارجاع به ${t.assignedTo}` : undefined,
      tone: "violet",
    });
  }
  for (const pi of order.preInvoices ?? []) {
    events.push({
      date: pi.date ?? pi.id,
      icon: "receipt",
      title: `پیش‌فاکتور #${pi.number} صادر شد`,
      subtitle: `مبلغ: ${formatCurrency(pi.totalAmount)}`,
      tone: "emerald",
    });
  }
  if (order.invoice) {
    events.push({
      date: order.invoice.date ?? order.invoice.id,
      icon: "invoice",
      title: `فاکتور رسمی #${order.invoice.number} صادر شد`,
      subtitle: `مبلغ: ${formatCurrency(order.invoice.totalAmount)}`,
      tone: "emerald",
    });
  }

  events.sort((a, b) => (new Date(a.date).getTime() - new Date(b.date).getTime()));

  const toneClass: Record<TimelineEvent["tone"], string> = {
    neutral: "bg-muted text-muted-foreground",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  };

  if (events.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        رویدادی برای نمایش وجود ندارد.
      </div>
    );
  }
  return (
    <div className="relative pr-4">
      <div className="absolute right-[7px] top-2 bottom-2 w-px bg-border" />
      <div className="space-y-3">
        {events.map((ev, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="relative flex items-start gap-3"
          >
            <span
              className={cn(
                "size-3.5 rounded-full grid place-items-center shrink-0 mt-0.5 ring-4 ring-background",
                toneClass[ev.tone]
              )}
            >
              <Icon name={ev.icon} size={8} className="opacity-80" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{ev.title}</div>
              {ev.subtitle && (
                <div className="text-xs text-muted-foreground">{ev.subtitle}</div>
              )}
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                {formatDate(ev.date)}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
