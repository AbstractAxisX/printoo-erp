"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { PageHeader, EmptyState } from "@/components/shared";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import { useCostDetail } from "@/lib/use-cost-detail";
import type { MaterialCost } from "./finance-cost-detail";

// ─── Module & status meta ─────────────────────────────────────────────
const MODULE_META: Record<
  string,
  { label: string; icon: IconName; color: string; bar: string }
> = {
  print: {
    label: "چاپ",
    icon: "print",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
  },
  warehouse: {
    label: "انبار",
    icon: "warehouse",
    color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    bar: "bg-cyan-500",
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

// ─── KPI Card ─────────────────────────────────────────────────────────
type KpiCardProps = {
  icon: IconName;
  label: string;
  value: number;
  hint?: string;
  color: "amber" | "emerald" | "rose" | "violet";
  onClick?: () => void;
  isAmount?: boolean;
};

const KPI_COLOR_MAP: Record<
  KpiCardProps["color"],
  { bg: string; text: string; ring: string }
> = {
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/20",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/20",
  },
  rose: {
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    ring: "ring-rose-500/20",
  },
  violet: {
    bg: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
    ring: "ring-violet-500/20",
  },
};

function KpiCard({ icon, label, value, hint, color, onClick, isAmount }: KpiCardProps) {
  const c = KPI_COLOR_MAP[color];
  return (
    <Card
      className={cn(
        "p-4 ring-1 transition",
        c.ring,
        onClick && "cursor-pointer hover:shadow-md hover:scale-[1.01]"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className={cn("size-10 rounded-lg grid place-items-center", c.bg, c.text)}>
          <Icon name={icon} size={20} />
        </div>
        <span
          className={cn(
            "font-bold tabular-nums",
            isAmount ? "text-base" : "text-3xl"
          )}
          dir={isAmount ? "ltr" : undefined}
        >
          {isAmount ? formatCurrency(value) : value}
        </span>
      </div>
      <div className="mt-2">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
    </Card>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────
export function FinanceDashboard() {
  const navigate = useAppStore((s) => s.navigate);
  const { openCost, modal } = useCostDetail();

  // Fetch all material costs
  const { data, isLoading } = useQuery({
    queryKey: ["material-costs", "dashboard"],
    queryFn: () => api<{ costs: MaterialCost[] }>("/api/material-costs"),
    refetchInterval: 30000,
  });

  const costs = data?.costs ?? [];

  // KPI computations
  const pendingCount = costs.filter((c) => c.status === "pending").length;
  const approvedCount = costs.filter((c) => c.status === "approved").length;
  const totalAmount = costs.reduce((sum, c) => sum + (c.amount || 0), 0);
  // "هزینه‌های فوری" = pending costs (still awaiting review, urgent)
  const urgentCount = pendingCount;

  // Module breakdown
  const moduleBreakdown = React.useMemo(() => {
    const map: Record<string, number> = { print: 0, warehouse: 0 };
    for (const c of costs) {
      if (map[c.module] !== undefined) map[c.module]++;
      else map[c.module] = (map[c.module] ?? 0) + 1;
    }
    return map;
  }, [costs]);

  const totalCosts = costs.length || 1;

  // Recent costs (compact list, top 6)
  const recentCosts = costs.slice(0, 6);

  return (
    <div className="space-y-5">
      <PageHeader
        title="داشبورد مالی"
        description="نمای کلی هزینه‌های ثبت‌شده توسط ماژول‌های چاپ و انبار"
        icon="wallet"
        actions={
          <Button onClick={() => navigate("finance", "costs")} className="gap-2">
            <Icon name="money" size={16} /> همه هزینه‌ها
          </Button>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon="clock"
          label="هزینه‌های در انتظار"
          value={pendingCount}
          hint="نیازمند بررسی واحد مالی"
          color="amber"
          onClick={() => navigate("finance", "costs")}
        />
        <KpiCard
          icon="checkCircle"
          label="تأیید شده"
          value={approvedCount}
          hint="هزینه‌های تأیید شده"
          color="emerald"
          onClick={() => navigate("finance", "costs")}
        />
        <KpiCard
          icon="coins"
          label="مجموع هزینه‌ها"
          value={totalAmount}
          hint="مجموع کل هزینه‌های ثبت‌شده"
          color="rose"
          isAmount
          onClick={() => navigate("finance", "costs")}
        />
        <KpiCard
          icon="alertTriangle"
          label="هزینه‌های فوری"
          value={urgentCount}
          hint="در انتظار بررسی و نیاز به اقدام سریع"
          color="violet"
          onClick={() => navigate("finance", "costs")}
        />
      </div>

      {/* Two-column layout: recent costs + module breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent costs (compact list) */}
        <Card className="p-0 overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Icon name="money" size={18} className="text-primary" />
              <h3 className="font-semibold text-sm">هزینه‌های اخیر</h3>
              <span className="text-[11px] text-muted-foreground">
                ({costs.length})
              </span>
            </div>
            <button
              onClick={() => navigate("finance", "costs")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              مشاهده همه <Icon name="arrowLeft" size={12} />
            </button>
          </div>
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Icon name="loading" size={16} className="animate-spin" />
              در حال بارگذاری...
            </div>
          ) : recentCosts.length === 0 ? (
            <EmptyState
              icon="checkCircle"
              title="هزینه‌ای ثبت نشده است"
              description="هنوز هزینه‌ای از ماژول‌ها دریافت نشده است"
            />
          ) : (
            <div className="divide-y max-h-[420px] overflow-y-auto scrollbar-thin">
              {recentCosts.map((c) => {
                const meta =
                  MODULE_META[c.module] ?? {
                    label: c.module,
                    icon: "wallet" as IconName,
                    color: "bg-muted text-muted-foreground",
                    bar: "bg-muted",
                  };
                return (
                  <button
                    key={c.id}
                    onClick={() => openCost(c.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-accent/40 transition text-right"
                  >
                    <div
                      className={cn(
                        "size-10 rounded-lg grid place-items-center shrink-0",
                        meta.color
                      )}
                    >
                      <Icon name={meta.icon} size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs">
                          #{c.order?.number ?? "—"}
                        </span>
                        <span className="font-medium text-sm truncate">
                          {c.order?.customer?.name ?? "—"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {c.description || c.expenseType?.name || "بدون توضیحات"}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className="text-xs font-bold tabular-nums"
                        dir="ltr"
                      >
                        {formatCurrency(c.amount)}
                      </span>
                      <span
                        className={cn(
                          "text-[11px] font-medium px-1.5 py-0.5 rounded-full",
                          STATUS_BADGE[c.status] ?? "bg-muted text-muted-foreground"
                        )}
                      >
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Module breakdown */}
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center gap-2">
            <Icon name="grid" size={18} className="text-primary" />
            <h3 className="font-semibold text-sm">هزینه‌ها بر اساس ماژول</h3>
          </div>
          <div className="p-5 space-y-4">
            {Object.entries(MODULE_META).map(([key, meta]) => {
              const count = moduleBreakdown[key] ?? 0;
              const pct = Math.round((count / totalCosts) * 100);
              const moduleAmount = costs
                .filter((c) => c.module === key)
                .reduce((sum, c) => sum + (c.amount || 0), 0);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "size-7 rounded-md grid place-items-center",
                          meta.color
                        )}
                      >
                        <Icon name={meta.icon} size={14} />
                      </div>
                      <span className="text-sm font-medium">{meta.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {pct}%
                      </span>
                      <span className="text-sm font-bold tabular-nums">
                        {count}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", meta.bar)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 tabular-nums" dir="ltr">
                    مجموع: {formatCurrency(moduleAmount)}
                  </div>
                </div>
              );
            })}

            {/* Total at the bottom */}
            <div className="pt-3 border-t flex items-center justify-between">
              <span className="text-xs text-muted-foreground">مجموع هزینه‌ها</span>
              <span className="text-sm font-bold tabular-nums" dir="ltr">
                {formatCurrency(totalAmount)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {modal}
    </div>
  );
}
