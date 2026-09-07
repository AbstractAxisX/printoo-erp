"use client";

// ─── Phase 15: تاریخچه هزینه‌ها — بازطراحی کامل ─────────────────────
// لاگ ریز-به-ریز تمام هزینه‌ها (روی سفارش + آزاد) با تاریخ و ساعت دقیق،
// ماژول ثبت‌کننده و کارمند — عین جداول همهٔ سفارشات ادمین داخلی:
//   • فرم ثبت هزینه (همان فرم داشبورد — دو حالت، جمع‌وجور)
//   • فیلترها: جستجو، وضعیت، نوع (روی سفارش/آزاد)، ماژول، دسته، بازهٔ زمانی
//   • سوییچ «به تفکیک سفارش» — گروه‌بندی هزینه‌ها زیر سربرگ هر سفارش
//   • کارت‌های جمع (در انتظار/تأیید/رد) + جدول با کلیک → مودال جزئیات

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { useInvalidate } from "@/lib/use-invalidate";
import { useCostDetail } from "@/lib/use-cost-detail";
import { PageHeader, EmptyState } from "@/components/shared";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { DataTable } from "@/components/ui/data-table";
import { CostEntryForm } from "@/components/shared/cost-entry-form";
import type { ColumnDef } from "@tanstack/react-table";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────

type MaterialCost = {
  id: string;
  orderId: string | null;
  title: string | null;
  amount: number;
  description: string | null;
  status: string;
  module: string;
  includeInInvoice?: boolean;
  expenseTypeId?: string | null;
  createdAt: string;
  createdByName?: string | null;
  supplier?: { name: string } | null;
  expenseType?: { name: string } | null;
  attachments?: { url: string; fileName: string }[];
  order: { id: string; number: number; customer: { name: string } } | null;
};

type ExpenseType = { id: string; name: string; isDefault: boolean };

// ─── Meta ──────────────────────────────────────────────────────────────

const MODULE_META: Record<string, { label: string; color: string; icon: IconName }> = {
  print: { label: "چاپ", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300", icon: "print" },
  material: { label: "متریال", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300", icon: "boxes" },
  warehouse: { label: "انبار", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", icon: "warehouse" },
  logistics: { label: "لجستیک", color: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300", icon: "truck" },
  finance: { label: "مالی", color: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300", icon: "wallet" },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "در انتظار", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  approved: { label: "تأیید شده", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  rejected: { label: "رد شده", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
};

const MODULES = ["print", "material", "warehouse", "logistics", "finance"] as const;
const STATUSES = ["pending", "approved", "rejected"] as const;
const SCOPES = [
  { id: "all", label: "همه" },
  { id: "order", label: "روی سفارش" },
  { id: "free", label: "آزاد" },
] as const;

// ─── Filter chip (همان الگوی orders-filters ادمین) ────────────────────

function FilterChip({
  active,
  onClick,
  children,
  tone = "primary",
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "primary" | "rose" | "emerald" | "amber";
  count?: number;
}) {
  const toneActive = {
    primary: "bg-primary text-primary-foreground border-primary",
    rose: "bg-rose-500 text-white border-rose-500",
    emerald: "bg-emerald-500 text-white border-emerald-500",
    amber: "bg-amber-500 text-white border-amber-500",
  }[tone];
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
        active
          ? `${toneActive} shadow-sm`
          : "bg-background text-muted-foreground border-input hover:border-foreground/30 hover:text-foreground"
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className="text-[10px] font-bold tabular-nums opacity-80">
          {count.toLocaleString("fa-IR")}
        </span>
      )}
    </button>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────

export function FinanceCosts() {
  const invalidate = useInvalidate();
  const boardFilter = useAppStore((s) => s.boardFilter);
  const setBoardFilter = useAppStore((s) => s.setBoardFilter);

  // فرم (جمع‌شونده)
  const [showForm, setShowForm] = React.useState(false);
  const [costMode, setCostMode] = React.useState<"order" | "free">("order");

  // فیلترها
  const [q, setQ] = React.useState("");
  const [statusSet, setStatusSet] = React.useState<Set<string>>(new Set());
  const [moduleSet, setModuleSet] = React.useState<Set<string>>(new Set());
  const [scope, setScope] = React.useState<"all" | "order" | "free">("all");
  const [categoryId, setCategoryId] = React.useState<string>("");
  const [dateFrom, setDateFrom] = React.useState<Date | null>(null);
  const [dateTo, setDateTo] = React.useState<Date | null>(null);
  const [groupByOrder, setGroupByOrder] = React.useState(false);
  const [showFilters, setShowFilters] = React.useState(false);

  // مصرف boardFilter از داشبورد (یک‌بار مصرف)
  React.useEffect(() => {
    if (boardFilter && boardFilter.module === "finance") {
      const v = boardFilter.value;
      if (v === "pending") {
        setStatusSet(new Set(["pending"]));
        setScope("all");
      } else if (v === "all-costs") {
        setStatusSet(new Set());
        setScope("all");
      } else if (v === "free") {
        setScope("free");
      } else if (v.startsWith("free:")) {
        setScope("free");
        setCategoryId(v.slice(5));
      }
      setBoardFilter("finance", null);
    }
  }, [boardFilter, setBoardFilter]);

  // ── داده‌ها ──
  const params = new URLSearchParams();
  if (scope !== "all") params.set("scope", scope);
  if (dateFrom) params.set("from", dateFrom.toISOString());
  if (dateTo) params.set("to", dateTo.toISOString());

  const { data: costsData, isLoading } = useQuery({
    queryKey: ["material-costs", "history", params.toString()],
    queryFn: () => api<{ costs: MaterialCost[] }>(`/api/material-costs?${params.toString()}`),
    refetchInterval: 60_000,
  });
  const { data: typesData } = useQuery({
    queryKey: ["expense-types"],
    queryFn: () => api<{ expenseTypes: ExpenseType[] }>("/api/expense-types"),
    staleTime: 60_000,
  });

  const allCosts = costsData?.costs ?? [];

  // فیلتر سمت کلاینت (جستجو/وضعیت/ماژول/دسته)
  const filtered = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    return allCosts.filter((c) => {
      if (statusSet.size > 0 && !statusSet.has(c.status)) return false;
      if (moduleSet.size > 0 && !moduleSet.has(c.module)) return false;
      if (categoryId && c.expenseTypeId !== categoryId) return false;
      if (query) {
        const hay = `${c.title ?? ""} ${c.description ?? ""} ${c.order?.number ?? ""} ${
          c.order?.customer?.name ?? ""
        } ${c.createdByName ?? ""}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [allCosts, q, statusSet, moduleSet, categoryId]);

  // گروه‌بندی به تفکیک سفارش
  const grouped = React.useMemo(() => {
    const map = new Map<
      string,
      { orderId: string | null; order: MaterialCost["order"]; costs: MaterialCost[] }
    >();
    for (const c of filtered) {
      const key = c.orderId ?? "__free__";
      const g = map.get(key) ?? { orderId: c.orderId, order: c.order, costs: [] };
      g.costs.push(c);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => {
      // سفارش‌ها اول (بزرگ‌ترین شماره اول)، آزاد آخر
      if (a.orderId === null) return 1;
      if (b.orderId === null) return -1;
      return (b.order?.number ?? 0) - (a.order?.number ?? 0);
    });
  }, [filtered]);

  // جمع‌ها
  const sumOf = (st: string) =>
    allCosts.filter((c) => c.status === st).reduce((s, c) => s + c.amount, 0);

  const { openCost, modal } = useCostDetail();

  // ── ستون‌های جدول ──
  const columns = React.useMemo<ColumnDef<MaterialCost>[]>(
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
          if (!o)
            return (
              <span className="inline-flex items-center gap-1 text-[11px] text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-950/60 px-2 py-0.5 rounded-full">
                <Icon name="coins" size={10} />
                آزاد{row.original.expenseType?.name ? ` — ${row.original.expenseType.name}` : ""}
              </span>
            );
          return (
            <div className="min-w-0">
              <div className="font-mono text-xs font-bold">#{o.number}</div>
              <div className="text-[10px] text-muted-foreground truncate">{o.customer?.name}</div>
            </div>
          );
        },
      },
      {
        id: "title",
        header: "هزینه",
        cell: ({ row }) => {
          const c = row.original;
          const files = (c.attachments?.length ?? 0) + (c.description ? 0 : 0);
          return (
            <div className="min-w-0 max-w-[260px]">
              <div className="text-sm font-medium truncate flex items-center gap-1.5">
                {c.title || c.description || "هزینه"}
                {(c.attachments?.length ?? 0) > 0 && (
                  <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5 shrink-0">
                    <Icon name="file" size={9} />
                    {(c.attachments ?? []).length.toLocaleString("fa-IR")}
                  </span>
                )}
                {c.includeInInvoice && (
                  <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">
                    در فاکتور
                  </span>
                )}
              </div>
              {(c.expenseType?.name || c.supplier?.name) && (
                <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                  {c.expenseType?.name ?? ""}
                  {c.supplier?.name ? ` • ${c.supplier.name}` : ""}
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "module",
        header: "ثبت از",
        cell: ({ row }) => {
          const m = MODULE_META[row.original.module] ?? {
            label: row.original.module,
            color: "bg-muted text-muted-foreground",
            icon: "wallet" as IconName,
          };
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
        accessorKey: "amount",
        header: "مبلغ",
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums" dir="ltr">
            {formatCurrency(row.original.amount)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "وضعیت",
        cell: ({ row }) => {
          const st = STATUS_META[row.original.status] ?? {
            label: row.original.status,
            cls: "bg-muted text-muted-foreground",
          };
          return <span className={cn("text-[10px] px-2 py-0.5 rounded-full", st.cls)}>{st.label}</span>;
        },
      },
    ],
    []
  );

  const activeFilterCount =
    (q ? 1 : 0) +
    statusSet.size +
    moduleSet.size +
    (scope !== "all" ? 1 : 0) +
    (categoryId ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  const toggleIn = (set: Set<string>, val: string) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="تاریخچه هزینه‌ها"
        icon="money"
        actions={
          <Button
            variant={showForm ? "outline" : "default"}
            size="sm"
            className="gap-1.5"
            onClick={() => setShowForm((v) => !v)}
          >
            <Icon name={showForm ? "arrowUp" : "plusCircle"} size={14} />
            {showForm ? "بستن فرم" : "ثبت هزینه جدید"}
          </Button>
        }
      />

      {/* فرم ثبت هزینه — جمع‌شونده (همان فرم داشبورد) */}
      {showForm && (
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
                <Icon name="plusCircle" size={17} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">ثبت هزینه جدید</h3>
                <p className="text-[11px] text-muted-foreground">
                  {costMode === "order"
                    ? "هزینه روی سفارش — با گزینهٔ نشستن در فاکتور"
                    : "هزینهٔ آزاد — کرایه، حقوق و هزینه‌های جاری"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1" role="radiogroup">
              {(["order", "free"] as const).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={costMode === m}
                  onClick={() => setCostMode(m)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
                    costMode === m
                      ? "bg-background text-foreground shadow-sm border"
                      : "text-muted-foreground hover:bg-background/60"
                  )}
                >
                  <Icon name={m === "order" ? "orders" : "coins"} size={13} />
                  {m === "order" ? "روی سفارش" : "آزاد"}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4">
            <CostEntryForm
              key={costMode}
              mode={costMode}
              selectableOrder={costMode === "order"}
              showInvoiceOption={costMode === "order"}
              fixedModule={costMode === "free" ? "finance" : undefined}
              showSupplier={costMode === "order"}
              onSubmitted={() => {
                invalidate(["material-costs", "finance"]);
                invalidate(["finance"]);
              }}
            />
          </div>
        </Card>
      )}

      {/* کارت‌های جمع */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3.5 ring-1 ring-amber-500/20 bg-amber-50/40 dark:bg-amber-950/10">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Icon name="clock" size={13} className="text-amber-600" />
            در انتظار تأیید
          </div>
          <div className="text-lg font-bold tabular-nums mt-1.5" dir="ltr">
            {formatCurrency(sumOf("pending"))}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {allCosts.filter((c) => c.status === "pending").length.toLocaleString("fa-IR")} مورد
          </div>
        </Card>
        <Card className="p-3.5 ring-1 ring-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/10">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Icon name="checkCircle" size={13} className="text-emerald-600" />
            تأیید شده
          </div>
          <div className="text-lg font-bold tabular-nums mt-1.5" dir="ltr">
            {formatCurrency(sumOf("approved"))}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {allCosts.filter((c) => c.status === "approved").length.toLocaleString("fa-IR")} مورد
          </div>
        </Card>
        <Card className="p-3.5 ring-1 ring-rose-500/20 bg-rose-50/40 dark:bg-rose-950/10">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Icon name="cancel" size={13} className="text-rose-600" />
            رد شده
          </div>
          <div className="text-lg font-bold tabular-nums mt-1.5" dir="ltr">
            {formatCurrency(sumOf("rejected"))}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {allCosts.filter((c) => c.status === "rejected").length.toLocaleString("fa-IR")} مورد
          </div>
        </Card>
        <Card className="p-3.5 ring-1 ring-primary/20">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Icon name="money" size={13} className="text-primary" />
            مجموع (فیلتر جاری)
          </div>
          <div className="text-lg font-bold tabular-nums mt-1.5" dir="ltr">
            {formatCurrency(filtered.reduce((s, c) => s + c.amount, 0))}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {filtered.length.toLocaleString("fa-IR")} مورد
          </div>
        </Card>
      </div>

      {/* نوار فیلترها */}
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
              placeholder="جستجو: نام، توضیح، سفارش، مشتری، کارمند…"
              className="pr-9"
            />
          </div>
          {/* نوع: همه/روی سفارش/آزاد */}
          <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                  scope === s.id
                    ? "bg-background text-foreground shadow-sm border"
                    : "text-muted-foreground hover:bg-background/60"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-1.5", showFilters && "border-primary/40 text-primary")}
            onClick={() => setShowFilters((v) => !v)}
          >
            <Icon name="filter" size={14} />
            فیلترها
            {activeFilterCount > 0 && (
              <span className="size-5 rounded-full bg-primary-foreground/20 text-[10px] font-bold grid place-items-center">
                {activeFilterCount.toLocaleString("fa-IR")}
              </span>
            )}
          </Button>
          {/* سوییچ تفکیک سفارش */}
          <Button
            variant={groupByOrder ? "default" : "outline"}
            size="sm"
            className={cn("gap-1.5", !groupByOrder && "text-muted-foreground")}
            onClick={() => setGroupByOrder((v) => !v)}
            title="هزینه‌ها را به تفکیک هر سفارش گروه‌بندی کن"
          >
            <Icon name="layers" size={14} />
            به تفکیک سفارش
          </Button>
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={() => {
                setQ("");
                setStatusSet(new Set());
                setModuleSet(new Set());
                setScope("all");
                setCategoryId("");
                setDateFrom(null);
                setDateTo(null);
              }}
            >
              <Icon name="cancel" size={13} /> پاک‌کردن
            </Button>
          )}
          <span className="mr-auto text-xs text-muted-foreground tabular-nums">
            {filtered.length.toLocaleString("fa-IR")} هزینه
          </span>
        </div>

        {/* فیلترهای پیشرفته */}
        {showFilters && (
          <div className="border-t pt-3 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground min-w-[80px]">وضعیت</span>
              {STATUSES.map((st) => (
                <FilterChip
                  key={st}
                  active={statusSet.has(st)}
                  onClick={() => setStatusSet((s) => toggleIn(s, st))}
                  tone={st === "approved" ? "emerald" : st === "rejected" ? "rose" : "primary"}
                >
                  {STATUS_META[st].label}
                </FilterChip>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground min-w-[80px]">ماژول ثبت</span>
              {MODULES.map((m) => (
                <FilterChip
                  key={m}
                  active={moduleSet.has(m)}
                  onClick={() => setModuleSet((s) => toggleIn(s, m))}
                >
                  {MODULE_META[m]?.label ?? m}
                </FilterChip>
              ))}
            </div>
            {scope === "free" && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground min-w-[80px]">دستهٔ آزاد</span>
                {(typesData?.expenseTypes ?? []).map((t) => (
                  <FilterChip
                    key={t.id}
                    active={categoryId === t.id}
                    onClick={() => setCategoryId((c) => (c === t.id ? "" : t.id))}
                  >
                    {t.name}
                  </FilterChip>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground min-w-[80px]">بازهٔ زمانی</span>
              <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="از تاریخ" />
              <Icon name="arrowLeft" size={14} className="text-muted-foreground" />
              <DatePicker value={dateTo} onChange={setDateTo} placeholder="تا تاریخ" />
            </div>
          </div>
        )}
      </Card>

      {/* جدول / حالت گروهی */}
      {groupByOrder ? (
        <Card className="p-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Icon name="loading" size={16} className="animate-spin" />
              در حال بارگذاری…
            </div>
          ) : grouped.length === 0 ? (
            <EmptyState
              icon="inbox"
              title="هزینه‌ای یافت نشد"
              description="فیلترها را تغییر دهید یا هزینهٔ جدیدی ثبت کنید"
            />
          ) : (
            <div className="space-y-4">
              {grouped.map((g) => {
                const sum = g.costs.reduce((s, c) => s + c.amount, 0);
                return (
                  <div key={g.orderId ?? "__free__"} className="rounded-xl border overflow-hidden">
                    <div className="px-4 py-2.5 bg-muted/40 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        {g.order ? (
                          <>
                            <span className="font-mono text-sm font-bold">#{g.order.number}</span>
                            <span className="text-xs text-muted-foreground truncate">
                              {g.order.customer?.name}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm font-semibold flex items-center gap-1.5">
                            <Icon name="coins" size={14} className="text-violet-500" />
                            هزینه‌های آزاد
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {g.costs.length.toLocaleString("fa-IR")} هزینه
                        </span>
                      </div>
                      <span className="text-sm font-bold tabular-nums" dir="ltr">
                        {formatCurrency(sum)}
                      </span>
                    </div>
                    <div className="divide-y">
                      {g.costs.map((c) => {
                        const m = MODULE_META[c.module] ?? {
                          label: c.module,
                          color: "bg-muted text-muted-foreground",
                          icon: "wallet" as IconName,
                        };
                        const st = STATUS_META[c.status] ?? {
                          label: c.status,
                          cls: "bg-muted text-muted-foreground",
                        };
                        return (
                          <button
                            key={c.id}
                            onClick={() => openCost(c.id)}
                            className="w-full text-right px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap hover:bg-accent/30 transition"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <span
                                className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-0.5",
                                  m.color
                                )}
                              >
                                <Icon name={m.icon} size={9} />
                                {m.label}
                              </span>
                              <span className="text-sm font-medium truncate max-w-[220px]">
                                {c.title || c.description || "هزینه"}
                              </span>
                              <span className={cn("text-[10px] px-2 py-0.5 rounded-full", st.cls)}>
                                {st.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                              <span>{c.createdByName ?? "—"}</span>
                              <span className="tabular-nums" dir="ltr">
                                {formatDateTime(c.createdAt)}
                              </span>
                              <span className="font-bold text-foreground tabular-nums" dir="ltr">
                                {formatCurrency(c.amount)}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-4">
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            pageSize={12}
            onRowClick={(c) => openCost(c.id)}
            emptyState={
              <EmptyState
                icon="inbox"
                title="هزینه‌ای یافت نشد"
                description="فیلترها را تغییر دهید یا هزینهٔ جدیدی ثبت کنید"
              />
            }
          />
        </Card>
      )}

      {modal}
    </div>
  );
}
