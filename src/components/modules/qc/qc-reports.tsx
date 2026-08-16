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
import { formatDate } from "@/lib/format";
import { useAppStore } from "@/stores/app-store";
import { useQcReportDetail } from "@/lib/use-qc-report-detail";
import { cn } from "@/lib/utils";
import type { QcReport } from "./qc-report-detail";

// ─── Module & status meta ─────────────────────────────────────────────
const MODULE_META: Record<
  string,
  { label: string; icon: IconName; color: string }
> = {
  designer: {
    label: "طراح",
    icon: "design",
    color: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  },
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
  reviewing: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "در انتظار",
  reviewing: "در حال بررسی",
  approved: "تأیید شده",
  rejected: "رد شده",
};

// ─── Component ────────────────────────────────────────────────────────
export function QcReports() {
  const navigate = useAppStore((s) => s.navigate);
  const { openReport, modal } = useQcReportDetail();

  // Filter state
  const [search, setSearch] = React.useState("");
  const [statusFilters, setStatusFilters] = React.useState<{
    pending: boolean;
    reviewing: boolean;
    approved: boolean;
    rejected: boolean;
  }>({
    pending: true,
    reviewing: true,
    approved: true,
    rejected: true,
  });
  const [moduleFilters, setModuleFilters] = React.useState<{
    designer: boolean;
    print: boolean;
    warehouse: boolean;
  }>({
    designer: true,
    print: true,
    warehouse: true,
  });

  // Fetch all QC reports
  const { data, isLoading } = useQuery({
    queryKey: ["qc-reports", "list"],
    queryFn: () => api<{ reports: QcReport[] }>("/api/qc-reports"),
    refetchInterval: 30000,
  });

  const allReports = data?.reports ?? [];

  // Apply search + filters
  const filteredReports = React.useMemo(() => {
    return allReports.filter((r) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const num = String(r.order?.number ?? "");
        const cust = (r.order?.customer?.name ?? "").toLowerCase();
        if (!num.includes(q) && !cust.includes(q)) return false;
      }
      if (!statusFilters[r.status as keyof typeof statusFilters]) return false;
      if (
        moduleFilters[r.fromModule as keyof typeof moduleFilters] === false
      )
        return false;
      return true;
    });
  }, [allReports, search, statusFilters, moduleFilters]);

  // Columns
  const columns = React.useMemo<ColumnDef<QcReport>[]>(
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
        id: "fromModule",
        accessorFn: (r) => r.fromModule,
        header: "ماژول گزارش‌دهنده",
        cell: ({ row }) => {
          const meta =
            MODULE_META[row.original.fromModule] ?? {
              label: row.original.fromModule,
              icon: "shield" as IconName,
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
        id: "description",
        accessorFn: (r) => r.description ?? "",
        header: "توضیحات",
        cell: ({ row }) => (
          <span
            className="text-xs text-muted-foreground line-clamp-1 max-w-[280px] inline-block"
            title={row.original.description}
          >
            {row.original.description || "—"}
          </span>
        ),
        enableSorting: false,
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
        title="گزارشات کنترل کیفیت"
        description="همه گزارشات دریافتی از ماژول‌های طراح، چاپ و انبار"
        icon="checkList"
        actions={
          <Button
            variant="outline"
            onClick={() => navigate("qc", "dashboard")}
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
              placeholder="جستجو بر اساس شماره سفارش یا نام مشتری..."
              className="w-full h-9 rounded-md border bg-background pr-9 pl-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="mr-auto text-xs text-muted-foreground">
            مجموع: {filteredReports.length} از {allReports.length} گزارش
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
            checked={statusFilters.reviewing}
            onChange={(v) => setStatusFilters((p) => ({ ...p, reviewing: v }))}
            label="در حال بررسی"
            size="sm"
            activeColor="amber"
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
            checked={moduleFilters.designer}
            onChange={(v) => setModuleFilters((p) => ({ ...p, designer: v }))}
            label="طراح"
            size="sm"
            activeColor="primary"
          />
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

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredReports}
          isLoading={isLoading}
          onRowClick={(row) => openReport(row.id)}
          showColumnToggle={false}
          pageSize={15}
          emptyState={
            <EmptyState
              icon="checkList"
              title="گزارشی یافت نشد"
              description="با فیلترهای فعلی گزارشی برای نمایش وجود ندارد"
            />
          }
        />
      </Card>

      {modal}
    </div>
  );
}
