"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import {
  PageHeader,
  LoadingState,
  EmptyState,
  StatusBadge,
  PriorityBadge,
} from "@/components/shared";
import {
  OrderDetailModal,
  type OrderDetail,
} from "@/components/shared/order-detail-modal";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleButton } from "@/components/ui/toggle-button";
import { formatCurrency, formatDate } from "@/lib/format";
import { MODULES, type OrderStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  format,
} from "date-fns";

// ─── Types ────────────────────────────────────────────────────────
type OrderItem = {
  id: string;
  designStartDate: string | null;
  designEndDate: string | null;
  printStartDate: string | null;
  printEndDate: string | null;
};

type Order = {
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
  createdAt: string;
  customer: { id: string; name: string; phone: string };
  items: OrderItem[];
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  module: string;
  createdAt: string;
};

type DayNote = {
  id: string;
  date: string; // yyyy-MM-dd
  content: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};

type CalEvent = {
  id: string;
  type: "order" | "task";
  refId: string;
  label: string;
  sublabel?: string;
  chipClass: string;
  date: Date;
  order?: Order;
  task?: Task;
  eventType?: "delivery" | "design" | "print";
};

// ─── Constants ────────────────────────────────────────────────────
const WEEK_DAYS = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
];

const NOTE_COLORS = [
  { key: "default", label: "پیش‌فرض", dot: "bg-slate-400", ring: "ring-slate-400" },
  { key: "rose", label: "قرمز", dot: "bg-rose-500", ring: "ring-rose-500" },
  { key: "amber", label: "نارنجی", dot: "bg-amber-500", ring: "ring-amber-500" },
  { key: "emerald", label: "سبز", dot: "bg-emerald-500", ring: "ring-emerald-500" },
  { key: "blue", label: "آبی", dot: "bg-blue-500", ring: "ring-blue-500" },
];

// ─── Helpers ──────────────────────────────────────────────────────
function toYMD(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function maxDate(dates: (Date | null)[]): Date | null {
  const valid = dates.filter(Boolean) as Date[];
  if (!valid.length) return null;
  return new Date(Math.max(...valid.map((d) => d.getTime())));
}

function getOrderDates(order: Order): {
  delivery: Date | null;
  design: Date | null;
  print: Date | null;
} {
  const items = order.items ?? [];
  const design = maxDate(
    items.map((i) => (i.designEndDate ? new Date(i.designEndDate) : null))
  );
  const print = maxDate(
    items.map((i) => (i.printEndDate ? new Date(i.printEndDate) : null))
  );
  const delivery = order.endDate ? new Date(order.endDate) : null;
  return { delivery, design, print };
}

function orderEventChipClass(
  order: Order,
  eventType: "delivery" | "design" | "print"
): string {
  // Urgent orders always render rose chips regardless of event type
  if (order.priority === "urgent") {
    return "bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 border-rose-500/20 dark:text-rose-300";
  }
  if (eventType === "design") {
    return "bg-violet-500/15 text-violet-700 hover:bg-violet-500/25 border-violet-500/20 dark:text-violet-300";
  }
  if (eventType === "print") {
    return "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 border-amber-500/20 dark:text-amber-300";
  }
  const map: Record<string, string> = {
    pending_design:
      "bg-violet-500/15 text-violet-700 hover:bg-violet-500/25 border-violet-500/20 dark:text-violet-300",
    in_printing:
      "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 border-amber-500/20 dark:text-amber-300",
    warehouse_logistics:
      "bg-cyan-500/15 text-cyan-700 hover:bg-cyan-500/25 border-cyan-500/20 dark:text-cyan-300",
    completed:
      "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-500/20 dark:text-emerald-300",
    archived:
      "bg-slate-500/15 text-slate-600 hover:bg-slate-500/25 border-slate-500/20 dark:text-slate-300",
    cancelled:
      "bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 border-rose-500/20 dark:text-rose-300",
  };
  return map[order.status] ?? map.pending_design;
}

const TASK_CHIP_CLASS =
  "bg-blue-500/15 text-blue-700 hover:bg-blue-500/25 border-blue-500/20 dark:text-blue-300";

function weekdayLabel(date: Date): string {
  // JS getDay(): 0=Sun ... 6=Sat. Persian week starts Saturday.
  return WEEK_DAYS[(date.getDay() + 1) % 7];
}

// ─── Component ────────────────────────────────────────────────────
export function CalendarPage() {
  const invalidate = useInvalidate();

  const [cursor, setCursor] = React.useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null);
  const [panelCollapsed, setPanelCollapsed] = React.useState(false);

  // Filter toggles
  const [showOrders, setShowOrders] = React.useState(true);
  const [showTasks, setShowTasks] = React.useState(true);
  const [urgentOnly, setUrgentOnly] = React.useState(false);

  // Order detail modal
  const [activeOrder, setActiveOrder] = React.useState<OrderDetail | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [loadingOrderId, setLoadingOrderId] = React.useState<string | null>(null);

  // Day note editor
  const [noteText, setNoteText] = React.useState("");
  const [noteColor, setNoteColor] = React.useState("default");

  // ─── Queries (real-time, 30s) ───────────────────────────────────
  const ordersQuery = useQuery({
    queryKey: ["orders-cal"],
    queryFn: () => api<{ orders: Order[] }>("/api/orders"),
    refetchInterval: 30000,
  });

  const tasksQuery = useQuery({
    queryKey: ["tasks-cal"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks"),
    refetchInterval: 30000,
  });

  const notesQuery = useQuery({
    queryKey: ["day-notes"],
    queryFn: () => api<{ notes: DayNote[] }>("/api/day-notes"),
    refetchInterval: 30000,
  });

  const allOrders = ordersQuery.data?.orders ?? [];
  const allTasks = tasksQuery.data?.tasks ?? [];
  const allNotes = notesQuery.data?.notes ?? [];

  // ─── Build flat event list ──────────────────────────────────────
  const events = React.useMemo<CalEvent[]>(() => {
    const list: CalEvent[] = [];

    if (showOrders) {
      for (const order of allOrders) {
        if (urgentOnly && order.priority !== "urgent") continue;
        const { delivery, design, print } = getOrderDates(order);
        if (delivery) {
          list.push({
            id: `${order.id}-delivery`,
            type: "order",
            refId: order.id,
            label: `#${order.number} تحویل`,
            sublabel: order.customer.name,
            chipClass: orderEventChipClass(order, "delivery"),
            date: delivery,
            order,
            eventType: "delivery",
          });
        }
        if (design) {
          list.push({
            id: `${order.id}-design`,
            type: "order",
            refId: order.id,
            label: `#${order.number} طراحی`,
            sublabel: order.customer.name,
            chipClass: orderEventChipClass(order, "design"),
            date: design,
            order,
            eventType: "design",
          });
        }
        if (print) {
          list.push({
            id: `${order.id}-print`,
            type: "order",
            refId: order.id,
            label: `#${order.number} چاپ`,
            sublabel: order.customer.name,
            chipClass: orderEventChipClass(order, "print"),
            date: print,
            order,
            eventType: "print",
          });
        }
      }
    }

    if (showTasks) {
      for (const task of allTasks) {
        if (!task.dueDate) continue;
        list.push({
          id: task.id,
          type: "task",
          refId: task.id,
          label: task.title,
          sublabel:
            MODULES[task.module as keyof typeof MODULES]?.faLabel ?? task.module,
          chipClass: TASK_CHIP_CLASS,
          date: new Date(task.dueDate),
          task,
        });
      }
    }

    return list;
  }, [allOrders, allTasks, showOrders, showTasks, urgentOnly]);

  // ─── Index events by date ───────────────────────────────────────
  const eventsByDay = React.useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const ev of events) {
      const key = toYMD(ev.date);
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.type !== b.type) return a.type === "order" ? -1 : 1;
        if (a.eventType && b.eventType && a.eventType !== b.eventType) {
          const order = { delivery: 0, design: 1, print: 2 };
          return order[a.eventType] - order[b.eventType];
        }
        return a.label.localeCompare(b.label, "fa");
      });
    }
    return map;
  }, [events]);

  // ─── Notes index by date ────────────────────────────────────────
  const notesByDate = React.useMemo(() => {
    const map = new Map<string, DayNote>();
    for (const n of allNotes) map.set(n.date, n);
    return map;
  }, [allNotes]);

  // ─── Calendar grid ──────────────────────────────────────────────
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 6 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 6 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const today = new Date();
  const monthEventsCount = events.filter((e) => isSameMonth(e.date, cursor)).length;

  // ─── Selected day derived data ──────────────────────────────────
  const selectedDayNote = selectedDay
    ? notesByDate.get(toYMD(selectedDay)) ?? null
    : null;

  React.useEffect(() => {
    setNoteText(selectedDayNote?.content ?? "");
    setNoteColor(selectedDayNote?.color ?? "default");
  }, [selectedDayNote]);

  const selectedDayEvents = selectedDay
    ? eventsByDay.get(toYMD(selectedDay)) ?? []
    : [];
  const selectedDayDeliveryOrders = selectedDayEvents
    .filter((e) => e.type === "order" && e.eventType === "delivery")
    .map((e) => e.order!)
    .filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i); // dedupe
  const selectedDayDesignOrders = selectedDayEvents
    .filter((e) => e.type === "order" && e.eventType === "design")
    .map((e) => e.order!)
    .filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i);
  const selectedDayPrintOrders = selectedDayEvents
    .filter((e) => e.type === "order" && e.eventType === "print")
    .map((e) => e.order!)
    .filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i);
  const selectedDayTasks = selectedDayEvents
    .filter((e) => e.type === "task")
    .map((e) => e.task!);

  // Combine all order events for the panel (unique orders)
  const allSelectedDayOrders = React.useMemo(() => {
    const map = new Map<string, Order>();
    for (const ev of selectedDayEvents) {
      if (ev.type === "order" && ev.order) map.set(ev.order.id, ev.order);
    }
    return Array.from(map.values());
  }, [selectedDayEvents]);

  // ─── Note mutations ─────────────────────────────────────────────
  const noteMut = useMutation({
    mutationFn: (body: { date: string; content: string; color: string }) =>
      api<{ note: DayNote }>("/api/day-notes", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidate(["day-notes"]);
      toast.success("یادداشت ذخیره شد");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const noteDeleteMut = useMutation({
    mutationFn: (date: string) =>
      api(`/api/day-notes/${date}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["day-notes"]);
      toast.success("یادداشت حذف شد");
      setNoteText("");
      setNoteColor("default");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ─── Open order detail modal ────────────────────────────────────
  const openOrderDetail = React.useCallback(async (orderId: string) => {
    setLoadingOrderId(orderId);
    try {
      const { order } = await api<{ order: OrderDetail }>(`/api/orders/${orderId}`);
      setActiveOrder(order);
      setModalOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingOrderId(null);
    }
  }, []);

  const handleSaveNote = () => {
    if (!selectedDay) return;
    noteMut.mutate({
      date: toYMD(selectedDay),
      content: noteText,
      color: noteColor,
    });
  };

  const handleDeleteNote = () => {
    if (!selectedDay) return;
    noteDeleteMut.mutate(toYMD(selectedDay));
  };

  const isLoading = ordersQuery.isLoading || tasksQuery.isLoading;

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <PageHeader
        title="تقویم کاری"
        description="نمای کامل سفارشات، تسک‌ها و یادداشت‌ها در یک تقویم حرفه‌ای"
        icon="calendar"
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCursor(subMonths(cursor, 1))}
              aria-label="ماه قبل"
            >
              <Icon name="chevronRight" size={16} />
            </Button>
            <Button variant="outline" onClick={() => setCursor(new Date())}>
              امروز
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCursor(addMonths(cursor, 1))}
              aria-label="ماه بعد"
            >
              <Icon name="chevronLeft" size={16} />
            </Button>
          </div>
        }
      />

      {/* Filter toolbar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Icon name="filter" size={15} /> فیلترها
          </div>
          <ToggleButton
            checked={showOrders}
            onChange={setShowOrders}
            label="سفارشات"
            size="sm"
            activeColor="primary"
          />
          <ToggleButton
            checked={showTasks}
            onChange={setShowTasks}
            label="تسک‌ها"
            size="sm"
            activeColor="primary"
          />
          <ToggleButton
            checked={urgentOnly}
            onChange={setUrgentOnly}
            label="فقط سفارشات فوری"
            size="sm"
            activeColor="amber"
            activeIcon="alert"
          />

          <div className="mr-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-violet-500" /> طراحی
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-amber-500" /> چاپ
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-emerald-500" /> تحویل
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-blue-500" /> تسک
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-rose-500" /> فوری
            </span>
          </div>
        </div>
      </Card>

      {/* Calendar grid */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="font-semibold text-lg" dir="auto">
            {format(cursor, "MMMM yyyy")}
          </h3>
          <span className="text-xs text-muted-foreground">
            {monthEventsCount} رویداد در این ماه
          </span>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {WEEK_DAYS.map((d) => (
            <div
              key={d}
              className="text-center text-xs font-semibold text-muted-foreground py-2 border-b"
            >
              {d}
            </div>
          ))}
        </div>

        {isLoading ? (
          <LoadingState />
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((day) => {
              const inMonth = isSameMonth(day, cursor);
              const isToday = isSameDay(day, today);
              const dayKey = toYMD(day);
              const dayEvents = eventsByDay.get(dayKey) ?? [];
              const note = notesByDate.get(dayKey);
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => {
                    setSelectedDay(day);
                    setPanelCollapsed(false);
                  }}
                  className={cn(
                    "min-h-[110px] rounded-lg border p-1.5 text-right transition-all flex flex-col gap-1 hover:shadow-sm hover:border-foreground/20",
                    !inMonth && "opacity-50 bg-muted/30",
                    isToday && "ring-2 ring-primary border-primary",
                    isSelected && !isToday && "ring-2 ring-primary/50 bg-primary/5",
                    !isToday && !isSelected && "bg-card"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "text-xs font-medium tabular-nums",
                        isToday &&
                          "inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground",
                        !isToday && inMonth && "text-foreground",
                        !inMonth && "text-muted-foreground"
                      )}
                      dir="ltr"
                    >
                      {format(day, "d")}
                    </span>
                    {note && (
                      <Icon
                        name="bookmark"
                        size={12}
                        className={cn(
                          "shrink-0",
                          note.color === "rose" && "text-rose-500",
                          note.color === "amber" && "text-amber-500",
                          note.color === "emerald" && "text-emerald-500",
                          note.color === "blue" && "text-blue-500",
                          (note.color === "default" || !note.color) &&
                            "text-muted-foreground"
                        )}
                      />
                    )}
                  </div>

                  {/* Event chips */}
                  <div className="space-y-0.5 flex-1 overflow-hidden">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (ev.type === "order" && ev.order) {
                            openOrderDetail(ev.order.id);
                          } else {
                            setSelectedDay(day);
                            setPanelCollapsed(false);
                          }
                        }}
                        className={cn(
                          "block w-full text-[10px] leading-tight rounded px-1 py-0.5 truncate border transition cursor-pointer",
                          ev.chipClass
                        )}
                        title={`${ev.label}${ev.sublabel ? " — " + ev.sublabel : ""}`}
                      >
                        {ev.label}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1 py-0.5">
                        +{dayEvents.length - 3} مورد دیگر
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Bottom panel (collapsible) */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div
            key="calendar-day-panel"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="p-0 overflow-hidden">
              {/* Panel header */}
              <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b bg-muted/30">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                    <Icon name="calendar" size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">
                      {weekdayLabel(selectedDay)} — {formatDate(selectedDay)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {allSelectedDayOrders.length} سفارش ·{" "}
                      {selectedDayTasks.length} تسک
                      {selectedDayNote ? " · یادداشت دارد" : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPanelCollapsed((c) => !c)}
                    aria-label={panelCollapsed ? "باز کردن پنل" : "جمع کردن پنل"}
                  >
                    <Icon
                      name={panelCollapsed ? "chevronDown" : "chevronUp"}
                      size={16}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedDay(null)}
                    aria-label="بستن پنل"
                  >
                    <Icon name="cancel" size={16} />
                  </Button>
                </div>
              </div>

              {/* Panel body */}
              {!panelCollapsed && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
                  {/* Orders section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Icon name="orders" size={15} className="text-primary" />
                      سفارشات
                      <span className="text-xs text-muted-foreground font-normal">
                        ({allSelectedDayOrders.length})
                      </span>
                    </div>

                    {/* Sub-group: delivery */}
                    {selectedDayDeliveryOrders.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          تحویل ({selectedDayDeliveryOrders.length})
                        </div>
                        {selectedDayDeliveryOrders.map((o) => (
                          <OrderRow
                            key={`d-${o.id}`}
                            order={o}
                            loading={loadingOrderId === o.id}
                            onClick={() => openOrderDetail(o.id)}
                          />
                        ))}
                      </div>
                    )}

                    {/* Sub-group: design */}
                    {selectedDayDesignOrders.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                          <span className="size-1.5 rounded-full bg-violet-500" />
                          موعد طراحی ({selectedDayDesignOrders.length})
                        </div>
                        {selectedDayDesignOrders.map((o) => (
                          <OrderRow
                            key={`de-${o.id}`}
                            order={o}
                            loading={loadingOrderId === o.id}
                            onClick={() => openOrderDetail(o.id)}
                          />
                        ))}
                      </div>
                    )}

                    {/* Sub-group: print */}
                    {selectedDayPrintOrders.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                          <span className="size-1.5 rounded-full bg-amber-500" />
                          موعد چاپ ({selectedDayPrintOrders.length})
                        </div>
                        {selectedDayPrintOrders.map((o) => (
                          <OrderRow
                            key={`p-${o.id}`}
                            order={o}
                            loading={loadingOrderId === o.id}
                            onClick={() => openOrderDetail(o.id)}
                          />
                        ))}
                      </div>
                    )}

                    {allSelectedDayOrders.length === 0 && (
                      <div className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-lg">
                        سفارشی برای این روز ثبت نشده
                      </div>
                    )}
                  </div>

                  {/* Tasks section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Icon name="task" size={15} className="text-blue-500" />
                      تسک‌ها
                      <span className="text-xs text-muted-foreground font-normal">
                        ({selectedDayTasks.length})
                      </span>
                    </div>
                    {selectedDayTasks.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-lg">
                        تسکی برای این روز ثبت نشده
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin pr-1">
                        {selectedDayTasks.map((t) => (
                          <div
                            key={t.id}
                            className="rounded-lg border bg-card p-2.5 hover:shadow-sm transition"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-medium text-sm">{t.title}</span>
                              <PriorityBadge priority={t.priority} />
                            </div>
                            {t.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {t.description}
                              </p>
                            )}
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                                <Icon name="grid" size={10} />
                                {MODULES[t.module as keyof typeof MODULES]?.faLabel ??
                                  t.module}
                              </span>
                              {t.status === "done" && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 px-1.5 py-0.5 text-[10px]">
                                  <Icon name="check" size={10} /> انجام شده
                                </span>
                              )}
                              {t.status === "in_progress" && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 px-1.5 py-0.5 text-[10px]">
                                  <Icon name="loading" size={10} /> در حال انجام
                                </span>
                              )}
                              {t.status === "todo" && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 px-1.5 py-0.5 text-[10px]">
                                  در صف
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Day note section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Icon name="bookmark" size={15} className="text-amber-500" />
                      یادداشت روز
                    </div>
                    <Textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      rows={4}
                      placeholder="یادداشتی برای این روز بنویسید..."
                      className="resize-none text-sm"
                    />
                    {/* Color picker */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">رنگ:</span>
                      <div className="flex items-center gap-1.5">
                        {NOTE_COLORS.map((c) => (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => setNoteColor(c.key)}
                            className={cn(
                              "size-6 rounded-full transition-all",
                              c.dot,
                              noteColor === c.key
                                ? cn(
                                    "ring-2 ring-offset-2 ring-offset-background scale-110",
                                    c.ring
                                  )
                                : "opacity-70 hover:opacity-100"
                            )}
                            aria-label={c.label}
                            title={c.label}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        onClick={handleSaveNote}
                        disabled={noteMut.isPending}
                        className="gap-1.5"
                      >
                        {noteMut.isPending ? (
                          <Icon name="loading" size={14} className="animate-spin" />
                        ) : (
                          <Icon name="check" size={14} />
                        )}
                        ذخیره یادداشت
                      </Button>
                      {selectedDayNote && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleDeleteNote}
                          disabled={noteDeleteMut.isPending}
                          className="gap-1.5 text-rose-600 hover:text-rose-700"
                        >
                          {noteDeleteMut.isPending ? (
                            <Icon name="loading" size={14} className="animate-spin" />
                          ) : (
                            <Icon name="trash" size={14} />
                          )}
                          حذف
                        </Button>
                      )}
                    </div>
                    {selectedDayNote && (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Icon name="clock" size={11} />
                        آخرین به‌روزرسانی: {formatDate(selectedDayNote.updatedAt, true)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Order detail modal */}
      <OrderDetailModal
        order={activeOrder}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />

      {/* Empty state when there are literally no events */}
      {!isLoading &&
        events.length === 0 &&
        allNotes.length === 0 && (
          <Card className="p-0">
            <EmptyState
              icon="calendarCheck"
              title="هیچ رویدادی وجود ندارد"
              description="با ثبت سفارش یا تسک، رویدادهای تقویم اینجا نمایش داده می‌شوند."
            />
          </Card>
        )}
    </div>
  );
}

// ─── Order row inside the day panel ───────────────────────────────
function OrderRow({
  order,
  loading,
  onClick,
}: {
  order: Order;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full text-right rounded-lg border p-2.5 hover:bg-accent/40 transition flex items-center gap-2.5 disabled:opacity-60"
    >
      <div
        className="size-9 rounded-md bg-primary/10 text-primary grid place-items-center font-bold text-xs shrink-0"
        dir="ltr"
      >
        #{order.number}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{order.customer.name}</div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <StatusBadge status={order.status} />
          {order.priority === "urgent" && (
            <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              <Icon name="alertTriangle" size={10} /> فوری
            </span>
          )}
        </div>
      </div>
      <div
        className="text-xs font-semibold tabular-nums shrink-0"
        dir="ltr"
      >
        {formatCurrency(order.totalAmount)}
      </div>
      {loading && (
        <Icon
          name="loading"
          size={14}
          className="animate-spin text-muted-foreground shrink-0"
        />
      )}
    </button>
  );
}
