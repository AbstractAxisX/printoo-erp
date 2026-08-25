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
import { formatCurrency, formatDate, daysRemaining } from "@/lib/format";
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
  FinanceTab,
  HistoryTab,
} from "./order-detail-tabs";
import { PreInvoiceModal } from "./pre-invoice-modal";

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
  }[];
  preInvoices: {
    id: string;
    number: number;
    totalAmount: number;
    paidAmount: number;
    date?: string;
    items?: string;
  }[];
  invoice: {
    id: string;
    number: number;
    totalAmount: number;
    paidAmount: number;
    date?: string;
  } | null;
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
};

type TabId = "overview" | "items" | "tasks" | "costs" | "finance" | "history";

const TABS: { id: TabId; label: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { id: "overview", label: "نمای کلی", icon: "dashboard" },
  { id: "items", label: "آیتم‌ها", icon: "orders" },
  { id: "tasks", label: "تسک‌ها", icon: "task" },
  { id: "costs", label: "هزینه‌ها", icon: "coins" },
  { id: "finance", label: "مالی", icon: "wallet" },
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
}: {
  order: OrderDetail | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const invalidate = useInvalidate();
  const navigate = useAppStore((s) => s.navigate);

  const [activeTab, setActiveTab] = React.useState<TabId>("overview");
  const [status, setStatus] = React.useState<OrderStatus>("pending_design");
  const [note, setNote] = React.useState("");
  const [preInvoiceOpen, setPreInvoiceOpen] = React.useState(false);

  // Sync local state when order loads/changes
  React.useEffect(() => {
    if (order) {
      setStatus(order.status);
      setNote(order.note || "");
      setActiveTab("overview");
    }
  }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Loading state — skeleton (not spinner) for perceived performance
  if (!order) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl p-0 gap-0">
          <DialogTitle className="sr-only">جزئیات سفارش</DialogTitle>
          <DialogDescription className="sr-only">
            در حال بارگذاری اطلاعات سفارش
          </DialogDescription>
          <ModalSkeleton />
        </DialogContent>
      </Dialog>
    );
  }

  const dr = daysRemaining(order.endDate);
  const s = ORDER_STATUS[order.status] ?? {
    label: "—",
    badge: "bg-muted text-muted-foreground",
  };
  const unpaid = Math.max(0, order.totalAmount - order.paidAmount);
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0 gap-0">
          <DialogTitle className="sr-only">
            سفارش #{order.number} — {order.customer?.name}
          </DialogTitle>
          <DialogDescription className="sr-only">
            جزئیات، آیتم‌ها، تسک‌ها، هزینه‌ها، مالی و تاریخچه سفارش
          </DialogDescription>

          {/* ── Header ── */}
          <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-l from-primary/5 to-transparent">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-12 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                  <span className="font-mono font-bold text-sm">#{order.number}</span>
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold truncate">
                    {order.customer?.name ?? "—"}
                  </h2>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
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
                {order.priority === "urgent" && (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 flex items-center gap-1">
                    <Icon name="alertTriangle" size={11} /> فوری
                  </span>
                )}
              </div>
            </div>

            {/* Quick metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Icon name="money" size={10} /> مبلغ کل
                </div>
                <div
                  className="text-sm font-bold mt-0.5 tabular-nums"
                  dir="ltr"
                >
                  {formatCurrency(order.totalAmount)}
                </div>
              </div>
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Icon name="checkCircle" size={10} /> پرداختی
                </div>
                <div
                  className="text-sm font-bold mt-0.5 text-emerald-600 tabular-nums"
                  dir="ltr"
                >
                  {formatCurrency(order.paidAmount)}
                </div>
              </div>
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Icon name="alert" size={10} /> باقی‌مانده
                </div>
                <div
                  className={cn(
                    "text-sm font-bold mt-0.5 tabular-nums",
                    unpaid > 0 ? "text-rose-600" : "text-emerald-600"
                  )}
                  dir="ltr"
                >
                  {formatCurrency(unpaid)}
                </div>
              </div>
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Icon name="clock" size={10} /> موعد تحویل
                </div>
                <div
                  className={cn(
                    "text-sm font-bold mt-0.5 tabular-nums",
                    dr.status === "overdue"
                      ? "text-rose-600"
                      : dr.status === "remaining"
                      ? "text-emerald-600"
                      : "text-amber-600"
                  )}
                >
                  {order.noEndDate
                    ? "بدون زمان"
                    : order.endDate
                    ? formatDate(order.endDate)
                    : "—"}
                  {!order.noEndDate && dr.status !== "none" && (
                    <span className="text-[10px] font-normal text-muted-foreground mr-1">
                      ({dr.days} روز)
                    </span>
                  )}
                </div>
              </div>
            </div>

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
          <div
            role="tablist"
            aria-label="بخش‌های سفارش"
            className="flex border-b px-3 overflow-x-auto scrollbar-thin"
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
                    "relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition border-b-2 -mb-px whitespace-nowrap",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon name={t.icon} size={14} />
                  {t.label}
                  {t.id === "items" && order.items?.length > 0 && (
                    <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                      {order.items.length}
                    </span>
                  )}
                  {t.id === "tasks" && tasksCount > 0 && (
                    <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                      {tasksCount}
                    </span>
                  )}
                  {t.id === "finance" && hasPreInvoice && (
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Tab body ── */}
          <div
            id={`order-tab-${activeTab}`}
            role="tabpanel"
            className="overflow-y-auto scrollbar-thin px-6 py-4"
            style={{ maxHeight: "42vh" }}
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
                {activeTab === "finance" && (
                  <FinanceTab
                    order={order}
                    onPreInvoice={() => setPreInvoiceOpen(true)}
                  />
                )}
                {activeTab === "history" && <HistoryTab order={order} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Footer ── */}
          <div className="px-6 py-3 border-t bg-muted/30 flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPreInvoiceOpen(true)}
              className="gap-1.5"
            >
              <Icon name="receipt" size={14} />
              {hasPreInvoice ? "ویرایش پیش‌فاکتور" : "صدور پیش‌فاکتور"}
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
      />
    </>
  );
}
