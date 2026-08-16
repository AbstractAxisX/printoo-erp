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
import { Icon } from "@/lib/icons";
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
    needsMaterial: boolean;
    materialConfirmed: boolean;
    printStartDate: string | null;
    printEndDate: string | null;
  }[];
};

// ─── Helpers ──────────────────────────────────────────────────────────
function needsMaterial(o: PrintOrder): boolean {
  return (o.items ?? []).some((it) => it.needsMaterial && !it.materialConfirmed);
}

function isReadyForPrint(o: PrintOrder): boolean {
  return !needsMaterial(o);
}

function printEndDate(o: PrintOrder): string | null {
  return o.items?.[0]?.printEndDate ?? null;
}

// ─── Component ────────────────────────────────────────────────────────
export function PrintOrders() {
  const navigate = useAppStore((s) => s.navigate);
  const { openOrder, modal } = usePrintOrderDetail();
  const [activeTab, setActiveTab] = React.useState("needs-material");

  // Filter state
  const [search, setSearch] = React.useState("");
  const [priorityFilters, setPriorityFilters] = React.useState<{
    urgent: boolean;
    normal: boolean;
  }>({ urgent: true, normal: true });

  // Fetch orders filtered by status=in_printing
  const { data, isLoading } = useQuery({
    queryKey: ["orders", "print", "in_printing", "list"],
    queryFn: () =>
      api<{ orders: PrintOrder[] }>("/api/orders?status=in_printing"),
    refetchInterval: 30000,
  });

  const allOrders = data?.orders ?? [];

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

  // Apply search + priority filter
  function applyFilters(list: PrintOrder[]): PrintOrder[] {
    return list.filter((o) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!(o.customer?.name ?? "").toLowerCase().includes(q)) return false;
      }
      if (o.priority === "urgent" && !priorityFilters.urgent) return false;
      if (o.priority === "normal" && !priorityFilters.normal) return false;
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
        id: "priority",
        accessorFn: (r) => r.priority,
        header: "اولویت",
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
        enableSorting: true,
      },
      {
        id: "printEndDate",
        accessorFn: (r) => {
          const d = printEndDate(r);
          return d ? new Date(d).getTime() : 0;
        },
        header: "موعد چاپ",
        cell: ({ row }) => {
          const end = printEndDate(row.original);
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
            مجموع: {allOrders.length} سفارش ({needsMaterialOrders.length}{" "}
            نیازمند متریال، {readyOrders.length} آماده چاپ)
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="needs-material" className="gap-1.5">
            <Icon name="alertTriangle" size={14} />
            نیازمند متریال
            <span className="text-[11px] text-muted-foreground">
              ({filteredNeedsMaterial.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="ready" className="gap-1.5">
            <Icon name="print" size={14} />
            آماده چاپ
            <span className="text-[11px] text-muted-foreground">
              ({filteredReady.length})
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
                <EmptyState
                  icon="checkCircle"
                  title="سفارش نیازمند متریال نیست"
                  description="همه سفارشات چاپ متریال خود را دریافت کرده‌اند"
                />
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
                <EmptyState
                  icon="inbox"
                  title="سفارش آماده چاپ نیست"
                  description="سفارشات در انتظار تأمین متریال هستند"
                />
              }
            />
          </Card>
        </TabsContent>
      </Tabs>

      {modal}
    </div>
  );
}
