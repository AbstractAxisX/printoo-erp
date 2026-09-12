"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  PageHeader,
  PriorityBadge,
  EmptyState,
} from "@/components/shared";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { ToggleButton } from "@/components/ui/toggle-button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDate, daysRemaining } from "@/lib/format";
import { useAppStore } from "@/stores/app-store";
import { usePrintOrderDetail } from "@/lib/use-print-order-detail";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────
// NOTE: Print view excludes prices, customer phone, and overall endDate.
// We only consume the fields the print is allowed to see.
type PrintOrder = {
  id: string;
  number: number;
  status: string;
  priority: string;
  createdAt: string;
  customer: { name: string };
  items: {
    id: string;
    product: { name: string };
    stage: string;
    needsMaterial: boolean;
    materialConfirmed: boolean;
    printStartDate: string | null;
    printEndDate: string | null;
  }[];
};

// Phase 17: برای کارت «تسک‌های فعال» (کوئری مشترک با print-tasks)
type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  module: string;
  createdAt: string;
};

// ─── Time filter ──────────────────────────────────────────────────────
type TimeFilter = "all" | "overdue" | "today" | "near";

const TIME_OPTIONS: { value: TimeFilter; label: string; icon: IconName; color: string }[] = [
  { value: "all", label: "همه", icon: "inbox", color: "" },
  { value: "overdue", label: "موعد گذشته", icon: "alertTriangle", color: "text-rose-600 dark:text-rose-400" },
  { value: "today", label: "موعد امروز", icon: "clock", color: "text-amber-600 dark:text-amber-400" },
  { value: "near", label: "نزدیک موعد (۲روز)", icon: "calendar", color: "text-emerald-600 dark:text-emerald-400" },
];

// ─── Time-filter helpers (Phase 17: منتقل از داشبورد حذف‌شده) ────────
/** موعد مؤثر = نزدیک‌ترین موعد چاپِ آیتم‌های فعال به امروز */
function effectivePrintDeadline(o: PrintOrder): string | null {
  const active = (o.items ?? []).filter((i) => i.stage === "print");
  const dates = (active.length > 0 ? active : (o.items ?? []))
    .map((i) => i.printEndDate)
    .filter((d): d is string => !!d);
  if (dates.length === 0) return null;
  const now = Date.now();
  const times = dates
    .map((d) => new Date(d).getTime())
    .filter((t) => Number.isFinite(t));
  if (times.length === 0) return null;
  const nearest = times.reduce((a, b) => (Math.abs(b - now) < Math.abs(a - now) ? b : a));
  return new Date(nearest).toISOString();
}

function orderTimeState(o: PrintOrder): "overdue" | "today" | "near" | "later" | "none" {
  const end = effectivePrintDeadline(o);
  if (!end) return "none";
  const dr = daysRemaining(end);
  if (dr.status === "overdue") return "overdue";
  if (dr.status === "today") return "today";
  if (dr.status === "remaining" && dr.days <= 2) return "near";
  return "later";
}

// ─── Helpers ──────────────────────────────────────────────────────────
function needsMaterial(o: PrintOrder): boolean {
  return (o.items ?? []).some((it) => it.needsMaterial && !it.materialConfirmed);
}

// ─── KPI Card (Phase 17: منتقل از داشبورد حذف‌شده + حالت فعال) ───────
type KpiCardProps = {
  icon: IconName;
  label: string;
  value: number;
  hint?: string;
  color: "amber" | "rose" | "emerald" | "violet";
  /** حالت انتخاب‌شده — کارتِ متناظر با فیلتر فعال هایلایت می‌شود */
  active?: boolean;
  onClick?: () => void;
};

const KPI_COLOR_MAP: Record<
  KpiCardProps["color"],
  { bg: string; text: string; ring: string; hoverRing: string; activeRing: string }
> = {
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/20",
    hoverRing: "hover:ring-amber-500/50",
    activeRing: "ring-2 ring-amber-500/70 border-amber-500/50",
  },
  rose: {
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    ring: "ring-rose-500/20",
    hoverRing: "hover:ring-rose-500/50",
    activeRing: "ring-2 ring-rose-500/70 border-rose-500/50",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/20",
    hoverRing: "hover:ring-emerald-500/50",
    activeRing: "ring-2 ring-emerald-500/70 border-emerald-500/50",
  },
  violet: {
    bg: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
    ring: "ring-violet-500/20",
    hoverRing: "hover:ring-violet-500/50",
    activeRing: "ring-2 ring-violet-500/70 border-violet-500/50",
  },
};

function KpiCard({ icon, label, value, hint, color, active, onClick }: KpiCardProps) {
  const c = KPI_COLOR_MAP[color];
  return (
    <Card
      className={cn(
        "p-4 ring-1 transition",
        c.ring,
        active && c.activeRing,
        onClick &&
          cn(
            "cursor-pointer hover:shadow-md hover:scale-[1.01] focus-visible:ring-2 outline-none",
            c.hoverRing
          )
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      aria-pressed={active}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between">
        <div className={cn("size-10 rounded-lg grid place-items-center", c.bg, c.text)}>
          <Icon name={icon} size={20} />
        </div>
        <span className="text-3xl font-bold tabular-nums">{value.toLocaleString("fa-IR")}</span>
      </div>
      <div className="mt-2">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
    </Card>
  );
}

// ─── Component ────────────────────────────────────────────────────────
export function PrintOrders() {
  const navigate = useAppStore((s) => s.navigate);
  const boardFilter = useAppStore((s) => s.boardFilter);
  const setBoardFilter = useAppStore((s) => s.setBoardFilter);
  const { openOrder, modal } = usePrintOrderDetail();
  const [activeTab, setActiveTab] = React.useState("needs-material");

  // Filter state
  const [search, setSearch] = React.useState("");
  const [priorityFilters, setPriorityFilters] = React.useState<{
    urgent: boolean;
    normal: boolean;
  }>({ urgent: true, normal: true });

  // فیلتر زمانی — مقدار اولیه از boardFilter (پرش از نوتیف/لینک خارجی)
  const [timeFilter, setTimeFilter] = React.useState<TimeFilter>("all");
  React.useEffect(() => {
    if (boardFilter && boardFilter.module === "print") {
      const v = boardFilter.value as TimeFilter;
      if (TIME_OPTIONS.some((o) => o.value === v)) setTimeFilter(v);
      setBoardFilter("print", null); // مصرف شد
    }
  }, [boardFilter, setBoardFilter]);

  // Fetch orders filtered by status=in_printing
  const { data, isLoading } = useQuery({
    queryKey: ["orders", "print", "in_printing", "list"],
    queryFn: () =>
      api<{ orders: PrintOrder[] }>("/api/orders?status=in_printing&board=print"),
    refetchInterval: 30000,
  });

  // Phase 17: تسک‌های چاپ برای کارت «تسک‌های فعال» —
  // همان کوئری print-tasks (کلید یکسان) تا کش مشترک شود و fetch تکراری نباشد.
  const { data: tasksData } = useQuery({
    queryKey: ["tasks", "print", "list"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks?module=print"),
    refetchInterval: 30000,
  });

  const allOrders = data?.orders ?? [];

  const activeTasksCount = React.useMemo(
    () =>
      (tasksData?.tasks ?? []).filter(
        (t) => t.status === "todo" || t.status === "in_progress"
      ).length,
    [tasksData]
  );

  // شمارش هر دستهٔ زمانی (برای بج‌های سگمنت و کارت‌های KPI)
  const timeCounts = React.useMemo(() => {
    const c: Record<TimeFilter, number> = { all: allOrders.length, overdue: 0, today: 0, near: 0 };
    for (const o of allOrders) {
      const st = orderTimeState(o);
      if (st === "overdue") c.overdue++;
      else if (st === "today") c.today++;
      else if (st === "near") c.near++;
    }
    return c;
  }, [allOrders]);

  // Split into needs-material / ready-for-print
  const { needsMaterialOrders, readyOrders } = React.useMemo(() => {
    const needs: PrintOrder[] = [];
    const ready: PrintOrder[] = [];
    for (const o of allOrders) {
      if (needsMaterial(o)) needs.push(o);
      else ready.push(o);
    }
    return { needsMaterialOrders: needs, readyOrders: ready };
  }, [allOrders]);

  // Apply search + priority + time filter
  function applyFilters(list: PrintOrder[]): PrintOrder[] {
    return list.filter((o) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const inName = (o.customer?.name ?? "").toLowerCase().includes(q);
        const inNumber = String(o.number).includes(q.replace("#", ""));
        if (!inName && !inNumber) return false;
      }
      if (o.priority === "urgent" && !priorityFilters.urgent) return false;
      if (o.priority === "normal" && !priorityFilters.normal) return false;
      if (timeFilter !== "all" && orderTimeState(o) !== timeFilter) return false;
      return true;
    });
  }

  const filteredNeedsMaterial = applyFilters(needsMaterialOrders);
  const filteredReady = applyFilters(readyOrders);

  // کلیک روی کارت زمانی → اعمال فیلتر؛ کلیک دوباره روی کارتِ فعال → خاموشی (all)
  const applyTimeCard = (f: TimeFilter) => {
    setTimeFilter((prev) => (prev === f ? "all" : f));
  };

  // کارت متریال → پرش به تب «نیازمند متریال»؛ کلیک دوباره → بازگشت به «آماده چاپ»
  const toggleMaterialTab = () => {
    setActiveTab((prev) => (prev === "needs-material" ? "ready" : "needs-material"));
  };

  // Columns print sees — NO price columns, NO customer phone, NO overall endDate
  const columns = React.useMemo<ColumnDef<PrintOrder>[]>(
    () => [
      {
        accessorKey: "number",
        header: "شماره",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold">
            #{row.original.number}
          </span>
        ),
        enableSorting: true,
      },
      {
        id: "customer",
        accessorFn: (r) => r.customer?.name ?? "",
        header: "مشتری",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.customer?.name ?? "—"}</span>
        ),
        enableSorting: true,
      },
      {
        id: "items",
        header: "آیتم‌ها",
        cell: ({ row }) => {
          const items = row.original.items ?? [];
          return (
            <div className="flex flex-wrap gap-1 max-w-[220px]">
              {items.slice(0, 2).map((it) => (
                <span
                  key={it.id}
                  className="text-xs bg-muted rounded px-1.5 py-0.5 truncate"
                >
                  {it.product?.name ?? "—"}
                </span>
              ))}
              {items.length > 2 && (
                <span className="text-xs text-muted-foreground">
                  +{items.length - 2}
                </span>
              )}
              {items.length === 0 && (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          );
        },
        enableSorting: false,
      },
      {
        id: "material",
        accessorFn: (r) => (needsMaterial(r) ? 1 : 0),
        header: "متریال",
        cell: ({ row }) => {
          const o = row.original;
          const nm = (o.items ?? []).filter((it) => it.needsMaterial && !it.materialConfirmed).length;
          if (nm === 0) {
            return (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 inline-flex items-center gap-0.5">
                <Icon name="check" size={10} /> تأمین شده
              </span>
            );
          }
          return (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 inline-flex items-center gap-0.5">
              <Icon name="alert" size={10} /> {nm.toLocaleString("fa-IR")} آیتم منتظر
            </span>
          );
        },
        enableSorting: true,
      },
      {
        id: "priority",
        accessorFn: (r) => r.priority,
        header: "اولویت",
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
        enableSorting: true,
      },
      {
        id: "printEndDate",
        accessorFn: (r) => {
          const d = effectivePrintDeadline(r);
          return d ? new Date(d).getTime() : 0;
        },
        header: "موعد چاپ",
        cell: ({ row }) => {
          const end = effectivePrintDeadline(row.original);
          if (!end) {
            return (
              <span className="text-xs text-muted-foreground">
                بدون موعد چاپ
              </span>
            );
          }
          const dr = daysRemaining(end);
          return (
            <div>
              <div className="text-xs tabular-nums">{formatDate(end)}</div>
              {dr.status !== "none" && (
                <div
                  className={cn(
                    "text-[11px] mt-0.5 flex items-center gap-1",
                    dr.status === "remaining" && "text-emerald-600",
                    dr.status === "overdue" && "text-rose-600",
                    dr.status === "today" && "text-amber-600"
                  )}
                >
                  <Icon
                    name={dr.status === "overdue" ? "alertTriangle" : "clock"}
                    size={11}
                  />
                  {dr.text}
                </div>
              )}
            </div>
          );
        },
        enableSorting: true,
      },
    ],
    []
  );

  const activeTime = TIME_OPTIONS.find((o) => o.value === timeFilter);

  // اجزای فعالِ فیلتر برای نوار خلاصه (زمان + جستجو + اولویت)
  const filterParts: string[] = [];
  if (timeFilter !== "all") filterParts.push(activeTime?.label ?? timeFilter);
  if (search.trim()) filterParts.push(`جستجو: «${search.trim()}»`);
  if (priorityFilters.urgent && !priorityFilters.normal) filterParts.push("اولویت: فوری");
  if (!priorityFilters.urgent && priorityFilters.normal) filterParts.push("اولویت: معمولی");

  return (
    <div className="space-y-5">
      <PageHeader
        title="سفارشات چاپ"
        description="سفارشات در مرحله چاپ — روی کارت‌های بالا کلیک کنید تا فیلتر شوند؛ برای جزئیات، روی ردیف جدول کلیک کنید"
        icon="orders"
      />

      {/* Phase 17: کارت‌های آماری (منتقل‌شده از داشبورد حذف‌شده) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          icon="print"
          label="در حال چاپ"
          value={allOrders.length}
          hint="مجموع سفارشات مرحله چاپ"
          color="amber"
          active={timeFilter === "all"}
          onClick={() => applyTimeCard("all")}
        />
        <KpiCard
          icon="alertTriangle"
          label="موعد گذشته"
          value={timeCounts.overdue}
          hint="موعد چاپ‌شان رسیده و گذشته"
          color="rose"
          active={timeFilter === "overdue"}
          onClick={() => applyTimeCard("overdue")}
        />
        <KpiCard
          icon="clock"
          label="موعد امروز"
          value={timeCounts.today}
          hint="امروز باید چاپ شوند"
          color="rose"
          active={timeFilter === "today"}
          onClick={() => applyTimeCard("today")}
        />
        <KpiCard
          icon="calendar"
          label="نزدیک موعد"
          value={timeCounts.near}
          hint="۲ روز یا کمتر تا موعد چاپ"
          color="violet"
          active={timeFilter === "near"}
          onClick={() => applyTimeCard("near")}
        />
        <KpiCard
          icon="boxes"
          label="نیازمند متریال"
          value={needsMaterialOrders.length}
          hint="در انتظار تأمین متریال"
          color="amber"
          active={activeTab === "needs-material"}
          onClick={toggleMaterialTab}
        />
        <KpiCard
          icon="task"
          label="تسک‌های فعال"
          value={activeTasksCount}
          hint="در صف یا در حال انجام"
          color="emerald"
          onClick={() => navigate("print", "tasks")}
        />
      </div>

      {/* Filters bar — زمان + جستجو + اولویت */}
      <Card className="p-4 space-y-3">
        {/* Time filter segmented control */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
            <Icon name="calendar" size={13} /> زمان:
          </span>
          <div
            role="radiogroup"
            aria-label="فیلتر زمانی"
            className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-1"
          >
            {TIME_OPTIONS.map((o) => {
              const active = timeFilter === o.value;
              return (
                <button
                  key={o.value}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTimeFilter(o.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                    active
                      ? "bg-background text-foreground shadow-sm border"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                  )}
                >
                  <Icon name={o.icon} size={13} className={active ? o.color : ""} />
                  {o.label}
                  {timeCounts[o.value] > 0 && (
                    <span
                      className={cn(
                        "text-[10px] tabular-nums rounded-full px-1.5 py-0.5",
                        active
                          ? "bg-muted text-foreground"
                          : "bg-muted/60 text-muted-foreground",
                        o.value === "overdue" && timeCounts.overdue > 0 && "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
                        o.value === "today" && timeCounts.today > 0 && "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                      )}
                    >
                      {timeCounts[o.value].toLocaleString("fa-IR")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search input */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Icon
              name="search"
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجو: نام مشتری یا شماره سفارش..."
              className="w-full h-9 rounded-md border bg-background pr-9 pl-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Priority filter toggles */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">اولویت:</span>
            <ToggleButton
              checked={priorityFilters.urgent}
              onChange={(v) =>
                setPriorityFilters((p) => ({ ...p, urgent: v }))
              }
              label="فوری"
              size="sm"
              activeColor="amber"
              activeIcon="alert"
            />
            <ToggleButton
              checked={priorityFilters.normal}
              onChange={(v) =>
                setPriorityFilters((p) => ({ ...p, normal: v }))
              }
              label="معمولی"
              size="sm"
              activeColor="primary"
            />
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>

      <TabsList>
          <TabsTrigger value="needs-material" className="gap-1.5">
            <Icon name="boxes" size={14} />
            نیازمند متریال
            <span className="text-[11px] text-muted-foreground">
              ({filteredNeedsMaterial.length.toLocaleString("fa-IR")})
            </span>
          </TabsTrigger>
          <TabsTrigger value="ready" className="gap-1.5">
            <Icon name="print" size={14} />
            آماده چاپ
            <span className="text-[11px] text-muted-foreground">
              ({filteredReady.length.toLocaleString("fa-IR")})
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Phase 17: نوار خلاصهٔ فیلتر — تفکیک زندهٔ مجموعهٔ فیلترشده به چاپ/متریال */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <span className="flex items-center gap-1 text-muted-foreground shrink-0">
            <Icon name="filter" size={13} />
            {filterParts.length > 0 ? "با این فیلتر:" : "نمای کلی:"}
          </span>
          <span className="font-medium">
            <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {filteredReady.length.toLocaleString("fa-IR")}
            </span>{" "}
            سفارش در بخش چاپ (آمادهٔ چاپ)
          </span>
          <span className="text-muted-foreground">و</span>
          <span className="font-medium">
            <span className="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {filteredNeedsMaterial.length.toLocaleString("fa-IR")}
            </span>{" "}
            سفارش در بخش متریال (منتظر تأمین)
          </span>
          {filterParts.length > 0 && (
            <span className="text-xs text-muted-foreground">
              — {filterParts.join(" • ")}
            </span>
          )}
        </div>

        <TabsContent value="needs-material">
          <Card className="p-0 overflow-hidden">
            <DataTable
              columns={columns}
              data={filteredNeedsMaterial}
              isLoading={isLoading}
              onRowClick={(row) => openOrder(row.id)}
              showColumnToggle={false}
              pageSize={15}
              emptyState={
                timeFilter !== "all" ? (
                  <EmptyState
                    icon="checkCircle"
                    title={`سفارش «${activeTime?.label}» در این تب نیست`}
                    description="فیلتر زمانی را تغییر دهید یا تب دیگر را ببینید"
                  />
                ) : (
                  <EmptyState
                    icon="checkCircle"
                    title="سفارش نیازمند متریال نیست"
                    description="همه سفارشات چاپ متریال خود را دریافت کرده‌اند"
                  />
                )
              }
            />
          </Card>
        </TabsContent>

        <TabsContent value="ready">
          <Card className="p-0 overflow-hidden">
            <DataTable
              columns={columns}
              data={filteredReady}
              isLoading={isLoading}
              onRowClick={(row) => openOrder(row.id)}
              showColumnToggle={false}
              pageSize={15}
              emptyState={
                timeFilter !== "all" ? (
                  <EmptyState
                    icon="inbox"
                    title={`سفارش «${activeTime?.label}» در این تب نیست`}
                    description="فیلتر زمانی را تغییر دهید یا تب دیگر را ببینید"
                  />
                ) : (
                  <EmptyState
                    icon="inbox"
                    title="سفارش آماده چاپ نیست"
                    description="سفارشات در انتظار تأمین متریال هستند"
                  />
                )
              }
            />
          </Card>
        </TabsContent>
      </Tabs>

      {modal}
    </div>
  );
}
