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
import { Button } from "@/components/ui/button";
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

// ─── Time filter (هم‌semantics با داشبورد چاپ) ──────────────────────
type TimeFilter = "all" | "overdue" | "today" | "near";

const TIME_OPTIONS: { value: TimeFilter; label: string; icon: IconName; color: string }[] = [
  { value: "all", label: "همه", icon: "inbox", color: "" },
  { value: "overdue", label: "موعد گذشته", icon: "alertTriangle", color: "text-rose-600 dark:text-rose-400" },
  { value: "today", label: "موعد امروز", icon: "clock", color: "text-amber-600 dark:text-amber-400" },
  { value: "near", label: "نزدیک موعد (۲روز)", icon: "calendar", color: "text-emerald-600 dark:text-emerald-400" },
];

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

function isReadyForPrint(o: PrintOrder): boolean {
  return !needsMaterial(o);
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

  // Phase 14: فیلتر زمانی — مقدار اولیه از کارتِ داشبورد (اگر آمده باشد)
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

  const allOrders = data?.orders ?? [];

  // شمارش هر دستهٔ زمانی (برای بج‌های سگمنت)
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="سفارشات چاپ"
        description="سفارشات در مرحله چاپ — برای مشاهده جزئیات روی ردیف کلیک کنید"
        icon="orders"
        actions={
          <Button
            variant="outline"
            onClick={() => navigate("print", "dashboard")}
            className="gap-2"
          >
            <Icon name="dashboard" size={16} /> داشبورد
          </Button>
        }
      />

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

          <div className="mr-auto text-xs text-muted-foreground">
            مجموع: {allOrders.length.toLocaleString("fa-IR")} سفارش (
            {needsMaterialOrders.length.toLocaleString("fa-IR")} نیازمند متریال،{" "}
            {readyOrders.length.toLocaleString("fa-IR")} آماده چاپ)
            {timeFilter !== "all" && activeTime && ` — فیلتر: ${activeTime.label}`}
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
