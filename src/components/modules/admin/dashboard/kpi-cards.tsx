"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/lib/icons";
import { TimeRangePicker } from "@/components/ui/time-range-picker";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { rangeToParams, type TimeRange } from "@/lib/time-ranges";

type KpiData = {
  value: number;
  prev: number;
  change: number;
  total: number;
};

type ChartPoint = { date: string; value: number };

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
  { key: "completed", label: "سفارشات تکمیل شده", icon: "checkCircle", color: "emerald" },
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

  const { data } = useQuery({
    queryKey: ["dashboard-kpi", globalRange.preset, globalRange.from.toISOString(), globalRange.to.toISOString()],
    queryFn: () => api<{ kpis: Record<string, KpiData>; chartData: ChartPoint[] }>(
      `/api/dashboard?${rangeToParams(globalRange)}`
    ),
    refetchInterval: 15000,
  });

  const kpis = data?.kpis;
  const chartData = data?.chartData ?? [];

  function getCardRange(cardKey: string): TimeRange {
    return cardRanges[cardKey] ?? globalRange;
  }

  return (
    <div className="space-y-3">
      {/* Header with global filter + chart toggle */}
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
        <div className="text-xs text-muted-foreground mr-auto">
          {kpis ? "به‌روزرسانی خودکار هر ۱۵ ثانیه" : "در حال بارگذاری..."}
        </div>
      </div>

      {/* KPI cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {KPI_CARDS.map((cfg) => {
          const kpi = kpis?.[cfg.key];
          const cardRange = getCardRange(cfg.key);
          const hasOverride = cardRange.label !== globalRange.label;
          return (
            <KpiCard
              key={cfg.key}
              config={cfg}
              data={kpi}
              range={cardRange}
              globalLabel={globalRange.label}
              showChart={showChart}
              chartData={chartData}
              onCardRangeReset={() => {
                setCardRanges((prev) => {
                  const n = { ...prev };
                  delete n[cfg.key];
                  return n;
                });
              }}
              onRangeChange={(r) => setCardRanges((prev) => ({ ...prev, [cfg.key]: r }))}
            />
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({
  config, data, range, onRangeChange, globalLabel, showChart, chartData, onCardRangeReset,
}: {
  config: KpiCardConfig;
  data?: KpiData;
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
  globalLabel: string;
  showChart: boolean;
  chartData: ChartPoint[];
  onCardRangeReset: () => void;
}) {
  const colors = COLOR_MAP[config.color];
  const hasOverride = range.label !== globalLabel;
  const fmt = (v: number) => config.isCurrency ? formatCurrency(v) : formatNumber(v);

  return (
    <Card className="p-3.5 relative overflow-hidden group hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={cn("size-9 rounded-lg grid place-items-center", colors.bg)}>
          <Icon name={config.icon} size={18} className={colors.text} />
        </div>
      </div>

      {/* Flip container */}
      <div className="relative mt-2.5" style={{ minHeight: showChart ? 64 : 32 }}>
        <div
          className={cn("transition-all duration-300", showChart ? "opacity-0 scale-95 pointer-events-none absolute inset-0" : "opacity-100 scale-100")}
        >
          <div className="text-xl font-bold tabular-nums truncate" dir="ltr">
            {data ? fmt(data.value) : "—"}
          </div>
        </div>
        {showChart && (
          <div className={cn("transition-all duration-300", showChart ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none absolute inset-0")}>
            <ResponsiveContainer width="100%" height={56}>
              <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-${config.color}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.stroke} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={colors.stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke={colors.stroke} strokeWidth={2} fill={`url(#grad-${config.color})`} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(v: number) => [fmt(v), ""]}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground mt-0.5">{config.label}</div>

      {/* Total + change */}
      <div className="flex items-center gap-2 mt-1.5 text-[11px]">
        <span className="text-muted-foreground">
          کل: <span className="tabular-nums" dir="ltr">{data ? fmt(data.total) : "—"}</span>
        </span>
        {data && (
          <span className={cn("flex items-center gap-0.5 font-medium", data.change >= 0 ? "text-emerald-600" : "text-rose-600")}>
            <Icon name={data.change >= 0 ? "arrowUp" : "arrowDown"} size={10} />
            {Math.abs(data.change)}%
          </span>
        )}
      </div>

      {/* Per-card time filter */}
      <div className="mt-2 pt-2 border-t">
        <TimeRangePicker
          value={range}
          onChange={onRangeChange}
          compact
          className="w-full justify-between text-[11px] h-7"
        />
        {hasOverride && (
          <button
            onClick={onCardRangeReset}
            className="text-[10px] text-muted-foreground hover:text-foreground mt-1 flex items-center gap-1"
          >
            <Icon name="cancel" size={10} /> بازگشت به فیلتر اصلی ({globalLabel})
          </button>
        )}
      </div>
    </Card>
  );
}
