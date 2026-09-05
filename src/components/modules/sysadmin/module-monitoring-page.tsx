"use client";

// Printoo24 ERP — Phase 13: «مانیتورینگ ماژول» (برد ظرف کار ماژول)
//
// سناریوی کاربر: «ادمین میخواد ببینه تو ماژول طراح هر کارمند چند سفارش
// داره، کی سرش شلوغ تره، کی تا کی کار داره، کی خلوت میشه و کی کم کاری
// کرده — بعد سفارش جدید رو به همون کسی پاس بده که خالی‌تره».
// قاتلِ صفحه: بنر «پیشنهاد تخصیص» — بهترین عضو در یک نگاه.
// همان برد برای چاپ (و هر ماژول دیگری) با آمار اختصاصی همان ماژول کار
// می‌کند: GET /api/monitoring/modules?module&from&to → ModuleBoardReport.

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/shared";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import { useAppStore } from "@/stores/app-store";
import { MODULES, type ModuleKey } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ModuleBoardReport, ModuleEmployeeRow } from "@/lib/monitoring";

// ─── بازهٔ زمانی (yyyy-MM-dd لوکال — قرارداد API) ───────────────────

type RangeMode = "week" | "month" | "quarter" | "custom";
type SortMode = "workload" | "delay" | "completion";

const RANGE_CHIPS: { id: RangeMode; label: string }[] = [
  { id: "week", label: "این هفته" },
  { id: "month", label: "این ماه" },
  { id: "quarter", label: "۳ ماه" },
  { id: "custom", label: "بازهٔ دلخواه" },
];

const SORT_CHIPS: { id: SortMode; label: string }[] = [
  { id: "workload", label: "ظرف کار" },
  { id: "delay", label: "تاخیر" },
  { id: "completion", label: "عملکرد" },
];

function localDayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// نمایش کلید روز (yyyy-MM-dd) بدون خطای تایم‌زون — تاریخ لوکال
function formatDayKey(key: string | null | undefined): string {
  if (!key) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return formatDate(key);
  return formatDate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function daysBetweenKeys(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function presetRange(mode: RangeMode): { from: string; to: string } {
  const now = new Date();
  const to = localDayKey(now);
  if (mode === "week") {
    return { from: localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())), to };
  }
  if (mode === "quarter") {
    return { from: localDayKey(new Date(now.getFullYear(), now.getMonth() - 3, 1)), to };
  }
  return { from: localDayKey(new Date(now.getFullYear(), now.getMonth(), 1)), to }; // این ماه
}

const fa = (n: number) => n.toLocaleString("fa-IR");

// ─── رنگ‌ها (بدون blue/indigo) ──────────────────────────────────────

const MODULE_TONE: Record<ModuleKey, { chip: string; dot: string; barBg: string; bar: string }> = {
  admin: {
    chip: "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
    dot: "bg-emerald-500",
    barBg: "bg-emerald-500",
    bar: "#10b981",
  },
  designer: {
    chip: "border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
    dot: "bg-violet-500",
    barBg: "bg-violet-500",
    bar: "#8b5cf6",
  },
  print: {
    chip: "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    dot: "bg-amber-500",
    barBg: "bg-amber-500",
    bar: "#f59e0b",
  },
  warehouse: {
    chip: "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
    dot: "bg-sky-500",
    barBg: "bg-sky-500",
    bar: "#0ea5e9",
  },
  finance: {
    chip: "border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
    dot: "bg-rose-500",
    barBg: "bg-rose-500",
    bar: "#f43f5e",
  },
  qc: {
    chip: "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
    dot: "bg-emerald-500",
    barBg: "bg-emerald-500",
    bar: "#10b981",
  },
  crm: {
    chip: "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    dot: "bg-amber-500",
    barBg: "bg-amber-500",
    bar: "#f59e0b",
  },
  srm: {
    chip: "border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
    dot: "bg-rose-500",
    barBg: "bg-rose-500",
    bar: "#f43f5e",
  },
};

// ─── صفحه ───────────────────────────────────────────────────────────

export function ModuleMonitoringPage() {
  const navigate = useAppStore((s) => s.navigate);
  const [module, setModule] = React.useState<ModuleKey>("designer");
  const [rangeMode, setRangeMode] = React.useState<RangeMode>("month");
  const [customFrom, setCustomFrom] = React.useState<Date | null>(null);
  const [customTo, setCustomTo] = React.useState<Date | null>(null);
  const [sortMode, setSortMode] = React.useState<SortMode>("workload");

  const todayKey = React.useMemo(() => localDayKey(), []);

  const range = React.useMemo(() => {
    if (rangeMode !== "custom") return presetRange(rangeMode);
    const now = new Date();
    let from = customFrom ? localDayKey(customFrom) : localDayKey(new Date(now.getFullYear(), now.getMonth(), 1));
    let to = customTo ? localDayKey(customTo) : localDayKey(now);
    if (from > to) [from, to] = [to, from];
    return { from, to };
  }, [rangeMode, customFrom, customTo]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["monitoring", "modules", module, range.from, range.to],
    queryFn: () =>
      api<ModuleBoardReport>(
        `/api/monitoring/modules?module=${module}&from=${range.from}&to=${range.to}`
      ),
  });

  const employees = data?.employees ?? [];
  const tone = MODULE_TONE[module];
  const faLabel = MODULES[module].faLabel;

  // پیشنهاد تخصیص: بدون مرخصی → آنلاین → کمترین ظرف کار → کمترین تاخیر
  const activeEmps = React.useMemo(() => employees.filter((e) => !e.onLeaveToday), [employees]);
  const recommended = React.useMemo(() => {
    if (activeEmps.length === 0) return null;
    return [...activeEmps].sort(
      (a, b) =>
        Number(b.online) - Number(a.online) ||
        a.openItems - b.openItems ||
        a.delayedDays - b.delayedDays
    )[0];
  }, [activeEmps]);
  const allOnLeave = employees.length > 0 && activeEmps.length === 0;

  // پرمشغول‌ترین / خالی‌ترین (فقط با بیش از یک عضوِ فعال معنا دارد)
  const maxOpen = Math.max(1, ...employees.map((e) => e.openItems));
  const busiestId = React.useMemo(() => {
    if (employees.length < 2) return null;
    const busiest = employees.reduce((m, e) => (e.openItems > m.openItems ? e : m), employees[0]);
    return busiest.openItems > 0 ? busiest.userId : null;
  }, [employees]);
  const idlestId = React.useMemo(() => {
    if (activeEmps.length < 2) return null;
    const idlest = activeEmps.reduce((m, e) => (e.openItems < m.openItems ? e : m), activeEmps[0]);
    return idlest.userId !== busiestId ? idlest.userId : null;
  }, [activeEmps, busiestId]);

  const sorted = React.useMemo(() => {
    const list = [...employees];
    if (sortMode === "delay") {
      list.sort(
        (a, b) => b.delayedOpen - a.delayedOpen || b.delayedDays - a.delayedDays || a.name.localeCompare(b.name, "fa")
      );
    } else if (sortMode === "completion") {
      list.sort((a, b) => b.completedInRange - a.completedInRange || a.name.localeCompare(b.name, "fa"));
    } else {
      list.sort((a, b) => b.openItems - a.openItems || a.name.localeCompare(b.name, "fa"));
    }
    return list;
  }, [employees, sortMode]);

  const barData = React.useMemo(
    () => employees.map((e) => ({ name: e.name, openItems: e.openItems, delayed: e.delayedOpen })),
    [employees]
  );
  const trendData = React.useMemo(() => data?.completedTrend ?? [], [data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="مانیتورینگ ماژول"
        description="مقایسهٔ ظرف کار و عملکرد کارمندان هر ماژول — برای انتخاب مسئول"
        icon="chartColumn"
      />

      {/* انتخاب ماژول + بازه */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground font-medium me-1">ماژول:</span>
          {(Object.entries(MODULES) as [ModuleKey, { faLabel: string }][]).map(([key, info]) => {
            const active = key === module;
            const t = MODULE_TONE[key];
            return (
              <button
                key={key}
                onClick={() => setModule(key)}
                className={cn(
                  "h-8 px-3 rounded-full border text-xs font-medium transition flex items-center gap-1.5",
                  active ? t.chip : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <span className={cn("size-1.5 rounded-full", active ? t.dot : "bg-muted-foreground/40")} />
                {info.faLabel}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground font-medium me-1">بازه:</span>
          {RANGE_CHIPS.map((r) => (
            <button
              key={r.id}
              onClick={() => setRangeMode(r.id)}
              className={cn(
                "h-7 px-3 rounded-full border text-[11px] font-medium transition",
                rangeMode === r.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {r.label}
            </button>
          ))}
          {rangeMode === "custom" && (
            <div className="flex items-center gap-1.5">
              <DatePicker value={customFrom} onChange={setCustomFrom} placeholder="از تاریخ" className="h-8 w-36 text-xs" />
              <Icon name="arrowLeft" size={13} className="text-muted-foreground" />
              <DatePicker value={customTo} onChange={setCustomTo} placeholder="تا تاریخ" className="h-8 w-36 text-xs" />
            </div>
          )}
          <span className="text-[10px] text-muted-foreground ms-auto tabular-nums" dir="rtl">
            {formatDayKey(range.from)} — {formatDayKey(range.to)}
          </span>
        </div>
      </div>

      {/* بدنه */}
      {isLoading ? (
        <BoardSkeleton />
      ) : error ? (
        <EmptyState icon="shield" title="دسترسی محدود" description={error.message} />
      ) : !data ? (
        <EmptyState icon="chartColumn" title="داده‌ای دریافت نشد" description="برد این ماژول در دسترس نیست." />
      ) : employees.length === 0 ? (
        <EmptyState
          icon="userGroup"
          title={`کارمندی در «${faLabel}» فعال نیست`}
          description="کاربران فعالِ دارای این ماژول اینجا ظاهر می‌شوند. از «کاربران» ماژول‌ها را تیک بزنید."
        />
      ) : (
        <>
          {/* پیشنهاد تخصیص — قاتل صفحه */}
          {allOnLeave ? (
            <div className="rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-4 flex items-center gap-3">
              <span className="size-10 rounded-xl bg-amber-500/15 text-amber-600 grid place-items-center shrink-0">
                <Icon name="alertTriangle" size={20} />
              </span>
              <div className="min-w-0">
                <div className="font-bold text-sm">همهٔ اعضا در مرخصی‌اند</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  فعلاً هیچ عضوی از «{faLabel}» برای تخصیص کار جدید در دسترس نیست.
                </div>
              </div>
            </div>
          ) : recommended ? (
            <div className="rounded-xl border border-emerald-300 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 flex flex-wrap items-center gap-3">
              <span className="size-10 rounded-xl bg-emerald-500/15 text-emerald-600 grid place-items-center shrink-0">
                <Icon name="medal" size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                  پیشنهاد تخصیص — بهترین انتخاب برای سفارش جدید
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <span className="font-bold text-base">{recommended.name}</span>
                  <OnlineDot online={recommended.online} />
                  <span className="text-xs text-foreground/80">
                    کمترین ظرف کار ({fa(recommended.openItems)} آیتم)
                  </span>
                  {recommended.delayedDays > 0 && (
                    <span className="text-xs text-rose-600 dark:text-rose-400">
                      {fa(recommended.delayedDays)} روز تاخیر تجمعی
                    </span>
                  )}
                  {recommended.busyUntil && (
                    <span className="text-xs text-muted-foreground">
                      کار تا {formatDayKey(recommended.busyUntil)}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => navigate("sysadmin", "user", recommended.userId)}
                className="h-8 px-3 rounded-lg border border-emerald-300 dark:border-emerald-800 text-xs font-medium flex items-center gap-1.5 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 transition shrink-0"
              >
                <Icon name="chartColumn" size={14} /> مانیتورینگ کاربر
              </button>
            </div>
          ) : null}

          {/* KPI ها */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BoardKpi icon="userGroup" label="کارمندان" value={fa(employees.length)} tone="violet" />
            <BoardKpi icon="layers" label="آیتم‌های باز" value={fa(data.totals.openItems)} tone="amber" />
            <BoardKpi icon="alertTriangle" label="تاخیری" value={fa(data.totals.delayedOpen)} tone="rose" />
            <BoardKpi icon="checkCircle" label="تکمیل در بازه" value={fa(data.totals.completedInRange)} tone="emerald" />
          </div>

          {/* مقایسهٔ کارمندان */}
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30 flex flex-wrap items-center gap-2">
              <Icon name="userGroup" size={15} className="text-primary" />
              <span className="text-sm font-bold">مقایسهٔ کارمندان {faLabel}</span>
              <div className="flex items-center gap-1 ms-auto">
                <span className="text-[10px] text-muted-foreground me-1">مرتب‌سازی:</span>
                {SORT_CHIPS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSortMode(s.id)}
                    className={cn(
                      "h-7 px-2.5 rounded-lg border text-[11px] font-medium transition",
                      sortMode === s.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-3 space-y-2.5">
              {sorted.map((emp) => (
                <EmployeeCard
                  key={emp.userId}
                  emp={emp}
                  maxOpen={maxOpen}
                  tone={tone}
                  todayKey={todayKey}
                  isBusiest={emp.userId === busiestId}
                  isIdle={emp.userId === idlestId}
                  onOpen={() => navigate("sysadmin", "user", emp.userId)}
                />
              ))}
            </div>
          </Card>

          {/* نمودارها */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon name="chartBar" size={15} className="text-primary" />
                <span className="text-sm font-bold">ظرف کار کارمندان {faLabel}</span>
                <span className="text-[10px] text-muted-foreground mr-auto">
                  میله‌های قرمز = دارای آیتم تاخیری
                </span>
              </div>
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.25} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10 }}
                      interval={0}
                    />
                    <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                    <Tooltip content={<BoardBarTip />} cursor={{ fill: "rgba(148,163,184,0.15)" }} />
                    <Bar dataKey="openItems" radius={[6, 6, 0, 0]} maxBarSize={42}>
                      {barData.map((d, i) => (
                        <Cell key={i} fill={d.delayed > 0 ? "#f43f5e" : tone.bar} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] grid place-items-center text-xs text-muted-foreground">
                  داده‌ای برای نمودار
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon name="chartLine" size={15} className="text-primary" />
                <span className="text-sm font-bold">روند تکمیل {faLabel}</span>
                <span className="text-[10px] text-muted-foreground mr-auto">
                  آیتم‌ها و تسک‌های تکمیل‌شده در بازه
                </span>
              </div>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={trendData} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="grad-module-trend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.25} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: string) => v.slice(5).replace("-", "/")}
                      minTickGap={24}
                    />
                    <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                    <Tooltip content={<BoardTrendTip />} cursor={{ stroke: "rgba(16,185,129,0.4)" }} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#grad-module-trend)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] grid place-items-center text-xs text-muted-foreground">
                  داده‌ای برای نمودار
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ─── زیرقطعه‌ها ─────────────────────────────────────────────────────

function OnlineDot({ online }: { online: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
      <span
        className={cn(
          "size-2 rounded-full",
          online ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"
        )}
      />
      {online ? "آنلاین" : "آفلاین"}
    </span>
  );
}

function BoardKpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  tone: "violet" | "amber" | "rose" | "emerald";
}) {
  const toneCls = {
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  }[tone];
  return (
    <Card className="p-4 flex items-center gap-3">
      <span className={cn("size-10 rounded-xl grid place-items-center shrink-0", toneCls)}>
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0">
        <div className="text-xl font-bold tabular-nums" dir="ltr">
          {value}
        </div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}

function busyTone(busyUntil: string | null, todayKey: string): { cls: string; note: string; noteCls: string } {
  if (!busyUntil) return { cls: "text-muted-foreground", note: "بدون موعد", noteCls: "text-muted-foreground" };
  const diff = daysBetweenKeys(todayKey, busyUntil);
  if (diff < 0) return { cls: "text-rose-600 dark:text-rose-400", note: `${fa(Math.abs(diff))} روز گذشته`, noteCls: "text-rose-600 dark:text-rose-400" };
  if (diff === 0) return { cls: "text-amber-600 dark:text-amber-400", note: "موعد امروز", noteCls: "text-amber-600 dark:text-amber-400" };
  if (diff <= 3) return { cls: "text-amber-600 dark:text-amber-400", note: `${fa(diff)} روز مانده`, noteCls: "text-amber-600 dark:text-amber-400" };
  return { cls: "text-foreground", note: `${fa(diff)} روز مانده`, noteCls: "text-muted-foreground" };
}

function EmployeeCard({
  emp,
  maxOpen,
  tone,
  todayKey,
  isBusiest,
  isIdle,
  onOpen,
}: {
  emp: ModuleEmployeeRow;
  maxOpen: number;
  tone: { barBg: string };
  todayKey: string;
  isBusiest: boolean;
  isIdle: boolean;
  onOpen: () => void;
}) {
  const pct = Math.min(100, Math.round((emp.openItems / maxOpen) * 100));
  const busy = busyTone(emp.busyUntil, todayKey);

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition",
        isBusiest && "border-rose-300 dark:border-rose-800 bg-rose-50/30 dark:bg-rose-950/20",
        isIdle && "border-emerald-300 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/20",
        !isBusiest && !isIdle && "hover:bg-accent/40"
      )}
    >
      {/* سربرگ: هویت + نشان‌ها + اکشن */}
      <div className="flex flex-wrap items-center gap-2">
        <OnlineDot online={emp.online} />
        <span className="font-bold text-sm">{emp.name}</span>
        {isBusiest && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 px-2 py-0.5 text-[10px] font-bold">
            <Icon name="alertTriangle" size={11} /> پرمشغول‌ترین
          </span>
        )}
        {isIdle && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
            <Icon name="checkBadge" size={11} /> خالی‌ترین
          </span>
        )}
        {emp.onLeaveToday && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
            <Icon name="calendar" size={11} /> مرخصی تا {formatDayKey(emp.leaveUntil)}
          </span>
        )}
        <button
          onClick={onOpen}
          className="ms-auto h-7 px-2.5 rounded-lg border text-[11px] font-medium flex items-center gap-1 hover:bg-accent transition shrink-0"
        >
          <Icon name="chartColumn" size={13} /> مانیتورینگ کاربر
        </button>
      </div>

      {/* آمار چهارگانه */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
        {/* ظرف کار */}
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground mb-1">ظرف کار</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums leading-none" dir="ltr">
              {fa(emp.openItems)}
            </span>
            <span className="text-[10px] text-muted-foreground">آیتم باز</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden mt-2" title={`${pct}%`}>
            <div
              className={cn(
                "h-full rounded-full transition-all",
                emp.delayedOpen > 0 ? "bg-rose-500" : tone.barBg
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {emp.tasksOpen > 0 ? `+ ${fa(emp.tasksOpen)} تسک باز` : "بدون تسک باز"}
          </div>
        </div>

        {/* تا کی کار دارد */}
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground mb-1">تا کی کار دارد</div>
          <div className={cn("text-lg font-bold tabular-nums leading-tight", busy.cls)} dir="ltr">
            {emp.busyUntil ? formatDayKey(emp.busyUntil) : "—"}
          </div>
          <div className={cn("text-[10px] mt-1", busy.noteCls)}>{busy.note}</div>
        </div>

        {/* تاخیر */}
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground mb-1">تاخیر</div>
          <div
            className={cn(
              "text-lg font-bold tabular-nums leading-tight",
              emp.delayedOpen > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"
            )}
            dir="ltr"
          >
            {fa(emp.delayedOpen)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {emp.delayedOpen > 0 ? `مجموع ${fa(emp.delayedDays)} روز` : "بدون تاخیر"}
            {emp.tasksOverdue > 0 && ` • ${fa(emp.tasksOverdue)} تسک معوق`}
          </div>
        </div>

        {/* عملکرد بازه */}
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground mb-1">عملکرد در بازه</div>
          <div className="text-lg font-bold tabular-nums leading-tight" dir="ltr">
            {fa(emp.completedInRange)}
          </div>
          <div className="text-[10px] mt-1 flex items-center gap-1.5 flex-wrap">
            {emp.lateCompletions > 0 && (
              <span className="text-rose-600/80 dark:text-rose-400/80">{fa(emp.lateCompletions)} دیر</span>
            )}
            {emp.tasksDoneInRange > 0 && (
              <span className="text-muted-foreground">{fa(emp.tasksDoneInRange)} تسک</span>
            )}
            {emp.lateCompletions === 0 && emp.tasksDoneInRange === 0 && (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── تولتیپ‌های فارسی نمودارها ──────────────────────────────────────

function BoardBarTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number | string }[];
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const v = Number(payload[0]?.value ?? 0);
  return (
    <div dir="rtl" className="rounded-lg border bg-popover px-3 py-1.5 text-xs shadow-md">
      <div className="font-bold mb-0.5">{String(label ?? "")}</div>
      <div className="tabular-nums">
        {fa(v)} <span className="text-muted-foreground">آیتم باز</span>
      </div>
    </div>
  );
}

function BoardTrendTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number | string }[];
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const v = Number(payload[0]?.value ?? 0);
  return (
    <div dir="rtl" className="rounded-lg border bg-popover px-3 py-1.5 text-xs shadow-md">
      <div className="text-muted-foreground mb-0.5 tabular-nums" dir="ltr">
        {label ? formatDayKey(String(label)) : ""}
      </div>
      <div className="font-bold tabular-nums">
        {fa(v)} <span className="text-muted-foreground font-normal">تکمیل</span>
      </div>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
