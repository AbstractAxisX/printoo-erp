"use client";

// ─── Phase 13: صفحهٔ اختصاصی مانیتورینگ کاربر ─────────────────────────
//
// مسیر: دابل‌کلیک روی کاربر در «مانیتورینگ کاربران» (sysadmin:user —
// param = userId) یا «مانیتورینگ کامل من» از پروفایل.
// منبع داده: GET /api/monitoring/users/{id}?from=&to= → دقیقاً
// UserDetailReport از src/lib/monitoring.ts (نسخهٔ سریالایز‌شدهٔ JSON).
// شامل: سوییچ بازه (امروز/هفته/ماه/۳ماه/دلخواه)، کارت پروفایل، KPI،
// «گزارش امروز» (مهم‌ترین بخش)، اوورویو تاخیر سفارش/تسک، چارت BI
// تعاملی، سفارش‌های باز، خط زمانی بازه با فیلتر نوع رویداد و مرخصی‌ها
// (CRUD مدیر: POST /api/leaves + DELETE /api/leaves/{id}).

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { useInvalidate } from "@/lib/use-invalidate";
import { formatDate, relativeTime } from "@/lib/format";
import { Icon, type IconName } from "@/lib/icons";
import { MODULES } from "@/lib/constants";
import { cn } from "@/lib/utils";

import {
  EmptyState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// قرارداد API — فقط import type (در کامپایل پاک می‌شود، بدون وابستگی
// ران‌تایم به lib/db). Date ها بعد از JSON.stringify رشته‌ای‌اند:
import type { TimelineEvent, UserDetailReport } from "@/lib/monitoring";

type Json<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;

type UserDetail = Json<UserDetailReport>;
type UserEvent = Json<TimelineEvent>;
type LeaveRow = UserDetail["leaves"][number];
type RangeKey = { from: string; to: string };
type RangePresetId = "today" | "week" | "month" | "quarter" | "custom";

// ─── Helper ها ───────────────────────────────────────────────────────

const fa = (n: number): string => n.toLocaleString("fa-IR");

function dayKeyOf(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** yyyy-MM-dd → yyyy/MM/dd (بدون تبدیل تایم‌زون — میلادی، بدون جلالی) */
function fmtDayKey(key: string): string {
  return key.split("-").join("/");
}

function timeOf(iso: string): string {
  return formatDate(iso, true).split(" ")[1] ?? "";
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[1][0]}`;
}

// ─── Meta ها ─────────────────────────────────────────────────────────

const KPI_TONES = {
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
} as const;
type KpiTone = keyof typeof KPI_TONES;

const EVENT_META: Record<
  UserEvent["kind"],
  { icon: IconName; cls: string }
> = {
  login: { icon: "login", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  logout: { icon: "logout", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
  design_done: { icon: "design", cls: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  print_done: { icon: "print", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  task_done: { icon: "taskDone", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  task_created: { icon: "taskAdd", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  qc_reported: { icon: "shield", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  qc_reviewed: { icon: "shield", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  order_created: { icon: "orders", cls: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  leave: { icon: "calendar", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
};

const KIND_GROUPS: {
  id: string;
  label: string;
  kinds: readonly UserEvent["kind"][] | null;
}[] = [
  { id: "all", label: "همه", kinds: null },
  { id: "presence", label: "ورود/خروج", kinds: ["login", "logout"] },
  { id: "work", label: "کارها", kinds: ["design_done", "print_done", "order_created"] },
  { id: "tasks", label: "تسک‌ها", kinds: ["task_done", "task_created"] },
  { id: "qc", label: "کنترل کیفیت", kinds: ["qc_reported", "qc_reviewed"] },
  { id: "leave", label: "مرخصی", kinds: ["leave"] },
];

// رنگ‌ها هماهنگ با اپ: emerald/violet/amber/sky (بدون blue/indigo)
const SERIES = [
  { key: "logins", label: "ورودها", color: "#10b981" },
  { key: "itemsDone", label: "آیتم‌های تکمیل‌شده", color: "#8b5cf6" },
  { key: "tasksDone", label: "تسک‌های انجام‌شده", color: "#f59e0b" },
  { key: "qc", label: "کنترل کیفیت", color: "#0ea5e9" },
] as const;

const RANGE_CHIPS: { id: RangePresetId; label: string }[] = [
  { id: "today", label: "امروز" },
  { id: "week", label: "این هفته" },
  { id: "month", label: "این ماه" },
  { id: "quarter", label: "۳ ماه" },
  { id: "custom", label: "بازهٔ دلخواه" },
];

const STAGE_CHIP = {
  design: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  print: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  warehouse: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
} as const;

const MODULE_CHIP: Record<string, string> = {
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  blue: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

/** پیش‌تنظیم بازه — همه yyyy-MM-dd لوکال */
function presetRange(id: Exclude<RangePresetId, "custom">): RangeKey {
  const now = new Date();
  const to = dayKeyOf(now);
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (id) {
    case "today":
      return { from: to, to };
    case "week": {
      // هفته از شنبه — getDay: 0=یکشنبه … 6=شنبه
      const offset = (now.getDay() + 1) % 7;
      return { from: dayKeyOf(new Date(y, m, d - offset)), to };
    }
    case "month":
      return { from: dayKeyOf(new Date(y, m, 1)), to };
    case "quarter":
      return { from: dayKeyOf(new Date(y, m - 2, 1)), to };
  }
}

// ═════════════════════════ Component اصلی ═══════════════════════════

export function UserMonitoringPage() {
  const navigate = useAppStore((s) => s.navigate);
  const param = useAppStore((s) => s.param);
  const me = useAppStore((s) => s.user);
  const invalidate = useInvalidate();

  // مدیر سیستم/مدیر داخلی → CRUD مرخصی + بازگشت به مانیتورینگ کاربران
  const isManager =
    !!me && (me.role === "master" || (me.modules ?? []).includes("admin"));

  const todayKey = React.useMemo(() => dayKeyOf(new Date()), []);

  // ── بازهٔ زمانی (پیش‌فرض: این هفته) ──
  const [preset, setPreset] = React.useState<RangePresetId>("week");
  const [range, setRange] = React.useState<RangeKey>(() => presetRange("week"));
  const [draftFrom, setDraftFrom] = React.useState<Date | null>(null);
  const [draftTo, setDraftTo] = React.useState<Date | null>(null);

  function selectPreset(id: RangePresetId) {
    setPreset(id);
    if (id === "custom") {
      // پیش‌پر کردن با بازهٔ فعلی تا اعمال صریح
      const [fy, fm, fd] = range.from.split("-").map(Number);
      const [ty, tm, td] = range.to.split("-").map(Number);
      setDraftFrom(new Date(fy, fm - 1, fd));
      setDraftTo(new Date(ty, tm - 1, td));
    } else {
      setRange(presetRange(id));
    }
  }

  function applyCustom() {
    if (!draftFrom || !draftTo) {
      toast.error("تاریخ شروع و پایان را انتخاب کنید");
      return;
    }
    const from = dayKeyOf(draftFrom);
    const to = dayKeyOf(draftTo);
    if (to < from) {
      toast.error("تاریخ پایان نمی‌تواند قبل از شروع باشد");
      return;
    }
    setRange({ from, to });
  }

  // ── داده (queryKey شامل بازه → تغییر بازه = fetch جدید) ──
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["monitoring", "user", param, range.from, range.to],
    queryFn: () =>
      api<UserDetail>(
        `/api/monitoring/users/${param}?from=${range.from}&to=${range.to}`
      ),
    enabled: !!param,
    refetchInterval: 60_000,
  });

  const refreshMonitoring = React.useCallback(() => {
    void refetch();
    invalidate(["monitoring"]);
  }, [refetch, invalidate]);

  const goBack = () => {
    if (isManager) navigate("sysadmin", "users");
    else navigate("profile", "view");
  };

  // ── بدون param ──
  if (!param) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="مانیتورینگ کاربر"
          description="صفحهٔ اختصاصی هر کاربر — سفارش‌ها، تسک‌ها، تاخیرها، حضور و مرخصی"
          icon="userCircle"
          actions={
            <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5">
              <Icon name="arrowRight" size={14} /> بازگشت به کاربران
            </Button>
          }
        />
        <EmptyState
          icon="userCircle"
          title="کاربری انتخاب نشده"
          description="از فهرست «مانیتورینگ کاربران» روی یک کاربر دابل‌کلیک کنید تا صفحهٔ اختصاصی او باز شود."
          action={
            <Button onClick={goBack} className="gap-1.5">
              <Icon name="users" size={15} /> بازگشت به کاربران
            </Button>
          }
        />
      </div>
    );
  }

  const presenceText = data
    ? `${data.online ? "آنلاین" : "آفلاین"} · ${fa(data.kpis.loginsInRange)} ورود · ${fa(data.kpis.activeDays)} روز فعال`
    : undefined;

  return (
    <div className="space-y-5">
      {/* ۱) هدر */}
      <PageHeader
        title={data ? `مانیتورینگ کاربر — ${data.user.name}` : "مانیتورینگ کاربر"}
        description={
          presenceText
            ? `${presenceText} — از ${fmtDayKey(range.from)} تا ${fmtDayKey(range.to)}`
            : "صفحهٔ اختصاصی هر کاربر — سفارش‌ها، تسک‌ها، تاخیرها، حضور و مرخصی"
        }
        icon="userCircle"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5">
              <Icon name="arrowRight" size={14} /> بازگشت به کاربران
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void refetch()}
              title="به‌روزرسانی"
            >
              <Icon
                name="refresh"
                size={15}
                className={cn(isFetching && "animate-spin")}
              />
            </Button>
          </>
        }
      />

      {/* ۲) سوییچ بازه — بالای صفحه، برجسته */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Icon name="filterHorizontal" size={14} /> بازهٔ مانیتورینگ:
          </span>
          {RANGE_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => selectPreset(c.id)}
              className={cn(
                "h-8 px-3 rounded-full text-xs font-medium border transition",
                preset === c.id
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "hover:bg-accent"
              )}
            >
              {c.label}
            </button>
          ))}
          {preset === "custom" && (
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker
                value={draftFrom}
                onChange={setDraftFrom}
                placeholder="از تاریخ"
                className="h-8 text-xs"
              />
              <DatePicker
                value={draftTo}
                onChange={setDraftTo}
                placeholder="تا تاریخ"
                className="h-8 text-xs"
              />
              <Button size="sm" className="h-8" onClick={applyCustom}>
                اعمال بازه
              </Button>
            </div>
          )}
          <span className="mr-auto text-[11px] text-muted-foreground tabular-nums shrink-0">
            از {fmtDayKey(range.from)} تا {fmtDayKey(range.to)}
          </span>
        </div>
      </Card>

      {/* بدنهٔ داده */}
      {isLoading ? (
        <LoadingState label="در حال دریافت دادهٔ مانیتورینگ…" />
      ) : isError ? (
        <EmptyState
          icon="alert"
          title="خطا در دریافت دادهٔ مانیتورینگ"
          description={error instanceof Error ? error.message : "خطای نامشخص"}
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              تلاش مجدد
            </Button>
          }
        />
      ) : data ? (
        <>
          {/* ۳) کارت پروفایل */}
          <ProfileCard report={data} todayKey={todayKey} />

          {/* ۴) KPI ها */}
          <KpiGrid kpis={data.kpis} />

          {/* ۵) گزارش امروز — مهم‌ترین بخش */}
          <TodayReport events={data.today.events} />

          {/* ۶) اوورویو تاخیر */}
          <DelayOverview delay={data.delayOverview} />

          {/* ۷) چارت فعالیت (BI) */}
          <ActivityChartCard series={data.activitySeries} kpis={data.kpis} />

          {/* ۸) سفارش‌های باز */}
          <OpenOrdersCard orders={data.openOrders} isManager={isManager} />

          {/* ۹) خط زمانی بازه */}
          <TimelineCard events={data.timeline} />

          {/* ۱۰) مرخصی‌ها */}
          <LeavesCard
            userId={param}
            userName={data.user.name}
            leaves={data.leaves}
            isManager={isManager}
            todayKey={todayKey}
            onChanged={refreshMonitoring}
          />
        </>
      ) : null}
    </div>
  );
}

// ═════════════════════════ ۳) کارت پروفایل ══════════════════════════

function ProfileCard({ report, todayKey }: { report: UserDetail; todayKey: string }) {
  const u = report.user;
  const isMaster = u.role === "master";
  const activeLeave =
    report.leaves.find((l) => l.startDate <= todayKey && todayKey <= l.endDate) ?? null;

  return (
    <Card className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div
          className={cn(
            "size-14 rounded-2xl grid place-items-center text-lg font-bold shrink-0",
            isMaster
              ? "bg-gradient-to-br from-violet-500 to-sky-500 text-white"
              : "bg-primary/10 text-primary"
          )}
        >
          {initialsOf(u.name)}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold">{u.name}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px] font-medium",
                report.online ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  report.online ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                )}
              />
              {report.online ? "آنلاین" : "آفلاین"}
            </span>
            {report.onLeaveToday && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                {activeLeave ? `مرخصی تا ${fmtDayKey(activeLeave.endDate)}` : "در مرخصی"}
              </span>
            )}
            {u.status !== "active" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                غیرفعال
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {isMaster ? (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                مدیر سیستم
              </span>
            ) : (
              u.modules.map((m) => {
                const meta = MODULES[m as keyof typeof MODULES];
                return (
                  <span
                    key={m}
                    className={cn(
                      "text-[10px] font-medium px-2 py-0.5 rounded-full",
                      MODULE_CHIP[meta?.color ?? ""] ?? "bg-muted text-muted-foreground"
                    )}
                  >
                    {meta?.faLabel ?? m}
                  </span>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span dir="ltr" className="flex items-center gap-1.5">
              <Icon name="mail" size={13} className="shrink-0" />
              {u.email}
            </span>
            {u.phone && (
              <span dir="ltr" className="tabular-nums">
                {u.phone}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-2 sm:border-r sm:pr-4 shrink-0">
          <MetaItem label="عضویت" value={formatDate(u.createdAt)} />
          <MetaItem label="آخرین ورود" value={u.lastLoginAt ? formatDate(u.lastLoginAt, true) : "—"} />
          <MetaItem label="آخرین بازدید" value={u.lastSeenAt ? relativeTime(u.lastSeenAt) : "—"} />
          <MetaItem label="مجموع ورودها" value={fa(u.loginCount)} />
        </div>
      </div>
    </Card>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-xs font-medium tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

// ═════════════════════════ ۴) KPI ها ═════════════════════════════════

function KpiGrid({ kpis }: { kpis: UserDetail["kpis"] }) {
  const completedTotal = kpis.design.completed + kpis.print.completed + kpis.tasks.done;

  const delaySub = (delayed: number, days: number, unit: string) =>
    delayed > 0 ? (
      <span className="text-rose-600 dark:text-rose-400 font-medium">
        {fa(delayed)} {unit} تاخیری · مجموع {fa(days)} روز
      </span>
    ) : (
      <span className="text-emerald-600 dark:text-emerald-400">بدون تاخیر</span>
    );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <KpiCard
        icon="design"
        tone="violet"
        label="طراحیِ باز"
        value={fa(kpis.design.open)}
        sub={delaySub(kpis.design.delayed, kpis.design.delayedDays, "آیتم")}
      />
      <KpiCard
        icon="print"
        tone="amber"
        label="چاپِ باز"
        value={fa(kpis.print.open)}
        sub={delaySub(kpis.print.delayed, kpis.print.delayedDays, "آیتم")}
      />
      <KpiCard
        icon="task"
        tone="sky"
        label="تسکِ باز"
        value={fa(kpis.tasks.open)}
        sub={delaySub(kpis.tasks.overdue, kpis.tasks.overdueDays, "تسک")}
      />
      <KpiCard
        icon="checkBadge"
        tone="emerald"
        label="تکمیل‌شده در بازه"
        value={fa(completedTotal)}
        sub={
          <span className="text-muted-foreground">
            طرح {fa(kpis.design.completed)} · چاپ {fa(kpis.print.completed)} · تسک {fa(kpis.tasks.done)}
          </span>
        }
      />
      <KpiCard
        icon="clock"
        tone="violet"
        label="ساعت آنلاین (برآورد)"
        value={`~${fa(kpis.onlineHoursEstimate)}`}
        sub={<span className="text-muted-foreground">برآورد از فاصلهٔ ورودها</span>}
      />
      <KpiCard
        icon="calendarCheck"
        tone="sky"
        label="روزهای فعال"
        value={fa(kpis.activeDays)}
        sub={
          <span className="text-muted-foreground">
            {fa(kpis.loginsInRange)} ورود در این بازه
          </span>
        }
      />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone: KpiTone;
}) {
  return (
    <Card className="p-3.5">
      <div className={cn("size-9 rounded-lg grid place-items-center mb-2.5", KPI_TONES[tone])}>
        <Icon name={icon} size={18} />
      </div>
      <div className="text-xl font-bold tabular-nums" dir="ltr">
        {value}
      </div>
      <div className="text-xs text-muted-foreground font-medium mt-0.5">{label}</div>
      {sub && <div className="text-[11px] mt-2 pt-1.5 border-t leading-relaxed">{sub}</div>}
    </Card>
  );
}

// ═════════════════════ ۵) گزارش امروز (بخش مهم) ═════════════════════

function TodayReport({ events }: { events: UserEvent[] }) {
  // روایت روز: صبح → شب (قدیمی → جدید)
  const sorted = React.useMemo(
    () => [...events].sort((a, b) => a.at.localeCompare(b.at)),
    [events]
  );

  const counts = React.useMemo(() => {
    let logins = 0;
    let items = 0;
    let tasks = 0;
    let qc = 0;
    let orders = 0;
    for (const e of events) {
      if (e.kind === "login") logins += 1;
      else if (e.kind === "design_done" || e.kind === "print_done") items += 1;
      else if (e.kind === "task_done") tasks += 1;
      else if (e.kind === "qc_reported" || e.kind === "qc_reviewed") qc += 1;
      else if (e.kind === "order_created") orders += 1;
    }
    return { logins, items, tasks, qc, orders };
  }, [events]);

  const chips = [
    { label: "ورود", value: counts.logins },
    { label: "آیتم تکمیل", value: counts.items },
    { label: "تسک", value: counts.tasks },
    { label: "گزارش QC", value: counts.qc },
    { label: "سفارش", value: counts.orders },
  ].filter((c) => c.value > 0);

  return (
    <Card className="p-0 overflow-hidden border-primary/30 bg-primary/5">
      <div className="px-4 py-3 border-b border-primary/20 bg-primary/5 flex flex-wrap items-center gap-2">
        <Icon name="calendarCheck" size={17} className="text-primary shrink-0" />
        <h3 className="font-bold text-sm">گزارش امروز — {formatDate(new Date())}</h3>
        <span className="text-[10px] text-muted-foreground hidden sm:inline">
          کارهایی که امروز انجام داده
        </span>
        <div className="flex items-center gap-1.5 flex-wrap mr-auto">
          {chips.length > 0 ? (
            chips.map((c) => (
              <span
                key={c.label}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary tabular-nums"
              >
                {fa(c.value)} {c.label}
              </span>
            ))
          ) : (
            <span className="text-[10px] text-muted-foreground">بدون فعالیت</span>
          )}
        </div>
      </div>
      {sorted.length === 0 ? (
        <div className="py-10 text-center">
          <Icon name="sun" size={26} className="mx-auto text-muted-foreground/60 mb-2" />
          <p className="text-sm text-muted-foreground">امروز هنوز فعالیتی ثبت نشده</p>
        </div>
      ) : (
        <div className="py-1.5">
          {sorted.map((ev, i) => (
            <TimelineRow
              key={`${ev.at}-${i}-${ev.kind}`}
              ev={ev}
              last={i === sorted.length - 1}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

// ═════════════════════ ۶) اوورویو تاخیر ═════════════════════════════

function DelayOverview({ delay }: { delay: UserDetail["delayOverview"] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* سفارش‌های تاخیری */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
          <Icon name="alertTriangle" size={16} className="text-rose-500" />
          <h3 className="font-semibold text-sm">اوورویو تاخیر — سفارشات</h3>
        </div>
        <div className="px-4 py-3 border-b">
          <div
            className={cn(
              "text-sm font-bold",
              delay.orders.count > 0
                ? "text-rose-600 dark:text-rose-400"
                : "text-muted-foreground"
            )}
          >
            {fa(delay.orders.count)} سفارش تاخیری
            <span className="text-muted-foreground font-normal mx-1">·</span>
            مجموع {fa(delay.orders.totalDays)} روز تاخیر
          </div>
        </div>
        {delay.orders.count === 0 ? (
          <div className="py-6 text-center text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5">
            <Icon name="checkCircle" size={14} /> سفارش تاخیری در این بازه نیست
          </div>
        ) : (
          <div className="max-h-80 overflow-auto scrollbar-thin">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 text-right">سفارش</TableHead>
                  <TableHead className="h-8 text-right">مشتری</TableHead>
                  <TableHead className="h-8 text-right">مرحله</TableHead>
                  <TableHead className="h-8 text-right">موعد</TableHead>
                  <TableHead className="h-8 text-right">تاخیر</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {delay.orders.items.map((it, i) => (
                  <TableRow key={`${it.orderNumber}-${it.stage}-${i}`}>
                    <TableCell className="py-1.5 font-mono font-bold text-primary" dir="ltr">
                      #{it.orderNumber}
                    </TableCell>
                    <TableCell className="py-1.5 max-w-[140px] truncate">{it.customerName}</TableCell>
                    <TableCell className="py-1.5">
                      <span
                        className={cn(
                          "text-[10px] font-medium px-2 py-0.5 rounded-full",
                          STAGE_CHIP[it.stage]
                        )}
                      >
                        {it.stage === "design" ? "طراحی" : "چاپ"}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 tabular-nums">{fmtDayKey(it.endDate)}</TableCell>
                    <TableCell className="py-1.5 text-rose-600 dark:text-rose-400 font-medium tabular-nums">
                      {fa(it.daysDelayed)} روز
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* تسک‌های تاخیری */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
          <Icon name="taskAdd" size={16} className="text-rose-500" />
          <h3 className="font-semibold text-sm">اوورویو تاخیر — تسک‌ها</h3>
        </div>
        <div className="px-4 py-3 border-b">
          <div
            className={cn(
              "text-sm font-bold",
              delay.tasks.count > 0
                ? "text-rose-600 dark:text-rose-400"
                : "text-muted-foreground"
            )}
          >
            {fa(delay.tasks.count)} تسک تاخیری
            <span className="text-muted-foreground font-normal mx-1">·</span>
            مجموع {fa(delay.tasks.totalDays)} روز تاخیر
          </div>
        </div>
        {delay.tasks.count === 0 ? (
          <div className="py-6 text-center text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5">
            <Icon name="checkCircle" size={14} /> تسک تاخیری در این بازه نیست
          </div>
        ) : (
          <div className="max-h-80 overflow-auto scrollbar-thin">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 text-right">عنوان</TableHead>
                  <TableHead className="h-8 text-right">موعد</TableHead>
                  <TableHead className="h-8 text-right">وضعیت</TableHead>
                  <TableHead className="h-8 text-right">تاخیر</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {delay.tasks.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="py-1.5 max-w-[220px] truncate font-medium">
                      {it.title}
                    </TableCell>
                    <TableCell className="py-1.5 tabular-nums">{fmtDayKey(it.dueDate)}</TableCell>
                    <TableCell className="py-1.5">
                      <StatusBadge status={it.status} />
                    </TableCell>
                    <TableCell className="py-1.5 text-rose-600 dark:text-rose-400 font-medium tabular-nums">
                      {fa(it.daysDelayed)} روز
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ═════════════════════ ۷) چارت فعالیت (BI تعاملی) ═══════════════════

function ActivityChartCard({
  series,
  kpis,
}: {
  series: UserDetail["activitySeries"];
  kpis: UserDetail["kpis"];
}) {
  const [hidden, setHidden] = React.useState<string[]>([]);
  const visible = SERIES.filter((s) => !hidden.includes(s.key));
  const toggle = (key: string) =>
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));

  const totals = React.useMemo(
    () => ({
      logins: series.reduce((s, r) => s + r.logins, 0),
      itemsDone: series.reduce((s, r) => s + r.itemsDone, 0),
      tasksDone: series.reduce((s, r) => s + r.tasksDone, 0),
      qc: series.reduce((s, r) => s + r.qc, 0),
    }),
    [series]
  );
  const grand = totals.logins + totals.itemsDone + totals.tasksDone + totals.qc;
  const tickInterval = series.length <= 8 ? 0 : Math.floor(series.length / 8);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30 flex flex-wrap items-center gap-2">
        <Icon name="chartColumn" size={16} className="text-primary" />
        <h3 className="font-semibold text-sm">روند فعالیت (BI)</h3>
        <span className="text-[10px] text-muted-foreground mr-auto">
          ثبت سفارش {fa(kpis.createdOrders)} · QC {fa(kpis.qc.reported)} گزارش / {fa(kpis.qc.reviewed)} بررسی
        </span>
      </div>

      {/* راهنمای تعاملی — کلیک = نمایش/مخفی */}
      <div className="px-4 pt-3 flex flex-wrap items-center gap-1.5">
        {SERIES.map((s) => {
          const off = hidden.includes(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                off ? "opacity-40 border-dashed" : "border-transparent hover:bg-accent"
              )}
            >
              <span className="size-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              {s.label}
              <span className="tabular-nums text-muted-foreground">({fa(totals[s.key])})</span>
            </button>
          );
        })}
      </div>

      <div className="p-4 pt-2">
        {grand === 0 ? (
          <div className="h-48 grid place-items-center text-sm text-muted-foreground">
            در این بازه فعالیتی ثبت نشده
          </div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="1%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.15} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => fmtDayKey(v)}
                  tick={{ fontSize: 10 }}
                  interval={tickInterval}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={6}
                />
                <YAxis allowDecimals={false} width={30} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "currentColor", fillOpacity: 0.08 }}
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    padding: "4px 8px",
                    direction: "rtl",
                  }}
                  formatter={(value: number, name: string) => [value.toLocaleString("fa-IR"), name]}
                  labelFormatter={(label: string) => fmtDayKey(label)}
                />
                {visible.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stackId="activity"
                    fill={s.color}
                    radius={i === visible.length - 1 ? [3, 3, 0, 0] : undefined}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}

// ═════════════════════ ۸) سفارش‌های باز ═════════════════════════════

function OpenOrdersCard({
  orders,
  isManager,
}: {
  orders: UserDetail["openOrders"];
  isManager: boolean;
}) {
  const navigate = useAppStore((s) => s.navigate);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30 flex flex-wrap items-center gap-2">
        <Icon name="orders" size={16} className="text-primary" />
        <h3 className="font-semibold text-sm">سفارش‌های باز ({fa(orders.length)})</h3>
        <span className="text-[10px] text-muted-foreground mr-auto">
          آیتم‌هایی که الان دست این کاربر است
        </span>
      </div>
      {orders.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          سفارش بازی در جریان نیست
        </div>
      ) : (
        <div className="max-h-96 overflow-auto scrollbar-thin">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 text-right w-16">شماره</TableHead>
                <TableHead className="h-8 text-right">مشتری</TableHead>
                <TableHead className="h-8 text-right">آیتم‌های فعال</TableHead>
                <TableHead className="h-8 text-right">موعد نهایی</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o, i) => (
                <TableRow
                  key={`${o.number}-${i}`}
                  onClick={isManager ? () => navigate("admin", "orders") : undefined}
                  className={cn(isManager && "cursor-pointer")}
                  title={isManager ? "مشاهدهٔ سفارش‌ها" : undefined}
                >
                  <TableCell className="py-2 font-mono font-bold text-primary" dir="ltr">
                    #{o.number}
                  </TableCell>
                  <TableCell className="py-2 max-w-[140px] truncate">{o.customerName}</TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      {o.stageCounts.design > 0 && (
                        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", STAGE_CHIP.design)}>
                          طراحی {fa(o.stageCounts.design)}
                        </span>
                      )}
                      {o.stageCounts.print > 0 && (
                        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", STAGE_CHIP.print)}>
                          چاپ {fa(o.stageCounts.print)}
                        </span>
                      )}
                      {o.stageCounts.warehouse > 0 && (
                        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", STAGE_CHIP.warehouse)}>
                          انبار {fa(o.stageCounts.warehouse)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 tabular-nums">
                    {o.endDate ? fmtDayKey(o.endDate) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

// ═════════════════════ ۹) خط زمانی بازه ═════════════════════════════

function TimelineCard({ events }: { events: UserEvent[] }) {
  const [filter, setFilter] = React.useState("all");

  const filtered = React.useMemo(
    () =>
      events.filter((e) => {
        const g = KIND_GROUPS.find((x) => x.id === filter);
        return !g || !g.kinds || g.kinds.includes(e.kind);
      }),
    [events, filter]
  );

  // گروه‌بندی روزانه — جدیدترین روز اول (داده از سرور نزولی است)
  const groups = React.useMemo(() => {
    const out: { day: string; events: UserEvent[] }[] = [];
    for (const ev of filtered) {
      const day = dayKeyOf(new Date(ev.at));
      const last = out[out.length - 1];
      if (last && last.day === day) last.events.push(ev);
      else out.push({ day, events: [ev] });
    }
    return out;
  }, [filtered]);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30 flex flex-wrap items-center gap-2">
        <Icon name="route" size={16} className="text-primary" />
        <h3 className="font-semibold text-sm">خط زمانی بازه ({fa(filtered.length)} رویداد)</h3>
        <span className="text-[10px] text-muted-foreground mr-auto hidden sm:inline">
          جدیدترین اول
        </span>
      </div>

      {/* فیلتر نوع رویداد */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b bg-muted/20">
        {KIND_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setFilter(g.id)}
            className={cn(
              "h-7 px-2.5 rounded-full text-[11px] font-medium border transition",
              filter === g.id
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-accent"
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="max-h-96 overflow-y-auto scrollbar-thin">
        {groups.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            در این بازه رویدادی ثبت نشده
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.day}>
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-4 py-1.5 border-b text-[11px] font-medium text-muted-foreground tabular-nums flex items-center justify-between">
                <span>{fmtDayKey(g.day)}</span>
                <span className="text-[10px]">{fa(g.events.length)} رویداد</span>
              </div>
              <div className="py-1">
                {g.events.map((ev, i) => (
                  <TimelineRow
                    key={`${ev.at}-${i}-${ev.kind}`}
                    ev={ev}
                    last={i === g.events.length - 1}
                    compact
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

/** ردیف خط زمانی — مشترک «گزارش امروز» و «خط زمانی بازه» */
function TimelineRow({
  ev,
  last,
  compact,
}: {
  ev: UserEvent;
  last?: boolean;
  compact?: boolean;
}) {
  const meta = EVENT_META[ev.kind];
  return (
    <div className={cn("flex gap-3 px-4", compact ? "py-2" : "py-2.5")}>
      <div className="flex flex-col items-center shrink-0">
        <div className={cn("size-8 rounded-full grid place-items-center", meta.cls)}>
          <Icon name={meta.icon} size={15} />
        </div>
        {!last && <div className="w-px flex-1 bg-border mt-1" />}
      </div>
      <div className="flex-1 min-w-0 pb-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-mono tabular-nums text-muted-foreground" dir="ltr">
            {timeOf(ev.at)}
          </span>
          <span className="text-sm font-medium leading-snug">{ev.title}</span>
        </div>
        {ev.subtitle && (
          <div className="text-xs text-muted-foreground mt-0.5 truncate">{ev.subtitle}</div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════ ۱۰) مرخصی‌ها ═════════════════════════════════

function LeavesCard({
  userId,
  userName,
  leaves,
  isManager,
  todayKey,
  onChanged,
}: {
  userId: string;
  userName: string;
  leaves: LeaveRow[];
  isManager: boolean;
  todayKey: string;
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [start, setStart] = React.useState<Date | null>(null);
  const [end, setEnd] = React.useState<Date | null>(null);
  const [note, setNote] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<LeaveRow | null>(null);

  const sorted = React.useMemo(
    () => [...leaves].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [leaves]
  );

  const addMut = useMutation({
    mutationFn: (payload: { startDate: string; endDate: string; note?: string }) =>
      api<{ leave: { id: string } }>("/api/leaves", {
        method: "POST",
        body: JSON.stringify({ userId, ...payload }),
      }),
    onSuccess: () => {
      toast.success("مرخصی ثبت شد");
      setAddOpen(false);
      setStart(null);
      setEnd(null);
      setNote("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message), // 409 هم‌پوشانی اینجا نشان داده می‌شود
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>(`/api/leaves/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("مرخصی حذف شد");
      setDeleteTarget(null);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const draftDays =
    start && end ? Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1 : 0;
  const validRange = !!start && !!end && start <= end;

  function submit() {
    if (!start || !end) {
      toast.error("تاریخ شروع و پایان را انتخاب کنید");
      return;
    }
    const s = dayKeyOf(start);
    const e = dayKeyOf(end);
    if (e < s) {
      toast.error("تاریخ پایان نمی‌تواند قبل از شروع باشد");
      return;
    }
    addMut.mutate({ startDate: s, endDate: e, note: note.trim() || undefined });
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30 flex flex-wrap items-center gap-2">
        <Icon name="calendar" size={16} className="text-amber-500" />
        <h3 className="font-semibold text-sm">مرخصی‌ها ({fa(sorted.length)})</h3>
        <span className="text-[10px] text-muted-foreground hidden sm:inline">
          انتخاب بازه در تقویم — برای زمان مرخصی و محاسبات آینده
        </span>
        {isManager && (
          <Button size="sm" className="mr-auto h-7 text-[11px] gap-1.5" onClick={() => setAddOpen(true)}>
            <Icon name="calendarAdd" size={13} /> ثبت مرخصی جدید
          </Button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {isManager ? "هنوز مرخصی برای این کاربر ثبت نشده" : "مرخصی ثبت نشده"}
        </div>
      ) : (
        <div className="divide-y">
          {sorted.map((l) => {
            const activeToday = l.startDate <= todayKey && todayKey <= l.endDate;
            const isFuture = l.startDate > todayKey;
            return (
              <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                <div
                  className={cn(
                    "size-8 rounded-lg grid place-items-center shrink-0",
                    activeToday
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon name="calendar" size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium tabular-nums">
                      {fmtDayKey(l.startDate)} — {fmtDayKey(l.endDate)}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {fa(l.days)} روز
                    </span>
                    {activeToday && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        جاری
                      </span>
                    )}
                    {isFuture && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        آینده
                      </span>
                    )}
                  </div>
                  {l.note && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{l.note}</div>
                  )}
                </div>
                {isManager && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(l)}
                    className="size-7 rounded-lg grid place-items-center text-rose-500 hover:bg-rose-500/10 transition shrink-0"
                    title="حذف مرخصی"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* دیالوگ ثبت مرخصی — مدیر */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ثبت مرخصی — {userName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">از تاریخ</label>
                <DatePicker value={start} onChange={setStart} placeholder="شروع مرخصی" clearable={false} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">تا تاریخ</label>
                <DatePicker value={end} onChange={setEnd} placeholder="پایان مرخصی" clearable={false} />
              </div>
            </div>
            {start && end && (
              <div className={cn("text-xs", validRange ? "text-muted-foreground" : "text-rose-600")}>
                {validRange ? `بازهٔ ${fa(draftDays)} روز` : "تاریخ پایان نمی‌تواند قبل از شروع باشد"}
              </div>
            )}
            <Input
              placeholder="یادداشت (اختیاری)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                انصراف
              </Button>
              <Button onClick={submit} disabled={addMut.isPending || !validRange}>
                {addMut.isPending ? (
                  <Icon name="spinner" size={14} className="animate-spin" />
                ) : (
                  <Icon name="calendarAdd" size={14} />
                )}
                ثبت مرخصی
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* تایید حذف مرخصی — مدیر */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف مرخصی</AlertDialogTitle>
            <AlertDialogDescription>
              مرخصی {deleteTarget ? fmtDayKey(deleteTarget.startDate) : ""} تا{" "}
              {deleteTarget ? fmtDayKey(deleteTarget.endDate) : ""} حذف شود؟ این عمل قابل بازگشت
              نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
