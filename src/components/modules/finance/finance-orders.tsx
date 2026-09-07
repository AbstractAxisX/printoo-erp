"use client";

// ─── Phase 15: سفارش‌ها — نمای مالی ──────────────────────────────────
// همهٔ سفارش‌های سیستم (باز + بسته) با فیلترهای کامل؛ کلیک روی هر سفارش
// → مودال «معرفی + تاریخچهٔ مالی» (فاکتور/پیش‌فاکتور/درآمد/هزینه).

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, EmptyState, StatusBadge } from "@/components/shared";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { FinanceOrderModal } from "./finance-order-modal";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";

// ─── Types ─────────────────────────────────────────────────────────────

type Order = {
  id: string;
  number: number;
  status: string;
  priority: string;
  createdAt: string;
  endDate: string | null;
  totalAmount: number;
  paidAmount: number;
  customer: { id: string; name: string; phone: string };
  items: { id: string; stage: string; product: { name: string } }[];
};

const OPEN_STATUSES = ["pending_design", "in_printing", "warehouse_logistics"];
const CLOSED_STATUSES = ["completed", "archived", "cancelled"];

const STATUS_LABELS: Record<string, string> = {
  pending_design: "در انتظار طراحی",
  in_printing: "در حال چاپ",
  warehouse_logistics: "انبار و لجستیک",
  completed: "تکمیل‌شده",
  archived: "آرشیو",
  cancelled: "باطل‌شده",
};

const STATUS_TONE: Record<string, string> = {
  pending_design: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  in_printing: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  warehouse_logistics: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  archived: "bg-muted text-muted-foreground",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
};

// «الان کجاست» — برجسته‌ترین مرحلهٔ فعال
function activeStageOf(o: Order): { label: string; cls: string } {
  const stages = o.items.map((i) => i.stage);
  if (stages.some((s) => s === "design")) return { label: "طراحی", cls: STATUS_TONE.pending_design };
  if (stages.some((s) => s === "print")) return { label: "چاپ", cls: STATUS_TONE.in_printing };
  if (stages.some((s) => s === "warehouse")) return { label: "انبار/لجستیک", cls: STATUS_TONE.warehouse_logistics };
  if (o.status === "cancelled") return { label: "باطل", cls: STATUS_TONE.cancelled };
  return { label: "تکمیل", cls: STATUS_TONE.completed };
}

// ─── Page ──────────────────────────────────────────────────────────────

export function FinanceOrders() {
  const [q, setQ] = React.useState("");
  const [view, setView] = React.useState<"open" | "closed" | "all">("open");
  const [statusSet, setStatusSet] = React.useState<Set<string>>(new Set());
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["orders", "finance-list"],
    queryFn: () => api<{ orders: Order[] }>("/api/orders?excludeArchived=false"),
    refetchInterval: 60_000,
  });

  const rows = React.useMemo(() => {
    let all = data?.orders ?? [];
    if (view === "open") all = all.filter((o) => OPEN_STATUSES.includes(o.status));
    if (view === "closed") all = all.filter((o) => CLOSED_STATUSES.includes(o.status));
    if (statusSet.size > 0) all = all.filter((o) => statusSet.has(o.status));
    const query = q.trim().toLowerCase();
    if (query) {
      all = all.filter((o) =>
        `${o.number} ${o.customer?.name ?? ""} ${o.customer?.phone ?? ""}`.toLowerCase().includes(query)
      );
    }
    return all;
  }, [data, view, statusSet, q]);

  const openOrder = (id: string) => {
    setOpenId(id);
    setModalOpen(true);
  };

  const columns = React.useMemo<ColumnDef<Order>[]>(
    () => [
      {
        accessorKey: "number",
        header: "سفارش",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-mono text-xs font-bold">#{row.original.number}</div>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              {formatDate(row.original.createdAt)}
            </div>
          </div>
        ),
      },
      {
        id: "customer",
        header: "مشتری",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="text-sm font-medium truncate max-w-[150px]">
              {row.original.customer?.name}
            </div>
            <div className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
              {row.original.customer?.phone}
            </div>
          </div>
        ),
      },
      {
        id: "items",
        header: "آیتم‌ها",
        cell: ({ row }) => (
          <div className="flex items-center gap-1 flex-wrap max-w-[180px]">
            {row.original.items.slice(0, 2).map((it) => (
              <span
                key={it.id}
                className="text-[10px] bg-muted rounded px-1.5 py-0.5 truncate max-w-[80px]"
              >
                {it.product?.name}
              </span>
            ))}
            {row.original.items.length > 2 && (
              <span className="text-[10px] text-muted-foreground">
                +{(row.original.items.length - 2).toLocaleString("fa-IR")}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "where",
        header: "الان کجاست",
        cell: ({ row }) => {
          const st = activeStageOf(row.original);
          return <span className={cn("text-[10px] px-2 py-0.5 rounded-full", st.cls)}>{st.label}</span>;
        },
      },
      {
        accessorKey: "status",
        header: "وضعیت",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "totalAmount",
        header: "جمع",
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums" dir="ltr">
            {formatCurrency(row.original.totalAmount)}
          </span>
        ),
      },
      {
        id: "paid",
        header: "پرداخت‌شده",
        meta: { align: "end" },
        cell: ({ row }) => {
          const o = row.original;
          const rem = o.totalAmount - o.paidAmount;
          return (
            <div className="min-w-[100px] text-left">
              <span
                className={cn(
                  "text-sm font-medium tabular-nums block",
                  rem > 0.001 && o.status !== "cancelled"
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-emerald-600 dark:text-emerald-400"
                )}
                dir="ltr"
              >
                {formatCurrency(o.paidAmount)}
              </span>
              {rem > 0.001 && o.status !== "cancelled" && (
                <span className="text-[10px] text-muted-foreground tabular-nums block" dir="ltr">
                  مانده {formatCurrency(rem)}
                </span>
              )}
            </div>
          );
        },
      },
    ],
    []
  );

  const allStatuses = [...OPEN_STATUSES, ...CLOSED_STATUSES];
  const toggleStatus = (s: string) => {
    setStatusSet((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader title="سفارش‌ها" icon="orders" />

      {/* فیلترها */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-64">
            <Icon
              name="search"
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجو: شماره سفارش، مشتری…"
              className="pr-9"
            />
          </div>
          {/* باز/بسته/همه */}
          <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
            {[
              { id: "open", label: "باز" },
              { id: "closed", label: "بسته" },
              { id: "all", label: "همه" },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  setView(v.id as typeof view);
                  setStatusSet(new Set());
                }}
                className={cn(
                  "inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition",
                  view === v.id
                    ? "bg-background text-foreground shadow-sm border"
                    : "text-muted-foreground hover:bg-background/60"
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <span className="mr-auto text-xs text-muted-foreground tabular-nums">
            {rows.length.toLocaleString("fa-IR")} سفارش
          </span>
        </div>
        {/* وضعیت‌ها */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {allStatuses.map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={cn(
                "text-[10px] px-2.5 py-1.5 rounded-lg border transition-all font-medium",
                statusSet.has(s)
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "bg-background text-muted-foreground border-input hover:border-foreground/30 hover:text-foreground"
              )}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </Card>

      {/* جدول */}
      <Card className="p-4">
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          pageSize={12}
          onRowClick={(o) => openOrder(o.id)}
          emptyState={
            <EmptyState
              icon="orders"
              title="سفارشی یافت نشد"
              description="فیلترها را تغییر دهید"
            />
          }
        />
      </Card>

      <FinanceOrderModal orderId={openId} open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
