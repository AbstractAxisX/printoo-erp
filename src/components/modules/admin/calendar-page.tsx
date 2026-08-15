"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { useOrderDetail } from "@/lib/use-order-detail";
import {
  PageHeader,
  LoadingState,
  EmptyState,
  StatusBadge,
  PriorityBadge,
} from "@/components/shared";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleButton } from "@/components/ui/toggle-button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatCurrency, formatDate } from "@/lib/format";
import { MODULES, type OrderStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { faIR } from "date-fns/locale";
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
  addDays,
  subDays,
  differenceInCalendarDays,
  startOfDay,
  min as dateMin,
  max as dateMax,
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

type CalEventType = "delivery" | "design" | "print" | "task";
type CalColorKey = "delivery" | "design" | "print" | "task" | "urgent";

type RangeEvent = {
  id: string;
  kind: "order" | "task";
  eventType: CalEventType;
  refId: string;
  label: string;
  sublabel: string;
  start: Date;
  end: Date;
  colorKey: CalColorKey;
  order?: Order;
  task?: Task;
};

type GanttColorKey =
  | "design"
  | "print"
  | "warehouse"
  | "completed"
  | "urgent"
  | "task";

type GanttRow = {
  id: string;
  kind: "order" | "task";
  refId: string;
  label: string;
  sublabel: string;
  start: Date;
  end: Date;
  colorKey: GanttColorKey;
  order?: Order;
  task?: Task;
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

// Soft bar colors for the calendar
const CAL_BAR_COLORS: Record<CalColorKey, { bar: string; dot: string; label: string }> = {
  delivery: {
    bar: "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600/40",
    dot: "bg-emerald-500",
    label: "تحویل",
  },
  design: {
    bar: "bg-violet-500 hover:bg-violet-600 text-white border-violet-600/40",
    dot: "bg-violet-500",
    label: "طراحی",
  },
  print: {
    bar: "bg-amber-500 hover:bg-amber-600 text-white border-amber-600/40",
    dot: "bg-amber-500",
    label: "چاپ",
  },
  task: {
    bar: "bg-blue-500 hover:bg-blue-600 text-white border-blue-600/40",
    dot: "bg-blue-500",
    label: "تسک",
  },
  urgent: {
    bar: "bg-rose-500 hover:bg-rose-600 text-white border-rose-600/40",
    dot: "bg-rose-500",
    label: "فوری",
  },
};

// Solid pill colors for the Gantt
const GANTT_BAR_COLORS: Record<GanttColorKey, { bar: string; dot: string; label: string }> = {
  design: {
    bar: "bg-violet-500 hover:bg-violet-600 text-white",
    dot: "bg-violet-500",
    label: "طراحی",
  },
  print: {
    bar: "bg-amber-500 hover:bg-amber-600 text-white",
    dot: "bg-amber-500",
    label: "چاپ",
  },
  warehouse: {
    bar: "bg-cyan-500 hover:bg-cyan-600 text-white",
    dot: "bg-cyan-500",
    label: "انبار",
  },
  completed: {
    bar: "bg-emerald-500 hover:bg-emerald-600 text-white",
    dot: "bg-emerald-500",
    label: "تکمیل",
  },
  urgent: {
    bar: "bg-rose-500 hover:bg-rose-600 text-white",
    dot: "bg-rose-500",
    label: "فوری",
  },
  task: {
    bar: "bg-blue-500 hover:bg-blue-600 text-white",
    dot: "bg-blue-500",
    label: "تسک",
  },
};

const OPEN_STATUSES: OrderStatus[] = [
  "pending_design",
  "in_printing",
  "warehouse_logistics",
];

// Layout constants for the calendar week rows
const CAL_HEADER_H = 30; // px reserved for date number + bookmark
const CAL_LANE_H = 24; // px per lane
const CAL_MAX_LANES = 4; // visible lanes per week
const CAL_WEEK_H = CAL_HEADER_H + CAL_MAX_LANES * CAL_LANE_H + 8; // ~134px

// ─── Date helpers ─────────────────────────────────────────────────
function toYMD(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function weekdayLabel(date: Date): string {
  // JS getDay(): 0=Sun ... 6=Sat. Persian week starts Saturday.
  return WEEK_DAYS[(date.getDay() + 1) % 7];
}

function safeStartOfDay(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return null;
  return startOfDay(date);
}

function monthLabel(d: Date): string {
  const monthName = format(d, "MMMM", { locale: faIR });
  const year = format(d, "yyyy");
  return `${monthName} ${year}`;
}

// Order delivery range: start = earliest of (createdAt, designStartDate, printStartDate),
// end = endDate. If no start, fall back to endDate (single-day bar).
function getOrderRange(order: Order): { start: Date | null; end: Date | null } {
  const end = safeStartOfDay(order.endDate);
  const firstItem = order.items?.[0];
  const candidates: Date[] = [];
  const created = safeStartOfDay(order.createdAt);
  if (created) candidates.push(created);
  if (firstItem) {
    const ds = safeStartOfDay(firstItem.designStartDate);
    const ps = safeStartOfDay(firstItem.printStartDate);
    if (ds) candidates.push(ds);
    if (ps) candidates.push(ps);
  }
  let start: Date | null = null;
  if (candidates.length) start = dateMin(candidates);
  if (!start && end) start = end;
  return { start, end };
}

function getDesignRange(order: Order): { start: Date | null; end: Date | null } {
  const firstItem = order.items?.[0];
  if (!firstItem) return { start: null, end: null };
  const start = safeStartOfDay(firstItem.designStartDate);
  const end = safeStartOfDay(firstItem.designEndDate);
  if (!start || !end) return { start: null, end: null };
  if (end < start) return { start: null, end: null };
  return { start, end };
}

function getPrintRange(order: Order): { start: Date | null; end: Date | null } {
  const firstItem = order.items?.[0];
  if (!firstItem) return { start: null, end: null };
  const start = safeStartOfDay(firstItem.printStartDate);
  const end = safeStartOfDay(firstItem.printEndDate);
  if (!start || !end) return { start: null, end: null };
  if (end < start) return { start: null, end: null };
  return { start, end };
}

function getCalColorKey(
  eventType: CalEventType,
  priority: string
): CalColorKey {
  if (priority === "urgent") return "urgent";
  return eventType;
}

function getGanttColorKey(order: Order): GanttColorKey {
  if (order.priority === "urgent") return "urgent";
  switch (order.status) {
    case "pending_design":
      return "design";
    case "in_printing":
      return "print";
    case "warehouse_logistics":
      return "warehouse";
    case "completed":
      return "completed";
    default:
      return "design";
  }
}

// Assign lanes within a single week. Each segment has startCol (0-6) and span (1-7).
// Returns a map of eventId -> lane index (0-based, reindexed per week).
function assignWeekLanes(
  segments: { eventId: string; startCol: number; span: number }[]
): Map<string, number> {
  const sorted = [...segments].sort((a, b) => {
    if (a.startCol !== b.startCol) return a.startCol - b.startCol;
    return b.span - a.span; // longer bars first within the same start
  });
  const lanes: number[] = []; // each lane tracks the endCol (exclusive) of its last segment
  const result = new Map<string, number>();
  for (const seg of sorted) {
    const segEnd = seg.startCol + seg.span;
    let assigned = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (seg.startCol >= lanes[i]) {
        lanes[i] = segEnd;
        assigned = i;
        break;
      }
    }
    if (assigned === -1) {
      lanes.push(segEnd);
      assigned = lanes.length - 1;
    }
    result.set(seg.eventId, assigned);
  }
  return result;
}

// ─── Filter type ──────────────────────────────────────────────────
type CalFilters = {
  showOrders: boolean;
  showDesign: boolean;
  showPrint: boolean;
  showTasks: boolean;
  urgentOnly: boolean;
};

type GanttFilters = {
  showOrders: boolean;
  showTasks: boolean;
  urgentOnly: boolean;
};

// ─── Build calendar events (with ranges) ──────────────────────────
function buildCalendarEvents(
  orders: Order[],
  tasks: Task[],
  filters: CalFilters
): RangeEvent[] {
  const list: RangeEvent[] = [];

  for (const order of orders) {
    if (filters.urgentOnly && order.priority !== "urgent") continue;

    if (filters.showOrders) {
      const { start, end } = getOrderRange(order);
      if (start && end) {
        list.push({
          id: `${order.id}-delivery`,
          kind: "order",
          eventType: "delivery",
          refId: order.id,
          label: `#${order.number} تحویل`,
          sublabel: order.customer.name,
          start,
          end,
          colorKey: getCalColorKey("delivery", order.priority),
          order,
        });
      }
    }

    if (filters.showDesign) {
      const { start, end } = getDesignRange(order);
      if (start && end) {
        list.push({
          id: `${order.id}-design`,
          kind: "order",
          eventType: "design",
          refId: order.id,
          label: `#${order.number} طراحی`,
          sublabel: order.customer.name,
          start,
          end,
          colorKey: getCalColorKey("design", order.priority),
          order,
        });
      }
    }

    if (filters.showPrint) {
      const { start, end } = getPrintRange(order);
      if (start && end) {
        list.push({
          id: `${order.id}-print`,
          kind: "order",
          eventType: "print",
          refId: order.id,
          label: `#${order.number} چاپ`,
          sublabel: order.customer.name,
          start,
          end,
          colorKey: getCalColorKey("print", order.priority),
          order,
        });
      }
    }
  }

  if (filters.showTasks) {
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const day = safeStartOfDay(task.dueDate);
      if (!day) continue;
      if (filters.urgentOnly && task.priority !== "urgent") continue;
      list.push({
        id: task.id,
        kind: "task",
        eventType: "task",
        refId: task.id,
        label: task.title,
        sublabel:
          MODULES[task.module as keyof typeof MODULES]?.faLabel ?? task.module,
        start: day,
        end: day,
        colorKey: task.priority === "urgent" ? "urgent" : "task",
        task,
      });
    }
  }

  return list;
}

// ─── Build Gantt rows ─────────────────────────────────────────────
function buildGanttRows(
  orders: Order[],
  tasks: Task[],
  filters: GanttFilters
): GanttRow[] {
  const rows: GanttRow[] = [];

  if (filters.showOrders) {
    for (const order of orders) {
      if (!OPEN_STATUSES.includes(order.status)) continue;
      if (filters.urgentOnly && order.priority !== "urgent") continue;
      const { start, end } = getOrderRange(order);
      if (!start || !end) continue;
      rows.push({
        id: `order-${order.id}`,
        kind: "order",
        refId: order.id,
        label: `#${order.number}`,
        sublabel: order.customer.name,
        start,
        end,
        colorKey: getGanttColorKey(order),
        order,
      });
    }
  }

  if (filters.showTasks) {
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const day = safeStartOfDay(task.dueDate);
      if (!day) continue;
      if (filters.urgentOnly && task.priority !== "urgent") continue;
      rows.push({
        id: `task-${task.id}`,
        kind: "task",
        refId: task.id,
        label: task.title,
        sublabel:
          MODULES[task.module as keyof typeof MODULES]?.faLabel ?? task.module,
        start: day,
        end: day,
        colorKey: task.priority === "urgent" ? "urgent" : "task",
        task,
      });
    }
  }

  return rows;
}

// ══════════════════════════════════════════════════════════════════
// CALENDAR TAB
// ══════════════════════════════════════════════════════════════════
function CalendarTab() {
  const invalidate = useInvalidate();
  const { openOrder, modal } = useOrderDetail();

  const [cursor, setCursor] = React.useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null);
  const [panelCollapsed, setPanelCollapsed] = React.useState(false);

  const [filters, setFilters] = React.useState<CalFilters>({
    showOrders: true,
    showDesign: true,
    showPrint: true,
    showTasks: true,
    urgentOnly: false,
  });

  // Day note editor state
  const [noteText, setNoteText] = React.useState("");
  const [noteColor, setNoteColor] = React.useState("default");

  // ─── Real-time queries (30s) ───────────────────────────────────
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

  const events = React.useMemo(
    () => buildCalendarEvents(allOrders, allTasks, filters),
    [allOrders, allTasks, filters]
  );

  const notesByDate = React.useMemo(() => {
    const map = new Map<string, DayNote>();
    for (const n of allNotes) map.set(n.date, n);
    return map;
  }, [allNotes]);

  // ─── Calendar grid ─────────────────────────────────────────────
  const days = React.useMemo(() => {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 6 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 6 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [cursor]);

  // Group days into weeks (rows of 7)
  const weeks = React.useMemo(() => {
    const list: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      list.push(days.slice(i, i + 7));
    }
    return list;
  }, [days]);

  const today = startOfDay(new Date());
  const monthEventsCount = events.filter((e) =>
    isSameMonth(e.start, cursor) || isSameMonth(e.end, cursor)
  ).length;

  // ─── Note mutations ────────────────────────────────────────────
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

  // ─── Selected day data ────────────────────────────────────────
  const selectedDayNote = selectedDay
    ? notesByDate.get(toYMD(selectedDay)) ?? null
    : null;

  React.useEffect(() => {
    setNoteText(selectedDayNote?.content ?? "");
    setNoteColor(selectedDayNote?.color ?? "default");
  }, [selectedDayNote]);

  const selectedDayInfo = React.useMemo(() => {
    if (!selectedDay) {
      return {
        delivery: [] as Order[],
        design: [] as Order[],
        print: [] as Order[],
        tasks: [] as Task[],
      };
    }
    const day = startOfDay(selectedDay);
    const delivery: Order[] = [];
    const design: Order[] = [];
    const print: Order[] = [];
    for (const order of allOrders) {
      if (filters.urgentOnly && order.priority !== "urgent") continue;
      if (filters.showOrders && order.endDate) {
        const ed = safeStartOfDay(order.endDate);
        if (ed && isSameDay(ed, day)) delivery.push(order);
      }
      if (filters.showDesign) {
        const { start, end } = getDesignRange(order);
        if (start && end && day >= start && day <= end) design.push(order);
      }
      if (filters.showPrint) {
        const { start, end } = getPrintRange(order);
        if (start && end && day >= start && day <= end) print.push(order);
      }
    }
    const dayTasks = allTasks.filter((t) => {
      if (!t.dueDate) return false;
      if (filters.urgentOnly && t.priority !== "urgent") return false;
      const d = safeStartOfDay(t.dueDate);
      return !!d && isSameDay(d, day);
    });
    return { delivery, design, print, tasks: dayTasks };
  }, [selectedDay, allOrders, allTasks, filters]);

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

  // ─── Pre-compute week segments + lanes for rendering ──────────
  const weeksRender = React.useMemo(() => {
    return weeks.map((week) => {
      const weekStart = week[0];
      const weekEnd = week[6];
      const segments: {
        eventId: string;
        startCol: number;
        span: number;
        event: RangeEvent;
      }[] = [];
      for (const ev of events) {
        // Check intersection (both normalized to start-of-day)
        if (ev.end < weekStart || ev.start > weekEnd) continue;
        const segStart = dateMax([ev.start, weekStart]);
        const segEnd = dateMin([ev.end, weekEnd]);
        if (segEnd < segStart) continue;
        const startCol = differenceInCalendarDays(segStart, weekStart);
        const span = differenceInCalendarDays(segEnd, segStart) + 1;
        segments.push({ eventId: ev.id, startCol, span, event: ev });
      }
      const lanes = assignWeekLanes(
        segments.map((s) => ({
          eventId: s.eventId,
          startCol: s.startCol,
          span: s.span,
        }))
      );
      const overflow = segments.filter((s) => {
        const lane = lanes.get(s.eventId) ?? 0;
        return lane >= CAL_MAX_LANES;
      });
      // Count overflow per day cell
      const overflowPerDay: number[] = new Array(7).fill(0);
      for (const s of overflow) {
        for (let c = s.startCol; c < s.startCol + s.span; c++) {
          if (c >= 0 && c < 7) overflowPerDay[c]++;
        }
      }
      const visibleSegments = segments.filter((s) => {
        const lane = lanes.get(s.eventId) ?? 0;
        return lane < CAL_MAX_LANES;
      });
      return {
        week,
        weekStart,
        visibleSegments: visibleSegments.map((s) => ({
          ...s,
          lane: lanes.get(s.eventId) ?? 0,
        })),
        overflowPerDay,
      };
    });
  }, [weeks, events]);

  return (
    <div className="space-y-4">
      {/* Toolbar: filters + month nav */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Icon name="filter" size={15} /> فیلترها
          </div>
          <ToggleButton
            checked={filters.showOrders}
            onChange={(v) => setFilters((f) => ({ ...f, showOrders: v }))}
            label="سفارشات"
            size="sm"
            activeColor="emerald"
          />
          <ToggleButton
            checked={filters.showDesign}
            onChange={(v) => setFilters((f) => ({ ...f, showDesign: v }))}
            label="طراحی"
            size="sm"
            activeColor="primary"
          />
          <ToggleButton
            checked={filters.showPrint}
            onChange={(v) => setFilters((f) => ({ ...f, showPrint: v }))}
            label="چاپ"
            size="sm"
            activeColor="amber"
          />
          <ToggleButton
            checked={filters.showTasks}
            onChange={(v) => setFilters((f) => ({ ...f, showTasks: v }))}
            label="تسک‌ها"
            size="sm"
            activeColor="primary"
          />
          <ToggleButton
            checked={filters.urgentOnly}
            onChange={(v) => setFilters((f) => ({ ...f, urgentOnly: v }))}
            label="فقط فوری"
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
            {monthLabel(cursor)}
          </h3>
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
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-px mb-2">
          {WEEK_DAYS.map((d) => (
            <div
              key={d}
              className="text-center text-xs font-semibold text-muted-foreground py-2"
            >
              {d}
            </div>
          ))}
        </div>

        {isLoading ? (
          <LoadingState />
        ) : (
          <div className="space-y-px">
            {weeksRender.map((wr, wi) => (
              <div
                key={wi}
                className="relative grid grid-cols-7 gap-px bg-border/60"
                style={{ height: `${CAL_WEEK_H}px` }}
              >
                {/* Day cells */}
                {wr.week.map((day) => {
                  const inMonth = isSameMonth(day, cursor);
                  const isToday = isSameDay(day, today);
                  const dayKey = toYMD(day);
                  const note = notesByDate.get(dayKey);
                  const isSelected =
                    selectedDay && isSameDay(day, selectedDay);
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => {
                        setSelectedDay(day);
                        setPanelCollapsed(false);
                      }}
                      className={cn(
                        "relative text-right transition-colors p-1.5 flex flex-col rounded-sm",
                        !inMonth && "bg-muted/25",
                        inMonth && "bg-card hover:bg-accent/30",
                        isToday && "ring-2 ring-inset ring-primary z-10",
                        isSelected && !isToday && "bg-primary/5"
                      )}
                      style={{ minHeight: `${CAL_WEEK_H}px` }}
                    >
                      {/* Date number + bookmark */}
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
                    </button>
                  );
                })}

                {/* Bars overlay (absolute) */}
                {wr.visibleSegments.map((seg) => {
                  const ev = seg.event;
                  const color = CAL_BAR_COLORS[ev.colorKey];
                  const leftPct = (seg.startCol / 7) * 100;
                  const widthPct = (seg.span / 7) * 100;
                  return (
                    <Tooltip key={seg.eventId}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (ev.kind === "order" && ev.order) {
                              openOrder(ev.order.id);
                            } else {
                              setSelectedDay(ev.start);
                              setPanelCollapsed(false);
                            }
                          }}
                          className={cn(
                            "absolute z-10 rounded-md px-2 py-0.5 text-[11px] font-medium border shadow-sm transition flex items-center gap-1 truncate",
                            color.bar
                          )}
                          style={{
                            top: `${CAL_HEADER_H + seg.lane * CAL_LANE_H}px`,
                            insetInlineStart: `calc(${leftPct}% + 2px)`,
                            inlineSize: `calc(${widthPct}% - 4px)`,
                            height: `${CAL_LANE_H - 4}px`,
                          }}
                        >
                          <span className="font-mono font-bold shrink-0">
                            {ev.label.split(" ")[0]}
                          </span>
                          {seg.span > 2 && (
                            <span className="truncate hidden sm:inline">
                              {ev.sublabel}
                            </span>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <div className="space-y-0.5 text-right">
                          <div className="font-semibold">{ev.label}</div>
                          <div className="text-primary-foreground/80">
                            {ev.sublabel}
                          </div>
                          <div
                            className="text-primary-foreground/70 text-[10px]"
                            dir="ltr"
                          >
                            {formatDate(ev.start)} → {formatDate(ev.end)}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}

                {/* +N overflow indicators */}
                {wr.overflowPerDay.map((count, ci) => {
                  if (count === 0) return null;
                  return (
                    <div
                      key={`ov-${wi}-${ci}`}
                      className="absolute z-[5] text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/80"
                      style={{
                        top: `${CAL_HEADER_H + CAL_MAX_LANES * CAL_LANE_H}px`,
                        insetInlineStart: `calc(${(ci / 7) * 100}% + 2px)`,
                      }}
                    >
                      +{count}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 text-xs text-muted-foreground text-left">
          {monthEventsCount} رویداد در این ماه
        </div>
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
                      {selectedDayInfo.delivery.length +
                        selectedDayInfo.design.length +
                        selectedDayInfo.print.length}{" "}
                      سفارش · {selectedDayInfo.tasks.length} تسک
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
                    </div>

                    {selectedDayInfo.delivery.length === 0 &&
                      selectedDayInfo.design.length === 0 &&
                      selectedDayInfo.print.length === 0 && (
                        <div className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-lg">
                          سفارشی برای این روز ثبت نشده
                        </div>
                      )}

                    {selectedDayInfo.delivery.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          تحویل ({selectedDayInfo.delivery.length})
                        </div>
                        {selectedDayInfo.delivery.map((o) => (
                          <OrderRow
                            key={`d-${o.id}`}
                            order={o}
                            onClick={() => openOrder(o.id)}
                          />
                        ))}
                      </div>
                    )}

                    {selectedDayInfo.design.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                          <span className="size-1.5 rounded-full bg-violet-500" />
                          در حال طراحی ({selectedDayInfo.design.length})
                        </div>
                        {selectedDayInfo.design.map((o) => (
                          <OrderRow
                            key={`de-${o.id}`}
                            order={o}
                            onClick={() => openOrder(o.id)}
                          />
                        ))}
                      </div>
                    )}

                    {selectedDayInfo.print.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                          <span className="size-1.5 rounded-full bg-amber-500" />
                          در حال چاپ ({selectedDayInfo.print.length})
                        </div>
                        {selectedDayInfo.print.map((o) => (
                          <OrderRow
                            key={`p-${o.id}`}
                            order={o}
                            onClick={() => openOrder(o.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Tasks section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Icon name="task" size={15} className="text-blue-500" />
                      تسک‌ها
                      <span className="text-xs text-muted-foreground font-normal">
                        ({selectedDayInfo.tasks.length})
                      </span>
                    </div>
                    {selectedDayInfo.tasks.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-lg">
                        تسکی برای این روز ثبت نشده
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin pr-1">
                        {selectedDayInfo.tasks.map((t) => (
                          <TaskRow key={t.id} task={t} />
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
                          <Icon
                            name="loading"
                            size={14}
                            className="animate-spin"
                          />
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
                            <Icon
                              name="loading"
                              size={14}
                              className="animate-spin"
                            />
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
                        آخرین به‌روزرسانی:{" "}
                        {formatDate(selectedDayNote.updatedAt, true)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
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

      {modal}
    </div>
  );
}

// ─── Order row inside the calendar day panel ──────────────────────
function OrderRow({
  order,
  onClick,
}: {
  order: Order;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-right rounded-lg border p-2.5 hover:bg-accent/40 transition flex items-center gap-2.5"
    >
      <div
        className="size-9 rounded-md bg-primary/10 text-primary grid place-items-center font-bold text-xs shrink-0"
        dir="ltr"
      >
        #{order.number}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">
          {order.customer.name}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <StatusBadge status={order.status} />
          {order.priority === "urgent" && <PriorityBadge priority="urgent" />}
        </div>
      </div>
      <div
        className="text-xs font-semibold tabular-nums shrink-0"
        dir="ltr"
      >
        {formatCurrency(order.totalAmount)}
      </div>
    </button>
  );
}

function TaskRow({ task }: { task: Task }) {
  return (
    <div className="rounded-lg border bg-card p-2.5 hover:shadow-sm transition">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm">{task.title}</span>
        <PriorityBadge priority={task.priority} />
      </div>
      {task.description && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
          {task.description}
        </p>
      )}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          <Icon name="grid" size={10} />
          {MODULES[task.module as keyof typeof MODULES]?.faLabel ?? task.module}
        </span>
        {task.status === "done" && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 px-1.5 py-0.5 text-[10px]">
            <Icon name="check" size={10} /> انجام شده
          </span>
        )}
        {task.status === "in_progress" && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 px-1.5 py-0.5 text-[10px]">
            <Icon name="loading" size={10} /> در حال انجام
          </span>
        )}
        {task.status === "todo" && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 px-1.5 py-0.5 text-[10px]">
            در صف
          </span>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// GANTT TAB
// ══════════════════════════════════════════════════════════════════
function GanttTab() {
  const { openOrder, modal } = useOrderDetail();

  const [cursor, setCursor] = React.useState<Date>(() =>
    subDays(startOfDay(new Date()), 7)
  );
  const [zoom, setZoom] = React.useState<"day" | "week">("day");
  const [filters, setFilters] = React.useState<GanttFilters>({
    showOrders: true,
    showTasks: true,
    urgentOnly: false,
  });

  // ─── Real-time queries (30s) ───────────────────────────────────
  const ordersQuery = useQuery({
    queryKey: ["orders-gantt"],
    queryFn: () => api<{ orders: Order[] }>("/api/orders"),
    refetchInterval: 30000,
  });
  const tasksQuery = useQuery({
    queryKey: ["tasks-gantt"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks"),
    refetchInterval: 30000,
  });

  const allOrders = ordersQuery.data?.orders ?? [];
  const allTasks = tasksQuery.data?.tasks ?? [];

  const rows = React.useMemo(
    () => buildGanttRows(allOrders, allTasks, filters),
    [allOrders, allTasks, filters]
  );

  // ─── Timeline configuration ───────────────────────────────────
  const windowDays = zoom === "day" ? 28 : 70;
  const dayWidth = zoom === "day" ? 48 : 20;
  const rowHeight = 52;
  const headerHeight = 56;
  const leftPanelWidth = 280;

  const timelineStart = startOfDay(cursor);
  const timelineEnd = addDays(timelineStart, windowDays - 1);
  const totalDays = windowDays;
  const timelineWidth = totalDays * dayWidth;

  const days = eachDayOfInterval({ start: timelineStart, end: timelineEnd });
  const today = startOfDay(new Date());
  const todayOffset = differenceInCalendarDays(today, timelineStart);
  const todayVisible = todayOffset >= 0 && todayOffset < totalDays;
  const todayLeftPx = todayOffset * dayWidth;

  // Shift navigation
  const shift = (dir: 1 | -1) => {
    const step = zoom === "day" ? 7 : 30;
    setCursor((c) => (dir === 1 ? addDays(c, step) : subDays(c, step)));
  };

  const isLoading = ordersQuery.isLoading || tasksQuery.isLoading;

  const ganttEmpty = rows.length === 0;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Icon name="filter" size={15} /> فیلترها
          </div>
          <ToggleButton
            checked={filters.showOrders}
            onChange={(v) => setFilters((f) => ({ ...f, showOrders: v }))}
            label="سفارشات"
            size="sm"
            activeColor="emerald"
          />
          <ToggleButton
            checked={filters.showTasks}
            onChange={(v) => setFilters((f) => ({ ...f, showTasks: v }))}
            label="تسک‌ها"
            size="sm"
            activeColor="primary"
          />
          <ToggleButton
            checked={filters.urgentOnly}
            onChange={(v) => setFilters((f) => ({ ...f, urgentOnly: v }))}
            label="فقط فوری"
            size="sm"
            activeColor="amber"
            activeIcon="alert"
          />

          <div className="mr-auto flex items-center gap-2">
            {/* Zoom toggle */}
            <div className="inline-flex rounded-lg border bg-muted p-0.5">
              <button
                onClick={() => setZoom("day")}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition",
                  zoom === "day"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                روزانه
              </button>
              <button
                onClick={() => setZoom("week")}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition",
                  zoom === "week"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                هفتگی
              </button>
            </div>

            {/* Navigation */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => shift(-1)}
              aria-label="بازه قبل"
            >
              <Icon name="chevronRight" size={16} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursor(subDays(startOfDay(new Date()), 7))}
            >
              امروز
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => shift(1)}
              aria-label="بازه بعد"
            >
              <Icon name="chevronLeft" size={16} />
            </Button>
          </div>
        </div>

        {/* Range label */}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Icon name="calendar2" size={13} />
          <span dir="ltr">
            {formatDate(timelineStart)} → {formatDate(timelineEnd)}
          </span>
          <span>·</span>
          <span>{rows.length} ردیف</span>
          {todayVisible && (
            <>
              <span>·</span>
              <span className="text-rose-600 font-medium flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-rose-500" /> امروز
              </span>
            </>
          )}
        </div>
      </Card>

      {/* Gantt chart */}
      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : ganttEmpty ? (
          <EmptyState
            icon="calendarCheck"
            title="هیچ موردی برای نمایش وجود ندارد"
            description="در این بازه زمانی سفارش یا تسکی یافت نشد. فیلترها را تغییر دهید یا بازه را جابه‌جا کنید."
          />
        ) : (
          <div
            className="overflow-auto scrollbar-thin"
            style={{ maxHeight: "70vh" }}
          >
            <div className="flex" style={{ minWidth: "max-content" }}>
              {/* ─── Left panel: task list (sticky) ─── */}
              <div
                className="sticky z-20 bg-card border-l shrink-0"
                style={{
                  insetInlineStart: 0,
                  width: `${leftPanelWidth}px`,
                }}
              >
                {/* Header */}
                <div
                  className="sticky top-0 z-30 bg-card border-b flex items-center px-4 font-semibold text-sm"
                  style={{ height: `${headerHeight}px` }}
                >
                  <Icon name="grid2" size={15} className="me-2 text-primary" />
                  سفارش / تسک
                </div>
                {/* Rows */}
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className="border-b flex items-center gap-2 px-4 hover:bg-accent/30 transition"
                    style={{ height: `${rowHeight}px` }}
                  >
                    <span
                      className={cn(
                        "size-2.5 rounded-full shrink-0",
                        GANTT_BAR_COLORS[row.colorKey].dot
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {row.label}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {row.sublabel}
                      </div>
                    </div>
                    {row.kind === "order" && row.order && (
                      <StatusBadge status={row.order.status} />
                    )}
                  </div>
                ))}
              </div>

              {/* ─── Right panel: timeline ─── */}
              <div
                className="relative"
                style={{ width: `${timelineWidth}px` }}
              >
                {/* Header (sticky top) */}
                <div
                  className="sticky top-0 z-10 bg-card border-b flex"
                  style={{ height: `${headerHeight}px` }}
                >
                  {days.map((day) => {
                    const isToday = isSameDay(day, today);
                    const isFriday = day.getDay() === 5;
                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          "flex flex-col items-center justify-center border-l shrink-0",
                          isFriday && "bg-rose-50/60 dark:bg-rose-950/20",
                          isToday && "bg-primary/10"
                        )}
                        style={{ width: `${dayWidth}px` }}
                      >
                        <span className="text-[10px] text-muted-foreground">
                          {weekdayLabel(day).slice(0, 1)}
                        </span>
                        <span
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            isToday && "text-primary"
                          )}
                          dir="ltr"
                        >
                          {format(day, "d")}
                        </span>
                        {zoom === "day" && (
                          <span className="text-[9px] text-muted-foreground" dir="ltr">
                            {format(day, "MM")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Body */}
                <div className="relative">
                  {/* Vertical gridlines (one per day) */}
                  <div
                    className="absolute inset-0 flex pointer-events-none"
                    aria-hidden
                  >
                    {days.map((day) => {
                      const isFriday = day.getDay() === 5;
                      return (
                        <div
                          key={day.toISOString()}
                          className={cn(
                            "border-l shrink-0",
                            isFriday && "bg-rose-50/40 dark:bg-rose-950/10"
                          )}
                          style={{ width: `${dayWidth}px` }}
                        />
                      );
                    })}
                  </div>

                  {/* Rows with bars */}
                  {rows.map((row) => {
                    const startOffset = differenceInCalendarDays(
                      row.start,
                      timelineStart
                    );
                    const endOffset = differenceInCalendarDays(
                      row.end,
                      timelineStart
                    );
                    // Clamp into view
                    const clampedStart = Math.max(0, startOffset);
                    const clampedEnd = Math.min(totalDays - 1, endOffset);
                    const span = clampedEnd - clampedStart + 1;
                    const barLeftPx = clampedStart * dayWidth;
                    const barWidthPx = span * dayWidth;
                    const color = GANTT_BAR_COLORS[row.colorKey];
                    const isSingleDay = span === 1;
                    return (
                      <div
                        key={row.id}
                        className="relative border-b"
                        style={{ height: `${rowHeight}px` }}
                      >
                        {/* Bar */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => {
                                if (row.kind === "order" && row.order) {
                                  openOrder(row.order.id);
                                }
                              }}
                              className={cn(
                                "absolute rounded-md px-2 py-1 text-[11px] font-medium shadow-sm transition flex items-center gap-1.5 overflow-hidden",
                                color.bar
                              )}
                              style={{
                                top: "8px",
                                bottom: "8px",
                                insetInlineStart: `${barLeftPx + 2}px`,
                                inlineSize: `${barWidthPx - 4}px`,
                                minWidth: "24px",
                              }}
                            >
                              <span className="font-mono font-bold shrink-0 truncate">
                                {row.label}
                              </span>
                              {!isSingleDay && barWidthPx > 80 && (
                                <span className="truncate hidden sm:inline opacity-90">
                                  {row.sublabel}
                                </span>
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="space-y-0.5 text-right">
                              <div className="font-semibold">{row.label}</div>
                              <div className="text-primary-foreground/80">
                                {row.sublabel}
                              </div>
                              <div
                                className="text-primary-foreground/70 text-[10px]"
                                dir="ltr"
                              >
                                {formatDate(row.start)} → {formatDate(row.end)}
                              </div>
                              {row.kind === "order" && row.order && (
                                <div
                                  className="text-primary-foreground/70 text-[10px]"
                                  dir="ltr"
                                >
                                  {formatCurrency(row.order.totalAmount)}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    );
                  })}

                  {/* Today line (vertical red) */}
                  {todayVisible && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10 pointer-events-none"
                      style={{ insetInlineStart: `${todayLeftPx + dayWidth / 2}px` }}
                    >
                      <div className="absolute -top-0 -translate-x-1/2 size-2 rounded-full bg-rose-500" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Color legend */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <span className="font-medium text-muted-foreground flex items-center gap-1.5">
            <Icon name="info" size={13} /> راهنمای رنگ:
          </span>
          {(["design", "print", "warehouse", "completed", "urgent", "task"] as GanttColorKey[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", GANTT_BAR_COLORS[k].dot)} />
              {GANTT_BAR_COLORS[k].label}
            </span>
          ))}
        </div>
      </Card>

      {modal}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════
export function CalendarPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="تقویم و گانت چارت"
        description="نمای کامل سفارشات، فازهای طراحی/چاپ، تسک‌ها و یادداشت‌ها در دو نمای تقویمی و گانت"
        icon="calendar"
      />
      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar" className="gap-1.5">
            <Icon name="calendar2" size={14} />
            تقویم
          </TabsTrigger>
          <TabsTrigger value="gantt" className="gap-1.5">
            <Icon name="chartBar" size={14} />
            گانت چارت
          </TabsTrigger>
        </TabsList>
        <TabsContent value="calendar">
          <CalendarTab />
        </TabsContent>
        <TabsContent value="gantt">
          <GanttTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
