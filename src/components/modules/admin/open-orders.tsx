"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, StatusBadge, PriorityBadge, EmptyState } from "@/components/shared";
import { OrderDetailModal, type OrderDetail } from "@/components/shared/order-detail-modal";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { formatCurrency, formatDate, daysRemaining } from "@/lib/format";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────
type Order = {
  id: string;
  number: number;
  status: string;
  endDate: string | null;
  noEndDate: boolean;
  totalAmount: number;
  priority: string;
  createdAt: string;
  customer: { id: string; name: string; phone: string };
  items: {
    id: string;
    productId: string;
    product: { name: string };
    quantity: number;
    totalAmount: number;
    stage: string;
    designEndDate: string | null;
    printEndDate: string | null;
  }[];
};

type Stage = "all" | "pending_design" | "in_printing" | "warehouse_logistics";

type CardFilter = "total" | "overdue" | "near" | "urgent";

// ─── Stage config ─────────────────────────────────────────────
const STAGES: {
  key: Stage;
  label: string;
  icon: IconName;
  color: string;
  activeCls: string;
}[] = [
  {
    key: "all",
    label: "همه سفارشات باز",
    icon: "layers",
    color: "slate",
    activeCls: "bg-slate-600 text-white border-slate-600 shadow-sm",
  },
  {
    key: "pending_design",
    label: "در حال طراحی",
    icon: "design",
    color: "violet",
    activeCls: "bg-violet-600 text-white border-violet-600 shadow-sm",
  },
  {
    key: "in_printing",
    label: "در حال چاپ",
    icon: "print",
    color: "amber",
    activeCls: "bg-amber-600 text-white border-amber-600 shadow-sm",
  },
  {
    key: "warehouse_logistics",
    label: "انبار و لجستیک",
    icon: "warehouse",
    color: "cyan",
    activeCls: "bg-cyan-600 text-white border-cyan-600 shadow-sm",
  },
];

// Near-deadline thresholds per stage (in days)
const NEAR_THRESHOLD: Record<Stage, number> = {
  all: 5,
  pending_design: 2,
  in_printing: 5,
  warehouse_logistics: 3,
};

// ─── Deadline helpers ─────────────────────────────────────────
function getOrderOwnStageDeadline(order: Order): string | null {
  if (order.status === "pending_design") {
    return order.items[0]?.designEndDate || order.endDate;
  }
  if (order.status === "in_printing") {
    return order.items[0]?.printEndDate || order.endDate;
  }
  return order.endDate;
}

function getStageDeadline(order: Order, stage: Stage): string | null {
  if (stage === "all") return getOrderOwnStageDeadline(order);
  if (stage === "pending_design") {
    return order.items[0]?.designEndDate || order.endDate;
  }
  if (stage === "in_printing") {
    return order.items[0]?.printEndDate || order.endDate;
  }
  return order.endDate; // warehouse_logistics
}

function getNearThreshold(order: Order, stage: Stage): number {
  if (stage === "all") {
    if (order.status === "pending_design") return NEAR_THRESHOLD.pending_design;
    if (order.status === "in_printing") return NEAR_THRESHOLD.in_printing;
    if (order.status === "warehouse_logistics") return NEAR_THRESHOLD.warehouse_logistics;
    return NEAR_THRESHOLD.all;
  }
  return NEAR_THRESHOLD[stage];
}

function categorize(order: Order, stage: Stage) {
  const deadline = getStageDeadline(order, stage);
  const dr = daysRemaining(deadline);
  const threshold = getNearThreshold(order, stage);
  const isOverdue = dr.status === "overdue";
  const isNearDeadline = dr.status === "remaining" && dr.days <= threshold;
  const isToday = dr.status === "today";
  const isUrgent = order.priority === "urgent";
  return { deadline, dr, isOverdue, isNearDeadline, isToday, isUrgent };
}

// ─── Main component ───────────────────────────────────────────
export function OpenOrdersPage() {
  const invalidate = useInvalidate();
  const navigate = useAppStore((s) => s.navigate);

  const [selectedStage, setSelectedStage] = React.useState<Stage>("all");
  const [cardFilter, setCardFilter] = React.useState<CardFilter | null>(null);

  // Search combobox state
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [productSearch, setProductSearch] = React.useState("");
  const [customerFilter, setCustomerFilter] = React.useState<string | null>(null);
  const [productFilter, setProductFilter] = React.useState<string | null>(null);

  // Row click → order detail modal
  const [selectedOrderId, setSelectedOrderId] = React.useState<string | null>(null);

  // Main orders query (auto-refresh every 30s)
  const { data: ordersData, isLoading } = useQuery({
    queryKey: ["open-orders", customerFilter, productFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("excludeArchived", "true");
      if (customerFilter) params.set("customerId", customerFilter);
      if (productFilter) params.set("productId", productFilter);
      return api<{ orders: Order[] }>(`/api/orders?${params.toString()}`);
    },
    refetchInterval: 30000,
  });

  // Customers & products for search comboboxes
  const { data: customersData } = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => api<{ customers: { id: string; name: string; phone: string }[] }>("/api/customers"),
  });
  const { data: productsData } = useQuery({
    queryKey: ["products-list"],
    queryFn: () => api<{ products: { id: string; name: string }[] }>("/api/products"),
  });

  const customers = customersData?.customers ?? [];
  const products = productsData?.products ?? [];

  // Filter to only open orders (not completed/archived/cancelled)
  const openOrders = React.useMemo(() => {
    return (ordersData?.orders ?? []).filter(
      (o) => o.status !== "completed" && o.status !== "archived" && o.status !== "cancelled"
    );
  }, [ordersData]);

  // Apply stage filter
  const stageOrders = React.useMemo(() => {
    if (selectedStage === "all") return openOrders;
    return openOrders.filter((o) => o.status === selectedStage);
  }, [openOrders, selectedStage]);

  // Summary stats per stage
  const stats = React.useMemo(() => {
    let overdue = 0;
    let near = 0;
    let urgent = 0;
    for (const o of stageOrders) {
      const c = categorize(o, selectedStage);
      if (c.isOverdue) overdue++;
      if (c.isNearDeadline || c.isToday) near++;
      if (c.isUrgent) urgent++;
    }
    return {
      total: stageOrders.length,
      overdue,
      near,
      urgent,
    };
  }, [stageOrders, selectedStage]);

  // Apply card filter
  const filteredOrders = React.useMemo(() => {
    if (!cardFilter || cardFilter === "total") return stageOrders;
    return stageOrders.filter((o) => {
      const c = categorize(o, selectedStage);
      if (cardFilter === "overdue") return c.isOverdue;
      if (cardFilter === "near") return c.isNearDeadline || c.isToday;
      if (cardFilter === "urgent") return c.isUrgent;
      return true;
    });
  }, [stageOrders, cardFilter, selectedStage]);

  // Stage counts for tab badges (computed from openOrders)
  const stageCounts = React.useMemo(() => {
    const counts: Record<Stage, number> = {
      all: openOrders.length,
      pending_design: 0,
      in_printing: 0,
      warehouse_logistics: 0,
    };
    for (const o of openOrders) {
      if (o.status === "pending_design") counts.pending_design++;
      else if (o.status === "in_printing") counts.in_printing++;
      else if (o.status === "warehouse_logistics") counts.warehouse_logistics++;
    }
    return counts;
  }, [openOrders]);

  // Fetch order detail when row is clicked
  const { data: orderDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ["order", selectedOrderId],
    queryFn: () => api<OrderDetail>(`/api/orders/${selectedOrderId}`),
    enabled: !!selectedOrderId,
  });

  // Reset card filter when stage changes
  React.useEffect(() => {
    setCardFilter(null);
  }, [selectedStage]);

  function handleRefresh() {
    invalidate(["orders", "open-orders", "dashboard"]);
  }

  function handleCardClick(filter: CardFilter) {
    setCardFilter((prev) => (prev === filter ? null : filter));
  }

  function resetAllFilters() {
    setCardFilter(null);
    setCustomerFilter(null);
    setProductFilter(null);
    setCustomerSearch("");
    setProductSearch("");
  }

  const activeFilterCount =
    (customerFilter ? 1 : 0) + (productFilter ? 1 : 0) + (cardFilter ? 1 : 0);

  // ─── Columns ─────────────────────────────────────────────
  const columns = React.useMemo<ColumnDef<Order>[]>(
    () => [
      {
        accessorKey: "number",
        header: "شماره",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold">#{row.original.number}</span>
        ),
        enableSorting: true,
      },
      {
        id: "customer",
        accessorFn: (r) => r.customer.name,
        header: "مشتری",
        cell: ({ row }) => (
          <div className="min-w-[140px]">
            <div className="font-medium text-sm">{row.original.customer.name}</div>
            <div className="text-xs text-muted-foreground tabular-nums" dir="ltr">
              {row.original.customer.phone}
            </div>
          </div>
        ),
        enableSorting: true,
      },
      {
        id: "items",
        header: "آیتم‌ها",
        cell: ({ row }) => {
          const items = row.original.items;
          return (
            <div className="flex flex-wrap gap-1 max-w-[220px]">
              {items.slice(0, 2).map((it) => (
                <span
                  key={it.id}
                  className="text-xs bg-muted rounded px-1.5 py-0.5 truncate max-w-[120px]"
                >
                  {it.product.name}
                </span>
              ))}
              {items.length > 2 && (
                <span className="text-xs text-muted-foreground self-center">
                  +{items.length - 2}
                </span>
              )}
            </div>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: "status",
        header: "وضعیت",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
        enableSorting: true,
      },
      {
        id: "stageDeadline",
        accessorFn: (r) => {
          const d = getStageDeadline(r, selectedStage);
          return d ? new Date(d).getTime() : 0;
        },
        header: () => (
          <div className="flex items-center gap-1">
            <span>موعد مرحله</span>
            <span className="text-[10px] font-normal text-muted-foreground">
              ({STAGES.find((s) => s.key === selectedStage)?.label})
            </span>
          </div>
        ),
        cell: ({ row }) => {
          const o = row.original;
          const deadline = getStageDeadline(o, selectedStage);
          if (!deadline) {
            return <span className="text-xs text-muted-foreground">بدون موعد</span>;
          }
          const dr = daysRemaining(deadline);
          return (
            <div>
              <div className="text-xs tabular-nums">{formatDate(deadline)}</div>
              {dr.status !== "none" && (
                <div
                  className={cn(
                    "text-[11px] mt-0.5 flex items-center gap-1",
                    dr.status === "remaining" && "text-emerald-600",
                    dr.status === "overdue" && "text-rose-600",
                    dr.status === "today" && "text-amber-600"
                  )}
                >
                  <Icon name={dr.status === "overdue" ? "alertTriangle" : "clock"} size={11} />
                  {dr.text}
                </div>
              )}
            </div>
          );
        },
        enableSorting: true,
      },
      {
        id: "endDate",
        accessorFn: (r) => (r.endDate ? new Date(r.endDate).getTime() : 0),
        header: "موعد کلی",
        cell: ({ row }) => {
          const o = row.original;
          if (o.noEndDate) return <span className="text-xs text-muted-foreground">بدون زمان</span>;
          if (!o.endDate) return <span className="text-xs text-muted-foreground">—</span>;
          const dr = daysRemaining(o.endDate);
          return (
            <div>
              <div className="text-xs tabular-nums">{formatDate(o.endDate)}</div>
              {dr.status !== "none" && (
                <div
                  className={cn(
                    "text-[11px] mt-0.5 flex items-center gap-1",
                    dr.status === "remaining" && "text-emerald-600",
                    dr.status === "overdue" && "text-rose-600",
                    dr.status === "today" && "text-amber-600"
                  )}
                >
                  <Icon name={dr.status === "overdue" ? "alertTriangle" : "clock"} size={11} />
                  {dr.text}
                </div>
              )}
            </div>
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
        accessorKey: "totalAmount",
        header: "مبلغ",
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums text-sm" dir="ltr">
            {formatCurrency(row.original.totalAmount)}
          </span>
        ),
        enableSorting: true,
      },
      {
        id: "createdAt",
        accessorFn: (r) => new Date(r.createdAt).getTime(),
        header: "تاریخ ساخت",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDate(row.original.createdAt)}
          </span>
        ),
        enableSorting: true,
      },
    ],
    [selectedStage]
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="سفارشات باز"
        description="سفارش‌های در حال پردازش — مدیریت بر اساس مرحلهٔ جریان کار"
        icon="clock"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handleRefresh} aria-label="بازخوانی">
              <Icon name="refresh" size={16} />
            </Button>
            <Button onClick={() => navigate("admin", "orders-new")} className="gap-2">
              <Icon name="plus" size={16} /> سفارش جدید
            </Button>
          </div>
        }
      />

      {/* ─── Stage tabs ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {STAGES.map((s) => {
          const isActive = selectedStage === s.key;
          const count = stageCounts[s.key];
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSelectedStage(s.key)}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl border px-4 py-3 transition-all text-right",
                isActive
                  ? s.activeCls
                  : "bg-background border-input hover:border-foreground/30 text-foreground"
              )}
            >
              <div
                className={cn(
                  "size-9 rounded-lg grid place-items-center shrink-0 transition-colors",
                  isActive
                    ? "bg-white/15"
                    : cn(
                        "bg-muted",
                        s.color === "violet" && "text-violet-600",
                        s.color === "amber" && "text-amber-600",
                        s.color === "cyan" && "text-cyan-600",
                        s.color === "slate" && "text-slate-600"
                      )
                )}
              >
                <Icon name={s.icon} size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{s.label}</div>
                <div
                  className={cn(
                    "text-xs mt-0.5 tabular-nums",
                    isActive ? "text-white/80" : "text-muted-foreground"
                  )}
                >
                  {count} سفارش
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ─── Summary cards (interactive) ───────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="کل سفارشات"
          value={stats.total}
          icon="orders"
          tone="slate"
          active={cardFilter === null || cardFilter === "total"}
          onClick={() => handleCardClick("total")}
        />
        <SummaryCard
          label="تأخیر شده"
          value={stats.overdue}
          icon="alertTriangle"
          tone="rose"
          active={cardFilter === "overdue"}
          onClick={() => handleCardClick("overdue")}
          hint="موعد مرحله گذشته است"
        />
        <SummaryCard
          label="نزدیک موعد"
          value={stats.near}
          icon="clock"
          tone="amber"
          active={cardFilter === "near"}
          onClick={() => handleCardClick("near")}
          hint={`حداکثر ${NEAR_THRESHOLD[selectedStage]} روز باقی مانده`}
        />
        <SummaryCard
          label="فوری"
          value={stats.urgent}
          icon="alert"
          tone="rose"
          active={cardFilter === "urgent"}
          onClick={() => handleCardClick("urgent")}
          hint="اولویت فوری"
        />
      </div>

      {/* ─── Active filter chip + search ───────────────────── */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchCombobox
            value={customerFilter}
            onChange={setCustomerFilter}
            search={customerSearch}
            onSearchChange={setCustomerSearch}
            placeholder="جستجوی مشتری (نام یا شماره)..."
            emptyText="مشتری‌ای یافت نشد"
            options={customers.map((c) => ({ value: c.id, label: c.name, sub: c.phone }))}
            icon="customers"
            className="w-60"
          />
          <SearchCombobox
            value={productFilter}
            onChange={setProductFilter}
            search={productSearch}
            onSearchChange={setProductSearch}
            placeholder="جستجوی محصول..."
            emptyText="محصولی یافت نشد"
            options={products.map((p) => ({ value: p.id, label: p.name }))}
            icon="package"
            className="w-52"
          />

          {/* Active card filter chip */}
          {cardFilter && cardFilter !== "total" && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary border border-primary/30 px-2.5 py-1 text-xs font-medium">
              <Icon
                name={
                  cardFilter === "overdue"
                    ? "alertTriangle"
                    : cardFilter === "near"
                    ? "clock"
                    : "alert"
                }
                size={12}
              />
              {cardFilter === "overdue"
                ? "تأخیر شده"
                : cardFilter === "near"
                ? "نزدیک موعد"
                : "فوری"}
              <button
                type="button"
                onClick={() => setCardFilter(null)}
                className="size-4 grid place-items-center rounded-full hover:bg-primary/20 transition"
                aria-label="پاک کردن فیلتر"
              >
                <Icon name="cancel" size={11} />
              </button>
            </div>
          )}

          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={resetAllFilters}
            >
              <Icon name="cancel" size={14} /> پاک کردن همه ({activeFilterCount})
            </Button>
          )}

          <div className="mr-auto text-xs text-muted-foreground tabular-nums">
            {filteredOrders.length} سفارش
          </div>
        </div>
      </Card>

      {/* ─── Data table ────────────────────────────────────── */}
      <Card className="p-4">
        <DataTable
          columns={columns}
          data={filteredOrders}
          isLoading={isLoading}
          pageSize={10}
          showColumnToggle
          onRowClick={(o) => setSelectedOrderId(o.id)}
          emptyState={
            <EmptyState
              icon="orders"
              title="سفارشی یافت نشد"
              description="با فیلترهای فعلی سفارش بازی وجود ندارد."
              action={
                <Button onClick={() => navigate("admin", "orders-new")} className="gap-2">
                  <Icon name="plus" size={16} /> ایجاد سفارش
                </Button>
              }
            />
          }
        />
      </Card>

      {/* ─── Order detail modal ────────────────────────────── */}
      <OrderDetailModal
        order={orderDetail ?? null}
        open={!!selectedOrderId}
        onOpenChange={(o) => {
          if (!o) setSelectedOrderId(null);
        }}
      />

      {/* Loading overlay for detail fetch */}
      {isLoadingDetail && selectedOrderId && (
        <div className="fixed inset-0 z-50 pointer-events-none grid place-items-center">
          <div className="pointer-events-auto bg-background/95 backdrop-blur border rounded-xl shadow-lg px-4 py-3 flex items-center gap-2">
            <Icon name="loading" size={16} className="animate-spin text-primary" />
            <span className="text-sm">بارگذاری جزئیات سفارش...</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────
function SummaryCard({
  label,
  value,
  icon,
  tone,
  active,
  onClick,
  hint,
}: {
  label: string;
  value: number;
  icon: IconName;
  tone: "slate" | "rose" | "amber" | "emerald";
  active: boolean;
  onClick: () => void;
  hint?: string;
}) {
  const toneCls = {
    slate: {
      icon: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
      ring: "border-slate-400 dark:border-slate-500",
      value: "text-slate-700 dark:text-slate-200",
    },
    rose: {
      icon: "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300",
      ring: "border-rose-400 dark:border-rose-500",
      value: "text-rose-700 dark:text-rose-300",
    },
    amber: {
      icon: "bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300",
      ring: "border-amber-400 dark:border-amber-500",
      value: "text-amber-700 dark:text-amber-300",
    },
    emerald: {
      icon: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300",
      ring: "border-emerald-400 dark:border-emerald-500",
      value: "text-emerald-700 dark:text-emerald-300",
    },
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border bg-card p-3.5 text-right transition-all",
        active
          ? cn(toneCls.ring, "ring-1 shadow-sm")
          : "border-input hover:border-foreground/30"
      )}
    >
      <div className={cn("size-10 rounded-lg grid place-items-center shrink-0", toneCls.icon)}>
        <Icon name={icon} size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className={cn("text-2xl font-bold tabular-nums leading-tight mt-0.5", toneCls.value)}>
          {value}
        </div>
        {hint && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</div>}
      </div>
      {active && (
        <div className="absolute top-2 left-2 size-2 rounded-full bg-primary" aria-hidden />
      )}
    </button>
  );
}

// ─── Search Combobox (dropdown + search) ──────────────────────
function SearchCombobox({
  value,
  onChange,
  search,
  onSearchChange,
  placeholder,
  emptyText,
  options,
  icon,
  className,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  search: string;
  onSearchChange: (v: string) => void;
  placeholder: string;
  emptyText: string;
  options: { value: string; label: string; sub?: string }[];
  icon: "customers" | "package";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);
  const filtered = options.filter(
    (o) => !search || o.label.includes(search) || (o.sub?.includes(search) ?? false)
  );

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) onSearchChange("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          role="combobox"
          aria-expanded={open}
          aria-controls="open-orders-search-list"
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm hover:bg-accent/50 transition min-w-0",
            className
          )}
        >
          <Icon name={icon} size={16} className="text-muted-foreground shrink-0" />
          <span className={cn("truncate flex-1 text-right", !selected && "text-muted-foreground")}>
            {selected ? (
              <span className="flex items-center gap-2">
                <span>{selected.label}</span>
                {selected.sub && (
                  <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                    {selected.sub}
                  </span>
                )}
              </span>
            ) : (
              placeholder
            )}
          </span>
          <Icon name="chevronDown" size={14} className="text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Icon name="search" size={14} className="text-muted-foreground" />
            <CommandInput
              placeholder={placeholder}
              value={search}
              onValueChange={onSearchChange}
              className="border-0 focus:ring-0 h-9"
            />
          </div>
          <CommandList className="max-h-60 scrollbar-thin" id="open-orders-search-list">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filtered.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.sub ?? ""}`}
                  onSelect={() => {
                    onChange(o.value === value ? null : o.value);
                    setOpen(false);
                    onSearchChange("");
                  }}
                  className="gap-2"
                >
                  <Icon
                    name={value === o.value ? "check" : icon}
                    size={14}
                    className={value === o.value ? "text-primary" : "text-muted-foreground opacity-0"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{o.label}</div>
                    {o.sub && (
                      <div className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                        {o.sub}
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {value && (
          <div className="border-t p-1">
            <button
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 flex items-center justify-center gap-1"
            >
              <Icon name="cancel" size={12} /> پاک کردن انتخاب
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
