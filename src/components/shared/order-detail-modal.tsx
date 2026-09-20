"use client";

// Printoo24 ERP — Order Detail Modal (Phase 2 rebuild)
//
// Cognitive UX (see ARCHITECTURE-NOTES-MUST-READ.md):
// - Context-First: default tab = Overview (identity + timeline + metrics + next-action CTA)
// - Action-Forward: status change is a header dropdown + Overview CTA, NOT a tab
// - Progressive Disclosure: note is a section in Overview, not a peer tab
// - 6 tabs: Overview → Items → Tasks → Costs(lazy) → Finance → History
// - Skeleton loading (not spinner) for perceived-performance
// - Lazy code-split via next/dynamic at the use-order-detail hook
//
// Public interface PRESERVED (drop-in): {order, open, onOpenChange} + type OrderDetail.
// OrderDetail is EXTENDED additively (tasks) — no breaking change to consumers:
//   - lib/use-order-detail.tsx
//   - components/modules/admin/open-orders.tsx (direct render)

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate, daysRemaining, isOrderClosed } from "@/lib/format";
import {
  ORDER_STATUS,
  ITEM_STAGE,
  PRIORITY,
  type OrderStatus,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAppStore } from "@/stores/app-store";
import {
  OverviewTab,
  ItemsTab,
  TasksTab,
  CostsTab,
  PreInvoiceTab,
  HistoryTab,
} from "./order-detail-tabs";
import { InvoiceTab, type InvoiceFull } from "./invoice-tab";
import { PreInvoiceModal } from "./pre-invoice-modal";

/** Phase 9 — شناسهٔ تب مودال جزئیات (برای openOrder(id, tab)) */
export type OrderDetailTab =
  | "overview"
  | "items"
  | "tasks"
  | "costs"
  | "preInvoice"
  | "invoice"
  | "history";

export type OrderEventLite = {
  id: string;
  type: string;
  stage: string | null;
  actorId: string | null;
  actorName: string | null;
  title: string;
  description: string | null;
  sensitive: boolean;
  createdAt: string;
};

export type OrderDetail = {
  id: string;
  number: number;
  status: OrderStatus;
  endDate: string | null;
  noEndDate: boolean;
  totalAmount: number;
  paidAmount: number;
  priority: string;
  splitMode: string;
  note: string | null;
  designerNote?: string | null;
  createdAt: string;
  updatedAt?: string;
  createdBy: string | null;
  customer: { id: string; name: string; phone: string };
  // Phase 18: مجریان سطح سفارش (GET /api/orders/[id] از قبل برمی‌گرداند)
  assignedDesignerId?: string | null;
  assignedPrinterId?: string | null;
  assignedDesigner?: { id: string; name: string; phone?: string } | null;
  assignedPrinter?: { id: string; name: string; phone?: string } | null;
  items: {
    id: string;
    productId: string;
    product: { name: string };
    quantity: number;
    pricePerUnit: number;
    totalAmount: number;
    note: string | null;
    description: string | null;
    stage: string;
    needsMaterial: boolean;
    materialConfirmed?: boolean;
    designStartDate: string | null;
    designEndDate: string | null;
    printStartDate: string | null;
    printEndDate: string | null;
    // Phase 18: مجری per-item (additive — سرور برمی‌گرداند)
    designAssigneeId?: string | null;
    printAssigneeId?: string | null;
    designAssigneeUser?: { id: string; name: string } | null;
    printAssigneeUser?: { id: string; name: string } | null;
  }[];
  preInvoices: {
    id: string;
    number: number;
    status?: string;
    issueDate?: string;
    validUntil?: string | null;
    totalAmount: number;
    paidAmount: number;
    discountAmount?: number;
    date?: string;
    items?: string;
    /** Phase 10: آیتم مرتبط — null = سند کل گروه */
    itemId?: string | null;
  }[];
  invoice: InvoiceFull | null;
  // Phase 14: رویدادهای واقعی گردش کار (audit) — sensitiveها سرور-side فیلتر شده‌اند
  events?: OrderEventLite[];
  // Extended (additive — GET /api/orders/[id] already includes these)
  tasks?: {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    priority: string;
    dueDate?: string | null;
    module: string;
    assignedTo?: string | null;
    assignedUser?: { id: string; name: string; role: string } | null;
    createdAt: string;
  }[];
  // Phase 22 (خواستهٔ 3): خلاصهٔ هزینه برای کاشی هزینه/قیمت/سود — فقط برای
  // مستر/مالی/ادمین داخلی برمی‌گردد؛ برای طراح/چاپ غایب است.
  costSummary?: { total: number; approved: number; pending: number };
  // Phase 22 (خواستهٔ 6): هدیهٔ ثبت‌شده روی سفارش (بخشش بخشی از مبلغ)
  giftAmount?: number;
  giftPercentage?: number;
  giftNote?: string | null;
  giftedAt?: string | null;
  giftedByName?: string | null;
};

type TabId = OrderDetailTab;

const TABS: { id: TabId; label: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { id: "overview", label: "نمای کلی", icon: "dashboard" },
  { id: "items", label: "آیتم‌ها", icon: "orders" },
  { id: "tasks", label: "تسک‌ها", icon: "task" },
  { id: "costs", label: "هزینه‌ها", icon: "coins" },
  { id: "preInvoice", label: "پیش‌فاکتور", icon: "receipt" },
  { id: "invoice", label: "فاکتور", icon: "invoice" },
  { id: "history", label: "تاریخچه", icon: "route" },
];

// ─── Skeleton ────────────────────────────────────────────────────
function ModalSkeleton() {
  return (
    <div className="flex flex-col gap-0">
      {/* header skeleton */}
      <div className="px-6 pt-5 pb-4 border-b">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-xl bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 rounded bg-muted animate-pulse" />
            <div className="h-3 w-28 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-6 w-20 rounded-full bg-muted animate-pulse" />
        </div>
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/60 animate-pulse" />
          ))}
        </div>
      </div>
      {/* tab nav skeleton */}
      <div className="flex gap-4 px-6 py-3 border-b">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-4 w-20 rounded bg-muted animate-pulse" />
        ))}
      </div>
      {/* body skeleton */}
      <div className="px-6 py-5 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg border bg-muted/30 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ─── Metric tile (header quick-stats) ─────────────────────────────
// Visual-hierarchy unit: icon chip + label + value + optional hint,
// with semantic tone (emerald=good, rose=risk, amber=attention).
function MetricTile({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  value: string;
  hint?: string;
  tone?: "emerald" | "rose" | "amber";
}) {
  const toneText =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "rose"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : "text-foreground";
  const toneChip =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : tone === "rose"
      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
      : tone === "amber"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "bg-muted text-muted-foreground";
  return (
    <div className="rounded-xl bg-background/70 backdrop-blur-sm p-3 border shadow-sm">
      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <span className={cn("size-5 rounded-md grid place-items-center", toneChip)}>
          <Icon name={icon} size={11} />
        </span>
        {label}
      </div>
      <div className={cn("text-sm font-bold mt-1.5 tabular-nums flex items-baseline gap-1", toneText)}>
        <span dir="ltr">{value}</span>
        {hint && (
          <span className="text-[10px] font-normal text-muted-foreground">({hint})</span>
        )}
      </div>
    </div>
  );
}

// ─── Status dropdown (action-forward, in header) ────────────────
function StatusDropdown({
  current,
  onChange,
  disabled,
}: {
  current: OrderStatus;
  onChange: (s: OrderStatus) => void;
  disabled?: boolean;
}) {
  const cur = ORDER_STATUS[current] ?? { label: "—", badge: "bg-muted text-muted-foreground" };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          disabled={disabled}
          className={cn(
            "text-xs font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1 transition",
            cur.badge,
            disabled ? "opacity-60 cursor-not-allowed" : "hover:opacity-80"
          )}
          aria-label="تغییر وضعیت سفارش"
        >
          {cur.label}
          <Icon name="chevronDown" size={12} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>تغییر وضعیت</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(Object.entries(ORDER_STATUS) as [OrderStatus, { label: string; badge: string }][]).map(
          ([k, v]) => (
            <DropdownMenuItem
              key={k}
              onClick={() => onChange(k)}
              className={cn("gap-2", k === current && "bg-accent")}
            >
              <span className={cn("size-2 rounded-full", v.badge.split(" ")[0])} />
              {v.label}
              {k === current && (
                <Icon name="check" size={12} className="mr-auto text-primary" />
              )}
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Main modal ─────────────────────────────────────────────────
export function OrderDetailModal({
  order,
  open,
  onOpenChange,
  initialTab,
  isError,
  errorMessage,
  onRetry,
}: {
  order: OrderDetail | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Phase 9 — تب آغازین (دکمهٔ ردیف پیش‌فاکتور/فاکتور → مستقیم همان تب) */
  initialTab?: OrderDetailTab | null;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  const invalidate = useInvalidate();
  const navigate = useAppStore((s) => s.navigate);

  const [activeTab, setActiveTab] = React.useState<TabId>("overview");
  const [status, setStatus] = React.useState<OrderStatus>("pending_design");
  const [note, setNote] = React.useState("");
  const [preInvoiceOpen, setPreInvoiceOpen] = React.useState(false);
  // Phase 22 (خواستهٔ 6): دیالوگ هدیه دادن سفارش
  const [giftOpen, setGiftOpen] = React.useState(false);
  // فقط مستر/مالی می‌توانند هدیه بدهند (تصمیم مالی)
  const user = useAppStore((s) => s.user);
  const canGift =
    !!user && (user.role === "master" || user.modules.includes("finance"));
  // Phase 9 — نمای آغازین PreInvoiceModal: فرم صدور یا سند مشخص
  const [piInitialDocId, setPiInitialDocId] = React.useState<string | null>(null);
  const [piInitialView, setPiInitialView] = React.useState<"list" | "issue" | "doc">("list");
  // Phase 10 — صدور برای آیتم مشخص (سند per-item) یا کل گروه (null)
  const [piInitialItemId, setPiInitialItemId] = React.useState<string | null>(null);

  // Sync local state when order loads/changes
  React.useEffect(() => {
    if (order) {
      setStatus(order.status);
      setNote(order.note || "");
      // تب آغازین فقط بار اول (order.id جدید) اعمال می‌شود
      setActiveTab(initialTab ?? "overview");
    }
  }, [order?.id]);

  // ── Status mutation (action-forward) ──
  const statusMut = useMutation({
    mutationFn: (newStatus: OrderStatus) =>
      api(`/api/orders/${order?.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      }),
    onSuccess: (_data, newStatus) => {
      setStatus(newStatus);
      invalidate(["orders", "open-orders", "dashboard", "notifications", "order"]);
      toast.success("وضعیت سفارش به‌روزرسانی شد");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Note mutation ──
  const noteMut = useMutation({
    mutationFn: () =>
      api(`/api/orders/${order?.id}`, {
        method: "PUT",
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      invalidate(["orders", "order"]);
      toast.success("یادداشت ذخیره شد");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Loading state — skeleton (not spinner) for perceived performance.
  // Error state — explicit message + retry (previously a forever-skeleton
  // on API failure, which looked like a blank/white modal).
  if (!order) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* 20-E — موبایل: تمام‌صفحه با اسکرول واحد؛ دسکتاپ عین قبل */}
        <DialogContent className="w-full max-w-none h-[100dvh] max-h-[100dvh] rounded-none overflow-y-auto sm:overflow-hidden sm:h-auto sm:max-w-5xl sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:rounded-xl p-0 gap-0 [&>*]:min-w-0">
          <DialogTitle className="sr-only">جزئیات سفارش</DialogTitle>
          <DialogDescription className="sr-only">
            در حال بارگذاری اطلاعات سفارش
          </DialogDescription>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Icon name="alertTriangle" size={32} className="text-rose-500" />
              <span className="text-sm font-medium text-rose-600 text-center leading-relaxed max-w-md">
                {errorMessage || "خطا در بارگذاری سفارش — سرور پاسخ نداد"}
              </span>
              {onRetry && (
                <Button size="sm" variant="outline" onClick={onRetry}>
                  تلاش دوباره
                </Button>
              )}
            </div>
          ) : (
            <ModalSkeleton />
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // فاز 24 (خواستهٔ 2): سفارش بسته (تمام/آرشیو/لغو) — بدون موعد/شمارش معکوس
  const closed = isOrderClosed(order.status);
  const dr = daysRemaining(order.endDate);
  const unpaid = Math.max(0, order.totalAmount - order.paidAmount);
  // Phase 22 (خواستهٔ 3): هزینه/قیمت/سود — سود = قیمت داده‌شده − هزینهٔ تأییدشده
  const cost = order.costSummary;
  const profit = cost != null ? order.totalAmount - cost.approved : null;
  const hasPreInvoice = (order.preInvoices?.length ?? 0) > 0;
  const tasksCount = order.tasks?.length ?? 0;
  const overdueTasks =
    order.tasks?.filter(
      (t) => t.dueDate && t.status !== "done" && new Date(t.dueDate) < new Date()
    ).length ?? 0;
  const blockingItems =
    order.items?.filter(
      (i) => i.needsMaterial && !i.materialConfirmed && i.stage !== "completed"
    ).length ?? 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* 20-E — موبایل: تمام‌صفحه (h-100dvh + اسکرول کل مودال)؛ دسکتاپ عین قبل */}
        <DialogContent className="w-full max-w-none h-[100dvh] max-h-[100dvh] rounded-none overflow-y-auto sm:overflow-hidden sm:h-auto sm:max-w-5xl sm:max-h-[92vh] sm:w-[calc(100%-2rem)] sm:rounded-xl p-0 gap-0 [&>*]:min-w-0">
          <DialogTitle className="sr-only">
            سفارش #{order.number} — {order.customer?.name}
          </DialogTitle>
          <DialogDescription className="sr-only">
            جزئیات، آیتم‌ها، تسک‌ها، هزینه‌ها، مالی و تاریخچه سفارش
          </DialogDescription>

          {/* ── Header ── */}
          <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-l from-primary/8 via-primary/3 to-transparent">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="size-14 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0 border border-primary/10">
                  <span className="font-mono font-bold text-base">#{order.number}</span>
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold truncate">
                    {order.customer?.name ?? "—"}
                  </h2>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1 flex-wrap">
                    {order.customer?.phone && (
                      <span dir="ltr" className="tabular-nums">
                        {order.customer.phone}
                      </span>
                    )}
                    <span className="text-muted-foreground/50">•</span>
                    <span>{formatDate(order.createdAt)}</span>
                    <span className="text-muted-foreground/50">•</span>
                    <span className="text-[11px]">
                      {order.splitMode === "separated" ? "تفکیک‌شده" : "گروهی"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusDropdown
                  current={status}
                  onChange={(ns) => statusMut.mutate(ns)}
                  disabled={statusMut.isPending}
                />
                {/* فاز 22 (خواستهٔ 6): هدیه دادن — مستر/مالی */}
                {canGift && (
                  <button
                    onClick={() => setGiftOpen(true)}
                    className="text-xs font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1 transition bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 hover:opacity-80"
                    title="بخشیدن بخشی یا تمام مبلغ سفارش — مشتری بدهکار نمی‌شود و زیان در هزینه‌ها دیده می‌شود"
                  >
                    <Icon name="gift" size={12} />
                    {(order.giftAmount ?? 0) > 0 ? "هدیه ثبت شده" : "هدیه"}
                  </button>
                )}
                {order.priority === "urgent" && (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 flex items-center gap-1">
                    <Icon name="alertTriangle" size={11} /> فوری
                  </span>
                )}
              </div>
            </div>

            {/* Quick metrics — Phase 22 (خواستهٔ 3):
                مدیر/مالی: ردیف «هزینه / قیمت داده‌شده / سود / موعد» + کاشی
                کوچک «پرداختی — باقی‌مانده» زیرش. سایر نقش‌ها: چیدمان قبلی. */}
            {cost != null ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <MetricTile
                    icon="coins"
                    label="هزینه سفارش"
                    value={formatCurrency(cost.approved)}
                    hint={
                      cost.pending > 0
                        ? `در انتظار ${formatCurrency(cost.pending)}`
                        : undefined
                    }
                    tone={cost.approved > 0 ? "rose" : undefined}
                  />
                  <MetricTile
                    icon="money"
                    label="قیمت داده‌شده"
                    value={formatCurrency(order.totalAmount)}
                  />
                  <MetricTile
                    icon={profit != null && profit >= 0 ? "trending" : "arrowDown"}
                    label="سود"
                    value={profit != null ? formatCurrency(profit) : "—"}
                    hint="قیمت − هزینه"
                    tone={profit != null && profit < 0 ? "rose" : "emerald"}
                  />
                  <MetricTile
                    icon="clock"
                    label="موعد تحویل"
                    value={
                      order.noEndDate
                        ? "بدون زمان"
                        : order.endDate
                        ? formatDate(order.endDate)
                        : "—"
                    }
                    hint={
                      !order.noEndDate && !closed && dr.status !== "none"
                        ? `${dr.days} روز`
                        : undefined
                    }
                    tone={
                      closed
                        ? undefined
                        : dr.status === "overdue"
                        ? "rose"
                        : dr.status === "remaining"
                        ? "emerald"
                        : "amber"
                    }
                  />
                </div>
                {/* کاشی کوچک: پرداختی — باقی‌مانده (خواستهٔ 3: یک کاشی، جمع‌وجور) */}
                <div className="mt-2 rounded-xl border bg-background/70 backdrop-blur-sm px-3.5 py-2 flex items-center justify-between gap-2 shadow-sm">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="size-5 rounded-md grid place-items-center shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Icon name="checkCircle" size={11} />
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">پرداختی</span>
                    <span className="text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400 truncate" dir="ltr">
                      {formatCurrency(order.paidAmount)}
                    </span>
                  </div>
                  <span className="h-4 w-px bg-border shrink-0" />
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={cn(
                        "size-5 rounded-md grid place-items-center shrink-0",
                        unpaid > 0
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      <Icon name="alert" size={11} />
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">باقی‌مانده</span>
                    <span
                      className={cn(
                        "text-xs font-bold tabular-nums truncate",
                        unpaid > 0
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      )}
                      dir="ltr"
                    >
                      {formatCurrency(unpaid)}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <MetricTile
                  icon="money"
                  label="مبلغ کل"
                  value={formatCurrency(order.totalAmount)}
            />
                <MetricTile
                  icon="checkCircle"
                  label="پرداختی"
                  value={formatCurrency(order.paidAmount)}
                  tone="emerald"
              />
                <MetricTile
                  icon="alert"
                  label="باقی‌مانده"
                  value={formatCurrency(unpaid)}
                  tone={unpaid > 0 ? "rose" : "emerald"}
              />
                <MetricTile
                  icon="clock"
                  label="موعد تحویل"
                  value={
                    order.noEndDate
                      ? "بدون زمان"
                      : order.endDate
                      ? formatDate(order.endDate)
                      : "—"
                  }
                  hint={
                    !order.noEndDate && !closed && dr.status !== "none"
                      ? `${dr.days} روز`
                      : undefined
                  }
                  tone={
                    closed
                      ? undefined
                      : dr.status === "overdue"
                      ? "rose"
                      : dr.status === "remaining"
                      ? "emerald"
                      : "amber"
                  }
                />
              </div>
            )}

            {/* Alert chips — blocking items / overdue tasks */}
            {(blockingItems > 0 || overdueTasks > 0) && (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {blockingItems > 0 && (
                  <button
                    onClick={() => setActiveTab("items")}
                    className="text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 flex items-center gap-1 hover:opacity-80"
                  >
                    <Icon name="alert" size={11} /> {blockingItems} آیتم نیازمند متریال
                  </button>
                )}
                {overdueTasks > 0 && (
                  <button
                    onClick={() => setActiveTab("tasks")}
                    className="text-[11px] px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 flex items-center gap-1 hover:opacity-80"
                  >
                    <Icon name="clock" size={11} /> {overdueTasks} تسک معوق
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Tab nav ── */}
          {/* 20-E — موبایل: چسبان بالای اسکرولِ مودال تمام‌صفحه */}
          <div
            role="tablist"
            aria-label="بخش‌های سفارش"
            className="flex border-b px-4 overflow-x-auto scrollbar-thin bg-muted/20 sticky top-0 z-20 sm:static"
          >
            {TABS.map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`order-tab-${t.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium transition border-b-2 -mb-px whitespace-nowrap rounded-t-lg",
                    isActive
                      ? "border-primary text-primary bg-primary/5"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40"
                  )}
                >
                  <Icon name={t.icon} size={14} />
                  {t.label}
                  {t.id === "items" && order.items?.length > 0 && (
                    <span
                      className={cn(
                        "text-[10px] rounded-full px-1.5 py-0.5 tabular-nums",
                        isActive
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {order.items.length}
                    </span>
                  )}
                  {t.id === "tasks" && tasksCount > 0 && (
                    <span
                      className={cn(
                        "text-[10px] rounded-full px-1.5 py-0.5 tabular-nums",
                        isActive
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {tasksCount}
                    </span>
                  )}
                  {t.id === "preInvoice" && hasPreInvoice && (
                    <span
                      className={cn(
                        "text-[10px] rounded-full px-1.5 py-0.5 tabular-nums",
                        isActive
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {order.preInvoices.length}
                    </span>
                  )}
                  {t.id === "invoice" && order.invoice && (
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Tab body ── */}
          {/* 20-E — موبایل: بدون سقف (اسکرول واحدِ خود مودال)؛ دسکتاپ عین قبل min(62vh,560px) */}
          <div
            id={`order-tab-${activeTab}`}
            role="tabpanel"
            className="overflow-y-auto scrollbar-thin px-6 py-4 max-h-none sm:max-h-[min(62vh,560px)]"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === "overview" && (
                  <OverviewTab
                    order={order}
                    status={status}
                    onAdvance={(ns) => statusMut.mutate(ns)}
                    advancing={statusMut.isPending}
                    note={note}
                    onNoteChange={setNote}
                    onSaveNote={() => noteMut.mutate()}
                    savingNote={noteMut.isPending}
                    onGoTab={setActiveTab}
                  />
                )}
                {activeTab === "items" && <ItemsTab order={order} />}
                {activeTab === "tasks" && <TasksTab order={order} />}
                {activeTab === "costs" && <CostsTab order={order} />}
                {activeTab === "preInvoice" && (
                  <PreInvoiceTab
                    order={order}
                    onIssue={(itemId) => {
                      setPiInitialView("issue");
                      setPiInitialDocId(null);
                      setPiInitialItemId(itemId);
                      setPreInvoiceOpen(true);
                    }}
                    onOpenDoc={(piId) => {
                      setPiInitialView("doc");
                      setPiInitialDocId(piId);
                      setPiInitialItemId(null);
                      setPreInvoiceOpen(true);
                    }}
                  />
                )}
                {activeTab === "invoice" && <InvoiceTab order={order} />}
                {activeTab === "history" && <HistoryTab order={order} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Footer — 20-اِ: safe-area موبایل برای دکمه‌های پایین ── */}
          <div className="px-6 py-3 border-t bg-muted/30 flex items-center gap-2 flex-wrap pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActiveTab("preInvoice")}
              className="gap-1.5"
            >
              <Icon name="receipt" size={14} />
              {hasPreInvoice ? "مدیریت پیش‌فاکتور" : "صدور پیش‌فاکتور"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActiveTab("invoice")}
              className="gap-1.5"
            >
              <Icon name="invoice" size={14} />
              فاکتور نهایی
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 mr-auto"
              onClick={() => {
                onOpenChange(false);
                navigate("admin", "orders-new", order.id);
              }}
            >
              <Icon name="edit" size={14} /> ویرایش کامل
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pre-invoice modal (existing, preserved) */}
      <PreInvoiceModal
        orderId={order.id}
        customerName={order.customer?.name}
        open={preInvoiceOpen}
        onOpenChange={setPreInvoiceOpen}
        initialDocId={piInitialDocId}
        initialView={piInitialView}
        initialItemId={piInitialItemId}
      />

      {/* فاز 22 (خواستهٔ 6): دیالوگ هدیه دادن سفارش — مستر/مالی */}
      <GiftDialog
        order={order}
        open={giftOpen}
        onOpenChange={setGiftOpen}
        onGifted={() => {
          invalidate(["orders", "order", "dashboard", "customers", "open-orders", "finance"]);
        }}
      />
    </>
  );
}

// ─── فاز 22 (خواستهٔ 6): دیالوگ هدیه دادن سفارش ───────────────────
// مبلغ یا درصد هدیه + یادداشت. بدهی مشتری همان لحظه کم می‌شود؛
// هزینه‌ها می‌مانند و «زیان» در سود سفارش و رادار رئیس دیده می‌شود.
function GiftDialog({
  order,
  open,
  onOpenChange,
  onGifted,
}: {
  order: OrderDetail;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onGifted: () => void;
}) {
  const [mode, setMode] = React.useState<"percentage" | "amount">("percentage");
  const [pct, setPct] = React.useState<string>("100");
  const [amount, setAmount] = React.useState<string>("");
  const [note, setNote] = React.useState("");

  // مبنای درصد: مبلغ خام (اقلام + هدیهٔ قبلی) — از روت هم همین منطق
  const itemsSum = (order.items ?? []).reduce((s, it) => s + (it.totalAmount || 0), 0);
  const rawTotal =
    order.invoice && order.invoice.status !== "cancelled"
      ? order.invoice.subtotal
      : itemsSum + (order.giftAmount ?? 0);

  const pctNum = Number(pct) || 0;
  const amountNum = Number(amount) || 0;
  const giftValue =
    mode === "percentage"
      ? Math.round((rawTotal * Math.min(100, Math.max(0, pctNum))) / 100)
      : Math.round(Math.min(Math.max(0, amountNum), rawTotal));
  const newTotal = Math.max(0, rawTotal - giftValue);
  const effectivePct = rawTotal > 0 ? Math.round((giftValue / rawTotal) * 100) : 0;

  const giftMut = useMutation({
    mutationFn: () =>
      api(`/api/orders/${order.id}/gift`, {
        method: "POST",
        body: JSON.stringify(
          mode === "percentage"
            ? { percentage: Math.min(100, Math.max(0, pctNum)), note: note.trim() || undefined }
            : { amount: Math.max(0, amountNum), note: note.trim() || undefined }
        ),
      }),
    onSuccess: () => {
      toast.success(
        `هدیه ثبت شد — ${effectivePct.toLocaleString("en-US")}٪ معادل ${formatCurrency(giftValue)} بخشیده شد`
      );
      onGifted();
      onOpenChange(false);
      setNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-md p-0 gap-0">
        <div className="px-5 pt-5 pb-4 border-b bg-gradient-to-l from-amber-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 grid place-items-center shrink-0">
              <Icon name="gift" size={20} />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">هدیه دادن سفارش #{order.number}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {order.customer?.name} — بخشیدن بخشی یا تمام مبلغ
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* هدیهٔ فعلی */}
          {(order.giftAmount ?? 0) > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-xs">
              هدیهٔ فعلی این سفارش: <b dir="ltr">{formatCurrency(order.giftAmount ?? 0)}</b>{" "}
              ({(order.giftPercentage ?? 0).toLocaleString("en-US")}٪)
              {order.giftedByName ? ` — ثبت‌شده توسط ${order.giftedByName}` : ""}
              . ثبت دوباره، مقدار قبلی را جایگزین می‌کند.
            </div>
          )}

          {/* حالت: درصد / مبلغ */}
          <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1" role="radiogroup" aria-label="نوع هدیه">
            <button
              role="radio"
              aria-checked={mode === "percentage"}
              onClick={() => setMode("percentage")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition",
                mode === "percentage"
                  ? "bg-background text-foreground shadow-sm border"
                  : "text-muted-foreground hover:bg-background/60"
              )}
            >
              به درصد
            </button>
            <button
              role="radio"
              aria-checked={mode === "amount"}
              onClick={() => setMode("amount")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition",
                mode === "amount"
                  ? "bg-background text-foreground shadow-sm border"
                  : "text-muted-foreground hover:bg-background/60"
              )}
            >
              مبلغ ثابت
            </button>
          </div>

          {mode === "percentage" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPct(String(p))}
                    className={cn(
                      "flex-1 rounded-lg border py-2 text-xs font-bold tabular-nums transition",
                      pctNum === p
                        ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"
                        : "hover:bg-muted/50"
                    )}
                  >
                    {p.toLocaleString("en-US")}٪
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  dir="ltr"
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground shrink-0">درصد</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                placeholder="مبلغ هدیه (دینار)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground shrink-0">دینار</span>
            </div>
          )}

          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="یادداشت هدیه (اختیاری) — در سوابق مشتری ثبت می‌شود، مثلاً: مناسبت تولد"
            className="min-h-16 text-xs"
          />

          {/* پیش‌نمایش محاسبه */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">مبلغ خام سفارش</span>
              <span className="font-bold tabular-nums" dir="ltr">{formatCurrency(rawTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">مبلغ هدیه ({effectivePct.toLocaleString("en-US")}٪)</span>
              <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400" dir="ltr">−{formatCurrency(giftValue)}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-1.5">
              <span className="font-medium">مبلغ نهایی سفارش</span>
              <span className="font-bold tabular-nums" dir="ltr">{formatCurrency(newTotal)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed pt-1">
              مشتری به‌خاطر هدیه بدهکار نمی‌شود؛ هزینه‌های واقعی سفارش در
              دیتابیس می‌مانند و «زیان» در سود سفارش و رادار رئیس دیده می‌شود.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-t bg-muted/30 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            انصراف
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            disabled={giftValue <= 0 || giftMut.isPending}
            onClick={() => giftMut.mutate()}
          >
            {giftMut.isPending ? (
              <Icon name="loading" size={14} className="animate-spin" />
            ) : (
              <Icon name="gift" size={14} />
            )}
            ثبت هدیه
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
