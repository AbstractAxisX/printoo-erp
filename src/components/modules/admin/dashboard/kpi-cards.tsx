"use client";

import * as React from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/lib/icons";
import { TimeRangePicker } from "@/components/ui/time-range-picker";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getPreset, type TimeRange } from "@/lib/time-ranges";
import { useDashboardKpis } from "./use-dashboard-data";

export type KpiCardConfig = {
  key: string;
  label: string;
  icon: IconName;
  color: string;
  isCurrency?: boolean;
};

export const KPI_CARDS: KpiCardConfig[] = [
  { key: "revenue", label: "درآمد کل", icon: "wallet", color: "emerald", isCurrency: true },
  { key: "orders", label: "سفارشات جدید", icon: "orders", color: "violet" },
  { key: "avgOrderValue", label: "میانگین ارزش سفارش", icon: "chart", color: "blue", isCurrency: true },
  { key: "newCustomers", label: "مشتریان جدید", icon: "customers", color: "teal" },
  { key: "completed", label: "تکمیل شده", icon: "checkCircle", color: "emerald" },
  { key: "urgent", label: "سفارشات فوری", icon: "alertTriangle", color: "rose" },
  { key: "payments", label: "پرداخت‌های دریافتی", icon: "creditCard", color: "amber", isCurrency: true },
  { key: "profit", label: "سود تخمینی", icon: "trending", color: "cyan", isCurrency: true },
];

const COLOR_MAP: Record<string, { bg: string; text: string; stroke: string }> = {
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-600 dark:text-emerald-400", stroke: "#10b981" },
  violet: { bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-600 dark:text-violet-400", stroke: "#8b5cf6" },
  blue: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-600 dark:text-blue-400", stroke: "#3b82f6" },
  teal: { bg: "bg-teal-50 dark:bg-teal-950/40", text: "text-teal-600 dark:text-teal-400", stroke: "#14b8a6" },
  rose: { bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-600 dark:text-rose-400", stroke: "#f43f5e" },
  amber: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-600 dark:text-amber-400", stroke: "#f59e0b" },
  cyan: { bg: "bg-cyan-50 dark:bg-cyan-950/40", text: "text-cyan-600 dark:text-cyan-400", stroke: "#06b6d4" },
};

export function KpiCardsGrid({
  globalRange,
  onGlobalRangeChange,
  showChart,
  onToggleChart,
}: {
  globalRange: TimeRange;
  onGlobalRangeChange: (r: TimeRange) => void;
  showChart: boolean;
  onToggleChart: () => void;
}) {
  const [cardRanges, setCardRanges] = React.useState<Record<string, TimeRange>>({});

  return (
    <div className="space-y-3">
      {/* Header with global filter + chart toggle + reset */}
      <div className="flex flex-wrap items-center gap-2">
        <TimeRangePicker value={globalRange} onChange={onGlobalRangeChange} />
        <button
          onClick={onToggleChart}
          className={cn(
            "size-9 rounded-lg border grid place-items-center transition",
            showChart ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          )}
          title={showChart ? "نمایش اعداد" : "نمایش نمودار"}
        >
          <Icon name={showChart ? "grid" : "chart"} size={16} />
        </button>
        <button
          onClick={() => { onGlobalRangeChange(getPreset("this-month")); setCardRanges({}); }}
          className="size-9 rounded-lg border grid place-items-center hover:bg-accent transition text-muted-foreground hover:text-foreground"
          title="ریست فیلترها"
        >
          <Icon name="refresh" size={15} />
        </button>
        <div className="text-xs text-muted-foreground mr-auto">به‌روزرسانی خودکار هر ۱۵ ثانیه</div>
      </div>

      {/* KPI cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {KPI_CARDS.map((cfg) => (
          <KpiCard
            key={cfg.key}
            config={cfg}
            range={cardRanges[cfg.key] ?? globalRange}
            globalLabel={globalRange.label}
            showChart={showChart}
            onRangeChange={(r) => setCardRanges((prev) => ({ ...prev, [cfg.key]: r }))}
            onCardRangeReset={() => setCardRanges((prev) => { const n = { ...prev }; delete n[cfg.key]; return n; })}
          />
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  config, range, globalLabel, showChart, onRangeChange, onCardRangeReset,
}: {
  config: KpiCardConfig;
  range: TimeRange;
  globalLabel: string;
  showChart: boolean;
  onRangeChange: (r: TimeRange) => void;
  onCardRangeReset: () => void;
}) {
  // R6: all 8 cards with the same range share ONE fetch via TanStack queryKey dedupe
  // (was: 8 independent queries with staleTime:0 → 8 calls on mount + 8 every 15s).
  // R11: queryKey now under ["dashboard","kpi",...] prefix → invalidations land.
  const { data } = useDashboardKpis(range);

  const colors = COLOR_MAP[config.color] ?? { bg: "bg-muted", text: "text-muted-foreground", stroke: "#94a3b8" };
  const kpi = data?.kpis?.[config.key];
  const chartData = data?.series?.[config.key] ?? [];
  const hasOverride = range.label !== globalLabel;
  const fmt = (v: number) => config.isCurrency ? formatCurrency(v) : formatNumber(v);

  return (
    <Card className="p-4 relative overflow-hidden group hover:shadow-md transition-shadow">
      {/* Header: icon + BIG label */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className={cn("size-10 rounded-xl grid place-items-center shrink-0", colors.bg)}>
          <Icon name={config.icon} size={20} className={colors.text} />
        </div>
        <div className="text-base font-bold leading-tight">{config.label}</div>
      </div>

      {/* Flip container: number ↔ chart */}
      <div className="relative" style={{ minHeight: showChart ? 64 : 32 }}>
        <div className={cn("transition-all duration-300", showChart ? "opacity-0 scale-95 pointer-events-none absolute inset-0" : "opacity-100 scale-100")}>
          <div className="text-2xl font-bold tabular-nums truncate" dir="ltr">
            {kpi ? fmt(kpi.value) : "—"}
          </div>
        </div>
        {showChart && (
          <div className={cn("transition-all duration-300", showChart ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none absolute inset-0")}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={56}>
                <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`grad-${config.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={colors.stroke} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={colors.stroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={["dataMin", "dataMax"]} />
                  <Area type="monotone" dataKey="value" stroke={colors.stroke} strokeWidth={2} fill={`url(#grad-${config.key})`} isAnimationActive={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb", padding: "4px 8px" }}
                    formatter={(v: number) => [fmt(v), config.label]}
                    labelFormatter={(l) => l}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-14 grid place-items-center text-xs text-muted-foreground">داده‌ای برای نمودار</div>
            )}
          </div>
        )}
      </div>

      {/* Total + change */}
      <div className="flex items-center gap-2 mt-1.5 text-[11px]">
        <span className="text-muted-foreground">
          کل: <span className="tabular-nums" dir="ltr">{kpi ? fmt(kpi.total) : "—"}</span>
        </span>
        {kpi && (
          <span className={cn("flex items-center gap-0.5 font-medium", kpi.change >= 0 ? "text-emerald-600" : "text-rose-600")}>
            <Icon name={kpi.change >= 0 ? "arrowUp" : "arrowDown"} size={10} />
            {Math.abs(kpi.change)}%
          </span>
        )}
      </div>

      {/* Per-card time filter */}
      <div className="mt-2 pt-2 border-t">
        <TimeRangePicker value={range} onChange={onRangeChange} compact className="w-full justify-between text-[11px] h-7" />
        {hasOverride && (
          <button onClick={onCardRangeReset} className="text-[10px] text-muted-foreground hover:text-foreground mt-1 flex items-center gap-1">
            <Icon name="cancel" size={10} /> بازگشت به فیلتر اصلی ({globalLabel})
          </button>
        )}
      </div>
    </Card>
  );
}
