"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  PageHeader,
  StatusBadge,
  PriorityBadge,
  EmptyState,
} from "@/components/shared";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleButton } from "@/components/ui/toggle-button";
import { formatDate, daysRemaining } from "@/lib/format";
import { useAppStore } from "@/stores/app-store";
import { useDesignerOrderDetail } from "@/lib/use-designer-order-detail";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────
// NOTE: Designer view excludes prices, customer phone, and overall endDate.
// We only consume the fields the designer is allowed to see.
type DesignerOrder = {
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
    designStartDate: string | null;
    designEndDate: string | null;
  }[];
};

// ─── Time filter (هم‌ semantics با داشبورد طراح) ────────────────────
type TimeFilter = "all" | "overdue" | "today" | "near";

const TIME_OPTIONS: { value: TimeFilter; label: string; icon: IconName; color: string }[] = [
  { value: "all", label: "همه", icon: "inbox", color: "" },
  { value: "overdue", label: "موعد گذشته", icon: "alertTriangle", color: "text-rose-600 dark:text-rose-400" },
  { value: "today", label: "موعد امروز", icon: "clock", color: "text-amber-600 dark:text-amber-400" },
  { value: "near", label: "نزدیک موعد (۲روز)", icon: "calendar", color: "text-emerald-600 dark:text-emerald-400" },
];

function effectiveDesignDeadline(o: DesignerOrder): string | null {
  const active = (o.items ?? []).filter((i) => i.stage === "design");
  const dates = (active.length > 0 ? active : (o.items ?? []))
    .map((i) => i.designEndDate)
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

function orderTimeState(o: DesignerOrder): "overdue" | "today" | "near" | "later" | "none" {
  const end = effectiveDesignDeadline(o);
  if (!end) return "none";
  const dr = daysRemaining(end);
  if (dr.status === "overdue") return "overdue";
  if (dr.status === "today") return "today";
  if (dr.status === "remaining" && dr.days <= 2) return "near";
  return "later";
}

// ─── Component ────────────────────────────────────────────────────────
export function DesignerOrders() {
  const navigate = useAppStore((s) => s.navigate);
  const boardFilter = useAppStore((s) => s.boardFilter);
  const setBoardFilter = useAppStore((s) => s.setBoardFilter);
  const { openOrder, modal } = useDesignerOrderDetail();

  // Filter state
  const [search, setSearch] = React.useState("");
  const [priorityFilters, setPriorityFilters] = React.useState<{
    urgent: boolean;
    normal: boolean;
  }>({ urgent: true, normal: true });

  // Phase 14: فیلتر زمانی — مقدار اولیه از کارتِ داشبورد (اگر آمده باشد)
  const [timeFilter, setTimeFilter] = React.useState<TimeFilter>("all");
  React.useEffect(() => {
    if (boardFilter && boardFilter.module === "designer") {
      const v = boardFilter.value as TimeFilter;
      if (TIME_OPTIONS.some((o) => o.value === v)) setTimeFilter(v);
      setBoardFilter("designer", null); // مصرف شد
    }
  }, [boardFilter, setBoardFilter]);

  // Fetch orders filtered by status=pending_design
  const { data, isLoading } = useQuery({
    queryKey: ["orders", "designer", "pending_design", "list"],
    queryFn: () =>
      api<{ orders: DesignerOrder[] }>("/api/orders?status=pending_design&board=designer"),
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

  // Client-side filter: search + priority + time
  const orders = React.useMemo(() => {
    return allOrders.filter((o) => {
      // Search by customer name or order number
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const inName = (o.customer?.name ?? "").toLowerCase().includes(q);
        const inNumber = String(o.number).includes(q.replace("#", ""));
        if (!inName && !inNumber) return false;
      }
      // Priority filter
      if (o.priority === "urgent" && !priorityFilters.urgent) return false;
      if (o.priority === "normal" && !priorityFilters.normal) return false;
      // Time filter
      if (timeFilter !== "all" && orderTimeState(o) !== timeFilter) return false;
      return true;
    });
  }, [allOrders, search, priorityFilters, timeFilter]);

  // Columns designer sees — NO price columns, NO customer phone, NO overall endDate
  const columns = React.useMemo<ColumnDef<DesignerOrder>[]>(
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
        id: "priority",
        accessorFn: (r) => r.priority,
        header: "اولویت",
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
        enableSorting: true,
      },
      {
        id: "designEndDate",
        accessorFn: (r) => {
          const d = effectiveDesignDeadline(r);
          return d ? new Date(d).getTime() : 0;
        },
        header: "موعد طراحی",
        cell: ({ row }) => {
          const end = effectiveDesignDeadline(row.original);
          if (!end) {
            return (
              <span className="text-xs text-muted-foreground">
                بدون موعد طراحی
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
      {
        accessorKey: "status",
        header: "وضعیت",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
        enableSorting: true,
      },
    ],
    []
  );

  const activeTime = TIME_OPTIONS.find((o) => o.value === timeFilter);

  return (
    <div className="space-y-5">
      <PageHeader
        title="سفارشات طراحی"
        description="سفارشات در مرحله طراحی — برای مشاهده جزئیات روی ردیف کلیک کنید"
        icon="orders"
        actions={
          <Button
            variant="outline"
            onClick={() => navigate("designer", "dashboard")}
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
            {orders.length.toLocaleString("fa-IR")} از {allOrders.length.toLocaleString("fa-IR")} سفارش
            {timeFilter !== "all" && activeTime && ` (${activeTime.label})`}
          </div>
        </div>
      </Card>

      {/* DataTable */}
      <Card className="p-0 overflow-hidden">
        <DataTable
          columns={columns}
          data={orders}
          isLoading={isLoading}
          onRowClick={(row) => openOrder(row.id)}
          showColumnToggle={false}
          pageSize={15}
          emptyState={
            timeFilter !== "all" ? (
              <EmptyState
                icon="checkCircle"
                title={`سفارش «${activeTime?.label}» وجود ندارد`}
                description="این دسته خالی است — فیلتر زمانی را تغییر دهید"
              />
            ) : (
              <EmptyState
                icon="checkCircle"
                title="سفارشی در مرحله طراحی نیست"
                description="همه سفارشات طراحی به مرحله بعد ارسال شده‌اند"
              />
            )
          }
        />
      </Card>

      {modal}
    </div>
  );
}
