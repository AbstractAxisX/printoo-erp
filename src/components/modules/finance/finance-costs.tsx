"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  PageHeader,
  EmptyState,
} from "@/components/shared";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleButton } from "@/components/ui/toggle-button";
import { formatCurrency, formatDate } from "@/lib/format";
import { useAppStore } from "@/stores/app-store";
import { useCostDetail } from "@/lib/use-cost-detail";
import { cn } from "@/lib/utils";
import type { MaterialCost } from "./finance-cost-detail";

// ─── Module & status meta ─────────────────────────────────────────────
const MODULE_META: Record<
  string,
  { label: string; icon: IconName; color: string }
> = {
  print: {
    label: "چاپ",
    icon: "print",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  },
  warehouse: {
    label: "انبار",
    icon: "warehouse",
    color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
  },
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "در انتظار",
  approved: "تأیید شده",
  rejected: "رد شده",
};

// ─── Component ────────────────────────────────────────────────────────
export function FinanceCosts() {
  const navigate = useAppStore((s) => s.navigate);
  const { openCost, modal } = useCostDetail();

  // Filter state
  const [search, setSearch] = React.useState("");
  const [statusFilters, setStatusFilters] = React.useState<{
    pending: boolean;
    approved: boolean;
    rejected: boolean;
  }>({
    pending: true,
    approved: true,
    rejected: true,
  });
  const [moduleFilters, setModuleFilters] = React.useState<{
    print: boolean;
    warehouse: boolean;
  }>({
    print: true,
    warehouse: true,
  });

  // Fetch all material costs
  const { data, isLoading } = useQuery({
    queryKey: ["material-costs", "list"],
    queryFn: () => api<{ costs: MaterialCost[] }>("/api/material-costs"),
    refetchInterval: 30000,
  });

  const allCosts = data?.costs ?? [];

  // Apply search + filters
  const filteredCosts = React.useMemo(() => {
    return allCosts.filter((c) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const num = String(c.order?.number ?? "");
        const desc = (c.description ?? "").toLowerCase();
        if (!num.includes(q) && !desc.includes(q)) return false;
      }
      if (!statusFilters[c.status as keyof typeof statusFilters]) return false;
      if (moduleFilters[c.module as keyof typeof moduleFilters] === false) return false;
      return true;
    });
  }, [allCosts, search, statusFilters, moduleFilters]);

  // Summary row computations
  const totalPending = filteredCosts
    .filter((c) => c.status === "pending")
    .reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalApproved = filteredCosts
    .filter((c) => c.status === "approved")
    .reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalRejected = filteredCosts
    .filter((c) => c.status === "rejected")
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  // Columns
  const columns = React.useMemo<ColumnDef<MaterialCost>[]>(
    () => [
      {
        accessorKey: "number",
        header: "شماره سفارش",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold">
            #{row.original.order?.number ?? "—"}
          </span>
        ),
        enableSorting: true,
      },
      {
        id: "customer",
        accessorFn: (r) => r.order?.customer?.name ?? "",
        header: "مشتری",
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.order?.customer?.name ?? "—"}
          </span>
        ),
        enableSorting: true,
      },
      {
        id: "supplier",
        accessorFn: (r) => r.supplier?.name ?? "",
        header: "تامین‌کننده",
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.supplier?.name ?? "—"}
          </span>
        ),
        enableSorting: true,
      },
      {
        id: "expenseType",
        accessorFn: (r) => r.expenseType?.name ?? "",
        header: "نوع هزینه",
        cell: ({ row }) => (
          <span className="text-xs px-2 py-0.5 rounded bg-muted">
            {row.original.expenseType?.name ?? "—"}
          </span>
        ),
        enableSorting: true,
      },
      {
        id: "description",
        accessorFn: (r) => r.description ?? "",
        header: "توضیحات",
        cell: ({ row }) => (
          <span
            className="text-xs text-muted-foreground line-clamp-1 max-w-[220px] inline-block"
            title={row.original.description ?? ""}
          >
            {row.original.description || "—"}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: "amount",
        accessorFn: (r) => r.amount,
        header: "مبلغ (IQD)",
        cell: ({ row }) => (
          <span className="text-sm font-bold tabular-nums" dir="ltr">
            {formatCurrency(row.original.amount)}
          </span>
        ),
        enableSorting: true,
      },
      {
        id: "status",
        accessorFn: (r) => r.status,
        header: "وضعیت",
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
              STATUS_BADGE[row.original.status] ?? "bg-muted text-muted-foreground"
            )}
          >
            {STATUS_LABEL[row.original.status] ?? row.original.status}
          </span>
        ),
        enableSorting: true,
      },
      {
        id: "module",
        accessorFn: (r) => r.module,
        header: "ماژول",
        cell: ({ row }) => {
          const meta =
            MODULE_META[row.original.module] ?? {
              label: row.original.module,
              icon: "wallet" as IconName,
              color: "bg-muted text-muted-foreground",
            };
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                meta.color
              )}
            >
              <Icon name={meta.icon} size={11} />
              {meta.label}
            </span>
          );
        },
        enableSorting: true,
      },
      {
        id: "createdAt",
        accessorFn: (r) => new Date(r.createdAt).getTime(),
        header: "تاریخ",
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatDate(row.original.createdAt)}
          </span>
        ),
        enableSorting: true,
      },
    ],
    []
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="هزینه‌های مالی"
        description="همه هزینه‌های ثبت‌شده توسط ماژول‌های چاپ و انبار"
        icon="money"
        actions={
          <Button
            variant="outline"
            onClick={() => navigate("finance", "dashboard")}
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
              placeholder="جستجو بر اساس شماره سفارش یا توضیحات..."
              className="w-full h-9 rounded-md border bg-background pr-9 pl-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="mr-auto text-xs text-muted-foreground">
            مجموع: {filteredCosts.length} از {allCosts.length} هزینه
          </div>
        </div>

        {/* Status filter toggles */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground shrink-0">وضعیت:</span>
          <ToggleButton
            checked={statusFilters.pending}
            onChange={(v) => setStatusFilters((p) => ({ ...p, pending: v }))}
            label="در انتظار"
            size="sm"
            activeColor="primary"
          />
          <ToggleButton
            checked={statusFilters.approved}
            onChange={(v) => setStatusFilters((p) => ({ ...p, approved: v }))}
            label="تأیید شده"
            size="sm"
            activeColor="emerald"
          />
          <ToggleButton
            checked={statusFilters.rejected}
            onChange={(v) => setStatusFilters((p) => ({ ...p, rejected: v }))}
            label="رد شده"
            size="sm"
            activeColor="primary"
            activeIcon="alert"
            inactiveIcon="cancel"
          />
        </div>

        {/* Module filter toggles */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground shrink-0">ماژول:</span>
          <ToggleButton
            checked={moduleFilters.print}
            onChange={(v) => setModuleFilters((p) => ({ ...p, print: v }))}
            label="چاپ"
            size="sm"
            activeColor="primary"
          />
          <ToggleButton
            checked={moduleFilters.warehouse}
            onChange={(v) => setModuleFilters((p) => ({ ...p, warehouse: v }))}
            label="انبار"
            size="sm"
            activeColor="primary"
          />
        </div>
      </Card>

      {/* Summary row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-3 ring-1 ring-amber-500/20 bg-amber-50/40 dark:bg-amber-950/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] text-muted-foreground">مجموع در انتظار</div>
              <div className="text-sm font-bold tabular-nums mt-0.5" dir="ltr">
                {formatCurrency(totalPending)}
              </div>
            </div>
            <div className="size-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 grid place-items-center">
              <Icon name="clock" size={16} />
            </div>
          </div>
        </Card>
        <Card className="p-3 ring-1 ring-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] text-muted-foreground">مجموع تأیید شده</div>
              <div className="text-sm font-bold tabular-nums mt-0.5" dir="ltr">
                {formatCurrency(totalApproved)}
              </div>
            </div>
            <div className="size-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 grid place-items-center">
              <Icon name="checkCircle" size={16} />
            </div>
          </div>
        </Card>
        <Card className="p-3 ring-1 ring-rose-500/20 bg-rose-50/40 dark:bg-rose-950/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] text-muted-foreground">مجموع رد شده</div>
              <div className="text-sm font-bold tabular-nums mt-0.5" dir="ltr">
                {formatCurrency(totalRejected)}
              </div>
            </div>
            <div className="size-8 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 grid place-items-center">
              <Icon name="cancel" size={16} />
            </div>
          </div>
        </Card>
      </div>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredCosts}
          isLoading={isLoading}
          onRowClick={(row) => openCost(row.id)}
          showColumnToggle={false}
          pageSize={15}
          emptyState={
            <EmptyState
              icon="money"
              title="هزینه‌ای یافت نشد"
              description="با فیلترهای فعلی هزینه‌ای برای نمایش وجود ندارد"
            />
          }
        />
      </Card>

      {modal}
    </div>
  );
}
