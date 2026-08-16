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
import { formatCurrency, formatNumber, relativeTime, daysRemaining, formatDate } from "@/lib/format";
import {
  type DealStage,
  STAGE_LABELS,
  STAGE_COLORS,
  ACTIVITY_META,
  type Activity,
} from "./crm-types";

type DashboardData = {
  kpis: {
    totalCustomers: number;
    activeDeals: number;
    pipelineValue: number;
    wonThisMonthValue: number;
    wonThisMonthCount: number;
    lostThisMonthCount: number;
    conversionRate: number;
    newCustomersThisMonth: number;
    totalDeals: number;
  };
  pipeline: { stage: DealStage; count: number; value: number }[];
  recentActivities: Activity[];
  topCustomers: {
    id: string;
    name: string;
    phone: string;
    isFavorite: boolean;
    ordersCount: number;
    dealsCount: number;
    totalSpent: number;
  }[];
  closingSoonDeals: {
    id: string;
    title: string;
    value: number;
    expectedCloseDate: string | null;
    customer: { id: string; name: string } | null;
  }[];
};

export function CRMDashboard() {
  const navigate = useAppStore((s) => s.navigate);
  const { data, isLoading } = useQuery({
    queryKey: ["crm-dashboard"],
    queryFn: () => api<DashboardData>("/api/crm/dashboard"),
    refetchInterval: 30000,
  });

  if (isLoading && !data) {
    return (
      <div className="space-y-5">
        <PageHeader title="داشبورد CRM" description="نمای کلی فروش و ارتباط با مشتریان" icon="dashboard" />
        <LoadingState label="در حال بارگذاری داشبورد..." />
      </div>
    );
  }

  const d = data;
  const kpis = d?.kpis;

  const kpiCards: {
    label: string;
    value: string;
    sub?: string;
    icon: IconName;
    color: string;
    bg: string;
  }[] = [
    {
      label: "کل مشتریان",
      value: formatNumber(kpis?.totalCustomers ?? 0),
      sub: `+${kpis?.newCustomersThisMonth ?? 0} این ماه`,
      icon: "customers",
      color: "text-teal-600 dark:text-teal-400",
      bg: "bg-teal-50 dark:bg-teal-950/40",
    },
    {
      label: "معاملات فعال",
      value: formatNumber(kpis?.activeDeals ?? 0),
      sub: `از کل ${formatNumber(kpis?.totalDeals ?? 0)} معامله`,
      icon: "layers",
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-50 dark:bg-violet-950/40",
    },
    {
      label: "ارزش قیف فروش",
      value: formatCurrency(kpis?.pipelineValue ?? 0),
      sub: "مجموع معاملات باز",
      icon: "wallet",
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/40",
    },
    {
      label: "معاملات برنده این ماه",
      value: formatCurrency(kpis?.wonThisMonthValue ?? 0),
      sub: `${kpis?.wonThisMonthCount ?? 0} معامله موفق`,
      icon: "checkCircle",
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
    },
  ];

  const maxPipelineCount = Math.max(1, ...(d?.pipeline?.map((p) => p.count ?? 0) || [1]));

  return (
    <div className="space-y-5">
      <PageHeader
        title="داشبورد CRM"
        description="نمای کلی فروش و ارتباط با مشتریان"
        icon="dashboard"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("crm", "pipeline")} className="gap-1.5">
              <Icon name="layers" size={15} /> قیف فروش
            </Button>
            <Button size="sm" onClick={() => navigate("crm", "deals")} className="gap-1.5">
              <Icon name="plus" size={15} /> معامله جدید
            </Button>
          </div>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map((k) => (
          <Card key={k.label} className="p-4 relative overflow-hidden group hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className={cn("size-10 rounded-xl grid place-items-center", k.bg)}>
                <Icon name={k.icon} size={20} className={k.color} />
              </div>
            </div>
            <div className="text-2xl font-bold tabular-nums truncate" dir="ltr" title={k.value}>
              {k.value}
            </div>
            <div className="text-sm font-medium mt-0.5">{k.label}</div>
            {k.sub && <div className="text-[11px] text-muted-foreground mt-1">{k.sub}</div>}
          </Card>
        ))}
      </div>

      {/* Pipeline + Conversion */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Icon name="layers" size={18} className="text-primary" />
              <h3 className="font-semibold text-sm">قیف فروش بر اساس مرحله</h3>
            </div>
            <button
              onClick={() => navigate("crm", "pipeline")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              مشاهده قیف <Icon name="arrowLeft" size={12} />
            </button>
          </div>
          <div className="space-y-3">
            {(d?.pipeline ?? []).map((p) => {
              const colors = STAGE_COLORS[p.stage] ?? STAGE_COLORS.lead;
              const pct = Math.round(((p.count ?? 0) / maxPipelineCount) * 100);
              return (
                <div key={p.stage} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("size-1.5 rounded-full", colors.dot)} />
                      <span className="font-medium">{STAGE_LABELS[p.stage] ?? p.stage}</span>
                      <span className="text-muted-foreground">({p.count ?? 0})</span>
                    </div>
                    <span className="tabular-nums text-muted-foreground" dir="ltr">
                      {formatCurrency(p.value ?? 0)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", colors.bar)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="trending" size={18} className="text-primary" />
            <h3 className="font-semibold text-sm">نرخ تبدیل</h3>
          </div>
          <div className="flex flex-col items-center justify-center py-4">
            <div className="relative size-32">
              <svg className="size-32 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" stroke="currentColor" strokeWidth="12" fill="none" className="text-muted" />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 50}`}
                  strokeDashoffset={`${2 * Math.PI * 50 * (1 - (kpis?.conversionRate ?? 0) / 100)}`}
                  strokeLinecap="round"
                  className="text-emerald-500 transition-all"
                />
              </svg>
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="text-2xl font-bold tabular-nums" dir="ltr">
                    {kpis?.conversionRate ?? 0}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">تبدیل به سفارش</div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full mt-4 text-center">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-2">
                <div className="text-xs text-muted-foreground">برنده</div>
                <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {kpis?.wonThisMonthCount ?? 0}
                </div>
              </div>
              <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 p-2">
                <div className="text-xs text-muted-foreground">بازنده</div>
                <div className="text-base font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                  {kpis?.lostThisMonthCount ?? 0}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Two-column: recent activities + closing soon */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b">
            <div className="flex items-center gap-2">
              <Icon name="task" size={18} className="text-primary" />
              <h3 className="font-semibold text-sm">فعالیت‌های اخیر</h3>
            </div>
            <button
              onClick={() => navigate("crm", "activities")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              مشاهده همه <Icon name="arrowLeft" size={12} />
            </button>
          </div>
          {(d?.recentActivities ?? []).length > 0 ? (
            <div className="divide-y max-h-96 overflow-y-auto">
              {(d?.recentActivities ?? []).map((a) => {
                const meta = ACTIVITY_META[a.type] ?? ACTIVITY_META.note;
                return (
                  <div key={a.id} className="flex items-start gap-3 px-5 py-3 hover:bg-accent/40 transition">
                    <div className={cn("size-8 rounded-lg grid place-items-center shrink-0", meta.bg)}>
                      <Icon name={meta.icon} size={14} className={meta.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{a.title ?? "—"}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                        {a.customer?.name && <span>{a.customer.name}</span>}
                        <span>•</span>
                        <span>{relativeTime(a.date)}</span>
                      </div>
                    </div>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full shrink-0", meta.bg, meta.color)}>
                      {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="task" title="فعالیتی ثبت نشده" />
          )}
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b">
            <div className="flex items-center gap-2">
              <Icon name="clock" size={18} className="text-amber-500" />
              <h3 className="font-semibold text-sm">معاملات نزدیک به بسته شدن</h3>
            </div>
            <button
              onClick={() => navigate("crm", "deals")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              همه معاملات <Icon name="arrowLeft" size={12} />
            </button>
          </div>
          {(d?.closingSoonDeals ?? []).length > 0 ? (
            <div className="divide-y">
              {(d?.closingSoonDeals ?? []).map((deal) => {
                const dr = daysRemaining(deal.expectedCloseDate);
                return (
                  <button
                    key={deal.id}
                    onClick={() => navigate("crm", "pipeline")}
                    className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-accent/40 transition text-right"
                  >
                    <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                      <Icon name="orders" size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{deal.title ?? "—"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {deal.customer?.name ?? "—"} • {formatDate(deal.expectedCloseDate)}
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <div className="text-xs font-semibold tabular-nums" dir="ltr">
                        {formatCurrency(deal.value ?? 0)}
                      </div>
                      <div
                        className={cn(
                          "text-[10px] mt-0.5",
                          dr.status === "today" && "text-rose-600 font-medium",
                          dr.status === "overdue" && "text-rose-600 font-medium",
                          dr.status === "remaining" && "text-amber-600",
                          dr.status === "none" && "text-muted-foreground"
                        )}
                      >
                        {dr.text}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="checkCircle" title="معامله‌ای نزدیک به بسته شدن نیست" />
          )}
        </Card>
      </div>

      {/* Top customers */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b">
          <div className="flex items-center gap-2">
            <Icon name="star" size={18} className="text-amber-500" />
            <h3 className="font-semibold text-sm">مشتریان برتر</h3>
          </div>
          <button
            onClick={() => navigate("crm", "customers")}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            همه مشتریان <Icon name="arrowLeft" size={12} />
          </button>
        </div>
        {(d?.topCustomers ?? []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-right text-xs font-medium text-muted-foreground px-5 py-2.5">مشتری</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-3 py-2.5">سفارش‌ها</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-3 py-2.5">معاملات</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-5 py-2.5">مجموع خرید</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(d?.topCustomers ?? []).map((c, idx) => (
                  <tr key={c.id} className="hover:bg-accent/40 transition">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="size-5 rounded-full bg-primary/10 text-primary grid place-items-center text-[10px] font-bold">
                          {idx + 1}
                        </span>
                        <span className="font-medium">{c.name ?? "—"}</span>
                        {c.isFavorite && <Icon name="star" size={12} className="text-amber-500" />}
                      </div>
                    </td>
                    <td className="text-center tabular-nums">{c.ordersCount ?? 0}</td>
                    <td className="text-center tabular-nums">{c.dealsCount ?? 0}</td>
                    <td className="px-5 py-2.5 text-left font-medium tabular-nums" dir="ltr">
                      {formatCurrency(c.totalSpent ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="customers" title="مشتری‌ای ثبت نشده" />
        )}
      </Card>

      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 justify-center pt-1">
        <Icon name="refresh" size={11} />
        به‌روزرسانی خودکار هر ۳۰ ثانیه
      </div>
    </div>
  );
}
