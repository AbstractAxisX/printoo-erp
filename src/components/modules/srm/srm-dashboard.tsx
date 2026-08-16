"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, EmptyState, LoadingState } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { formatCurrency, formatNumber, relativeTime, formatDate } from "@/lib/format";

// ─── Types ────────────────────────────────────────────────────────────
type RecentCost = {
  id: string;
  amount: number;
  status: string;
  module: string;
  description: string | null;
  createdAt: string;
  supplier: { name: string } | null;
  expenseType: { name: string } | null;
  order: { number: number; customer: { name: string } } | null;
};

type SuppliersByCategoryItem = {
  id: string;
  name: string;
  icon: string | null;
  subcategories: {
    id: string;
    name: string;
    _count: { suppliers: number };
  }[];
  _count: { subcategories: number };
};

type DashboardData = {
  stats: {
    suppliers: number;
    categories: number;
    services: number;
    priceLists: number;
    totalCosts: number;
    approvedCosts: number;
    pendingCosts: number;
  };
  recentCosts: RecentCost[];
  suppliersByCategory: SuppliersByCategoryItem[];
};

// ─── Meta maps ────────────────────────────────────────────────────────
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

const MODULE_META: Record<string, { label: string; icon: IconName; color: string }> = {
  print: { label: "چاپ", icon: "print", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  warehouse: { label: "انبار", icon: "warehouse", color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" },
};

// Color rotation for category bars
const CATEGORY_COLORS = [
  "bg-orange-500",
  "bg-teal-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-cyan-500",
  "bg-pink-500",
];

// ─── Component ────────────────────────────────────────────────────────
export function SRMDashboard() {
  const navigate = useAppStore((s) => s.navigate);

  const { data, isLoading } = useQuery({
    queryKey: ["srm-dashboard"],
    queryFn: () => api<DashboardData>("/api/srm/dashboard"),
    refetchInterval: 30000,
  });

  if (isLoading && !data) {
    return (
      <div className="space-y-5">
        <PageHeader title="داشبورد SRM" description="نمای کلی تامین‌کنندگان، خدمات و قیمت‌ها" icon="suppliers" />
        <LoadingState label="در حال بارگذاری داشبورد..." />
      </div>
    );
  }

  const d = data;
  const stats = d?.stats;
  const recentCosts = d?.recentCosts ?? [];
  const byCategory = d?.suppliersByCategory ?? [];

  // KPI cards
  const kpiCards: {
    label: string;
    value: string;
    sub?: string;
    icon: IconName;
    color: string;
    bg: string;
    onClick?: () => void;
  }[] = [
    {
      label: "تامین‌کنندگان",
      value: formatNumber(stats?.suppliers ?? 0),
      sub: "کل تامین‌کنندگان ثبت‌شده",
      icon: "suppliers",
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-50 dark:bg-orange-950/40",
      onClick: () => navigate("srm", "suppliers"),
    },
    {
      label: "دسته‌بندی‌ها",
      value: formatNumber(stats?.categories ?? 0),
      sub: "دسته‌بندی خدمات و متریال",
      icon: "grid",
      color: "text-teal-600 dark:text-teal-400",
      bg: "bg-teal-50 dark:bg-teal-950/40",
      onClick: () => navigate("srm", "categories"),
    },
    {
      label: "خدمات",
      value: formatNumber(stats?.services ?? 0),
      sub: "خدمات ثبت‌شده تامین‌کنندگان",
      icon: "task",
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-50 dark:bg-violet-950/40",
      onClick: () => navigate("srm", "services"),
    },
    {
      label: "لیست قیمت‌ها",
      value: formatNumber(stats?.priceLists ?? 0),
      sub: "قیمت‌های ثبت‌شده",
      icon: "tag",
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/40",
      onClick: () => navigate("srm", "compare"),
    },
    {
      label: "مجموع هزینه‌ها",
      value: formatCurrency(stats?.totalCosts ?? 0),
      sub: `تأیید شده: ${formatCurrency(stats?.approvedCosts ?? 0)}`,
      icon: "coins",
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-50 dark:bg-rose-950/40",
      onClick: () => navigate("srm", "costs"),
    },
  ];

  // Compute total suppliers per category (sum of subcategory._count.suppliers)
  const categoryTotals = byCategory.map((c) => {
    const totalSuppliers = (c.subcategories ?? []).reduce(
      (sum, s) => sum + (s._count?.suppliers ?? 0),
      0
    );
    return { id: c.id, name: c.name, icon: c.icon, totalSuppliers, subCount: c._count?.subcategories ?? 0 };
  });
  const maxTotal = Math.max(1, ...categoryTotals.map((c) => c.totalSuppliers));

  return (
    <div className="space-y-5">
      <PageHeader
        title="داشبورد SRM"
        description="نمای کلی تامین‌کنندگان، خدمات و قیمت‌ها"
        icon="suppliers"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("srm", "compare")} className="gap-1.5">
              <Icon name="analytics" size={15} /> مقایسه قیمت
            </Button>
            <Button size="sm" onClick={() => navigate("srm", "suppliers")} className="gap-1.5">
              <Icon name="plus" size={15} /> تامین‌کننده جدید
            </Button>
          </div>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {kpiCards.map((k) => (
          <Card
            key={k.label}
            onClick={k.onClick}
            className="p-4 relative overflow-hidden group hover:shadow-md transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={cn("size-10 rounded-xl grid place-items-center", k.bg)}>
                <Icon name={k.icon} size={20} className={k.color} />
              </div>
            </div>
            <div className="text-xl font-bold tabular-nums truncate" dir="ltr" title={k.value}>
              {k.value}
            </div>
            <div className="text-sm font-medium mt-0.5">{k.label}</div>
            {k.sub && <div className="text-[11px] text-muted-foreground mt-1 truncate">{k.sub}</div>}
          </Card>
        ))}
      </div>

      {/* Two-column: recent costs + suppliers by category */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent costs */}
        <Card className="p-0 overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-3.5 border-b">
            <div className="flex items-center gap-2">
              <Icon name="coins" size={18} className="text-rose-500" />
              <h3 className="font-semibold text-sm">هزینه‌های اخیر</h3>
              <span className="text-[11px] text-muted-foreground">({recentCosts.length})</span>
            </div>
            <button
              onClick={() => navigate("srm", "costs")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              مشاهده همه <Icon name="arrowLeft" size={12} />
            </button>
          </div>
          {recentCosts.length === 0 ? (
            <EmptyState icon="coins" title="هزینه‌ای ثبت نشده" />
          ) : (
            <div className="divide-y max-h-96 overflow-y-auto scrollbar-thin">
              {recentCosts.map((c) => {
                const mMeta = MODULE_META[c.module] ?? { label: c.module, icon: "wallet" as IconName, color: "bg-muted text-muted-foreground" };
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-accent/40 transition"
                  >
                    <div className={cn("size-9 rounded-lg grid place-items-center shrink-0", mMeta.color)}>
                      <Icon name={mMeta.icon} size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs">#{c.order?.number ?? "—"}</span>
                        <span className="text-sm font-medium truncate">{c.supplier?.name ?? "—"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {c.description || c.expenseType?.name || c.order?.customer?.name || "بدون توضیحات"}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xs font-bold tabular-nums" dir="ltr">
                        {formatCurrency(c.amount)}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                          STATUS_BADGE[c.status] ?? "bg-muted text-muted-foreground"
                        )}
                      >
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Suppliers by category breakdown */}
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b flex items-center gap-2">
            <Icon name="grid" size={18} className="text-primary" />
            <h3 className="font-semibold text-sm">تامین‌کنندگان بر اساس دسته</h3>
          </div>
          <div className="p-5 space-y-4 max-h-96 overflow-y-auto scrollbar-thin">
            {categoryTotals.length === 0 ? (
              <EmptyState icon="grid" title="دسته‌ای ثبت نشده" />
            ) : (
              categoryTotals.map((c, idx) => {
                const colorCls = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                const pct = Math.round((c.totalSuppliers / maxTotal) * 100);
                return (
                  <div key={c.id}>
                    <div className="flex items-center justify-between mb-1.5 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("size-1.5 rounded-full", colorCls)} />
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">({c.subCount} زیردسته)</span>
                      </div>
                      <span className="tabular-nums font-bold">{c.totalSuppliers}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", colorCls)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
            <div className="pt-3 border-t flex items-center justify-between">
              <span className="text-xs text-muted-foreground">مجموع تامین‌کنندگان</span>
              <span className="text-sm font-bold tabular-nums">
                {categoryTotals.reduce((s, c) => s + c.totalSuppliers, 0)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <QuickLinkCard
          icon="suppliers"
          label="تامین‌کنندگان"
          description="مدیریت تامین‌کنندگان"
          color="bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400"
          onClick={() => navigate("srm", "suppliers")}
        />
        <QuickLinkCard
          icon="grid"
          label="دسته‌بندی‌ها"
          description="دسته و زیردسته‌ها"
          color="bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400"
          onClick={() => navigate("srm", "categories")}
        />
        <QuickLinkCard
          icon="analytics"
          label="مقایسه قیمت"
          description="بهترین قیمت خدمات"
          color="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
          onClick={() => navigate("srm", "compare")}
        />
        <QuickLinkCard
          icon="coins"
          label="هزینه‌ها"
          description="هزینه‌های ثبت‌شده"
          color="bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400"
          onClick={() => navigate("srm", "costs")}
        />
      </div>

      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 justify-center pt-1">
        <Icon name="refresh" size={11} />
        به‌روزرسانی خودکار هر ۳۰ ثانیه
      </div>
    </div>
  );
}

function QuickLinkCard({
  icon,
  label,
  description,
  color,
  onClick,
}: {
  icon: IconName;
  label: string;
  description: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-right rounded-lg border bg-card p-3 hover:shadow-md hover:bg-accent/40 transition group"
    >
      <div className={cn("size-9 rounded-lg grid place-items-center mb-2", color)}>
        <Icon name={icon} size={18} />
      </div>
      <div className="text-sm font-semibold">{label}</div>
      <div className="text-[11px] text-muted-foreground">{description}</div>
    </button>
  );
}
