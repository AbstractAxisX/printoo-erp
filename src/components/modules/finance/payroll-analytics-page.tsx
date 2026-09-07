"use client";

// ─── Phase 16: تحلیل حقوق — مالی ───────────────────────────────────────
// تحلیل و مانیتورینگ حقوق (فول اپشن):
//   ۱) فیلتر سراسری زمان (TimeRangePicker — الگوی داشبورد مالی)
//   ۲) ردیف KPI: جمع پرداختی بازه • میانگین ماهانه • ماه‌های پرداخت •
//      کارمندان • مساعدهٔ کسرنشده
//   ۳) کارت مقایسهٔ ماه‌به‌ماه (lastDelta) با دو میلهٔ نرمال‌شده
//   ۴) نمودار روند ماهانه (BarChart — تولتیپ فارسی، پالت emerald)
//   ۵) کارت‌های حقوق به تفکیک ماژول (+سهم) با نکتهٔ شمارش چند-ماژولی
//   ۶) جدول کارمندان (DataTable: جستجو + مرتب‌سازی؛ کلیک فقط برای مدیر)
//   ۷) کارت‌های لینک: تاریخچه هزینه‌ها / مدیریت دورهٔ جاری

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { PageHeader, EmptyState, LoadingState } from "@/components/shared";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { TimeRangePicker } from "@/components/ui/time-range-picker";
import { getPreset, type TimeRange } from "@/lib/time-ranges";
import { formatCurrency, formatNumber, formatDate } from "@/lib/format";
import { MODULES } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ─── Types (قرارداد /api/payroll/analytics) ─────────────────────────────

type Analytics = {
  kpis: {
    totalPaid: number;
    monthsCount: number;
    avgPerMonth: number;
    employeesCount: number;
    entriesCount: number;
  };
  monthly: { key: string; paidSum: number; entriesCount: number }[];
  byModule: { module: string; sum: number; count: number }[];
  byEmployee: {
    userId: string;
    name: string;
    modules: string[];
    sum: number;
    monthsCount: number;
    avg: number;
    lastPaidAt: string | null;
  }[];
  advances: {
    pendingSum: number;
    pendingCount: number;
    paidInRangeSum: number;
    paidInRangeCount: number;
  };
  lastDelta: {
    currentKey: string;
    prevKey: string;
    current: number;
    prev: number;
    pct: number;
  } | null;
};

// ─── رنگ چیپ/میلهٔ ماژول — الگوی سیستم (monitoring-users) ─────────────

const MODULE_COLORS: Record<string, string> = {
  admin: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
  designer: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  print: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  warehouse: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
  finance: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  qc: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  crm: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
  srm: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
};

const MODULE_BAR: Record<string, string> = {
  admin: "bg-teal-500",
  designer: "bg-violet-500",
  print: "bg-amber-500",
  warehouse: "bg-cyan-500",
  finance: "bg-rose-500",
  qc: "bg-blue-500",
  crm: "bg-teal-500",
  srm: "bg-orange-500",
};

// ─── کمکی‌ها ────────────────────────────────────────────────────────────

function fa(n: number): string {
  return n.toLocaleString("fa-IR");
}

function faDigits(s: string): string {
  return s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

function moduleLabel(key: string): string {
  if (key === "none") return "بدون ماژول";
  const meta = (MODULES as Record<string, { faLabel: string }>)[key];
  return meta?.faLabel ?? key;
}

function compactTick(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${Math.round(v / 1_000_000)}M`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(v);
}

function ModuleChip({ module }: { module: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        MODULE_COLORS[module] ?? "bg-muted text-muted-foreground"
      )}
    >
      {moduleLabel(module)}
    </span>
  );
}

// ─── KPI card ───────────────────────────────────────────────────────────

const TONE: Record<string, { bg: string; text: string; ring: string }> = {
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/20" },
  teal: { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400", ring: "ring-teal-500/20" },
  violet: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", ring: "ring-violet-500/20" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/20" },
  rose: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", ring: "ring-rose-500/20" },
};

function KpiCard({
  icon,
  tone,
  label,
  value,
  hint,
  rangeLabel,
}: {
  icon: IconName;
  tone: keyof typeof TONE;
  label: string;
  value: string;
  hint: string;
  rangeLabel: string;
}) {
  const c = TONE[tone];
  return (
    <Card className={cn("p-4 ring-1", c.ring)}>
      <div className={cn("size-10 rounded-xl grid place-items-center shrink-0", c.bg, c.text)}>
        <Icon name={icon} size={19} />
      </div>
      <div className="text-2xl font-bold tabular-nums mt-2.5 truncate" dir="ltr" title={value}>
        {value}
      </div>
      <div className="text-xs font-medium text-muted-foreground mt-1">{label}</div>
      <div className="text-[10px] text-muted-foreground/70 mt-1.5 pt-1.5 border-t">
        {hint} • {rangeLabel}
      </div>
    </Card>
  );
}

// ─── کارت مقایسهٔ ماه‌به‌ماه (lastDelta) ───────────────────────────────

function MoMDeltaCard({ delta }: { delta: Analytics["lastDelta"] }) {
  if (!delta) {
    return (
      <Card className="p-4 ring-1 ring-muted min-h-[152px] flex flex-col items-center justify-center text-center">
        <Icon name="trending" size={24} className="text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground mt-2 max-w-[220px]">
          برای مقایسهٔ ماه‌به‌ماه، حداقل دو ماه پرداخت در بازه لازم است
        </p>
      </Card>
    );
  }
  const up = delta.pct >= 0;
  const max = Math.max(delta.current, delta.prev, 1);
  const bar = (label: string, value: number, cls: string) => (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-12 shrink-0 tabular-nums" dir="ltr">
        {faDigits(label)}
      </span>
      <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", cls)} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-[10px] font-medium tabular-nums shrink-0" dir="ltr">
        {formatNumber(value)}
      </span>
    </div>
  );
  return (
    <Card className={cn("p-4 ring-1", up ? TONE.emerald.ring : TONE.rose.ring)}>
      <div className="flex items-center gap-2.5">
        <div className={cn("size-10 rounded-xl grid place-items-center shrink-0", up ? TONE.emerald.bg : TONE.rose.bg, up ? TONE.emerald.text : TONE.rose.text)}>
          <Icon name={up ? "arrowUp" : "arrowDown"} size={19} />
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-bold tabular-nums" dir="ltr">
            {up ? "+" : "−"}{fa(Math.abs(delta.pct))}٪
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            دورهٔ <span dir="ltr" className="tabular-nums">{faDigits(delta.currentKey)}</span> نسبت به{" "}
            <span dir="ltr" className="tabular-nums">{faDigits(delta.prevKey)}</span>
          </div>
        </div>
      </div>
      <div className="mt-3.5 space-y-2">
        {bar(delta.currentKey, delta.current, up ? "bg-emerald-500" : "bg-rose-500")}
        {bar(delta.prevKey, delta.prev, "bg-muted-foreground/25")}
      </div>
    </Card>
  );
}

// ─── نمودار روند ماهانه ────────────────────────────────────────────────

function TrendChartCard({ monthly }: { monthly: Analytics["monthly"] }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 grid place-items-center">
            <Icon name="chartColumn" size={17} />
          </div>
          <div>
            <h3 className="font-semibold text-sm">روند ماهانهٔ حقوق</h3>
            <p className="text-[11px] text-muted-foreground">جمع خالص پرداختی هر دوره — کلید دوره میلادی yyyy-MM</p>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground">{fa(monthly.length)} دورهٔ پرداخت‌شده</span>
      </div>
      <div className="p-4">
        {monthly.length === 0 ? (
          <div className="h-60 grid place-items-center text-xs text-muted-foreground">
            در این بازه حقوقی پرداخت نشده است
          </div>
        ) : (
          <div className="h-60" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.15} />
                <XAxis
                  dataKey="key"
                  tickFormatter={(v: string) => faDigits(v)}
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={6}
                />
                <YAxis
                  tickFormatter={(v: number) => compactTick(v)}
                  width={40}
                  tick={{ fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "currentColor", fillOpacity: 0.08 }}
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    padding: "4px 8px",
                    direction: "rtl",
                  }}
                  formatter={(value: number) => [formatCurrency(value), "جمع پرداختی"]}
                  labelFormatter={(label: string) => {
                    const m = monthly.find((x) => x.key === label);
                    return m ? `${faDigits(label)} • ${fa(m.entriesCount)} ورودی` : faDigits(label);
                  }}
                />
                <Bar dataKey="paidSum" name="جمع پرداختی" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── کارت‌های حقوق به تفکیک ماژول ─────────────────────────────────────

function ModuleCardsSection({ byModule, totalPaid }: { byModule: Analytics["byModule"]; totalPaid: number }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 grid place-items-center">
            <Icon name="grid" size={17} />
          </div>
          <div>
            <h3 className="font-semibold text-sm">حقوق به تفکیک ماژول</h3>
            <p className="text-[11px] text-muted-foreground">جمع پرداختیِ ورودی‌های هر ماژول در بازه</p>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground"
          title="ورودی هر کارمند به ازای هر ماژولش شمرده می‌شود"
        >
          <Icon name="info" size={11} />
          کارمندان چند-ماژولی در هر ماژول شمرده می‌شوند
        </span>
      </div>
      <div className="p-4">
        {byModule.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8">در این بازه حقوقی پرداخت نشده است</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {byModule.map((m) => {
              const share = totalPaid > 0 ? (m.sum / totalPaid) * 100 : 0;
              return (
                <Card key={m.module} className="p-3.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <ModuleChip module={m.module} />
                    <span className="text-[10px] text-muted-foreground shrink-0">{fa(m.count)} ورودی</span>
                  </div>
                  <div className="text-lg font-bold tabular-nums mt-2.5 truncate" dir="ltr" title={formatCurrency(m.sum)}>
                    {formatCurrency(m.sum)}
                  </div>
                  <div className="h-1.5 rounded-full bg-muted mt-2.5 overflow-hidden" title={`سهم ${Math.round(share)}٪ از کل`}>
                    <div
                      className={cn("h-full rounded-full", MODULE_BAR[m.module] ?? "bg-slate-400")}
                      style={{ width: `${Math.max(share, 2)}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1.5">{Math.round(share).toLocaleString("fa-IR")}٪ از کل بازه</div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

export function PayrollAnalyticsPage() {
  const navigate = useAppStore((s) => s.navigate);
  const user = useAppStore((s) => s.user);

  // الگوی داشبورد مالی — «this-year» برای دید ماهانه (پریست ۶ماهه موجود نیست)
  const [range, setRange] = React.useState<TimeRange>(() => getPreset("this-year"));
  const [q, setQ] = React.useState("");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["payroll-analytics", range.from.toISOString(), range.to.toISOString()],
    queryFn: () =>
      api<Analytics>(
        `/api/payroll/analytics?from=${range.from.toISOString()}&to=${range.to.toISOString()}`
      ),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const k = data?.kpis;
  const adv = data?.advances;
  const isMaster = user?.role === "master";

  const filteredEmployees = React.useMemo(() => {
    const list = data?.byEmployee ?? [];
    const query = q.trim().toLowerCase();
    return query ? list.filter((e) => e.name.toLowerCase().includes(query)) : list;
  }, [data, q]);

  const columns = React.useMemo<ColumnDef<Analytics["byEmployee"][number]>[]>(() => [
    {
      accessorKey: "name",
      header: "کارمند",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{row.original.name}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {row.original.modules.map((m) => (
              <ModuleChip key={m} module={m} />
            ))}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "sum",
      header: "جمع بازه",
      meta: { align: "end" },
      cell: ({ row }) => (
        <span className="font-semibold tabular-nums" dir="ltr">{formatCurrency(row.original.sum)}</span>
      ),
    },
    {
      accessorKey: "monthsCount",
      header: "ماه‌ها",
      meta: { align: "center" },
      cell: ({ row }) => <span className="tabular-nums">{fa(row.original.monthsCount)}</span>,
    },
    {
      accessorKey: "avg",
      header: "میانگین ماهانه",
      meta: { align: "end" },
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground" dir="ltr">{formatCurrency(row.original.avg)}</span>
      ),
    },
    {
      accessorKey: "lastPaidAt",
      header: "آخرین پرداخت",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
          {formatDate(row.original.lastPaidAt)}
        </span>
      ),
    },
  ], []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="تحلیل حقوق"
        icon="chartColumn"
        description={`روند ماهانه، تفکیک ماژول و مقایسهٔ کارمندان — بازهٔ ${range.label}`}
        actions={
          <div className="flex items-center gap-2">
            <TimeRangePicker value={range} onChange={setRange} compact />
            <Button variant="outline" size="sm" onClick={() => refetch()} title="به‌روزرسانی">
              <Icon name="refresh" size={14} className={isFetching ? "animate-spin" : ""} />
            </Button>
          </div>
        }
      />

      {isLoading && <LoadingState label="در حال بارگذاری تحلیل حقوق…" />}

      {!isLoading && (error || !data) && (
        <EmptyState
          icon="alertTriangle"
          title="خطا در دریافت تحلیل حقوق"
          description={error instanceof Error ? error.message : "داده‌ای دریافت نشد"}
          action={
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetch()}>
              <Icon name="refresh" size={14} /> تلاش دوباره
            </Button>
          }
        />
      )}

      {!isLoading && data && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard
              icon="money"
              tone="emerald"
              label="جمع پرداختی بازه"
              value={formatCurrency(k?.totalPaid ?? 0)}
              hint={`${fa(k?.entriesCount ?? 0)} ورودی پرداخت‌شده`}
              rangeLabel={range.label}
            />
            <KpiCard
              icon="chartColumn"
              tone="teal"
              label="میانگین ماهانه"
              value={formatCurrency(k?.avgPerMonth ?? 0)}
              hint="جمع ÷ ماه‌های پرداخت"
              rangeLabel={range.label}
            />
            <KpiCard
              icon="calendar"
              tone="violet"
              label="ماه‌های پرداخت"
              value={fa(k?.monthsCount ?? 0)}
              hint="دوره‌های دارای پرداخت در بازه"
              rangeLabel={range.label}
            />
            <KpiCard
              icon="userGroup"
              tone="rose"
              label="کارمندان"
              value={fa(k?.employeesCount ?? 0)}
              hint="دریافت‌کنندگان حقوق در بازه"
              rangeLabel={range.label}
            />
            <KpiCard
              icon="giftCard"
              tone="amber"
              label="مساعدهٔ کسرنشده"
              value={formatCurrency(adv?.pendingSum ?? 0)}
              hint={`${fa(adv?.pendingCount ?? 0)} مساعده در انتظار کسر`}
              rangeLabel="همه زمان‌ها"
            />
          </div>

          {/* MoM delta + روند ماهانه */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <MoMDeltaCard delta={data.lastDelta} />
            <div className="lg:col-span-3">
              <TrendChartCard monthly={data.monthly} />
            </div>
          </div>

          {/* تفکیک ماژول */}
          <ModuleCardsSection byModule={data.byModule} totalPaid={k?.totalPaid ?? 0} />

          {/* جدول کارمندان */}
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center gap-2.5 flex-wrap">
              <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
                <Icon name="userGroup" size={17} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">کارمندان ({fa(filteredEmployees.length)})</h3>
                <p className="text-[11px] text-muted-foreground">
                  جمع بازه و میانگین ماهانهٔ هر کارمند{isMaster ? " — کلیک: مانیتورینگ کاربر" : ""}
                </p>
              </div>
            </div>
            <div className="p-4">
              {data.byEmployee.length === 0 ? (
                <EmptyState
                  icon="userGroup"
                  title="کارمندی در این بازه حقوق نگرفته است"
                  description="پس از پرداخت دوره، آمار همین‌جا جمع می‌شود."
                  className="py-8"
                />
              ) : (
                <DataTable
                  columns={columns}
                  data={filteredEmployees}
                  globalFilter={q}
                  onGlobalFilterChange={setQ}
                  searchPlaceholder="جستجوی کارمند…"
                  showColumnToggle={false}
                  pageSize={10}
                  dense
                  onRowClick={isMaster ? (row) => navigate("sysadmin", "user", row.userId) : undefined}
                />
              )}
            </div>
          </Card>

          {/* کارت‌های لینک */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card
              role="button"
              tabIndex={0}
              onClick={() => navigate("finance", "costs")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate("finance", "costs");
                }
              }}
              className="p-4 ring-1 ring-rose-500/15 cursor-pointer hover:shadow-md hover:scale-[1.01] transition group"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 grid place-items-center shrink-0">
                  <Icon name="receipt" size={19} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm">هزینه‌های حقوق در تاریخچه هزینه‌ها</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    هر پرداخت حقوق/مساعده یک سند هزینهٔ تأییدشدهٔ «حقوق» است
                  </p>
                </div>
                <Icon name="arrowLeft" size={15} className="text-muted-foreground/40 group-hover:text-foreground group-hover:-translate-x-0.5 transition mr-auto shrink-0" />
              </div>
            </Card>
            <Card
              role="button"
              tabIndex={0}
              onClick={() => navigate("finance", "payroll")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate("finance", "payroll");
                }
              }}
              className="p-4 ring-1 ring-emerald-500/15 cursor-pointer hover:shadow-md hover:scale-[1.01] transition group"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 grid place-items-center shrink-0">
                  <Icon name="wallet" size={19} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm">مدیریت دورهٔ جاری</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    ویرایش ارقام، مساعده و پرداخت دورهٔ باز
                  </p>
                </div>
                <Icon name="arrowLeft" size={15} className="text-muted-foreground/40 group-hover:text-foreground group-hover:-translate-x-0.5 transition mr-auto shrink-0" />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
