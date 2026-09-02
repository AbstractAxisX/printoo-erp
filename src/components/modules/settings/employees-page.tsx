"use client";

// Printoo24 ERP — Settings › Employees management (master-only, Phase 12)
//
// «مدیریت کارمندان» — جایگزین حضور و غیاب:
//   KPI ها: تعداد کارمندان / آنلاین / کار تاخیری کل
//   جدول هر کارمند: حضور (آنلاین/آخرین بازدید) + طراحی (فعال/تاخیر/تکمیل/دیرکرد)
//   + چاپ + تسک‌ها (انجام/تاخیر) + QC + ورودها
//   دیالوگ جزئیات: ورود/خروج‌ها + خط زمانی «آن روز چه کرد» (تاریخ قابل انتخاب)
//
// داده از /api/employees/stats + /api/employees/daily (هر دو master-gated).

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MODULES, USER_ROLE, type ModuleKey } from "@/lib/constants";
import { formatDateTime, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────
type EmployeeStats = {
  design: { assigned: number; active: number; completed: number; delayedActive: number; lateCompletions: number; itemsCompleted: number };
  print: { assigned: number; active: number; completed: number; delayedActive: number; lateCompletions: number; itemsCompleted: number };
  tasks: { assigned: number; done: number; inProgress: number; overdue: number };
  qc: { reported: number; reviewed: number };
};

type Employee = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  modules: string[];
  createdAt: string;
  online: boolean;
  lastSeenAt: string | null;
  lastLoginAt: string | null;
  loginCount: number;
  stats: EmployeeStats;
};

type StatsResponse = {
  employees: Employee[];
  summary: { total: number; active: number; onlineNow: number };
};

type DayEvent = {
  kind: "login" | "logout" | "design" | "print" | "task_done" | "task_due" | "order_created" | "qc";
  at: string;
  label: string;
  meta?: string;
};

type DayResponse = {
  date: string;
  user: { id: string; name: string; modules: string[] };
  day: {
    userId: string;
    name: string;
    events: DayEvent[];
    summary: {
      logins: number;
      firstAt: string | null;
      lastAt: string | null;
      designCompleted: number;
      printCompleted: number;
      tasksCompleted: number;
      tasksDue: number;
      ordersCreated: number;
      qcReported: number;
    };
  } | null;
};

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

const EVENT_META: Record<DayEvent["kind"], { label: string; icon: string; color: string }> = {
  login: { label: "ورود", icon: "login", color: "text-emerald-600 bg-emerald-500/10" },
  logout: { label: "خروج", icon: "logout", color: "text-muted-foreground bg-muted" },
  design: { label: "طراحی", icon: "design", color: "text-violet-600 bg-violet-500/10" },
  print: { label: "چاپ", icon: "print", color: "text-amber-600 bg-amber-500/10" },
  task_done: { label: "تسک", icon: "check", color: "text-emerald-600 bg-emerald-500/10" },
  task_due: { label: "موعد", icon: "clock", color: "text-rose-600 bg-rose-500/10" },
  order_created: { label: "ثبت", icon: "plusCircle", color: "text-primary bg-primary/10" },
  qc: { label: "QC", icon: "shield", color: "text-blue-600 bg-blue-500/10" },
};

function presenceText(e: Employee): string {
  if (e.online) return "آنلاین";
  if (e.lastSeenAt) {
    const mins = Math.floor((Date.now() - new Date(e.lastSeenAt).getTime()) / 60000);
    if (mins < 60) return `${mins} دقیقه پیش`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} ساعت پیش`;
    return `آخرین بازدید: ${formatDate(e.lastSeenAt)}`;
  }
  return "بدون بازدید";
}

function StatCell({
  label,
  value,
  tone = "default",
  title,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "danger" | "success" | "warn";
  title?: string;
}) {
  return (
    <div className="text-center min-w-[52px]" title={title}>
      <div
        className={cn(
          "text-sm font-bold tabular-nums",
          tone === "danger" && "text-rose-600 dark:text-rose-400",
          tone === "success" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400"
        )}
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export function EmployeesPage() {
  const me = useAppStore((s) => s.user);
  const isMaster = me?.role === "master";
  const [selected, setSelected] = React.useState<Employee | null>(null);
  const [dayDate, setDayDate] = React.useState(() => new Date().toISOString().slice(0, 10));

  const { data, isLoading } = useQuery({
    queryKey: ["employees", "stats"],
    queryFn: () => api<StatsResponse>("/api/employees/stats"),
    refetchInterval: 60000,
    enabled: isMaster,
  });

  const employees = data?.employees ?? [];
  const summary = data?.summary;

  const totalDelayed =
    employees.reduce(
      (s, e) =>
        s + e.stats.design.delayedActive + e.stats.print.delayedActive + e.stats.tasks.overdue,
      0
    ) || 0;

  if (!isMaster) {
    return (
      <div>
        <PageHeader title="مدیریت کارمندان" description="تنظیمات سیستم" icon="checkList" />
        <EmptyState
          icon="shield"
          title="دسترسی محدود"
          description="این بخش مخصوص ادمین سراسری (master) است."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="مدیریت کارمندان"
        description="آمار ریز-به-ریز فعالیت و حضور هر کارمند — سفارش‌ها، تسک‌ها، تاخیرها، ورود و خروج"
        icon="checkList"
      />

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Icon name="user" size={14} /> کارمندان
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1">
            {summary?.total ?? "—"}
            <span className="text-xs font-normal text-muted-foreground mr-2">
              ({summary?.active ?? 0} فعال)
            </span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <span className="size-2 rounded-full bg-emerald-500" /> آنلاین الان
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
            {summary?.onlineNow ?? "—"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Icon name="clock" size={14} /> کار تاخیری کل
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1 text-rose-600 dark:text-rose-400">
            {totalDelayed}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Icon name="check" size={14} /> تسک‌های انجام‌شده
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1">
            {employees.reduce((s, e) => s + e.stats.tasks.done, 0)}
          </div>
        </Card>
      </div>

      {/* ── Employees table ── */}
      {isLoading ? (
        <LoadingState />
      ) : employees.length === 0 ? (
        <Card className="p-0">
          <EmptyState icon="user" title="کارمندی ثبت نشده" description="از «کاربران و دسترسی‌ها» کاربر اضافه کنید." />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-semibold">عملکرد و حضور کارمندان</span>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>طراحی: فعال/تاخیر/انجام/دیرکرد</span>
              <span className="hidden sm:inline">| چاپ | تسک: انجام/تاخیر | QC | ورود</span>
            </div>
          </div>
          <div className="divide-y max-h-[560px] overflow-y-auto scrollbar-thin">
            {employees.map((e) => {
              const isMasterRow = e.role === "master";
              return (
                <button
                  key={e.id}
                  onClick={() => setSelected(e)}
                  className={cn(
                    "w-full text-right flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors flex-wrap",
                    e.status === "inactive" && "opacity-60"
                  )}
                >
                  {/* avatar + identity */}
                  <span className="relative shrink-0">
                    <span
                      className={cn(
                        "size-10 rounded-full grid place-items-center text-xs font-bold shrink-0",
                        isMasterRow
                          ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white"
                          : "bg-primary/10 text-primary"
                      )}
                    >
                      {e.name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("")}
                    </span>
                    <span
                      className={cn(
                        "absolute -bottom-0.5 -left-0.5 size-2.5 rounded-full ring-2 ring-card",
                        e.online ? "bg-emerald-500" : "bg-muted-foreground/40"
                      )}
                    />
                  </span>
                  <div className="min-w-[160px] flex-1">
                    <div className="font-medium text-sm truncate">
                      {e.name}
                      {e.id === me?.id && (
                        <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 mr-2">
                          شما
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {isMasterRow ? "مدیر ارشد — همه ماژول‌ها" : e.modules.map((m) => (MODULES as Record<string, { faLabel: string }>)[m]?.faLabel ?? m).join(" + ")}
                    </div>
                    <div className={cn("text-[10px] mt-0.5", e.online && "text-emerald-600 dark:text-emerald-400 font-medium")}>
                      {presenceText(e)}
                    </div>
                  </div>

                  {/* stats cells */}
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <StatCell
                      label="فعال"
                      value={e.stats.design.active}
                      tone={e.stats.design.delayedActive > 0 ? "warn" : "default"}
                    />
                    <StatCell label="تاخیر" value={e.stats.design.delayedActive} tone="danger" />
                    <StatCell label="انجام" value={e.stats.design.itemsCompleted} tone="success" />
                    <StatCell label="دیرکرد" value={e.stats.design.lateCompletions} tone="danger" />
                    <span className="w-px h-8 bg-border hidden sm:block" />
                    <StatCell
                      label="چاپ فعال"
                      value={e.stats.print.active}
                      tone={e.stats.print.delayedActive > 0 ? "warn" : "default"}
                    />
                    <StatCell label="چاپ تاخیر" value={e.stats.print.delayedActive} tone="danger" />
                    <StatCell label="چاپ انجام" value={e.stats.print.itemsCompleted} tone="success" />
                    <span className="w-px h-8 bg-border hidden sm:block" />
                    <StatCell label="تسک" value={e.stats.tasks.assigned} />
                    <StatCell label="انجام" value={e.stats.tasks.done} tone="success" />
                    <StatCell label="تاخیر" value={e.stats.tasks.overdue} tone="danger" />
                    <StatCell label="QC" value={e.stats.qc.reported + e.stats.qc.reviewed} />
                    <StatCell label="ورود" value={e.loginCount} />
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Detail dialog: daily activity ── */}
      <EmployeeDayDialog
        employee={selected}
        date={dayDate}
        setDate={setDayDate}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

// ─── Daily drill-down dialog ──────────────────────────────────────
function EmployeeDayDialog({
  employee,
  date,
  setDate,
  onClose,
}: {
  employee: Employee | null;
  date: string;
  setDate: (d: string) => void;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["employees", "daily", employee?.id, date],
    queryFn: () =>
      api<DayResponse>(`/api/employees/daily?userId=${employee?.id}&date=${date}`),
    enabled: !!employee,
  });

  const day = data?.day;
  const s = day?.summary;

  return (
    <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "size-2.5 rounded-full",
                employee?.online ? "bg-emerald-500" : "bg-muted-foreground/40"
              )}
            />
            {employee?.name}
            <span className="text-xs font-normal text-muted-foreground">
              {employee?.role === "master"
                ? "مدیر ارشد"
                : employee?.modules.map((m) => (MODULES as Record<string, { faLabel: string }>)[m]?.faLabel ?? m).join(" + ")}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* login summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="p-3">
            <div className="text-[10px] text-muted-foreground">آخرین ورود</div>
            <div className="text-xs font-semibold mt-0.5">
              {employee?.lastLoginAt ? formatDateTime(employee.lastLoginAt) : "—"}
            </div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] text-muted-foreground">آخرین بازدید</div>
            <div className="text-xs font-semibold mt-0.5">
              {employee?.lastSeenAt ? formatDateTime(employee.lastSeenAt) : "—"}
            </div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] text-muted-foreground">مجموع ورودها</div>
            <div className="text-xs font-bold tabular-nums mt-0.5">{employee?.loginCount ?? 0}</div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] text-muted-foreground">تعداد ورودِ روزِ انتخابی</div>
            <div className="text-xs font-bold tabular-nums mt-0.5">{s?.logins ?? 0}</div>
          </Card>
        </div>

        {/* date picker + day summary */}
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
            dir="ltr"
            aria-label="تاریخ فعالیت"
          />
          {s && (
            <div className="flex items-center gap-2 text-[11px] flex-wrap">
              <span className="bg-violet-500/10 text-violet-700 dark:text-violet-300 rounded-full px-2 py-0.5">
                {s.designCompleted} طراحی
              </span>
              <span className="bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded-full px-2 py-0.5">
                {s.printCompleted} چاپ
              </span>
              <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 rounded-full px-2 py-0.5">
                {s.tasksCompleted} تسک انجام
              </span>
              <span className="bg-rose-500/10 text-rose-700 dark:text-rose-300 rounded-full px-2 py-0.5">
                {s.tasksDue} موعد روز
              </span>
              <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5">
                {s.ordersCreated} ثبت سفارش
              </span>
              {s.firstAt && (
                <span className="text-muted-foreground">
                  اولین فعالیت: {formatDateTime(s.firstAt)} — آخرین: {formatDateTime(s.lastAt)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* timeline */}
        {isLoading ? (
          <div className="py-8 grid place-items-center">
            <Icon name="loading" size={24} className="animate-spin text-primary" />
          </div>
        ) : !day || day.events.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            برای این تاریخ فعالیتی ثبت نشده است.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto scrollbar-thin divide-y rounded-lg border">
            {day.events.map((ev, i) => {
              const meta = EVENT_META[ev.kind];
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className={cn(
                      "size-7 rounded-lg grid place-items-center shrink-0",
                      meta.color
                    )}
                  >
                    <Icon name={meta.icon as "login"} size={14} />
                  </span>
                  <span className="text-xs flex-1 truncate" title={ev.label}>
                    {ev.label}
                    {ev.meta && (
                      <span className="text-muted-foreground mr-1.5">({ev.meta})</span>
                    )}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0" dir="ltr">
                    {new Date(ev.at).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="outline" onClick={onClose} className="gap-2">
            بستن
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
