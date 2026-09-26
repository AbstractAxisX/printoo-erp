"use client";

// Printoo24 ERP — Open Orders Kanban (Phase 20, خواستهٔ 4)
//
// نمای کانبان سفارشات باز: 3 ستون = 3 وضعیت جریان کار (در حال طراحی /
// در حال چاپ / انبار و لجستیک). کشیدن کارت بین ستون‌ها وضعیت سفارش را
// با PUT /api/orders/[id]/status عوض می‌کند (همگام‌سازی آیتم‌ها سمت سرور).
//
// الگو عیناً از tasks-page.tsx (الگوی اثبات‌شدهٔ dnd-kit پروژه):
//   DndContext + PointerSensor(distance 6) + useDroppable ستون‌ها +
//   useSortable کارت‌ها + DragOverlay + آپدیت خوش‌بینانهٔ محلی
//   (statusOverride) + rollback روی خطا (پیام فارسی سرور → toast).
//
// کارت: کلیک ساده (بدون درگ) → مودال جزئیات سفارش (onOpenOrder).

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon } from "@/lib/icons";
import { ORDER_STATUS, type OrderStatus } from "@/lib/constants";
import { formatCurrency, formatDate, daysRemaining } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getStageDeadline, type OpenOrder } from "./open-orders-helpers";
import { t } from "@/lib/i18n";

// ─── ستون‌های کانبان = وضعیت‌های سفارش (برچسب از ORDER_STATUS) ────
const KANBAN_COLUMNS: {
  key: OrderStatus;
  dot: string;
  ring: string;
  hover: string;
  emptyHint: string;
}[] = [
  {
    key: "pending_design",
    dot: "bg-violet-500",
    ring: "ring-violet-400/60",
    hover: "hover:border-violet-300",
    emptyHint: t("سفارشی در طراحی نیست"),
  },
  {
    key: "in_printing",
    dot: "bg-amber-500",
    ring: "ring-amber-400/60",
    hover: "hover:border-amber-300",
    emptyHint: t("سفارشی در چاپ نیست"),
  },
  {
    key: "warehouse_logistics",
    dot: "bg-cyan-500",
    ring: "ring-cyan-400/60",
    hover: "hover:border-cyan-300",
    emptyHint: t("سفارشی در انبار نیست"),
  },
];

// ─── Board ────────────────────────────────────────────────────
export function OpenOrdersKanban({
  orders,
  onOpenOrder,
}: {
  orders: OpenOrder[];
  onOpenOrder: (id: string) => void;
}) {
  const invalidate = useInvalidate();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  // آپدیت خوش‌بینانهٔ محلی وضعیت — تا رسیدن پاسخ سرور کارت فوری جابجا می‌شود.
  const [statusOverride, setStatusOverride] = React.useState<
    Record<string, string>
  >({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const serverOrders = orders;

  // بعد از رفرش (30ثانیه‌ای / invalidate) اگر سرور هم‌راز override شد، پاکش کن.
  React.useEffect(() => {
    if (Object.keys(statusOverride).length === 0) return;
    setStatusOverride((prev) => {
      const next: Record<string, string> = {};
      for (const [id, status] of Object.entries(prev)) {
        const o = serverOrders.find((x) => x.id === id);
        if (!o || o.status !== status) next[id] = status;
      }
      return next;
    });
  }, [serverOrders, statusOverride]);

  const boardOrders = React.useMemo(
    () =>
      serverOrders.map((o) =>
        statusOverride[o.id] ? { ...o, status: statusOverride[o.id] } : o
      ),
    [serverOrders, statusOverride]
  );

  const activeOrder = activeId
    ? boardOrders.find((o) => o.id === activeId) ?? null
    : null;

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      api(`/api/orders/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      }),
  });

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // ستون مقصد: خودِ ستون یا کارتی که رویش رها شد
    let dest: OrderStatus | null = null;
    if (KANBAN_COLUMNS.some((c) => c.key === overIdStr)) {
      dest = overIdStr as OrderStatus;
    } else {
      const overOrder = boardOrders.find((o) => o.id === overIdStr);
      dest = (overOrder?.status as OrderStatus) ?? null;
    }

    const order = boardOrders.find((o) => o.id === activeIdStr);
    if (!order || !dest) return;
    if (order.status === dest) return; // همان ستون — کاری نکن

    const label = ORDER_STATUS[dest].label;
    const orderNumber = order.number;

    // خوش‌بینانه: کارت همین حالا به ستون جدید می‌رود
    setStatusOverride((prev) => ({ ...prev, [activeIdStr]: dest }));

    statusMut.mutate(
      { id: activeIdStr, status: dest },
      {
        onSuccess: () => {
          invalidate(["open-orders", "orders"]);
          toast.success(t("سفارش #{p0} به «{p1}» منتقل شد", { p0: orderNumber, p1: label }));
        },
        onError: (err: Error) => {
          // rollback + پیام فارسی سرور (مثل گاردهای 400/404/409 وضعیت)
          setStatusOverride((prev) => {
            const next = { ...prev };
            delete next[activeIdStr];
            return next;
          });
          toast.error(err.message);
          invalidate(["open-orders"]);
        },
      }
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {/* برد اسکرول افقی — موبایل (390px): ستون‌ها min-w-[300px] و جابجا */}

      <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.key}
            col={col}
            orders={boardOrders.filter((o) => o.status === col.key)}
            onOpenOrder={onOpenOrder}
          />
        ))}
      </div>

      <DragOverlay
        dropAnimation={{
          duration: 180,
          easing: "cubic-bezier(0.18,0.67,0.6,1.22)",
        }}
      >
        {activeOrder ? <KanbanCardOverlay order={activeOrder} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Column (droppable) ───────────────────────────────────────
function KanbanColumn({
  col,
  orders,
  onOpenOrder,
}: {
  col: (typeof KANBAN_COLUMNS)[number];
  orders: OpenOrder[];
  onOpenOrder: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  const total = orders.reduce((s, o) => s + (o.totalAmount ?? 0), 0);
  return (
    <div className="flex flex-col min-w-[300px] flex-1">
      <div className="flex items-center justify-between gap-2 px-1 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("size-2.5 rounded-full shrink-0", col.dot)} />
          <span className="font-semibold text-sm truncate">
            {ORDER_STATUS[col.key].label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="text-[11px] text-muted-foreground tabular-nums"
            dir="ltr"
          >
            {formatCurrency(total)}
          </span>
          <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5 tabular-nums">
            {orders.length}
          </span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 rounded-xl border bg-muted/30 p-2 space-y-2 transition-colors",
          "max-h-[70vh] overflow-y-auto scrollbar-thin",
          col.hover,
          isOver && cn("ring-2 bg-background/60", col.ring)
        )}
      >
        <SortableContext
          items={orders.map((o) => o.id)}
          strategy={verticalListSortingStrategy}
        >
          {orders.map((o) => (
            <KanbanCard key={o.id} order={o} onOpen={onOpenOrder} />
          ))}
        </SortableContext>
        {orders.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-10 select-none">
            {col.emptyHint}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sortable order card ──────────────────────────────────────
function KanbanCard({
  order,
  onOpen,
}: {
  order: OpenOrder;
  onOpen: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: order.id });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const items = order.items ?? [];
  const isUrgent = order.priority === "urgent";
  // موعد مرحلهٔ فعلی خود سفارش (طراحی/چاپ/انبار — همان منطق جدول)
  const deadline = getStageDeadline(order, "all");
  const dr = daysRemaining(deadline);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(order.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(order.id);
        }
      }}
      title={t("کشیدن = تغییر وضعیت · کلیک = جزئیات سفارش")}
      className={cn(
        "group rounded-xl border bg-card p-3 cursor-grab active:cursor-grabbing select-none",
        "hover:shadow-md hover:-translate-y-0.5 transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        isUrgent && "border-s-rose-500 border-s-4",
        isDragging && "opacity-40"
      )}
    >
      {/* سربرگ: شماره + فوری | مبلغ */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-xs font-bold">#{order.number}</span>
          {isUrgent && (
            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 shrink-0">
              <Icon name="alertTriangle" size={9} /> {t("فوری")}
            </span>
          )}
        </div>
        <span
          className="text-xs font-semibold tabular-nums text-muted-foreground shrink-0"
          dir="ltr"
        >
          {formatCurrency(order.totalAmount)}
        </span>
      </div>

      {/* مشتری */}
      <div className="text-sm font-medium mt-1.5 truncate">
        {order.customer?.name ?? "—"}
      </div>

      {/* آیتم‌ها (حداکثر 2 + +N) */}
      <div className="flex flex-wrap gap-1 mt-1.5">
        {items.slice(0, 2).map((it) => (
          <span
            key={it.id}
            className="text-[11px] bg-muted rounded px-1.5 py-0.5 truncate max-w-[120px]"
          >
            {it.product?.name ?? "—"}
          </span>
        ))}
        {items.length > 2 && (
          <span className="text-[11px] text-muted-foreground tabular-nums self-center">
            +{items.length - 2}
          </span>
        )}
      </div>

      {/* موعد مرحله — رنگ بر اساس فوریت */}
      {deadline && (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[11px] mt-2 rounded-full px-2 py-0.5",
            dr.status === "overdue" &&
              "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-medium",
            dr.status === "today" &&
              "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-medium",
            dr.status === "remaining" && "bg-muted text-muted-foreground",
            dr.status === "none" && "bg-muted text-muted-foreground"
          )}
        >
          <Icon
            name={dr.status === "overdue" ? "alertTriangle" : "clock"}
            size={11}
          />
          <span className="tabular-nums">{formatDate(deadline)}</span>
          <span className="opacity-70">· {dr.text}</span>
        </span>
      )}
    </div>
  );
}

// ─── Drag overlay (preview) ───────────────────────────────────
function KanbanCardOverlay({ order }: { order: OpenOrder }) {
  const isUrgent = order.priority === "urgent";
  return (
    <div
      className={cn(
        "w-72 rounded-xl border border-s-4 bg-card p-3 shadow-xl rotate-2",
        isUrgent ? "border-s-rose-500" : "border-s-transparent"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-bold">#{order.number}</span>
        <span
          className="text-xs font-semibold tabular-nums text-muted-foreground"
          dir="ltr"
        >
          {formatCurrency(order.totalAmount)}
        </span>
      </div>
      <div className="text-sm font-medium mt-1.5 truncate">
        {order.customer?.name ?? "—"}
      </div>
    </div>
  );
}
