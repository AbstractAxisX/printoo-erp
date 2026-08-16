"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/shared";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PriceComparison, SupplierService, SupplierCategory } from "./srm-types";

type SortKey = "name" | "diff" | "suppliers" | "minPrice";

// ─── Component ────────────────────────────────────────────────────────
export function SRMPriceComparison() {
  const [search, setSearch] = React.useState("");
  const [subcategoryFilter, setSubcategoryFilter] = React.useState<string>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("diff");
  const [expandedRows, setExpandedRows] = React.useState<Record<string, boolean>>({});

  // Fetch comparisons
  const { data, isLoading } = useQuery({
    queryKey: ["srm-compare-prices"],
    queryFn: () => api<{ comparisons: PriceComparison[] }>("/api/srm/compare-prices"),
    refetchInterval: 30000,
  });
  const comparisonsRaw = data?.comparisons ?? [];

  // Fetch services to map serviceId -> subcategoryId (for filtering)
  const { data: svcData } = useQuery({
    queryKey: ["supplier-services", "for-compare"],
    queryFn: () => api<{ services: SupplierService[] }>("/api/supplier-services"),
  });
  const services = svcData?.services ?? [];

  // Fetch categories (with subcategories) for filter dropdown
  const { data: catData } = useQuery({
    queryKey: ["supplier-categories", "for-compare"],
    queryFn: () => api<{ categories: SupplierCategory[] }>("/api/supplier-categories"),
  });
  const categories = catData?.categories ?? [];

  // Flatten subcategories
  const allSubcategories = React.useMemo(() => {
    return categories.flatMap((c) =>
      (c.subcategories ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        categoryName: c.name,
      }))
    );
  }, [categories]);

  // Map serviceId -> subcategoryId (first match wins; same service name could belong to multiple)
  const serviceSubcatMap = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const s of services) {
      if (s.subcategoryId && !m.has(s.id)) m.set(s.id, s.subcategoryId);
    }
    return m;
  }, [services]);

  // Apply filters + sort
  const comparisons = React.useMemo(() => {
    let result = comparisonsRaw.filter((c) => {
      // Search by service name (client-side)
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!c.name.toLowerCase().includes(q)) return false;
      }
      // Subcategory filter: at least one supplier's service must match the subcategory
      if (subcategoryFilter !== "all") {
        const matches = c.suppliers.some(
          (sp) => serviceSubcatMap.get(sp.serviceId) === subcategoryFilter
        );
        if (!matches) return false;
      }
      return true;
    });

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name, "fa");
        case "suppliers":
          return b.suppliers.length - a.suppliers.length;
        case "minPrice":
          return (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity);
        case "diff":
        default: {
          const da = (a.maxPrice ?? 0) - (a.minPrice ?? 0);
          const db = (b.maxPrice ?? 0) - (b.minPrice ?? 0);
          return db - da;
        }
      }
    });

    return result;
  }, [comparisonsRaw, search, subcategoryFilter, sortKey, serviceSubcatMap]);

  // Stats
  const totalServices = comparisons.length;
  const totalWithMultiple = comparisons.filter((c) => c.suppliers.length > 1).length;
  const avgSavings = React.useMemo(() => {
    const savings: number[] = [];
    for (const c of comparisons) {
      if (c.minPrice && c.maxPrice && c.maxPrice > c.minPrice) {
        const pct = ((c.maxPrice - c.minPrice) / c.maxPrice) * 100;
        savings.push(pct);
      }
    }
    if (savings.length === 0) return 0;
    return Math.round(savings.reduce((a, b) => a + b, 0) / savings.length);
  }, [comparisons]);

  function toggleRow(name: string) {
    setExpandedRows((p) => ({ ...p, [name]: !p[name] }));
  }

  // ── Columns ───────────────────────────────────────────────────────
  const columns: ColumnDef<PriceComparison>[] = [
    {
      id: "expand",
      header: () => <div className="w-8" />,
      cell: ({ row }) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleRow(row.original.name);
          }}
          className="size-7 rounded-md hover:bg-accent grid place-items-center"
          title={expandedRows[row.original.name] ? "بستن" : "گشودن"}
        >
          <Icon
            name={expandedRows[row.original.name] ? "chevronDown" : "chevronLeft"}
            size={14}
            className="text-muted-foreground"
          />
        </button>
      ),
      enableSorting: false,
      meta: { hideable: false },
    },
    {
      accessorKey: "name",
      header: "نام خدمه",
      cell: ({ row }) => (
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 grid place-items-center shrink-0">
            <Icon name="analytics" size={14} />
          </div>
          <div className="font-medium text-sm truncate">{row.original.name}</div>
        </div>
      ),
      enableSorting: true,
    },
    {
      id: "suppliersCount",
      accessorFn: (r) => r.suppliers.length,
      header: "تامین‌کنندگان",
      cell: ({ row }) => (
        <span
          className={cn(
            "tabular-nums inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
            row.original.suppliers.length > 1
              ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Icon name="suppliers" size={10} />
          {row.original.suppliers.length}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: "minPrice",
      accessorFn: (r) => r.minPrice ?? 0,
      header: "حداقل قیمت",
      cell: ({ row }) => {
        const p = row.original.minPrice;
        if (p === null || p === undefined) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums" dir="ltr">
            {formatCurrency(p)}
          </span>
        );
      },
      enableSorting: true,
    },
    {
      id: "maxPrice",
      accessorFn: (r) => r.maxPrice ?? 0,
      header: "حداکثر قیمت",
      cell: ({ row }) => {
        const p = row.original.maxPrice;
        if (p === null || p === undefined) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <span className="text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums" dir="ltr">
            {formatCurrency(p)}
          </span>
        );
      },
      enableSorting: true,
    },
    {
      id: "range",
      accessorFn: (r) => (r.maxPrice ?? 0) - (r.minPrice ?? 0),
      header: "اختلاف قیمت",
      cell: ({ row }) => {
        const diff = (row.original.maxPrice ?? 0) - (row.original.minPrice ?? 0);
        if (diff <= 0 || row.original.minPrice === null) {
          return <span className="text-muted-foreground text-xs">—</span>;
        }
        const pct = Math.round((diff / (row.original.maxPrice ?? 1)) * 100);
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums" dir="ltr">
              {formatCurrency(diff)}
            </span>
            <span className="text-[10px] text-muted-foreground">{pct}% پراکندگی</span>
          </div>
        );
      },
      enableSorting: true,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="مقایسه قیمت‌ها"
        description="مقایسه قیمت خدمات مشابه بین تمام تامین‌کنندگان"
        icon="analytics"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setSubcategoryFilter("all");
                setSortKey("diff");
                setExpandedRows({});
              }}
              className="gap-1.5"
            >
              <Icon name="refresh" size={14} /> پاک کردن فیلترها
            </Button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 ring-1 ring-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] text-muted-foreground">خدمات قابل مقایسه</div>
              <div className="text-2xl font-bold tabular-nums mt-0.5">{totalServices}</div>
            </div>
            <div className="size-9 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 grid place-items-center">
              <Icon name="analytics" size={18} />
            </div>
          </div>
        </Card>
        <Card className="p-4 ring-1 ring-orange-500/20 bg-orange-50/40 dark:bg-orange-950/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] text-muted-foreground">با چند تامین‌کننده</div>
              <div className="text-2xl font-bold tabular-nums mt-0.5">{totalWithMultiple}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">قابل مقایسه واقعی</div>
            </div>
            <div className="size-9 rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400 grid place-items-center">
              <Icon name="suppliers" size={18} />
            </div>
          </div>
        </Card>
        <Card className="p-4 ring-1 ring-amber-500/20 bg-amber-50/40 dark:bg-amber-950/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] text-muted-foreground">میانگین پراکندگی</div>
              <div className="text-2xl font-bold tabular-nums mt-0.5">{avgSavings}%</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">پتانسیل صرفه‌جویی</div>
            </div>
            <div className="size-9 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 grid place-items-center">
              <Icon name="trending" size={18} />
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <DataTable
          columns={columns}
          data={comparisons}
          isLoading={isLoading}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          searchPlaceholder="جستجوی نام خدمه..."
          pageSize={10}
          onRowClick={(c) => toggleRow(c.name)}
          toolbar={
            <div className="flex items-center gap-2">
              <Select value={subcategoryFilter} onValueChange={setSubcategoryFilter}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="همه زیردسته‌ها" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه زیردسته‌ها</SelectItem>
                  {allSubcategories.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.categoryName} / {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="diff">بیشترین اختلاف قیمت</SelectItem>
                  <SelectItem value="name">نام خدمه (الفبا)</SelectItem>
                  <SelectItem value="suppliers">تعداد تامین‌کنندگان</SelectItem>
                  <SelectItem value="minPrice">حداقل قیمت</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
          getRowCanExpand={() => true}
          renderExpandedRow={(row) => (
            <ExpandedPriceList comparison={row} />
          )}
          emptyState={
            <EmptyState
              icon="analytics"
              title="موردی برای مقایسه یافت نشد"
              description="هنوز خدمه‌ای با قیمت ثبت نشده است یا فیلترها نتیجه‌ای ندارند."
            />
          }
        />
      </Card>

      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 justify-center pt-1">
        <Icon name="refresh" size={11} />
        به‌روزرسانی خودکار هر ۳۰ ثانیه
      </div>
    </div>
  );
}

// ─── Expanded row: list of suppliers with their prices ────────────────
function ExpandedPriceList({ comparison }: { comparison: PriceComparison }) {
  // Sort suppliers by price ascending (best first); nulls last
  const sorted = React.useMemo(() => {
    return [...comparison.suppliers].sort((a, b) => {
      if (a.price === null && b.price === null) return 0;
      if (a.price === null) return 1;
      if (b.price === null) return -1;
      return a.price - b.price;
    });
  }, [comparison.suppliers]);

  const bestPrice = comparison.minPrice;

  if (sorted.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">
        تامین‌کننده‌ای برای این خدمه ثبت نشده است.
      </div>
    );
  }

  return (
    <div className="p-3 bg-muted/20">
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-2 border-b bg-muted/40 flex items-center justify-between">
          <span className="text-xs font-medium flex items-center gap-1.5">
            <Icon name="suppliers" size={12} className="text-orange-500" />
            مقایسه {sorted.length} تامین‌کننده
          </span>
          <span className="text-[10px] text-muted-foreground">
            بهترین قیمت با رنگ سبز مشخص شده است
          </span>
        </div>
        <div className="divide-y">
          {sorted.map((sp, idx) => {
            const isBest = sp.price !== null && sp.price === bestPrice;
            return (
              <div
                key={sp.serviceId}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5",
                  isBest && "bg-emerald-50/60 dark:bg-emerald-950/20"
                )}
              >
                <div
                  className={cn(
                    "size-8 rounded-lg grid place-items-center shrink-0 font-bold text-xs",
                    isBest
                      ? "bg-emerald-500 text-white"
                      : idx === 1
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{sp.name}</span>
                    {isBest && (
                      <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full inline-flex items-center gap-1">
                        <Icon name="checkCircle" size={10} /> بهترین قیمت
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  {sp.price !== null ? (
                    <span
                      className={cn(
                        "text-sm font-bold tabular-nums",
                        isBest
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-foreground"
                      )}
                      dir="ltr"
                    >
                      {formatCurrency(sp.price)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">بدون قیمت</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
