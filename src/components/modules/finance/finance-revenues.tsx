"use client";

// ─── Phase 15: درآمدها — دفتر درآمد ریز-به-ریز ────────────────────────
// هر تغییری در «پرداخت‌شدهٔ» سفارش‌ها با تفاضل هوشمند: چه مبلغ جدیدی،
// کی و چه ساعتی، توسط کدام کارمند و از کدام ماژول (مالی/ادمین/لجستیک)
// ثبت شد — به تفکیک سفارش با شناسه و مشتری.

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/shared";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { DataTable } from "@/components/ui/data-table";
import { TimeRangePicker } from "@/components/ui/time-range-picker";
import { getPreset, type TimeRange } from "@/lib/time-ranges";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";

// ─── Types ─────────────────────────────────────────────────────────────

type RevenueLog = {
  id: string;
  orderId: string;
  amount: number;
  totalAfter: number;
  module: string;
  method: string | null;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
  order: {
    id: string;
    number: number;
    status: string;
    totalAmount: number;
    paidAmount: number;
    customer: { id: string; name: string } | null;
  } | null;
};

// ─── Meta ──────────────────────────────────────────────────────────────

const MODULE_META: Record<string, { label: string; color: string; icon: IconName }> = {
  finance: { label: "مالی", color: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300", icon: "wallet" },
  admin: { label: "ادمین داخلی", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300", icon: "dashboard" },
  logistics: { label: "لجستیک", color: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300", icon: "truck" },
  other: { label: "سایر", color: "bg-muted text-muted-foreground", icon: "info" },
};

const METHOD_LABEL: Record<string, string> = {
  cash: "نقدی",
  transfer: "کارت به کارت",
  cheque: "چک",
};

// ─── Page ──────────────────────────────────────────────────────────────

export function FinanceRevenues() {
  const [range, setRange] = React.useState<TimeRange>(() => getPreset("this-month"));
  const [module, setModule] = React.useState<string>("");
  const [q, setQ] = React.useState("");

  const params = new URLSearchParams({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  });
  if (module) params.set("module", module);

  const { data, isLoading } = useQuery({
    queryKey: ["revenues", params.toString()],
    queryFn: () => api<{ logs: RevenueLog[] }>(`/api/revenues?${params.toString()}`),
    refetchInterval: 60_000,
  });

  const logs = React.useMemo(() => {
    const all = data?.logs ?? [];
    const query = q.trim().toLowerCase();
    if (!query) return all;
    return all.filter((l) =>
      `${l.order?.number ?? ""} ${l.order?.customer?.name ?? ""} ${l.createdByName ?? ""} ${
        l.note ?? ""
      }`
        .toLowerCase()
        .includes(query)
    );
  }, [data, q]);

  const totalRevenue = logs.reduce((s, l) => s + l.amount, 0);
  const positiveCount = logs.filter((l) => l.amount > 0).length;

  const columns = React.useMemo<ColumnDef<RevenueLog>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "تاریخ و ساعت",
        cell: ({ row }) => (
          <div className="text-xs tabular-nums text-muted-foreground" dir="ltr">
            {formatDateTime(row.original.createdAt)}
          </div>
        ),
      },
      {
        id: "order",
        header: "سفارش",
        cell: ({ row }) => {
          const o = row.original.order;
          return (
            <div className="min-w-0">
              <div className="font-mono text-xs font-bold">#{o?.number ?? "—"}</div>
              <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                {o?.customer?.name ?? "—"}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "amount",
        header: "درآمد جدید",
        meta: { align: "end" },
        cell: ({ row }) => {
          const a = row.original.amount;
          return (
            <span
              className={cn(
                "font-bold tabular-nums inline-flex items-center gap-1",
                a > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              )}
              dir="ltr"
            >
              {a > 0 ? <Icon name="arrowUp" size={11} /> : <Icon name="arrowDown" size={11} />}
              {a > 0 ? "+" : "−"}
              {formatCurrency(Math.abs(a))}
            </span>
          );
        },
      },
      {
        accessorKey: "totalAfter",
        header: "کل پرداخت‌شده",
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="font-medium tabular-nums text-muted-foreground" dir="ltr">
            {formatCurrency(row.original.totalAfter)}
          </span>
        ),
      },
      {
        accessorKey: "module",
        header: "ثبت از",
        cell: ({ row }) => {
          const m = MODULE_META[row.original.module] ?? MODULE_META.other;
          return (
            <span
              className={cn("text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-0.5", m.color)}
            >
              <Icon name={m.icon} size={9} />
              {m.label}
            </span>
          );
        },
      },
      {
        id: "creator",
        header: "ثبت‌کننده",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground truncate block max-w-[120px]">
            {row.original.createdByName ?? "—"}
          </span>
        ),
      },
      {
        id: "method",
        header: "روش",
        cell: ({ row }) => {
          const method = row.original.method;
          return method ? (
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {METHOD_LABEL[method] ?? method}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          );
        },
      },
      {
        id: "note",
        header: "یادداشت",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground truncate block max-w-[200px]">
            {row.original.note ?? "—"}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="درآمدها"
        icon="trending"
        actions={<TimeRangePicker value={range} onChange={setRange} compact />}
      />

      {/* جمع‌ها */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-3.5 ring-1 ring-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/10">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Icon name="trending" size={13} className="text-emerald-600" />
            مجموع درآمد ({range.label})
          </div>
          <div className="text-lg font-bold tabular-nums mt-1.5" dir="ltr">
            {formatCurrency(totalRevenue)}
          </div>
        </Card>
        <Card className="p-3.5 ring-1 ring-emerald-500/10">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Icon name="arrowUp" size={13} className="text-emerald-600" />
            دریافتی‌های جدید
          </div>
          <div className="text-lg font-bold tabular-nums mt-1.5">
            {positiveCount.toLocaleString("fa-IR")}
          </div>
        </Card>
        <Card className="p-3.5 ring-1 ring-rose-500/10">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Icon name="arrowDown" size={13} className="text-rose-600" />
            اصلاح‌های کاهشی
          </div>
          <div className="text-lg font-bold tabular-nums mt-1.5">
            {(logs.length - positiveCount).toLocaleString("fa-IR")}
          </div>
        </Card>
      </div>

      {/* فیلتر */}
      <Card className="p-4 flex items-center gap-2 flex-wrap">
        <div className="relative w-64">
          <Icon
            name="search"
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجو: سفارش، مشتری، کارمند…"
            className="pr-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
          {[
            { id: "", label: "همه" },
            { id: "finance", label: "مالی" },
            { id: "admin", label: "ادمین" },
            { id: "logistics", label: "لجستیک" },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setModule(m.id)}
              className={cn(
                "inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                module === m.id
                  ? "bg-background text-foreground shadow-sm border"
                  : "text-muted-foreground hover:bg-background/60"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="mr-auto text-xs text-muted-foreground tabular-nums">
          {logs.length.toLocaleString("fa-IR")} ثبت
        </span>
      </Card>

      {/* جدول */}
      <Card className="p-4">
        <DataTable
          columns={columns}
          data={logs}
          isLoading={isLoading}
          pageSize={12}
          emptyState={
            <EmptyState
              icon="trending"
              title="درآمدی در این بازه ثبت نشده"
              description="هر پرداخت مشتری (از مالی، ادمین یا لجستیک) اینجا ریز-به-ریز ثبت می‌شود"
            />
          }
        />
      </Card>
    </div>
  );
}
