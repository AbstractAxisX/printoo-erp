"use client";

// Printoo24 ERP — Phase 13: «پروفایل» (ماژول مجازی — حقِ همه)
//
// مسیرها: سایدبار «پروفایل من» → navigate("profile","view") بدون param =
// پروفایل خودِ کاربر. مدیرها می‌توانند برای دیگران
// navigate("profile","view",userId) بزنند (API خودش 403 می‌دهد اگر
// نه‌مدیر باشد). داده: GET /api/monitoring/users/{id}?from&to →
// UserDetailReport (هویت + KPI بازه + گزارش امروز + خط زمانی + مرخصی‌ها).
// مدیرِ در حال دیدنِ پروفایلِ دیگری می‌تواند مرخصی ثبت/حذف کند
// (POST /api/leaves + DELETE /api/leaves/{id}).

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/shared";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { useAppStore } from "@/stores/app-store";
import { formatDate } from "@/lib/format";
import { MODULES, USER_ROLE, type ModuleKey } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { TimelineEvent, UserDetailReport } from "@/lib/monitoring";

// ─── بازه (yyyy-MM-dd لوکال — قرارداد API) ─────────────────────────

type RangeMode = "week" | "month" | "quarter";

const RANGE_CHIPS: { id: RangeMode; label: string }[] = [
  { id: "week", label: "این هفته" },
  { id: "month", label: "این ماه" },
  { id: "quarter", label: "۳ ماه" },
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

// ─── فرا‌یابی رویدادها ──────────────────────────────────────────────

const EVENT_META: Record<TimelineEvent["kind"], { icon: IconName; tone: string }> = {
  login: { icon: "login", tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  logout: { icon: "logout", tone: "bg-muted text-muted-foreground" },
  design_done: { icon: "pencil", tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  print_done: { icon: "print", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  task_done: { icon: "taskDone", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  task_created: { icon: "taskAdd", tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  qc_reported: { icon: "checkList", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  qc_reviewed: { icon: "checkCircle", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  order_created: { icon: "orders", tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  leave: { icon: "calendar", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
};

// ─── صفحه ───────────────────────────────────────────────────────────

export function ProfilePage() {
  const param = useAppStore((s) => s.param);
  const navigate = useAppStore((s) => s.navigate);
  const me = useAppStore((s) => s.user);

  const [rangeMode, setRangeMode] = React.useState<RangeMode>("month");
  const range = React.useMemo(() => presetRange(rangeMode), [rangeMode]);

  const targetId = param ?? me?.id ?? null;
  const isSelf = !!me && targetId === me.id;
  const meIsManager = !!me && (me.role === "master" || (me.modules ?? []).includes("admin"));
  // فقط مدیرِ ناظرِ پروفایلِ دیگری کنترل مرخصی دارد (API هم همین را الزام می‌کند)
  const canManageLeaves = meIsManager && !isSelf && !!targetId;

  const { data, isLoading, error } = useQuery({
    queryKey: ["monitoring", "user-detail", targetId, range.from, range.to],
    queryFn: () =>
      api<UserDetailReport>(
        `/api/monitoring/users/${targetId}?from=${range.from}&to=${range.to}`
      ),
    enabled: !!targetId,
  });

  const user = data?.user;
  const k = data?.kpis;
  const ownerIsMaster = user?.role === "master";

  return (
    <div className="space-y-4">
      <PageHeader
        title="پروفایل"
        description={
          user
            ? isSelf
              ? "اطلاعات، عملکرد و مرخصی‌های شما"
              : `${user.name} — اطلاعات، عملکرد و مرخصی‌ها`
            : "اطلاعات کاربر"
        }
        icon="userCircle"
        actions={
          <>
            <div className="flex items-center gap-1">
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
            </div>
            {/* مستر نیازی به مانیتورینگ ندارد؛ برای بقیه (حتی خودِ کاربر) مجاز است */}
            {user && !ownerIsMaster && targetId && (
              <Button variant="outline" size="sm" onClick={() => navigate("sysadmin", "user", targetId)}>
                <Icon name="analytics" size={14} />
                {isSelf ? "مانیتورینگ کامل من" : "مانیتورینگ کاربر"}
              </Button>
            )}
          </>
        }
      />

      {isLoading || !targetId ? (
        <ProfileSkeleton />
      ) : error ? (
        <EmptyState
          icon="shield"
          title="دسترسی محدود"
          description={error.message || "مشاهدهٔ این پروفایل مجاز نیست."}
        />
      ) : !data || !user || !k ? (
        <EmptyState icon="userCircle" title="کاربر یافت نشد" description="این پروفایل در دسترس نیست." />
      ) : (
        <>
          {/* کارت هویت */}
          <Card className="p-0 overflow-hidden">
            <div className="p-5 flex flex-col sm:flex-row gap-5">
              <div className="flex flex-col items-center gap-2 shrink-0 mx-auto sm:mx-0">
                <div className="size-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-violet-600 text-white grid place-items-center text-2xl font-bold shadow-md">
                  {initialsOf(user.name)}
                </div>
                {data.online && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 px-2.5 py-0.5 text-[10px] font-bold">
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> آنلاین
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold">{user.name}</span>
                  {ownerIsMaster ? (
                    <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white bg-gradient-to-l from-violet-600 to-rose-500">
                      مدیر سیستم
                    </span>
                  ) : (
                    <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-bold">
                      {USER_ROLE[user.role]?.label ?? user.role}
                    </span>
                  )}
                  {user.status !== "active" && (
                    <span className="rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-0.5 text-[11px] font-medium">
                      غیرفعال
                    </span>
                  )}
                  {data.onLeaveToday && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 px-2.5 py-0.5 text-[11px] font-medium">
                      <Icon name="calendar" size={11} /> در مرخصی
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {ownerIsMaster ? (
                    <span className="rounded-full border px-2.5 py-0.5 text-[10px] text-muted-foreground">
                      همهٔ ماژول‌ها
                    </span>
                  ) : user.modules.length === 0 ? (
                    <span className="rounded-full border px-2.5 py-0.5 text-[10px] text-muted-foreground">
                      بدون ماژول
                    </span>
                  ) : (
                    user.modules.map((m) => (
                      <span
                        key={m}
                        className="rounded-full border px-2.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {MODULES[m as ModuleKey]?.faLabel ?? m}
                      </span>
                    ))
                  )}
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Icon name="mail" size={13} className="shrink-0" />
                    <span dir="ltr" className="tabular-nums">{user.email}</span>
                  </span>
                  {user.phone && (
                    <span className="flex items-center gap-1.5">
                      <Icon name="customerService" size={13} className="shrink-0" />
                      <span dir="ltr" className="tabular-nums">{user.phone}</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Icon name="calendar" size={13} className="shrink-0" />
                    عضویت از {formatDate(user.createdAt)}
                  </span>
                </div>
              </div>

              <div className="shrink-0 sm:border-s sm:ps-5 flex sm:flex-col gap-4 justify-between">
                <div className="text-center">
                  <div className="text-xl font-bold tabular-nums" dir="ltr">
                    {fa(user.loginCount)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">مجموع ورودها</div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-bold tabular-nums" dir="ltr">
                    {formatDate(user.lastLoginAt, true)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">آخرین ورود</div>
                </div>
              </div>
            </div>
          </Card>

          {/* آمار سریع */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat
              icon="inbox"
              label="کارهای باز"
              value={fa(k.design.open + k.print.open + k.tasks.open)}
              sub={`طراحی ${fa(k.design.open)} • چاپ ${fa(k.print.open)} • تسک ${fa(k.tasks.open)}`}
              tone="violet"
            />
            <MiniStat
              icon="alertTriangle"
              label="تاخیری"
              value={fa(k.design.delayed + k.print.delayed + k.tasks.overdue)}
              sub={`مجموع ${fa(k.design.delayedDays + k.print.delayedDays + k.tasks.overdueDays)} روز`}
              tone="rose"
            />
            <MiniStat
              icon="checkCircle"
              label="تکمیل در بازه"
              value={fa(k.design.completed + k.print.completed + k.tasks.done)}
              sub={`طراحی ${fa(k.design.completed)} • چاپ ${fa(k.print.completed)} • تسک ${fa(k.tasks.done)}`}
              tone="emerald"
            />
            <MiniStat
              icon="clock"
              label="ساعت آنلاین ~"
              value={fa(Math.round(k.onlineHoursEstimate))}
              sub={`${fa(k.activeDays)} روز فعال • ${fa(k.loginsInRange)} ورود`}
              tone="sky"
            />
          </div>

          {/* گزارش امروز + آخرین فعالیت‌ها */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-0 overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2 shrink-0">
                <Icon name="clock" size={15} className="text-primary" />
                <span className="text-sm font-bold">گزارش امروز</span>
                <span className="text-[10px] text-muted-foreground mr-auto">
                  {fa(data.today.events.length)} رویداد
                </span>
              </div>
              <div className="p-3 max-h-72 overflow-y-auto">
                {data.today.events.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-8 text-center">
                    امروز رویدادی ثبت نشده است
                  </p>
                ) : (
                  data.today.events.map((ev, i) => <TimelineItem key={i} ev={ev} />)
                )}
              </div>
            </Card>

            <Card className="p-0 overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2 shrink-0">
                <Icon name="chartLine" size={15} className="text-primary" />
                <span className="text-sm font-bold">آخرین فعالیت‌ها</span>
                <span className="text-[10px] text-muted-foreground mr-auto">۱۲ مورد اخیر</span>
              </div>
              <div className="p-3">
                {data.timeline.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-8 text-center">
                    در این بازه فعالیتی ثبت نشده است
                  </p>
                ) : (
                  data.timeline.slice(0, 12).map((ev, i) => <TimelineItem key={i} ev={ev} />)
                )}
              </div>
            </Card>
          </div>

          {/* مرخصی‌ها */}
          <LeavesSection
            userId={targetId}
            title={isSelf ? "مرخصی‌های من" : "مرخصی‌ها"}
            leaves={[...data.leaves].reverse()}
            canManage={canManageLeaves}
            selfReadOnly={isSelf && !meIsManager}
          />
        </>
      )}
    </div>
  );
}

// ─── زیرقطعه‌ها ─────────────────────────────────────────────────────

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  return parts.slice(0, 2).map((p) => p[0]).join("");
}

function MiniStat({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  sub?: string;
  tone: "violet" | "rose" | "emerald" | "sky";
}) {
  const toneCls = {
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
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
        {sub && <div className="text-[10px] text-muted-foreground/80 mt-0.5 truncate">{sub}</div>}
      </div>
    </Card>
  );
}

function TimelineItem({ ev }: { ev: TimelineEvent }) {
  const meta = EVENT_META[ev.kind] ?? { icon: "info" as IconName, tone: "bg-muted text-muted-foreground" };
  return (
    <div className="flex gap-3 py-1.5 border-b last:border-b-0">
      <span className={cn("size-8 rounded-lg grid place-items-center shrink-0", meta.tone)}>
        <Icon name={meta.icon} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold truncate">{ev.title}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0" dir="ltr">
            {formatDate(ev.at, true)}
          </span>
        </div>
        {ev.subtitle && <div className="text-[11px] text-muted-foreground truncate">{ev.subtitle}</div>}
      </div>
    </div>
  );
}

type LeaveRow = UserDetailReport["leaves"][number];

function LeavesSection({
  userId,
  title,
  leaves,
  canManage,
  selfReadOnly,
}: {
  userId: string;
  title: string;
  leaves: LeaveRow[];
  canManage: boolean;
  selfReadOnly: boolean;
}) {
  const qc = useQueryClient();
  const todayKey = React.useMemo(() => localDayKey(), []);
  const [start, setStart] = React.useState<Date | null>(null);
  const [end, setEnd] = React.useState<Date | null>(null);
  const [note, setNote] = React.useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["monitoring"] });

  const addLeave = useMutation({
    mutationFn: async () => {
      if (!start || !end) throw new Error("تاریخ شروع و پایان الزامی است");
      const startDate = localDayKey(start);
      const endDate = localDayKey(end);
      if (endDate < startDate) throw new Error("تاریخ پایان نمی‌تواند قبل از شروع باشد");
      return api("/api/leaves", {
        method: "POST",
        body: JSON.stringify({ userId, startDate, endDate, note }),
      });
    },
    onSuccess: () => {
      toast.success("مرخصی ثبت شد");
      setStart(null);
      setEnd(null);
      setNote("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteLeave = useMutation({
    mutationFn: (id: string) => api(`/api/leaves/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("مرخصی حذف شد");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2 flex-wrap">
        <Icon name="calendar" size={15} className="text-primary" />
        <span className="text-sm font-bold">{title}</span>
        <span className="text-[10px] text-muted-foreground mr-auto">
          {leaves.length > 0 ? `${fa(leaves.length)} بازه ثبت‌شده` : "بدون سابقهٔ مرخصی"}
        </span>
      </div>

      <div className="p-3 space-y-2.5">
        {selfReadOnly && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-2.5 text-[11px] text-muted-foreground">
            <Icon name="info" size={14} className="shrink-0" />
            ثبت مرخصی توسط مدیر انجام می‌شود — برای درخواست، با مدیر خود هماهنگ کنید.
          </div>
        )}

        {canManage && (
          <div className="rounded-lg border border-dashed p-3 bg-muted/20 space-y-2">
            <div className="text-[11px] font-bold flex items-center gap-1.5">
              <Icon name="calendarAdd" size={13} /> ثبت مرخصی جدید
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker value={start} onChange={setStart} placeholder="از تاریخ" className="h-8 w-32 text-xs" clearable={false} />
              <Icon name="arrowLeft" size={13} className="text-muted-foreground" />
              <DatePicker value={end} onChange={setEnd} placeholder="تا تاریخ" className="h-8 w-32 text-xs" clearable={false} />
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="یادداشت (اختیاری)"
                className="h-8 flex-1 min-w-40 text-xs"
              />
              <Button
                size="sm"
                className="h-8"
                disabled={addLeave.isPending}
                onClick={() => addLeave.mutate()}
              >
                {addLeave.isPending ? (
                  <Icon name="spinner" size={14} className="animate-spin" />
                ) : (
                  <Icon name="add" size={14} />
                )}
                ثبت
              </Button>
            </div>
          </div>
        )}

        {leaves.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">مرخصی ثبت نشده است</p>
        ) : (
          leaves.map((l) => {
            const activeToday = l.startDate <= todayKey && todayKey <= l.endDate;
            const isFuture = l.startDate > todayKey;
            return (
              <div
                key={l.id}
                className="flex items-center gap-3 rounded-lg border p-2.5 hover:bg-accent/40 transition"
              >
                <span
                  className={cn(
                    "size-8 rounded-lg grid place-items-center shrink-0",
                    activeToday
                      ? "bg-amber-500/15 text-amber-600"
                      : isFuture
                        ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon name={activeToday ? "pause" : "calendar"} size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold tabular-nums" dir="rtl">
                    {formatDayKey(l.startDate)} — {formatDayKey(l.endDate)}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {fa(l.days)} روز{l.note ? ` • ${l.note}` : ""}
                  </div>
                </div>
                {activeToday && (
                  <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 text-[10px] font-bold shrink-0">
                    جاری
                  </span>
                )}
                {isFuture && (
                  <span className="rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 px-2 py-0.5 text-[10px] font-medium shrink-0">
                    پیش‌رو
                  </span>
                )}
                {canManage && (
                  <button
                    onClick={() => deleteLeave.mutate(l.id)}
                    disabled={deleteLeave.isPending}
                    title="حذف مرخصی"
                    className="size-7 rounded-lg grid place-items-center text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition shrink-0 disabled:opacity-50"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
