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
import { Icon } from "@/lib/icons";
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
    designStartDate: string | null;
    designEndDate: string | null;
  }[];
};

// ─── Component ────────────────────────────────────────────────────────
export function DesignerOrders() {
  const navigate = useAppStore((s) => s.navigate);
  const { openOrder, modal } = useDesignerOrderDetail();

  // Filter state
  const [search, setSearch] = React.useState("");
  const [priorityFilters, setPriorityFilters] = React.useState<{
    urgent: boolean;
    normal: boolean;
  }>({ urgent: true, normal: true });

  // Fetch orders filtered by status=pending_design
  const { data, isLoading } = useQuery({
    queryKey: ["orders", "designer", "pending_design", "list"],
    queryFn: () =>
      api<{ orders: DesignerOrder[] }>("/api/orders?status=pending_design&board=designer"),
    refetchInterval: 30000,
  });

  const allOrders = data?.orders ?? [];

  // Client-side filter: customer name search + priority
  const orders = React.useMemo(() => {
    return allOrders.filter((o) => {
      // Search by customer name
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!(o.customer?.name ?? "").toLowerCase().includes(q)) return false;
      }
      // Priority filter
      if (o.priority === "urgent" && !priorityFilters.urgent) return false;
      if (o.priority === "normal" && !priorityFilters.normal) return false;
      return true;
    });
  }, [allOrders, search, priorityFilters]);

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
          const d = r.items?.[0]?.designEndDate;
          return d ? new Date(d).getTime() : 0;
        },
        header: "موعد طراحی",
        cell: ({ row }) => {
          const end = row.original.items?.[0]?.designEndDate ?? null;
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

      {/* Filters bar */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search input */}
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Icon
              name="search"
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجو بر اساس نام مشتری..."
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
            {orders.length} سفارش
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
            <EmptyState
              icon="checkCircle"
              title="سفارشی در مرحله طراحی نیست"
              description="همه سفارشات طراحی به مرحله بعد ارسال شده‌اند"
            />
          }
        />
      </Card>

      {modal}
    </div>
  );
}
