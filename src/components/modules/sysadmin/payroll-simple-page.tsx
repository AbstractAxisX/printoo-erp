"use client";

// ─── Phase 16: حقوق کارمندان — مدیر سیستم (ساده: «حقوق بده و برو») ───
// صفحهٔ سریع مستر — بدون تحلیل، بدون مدیریت مساعده، بدون ویرایش ارقام:
//   • نوار جمع‌وجور: Σ خالص دوره | پرداخت‌شده | مانده | تعداد
//   • جدول فقط-خواندنی کارمندان + دکمهٔ پرداخت per-row (تأیید)
//   • دکمهٔ بزرگ «پرداخت حقوق کل دوره» (AlertDialog)
//   • لیست دوره‌های گذشته (کوچک، فقط-خواندنی)
// ویرایش ارقام/مساعده در ماژول مالی انجام می‌شود.

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, EmptyState, LoadingState } from "@/components/shared";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { formatCurrency, formatNumber, formatDate } from "@/lib/format";
import { MODULES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types (قرارداد /api/payroll) ───────────────────────────────────────

type PayrollEntry = {
  id: string;
  userId: string;
  name: string;
  role: string;
  userStatus: string;
  modules: string[];
  status: "draft" | "paid";
  baseSalary: number;
  overtimeHours: number;
  overtimeRate: number;
  bonus: number;
  deduction: number;
  insurance: number;
  tax: number;
  advanceDeducted: number;
  netPay: number;
  note: string | null;
  paidAt: string | null;
  pendingAdvanceSum: number;
};

type Period = {
  id: string;
  key: string;
  status: "open" | "paid" | "closed";
  startDate: string;
  endDate: string;
  totalNet: number;
  entriesCount: number;
  paidAt: string | null;
  paidByName: string | null;
};

type PayrollData = {
  current: {
    id: string;
    key: string;
    status: string;
    startDate: string;
    endDate: string;
    paidAt: string | null;
    paidByName: string | null;
    totalNet: number;
    entriesCount: number;
    entries: PayrollEntry[];
    totals: {
      count: number;
      net: number;
      paidCount: number;
      paidSum: number;
    };
  };
  periods: Period[];
};

// ─── رنگ چیپ ماژول — الگوی سیستم ──────────────────────────────────────

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

const PERIOD_STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "باز", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  paid: { label: "پرداخت‌شده", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  closed: { label: "بسته", cls: "bg-muted text-muted-foreground" },
};

// ─── کمکی‌ها ────────────────────────────────────────────────────────────

function fa(n: number): string {
  return n.toLocaleString("fa-IR");
}

function faDigits(s: string): string {
  return s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

function ModuleChip({ module }: { module: string }) {
  const meta = (MODULES as Record<string, { faLabel: string }>)[module];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        MODULE_COLORS[module] ?? "bg-muted text-muted-foreground"
      )}
    >
      {meta?.faLabel ?? module}
    </span>
  );
}

/** خالصِ زنده برای ردیف‌های پرداخت‌نشده (netPay ذخیره‌شده فقط بعد از پرداخت معتبر است) */
function liveNet(e: PayrollEntry): number {
  return Math.round(
    e.baseSalary + e.overtimeHours * e.overtimeRate + e.bonus -
      e.deduction - e.insurance - e.tax - e.advanceDeducted
  );
}

// ─── کارت جمع‌وجور نوار آمار ──────────────────────────────────────────

function StatBox({
  label,
  value,
  icon,
  cls,
}: {
  label: string;
  value: string;
  icon: IconName;
  cls: string;
}) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className={cn("size-6 rounded-lg grid place-items-center shrink-0", cls)}>
          <Icon name={icon} size={13} />
        </span>
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums mt-2 truncate" dir="ltr" title={value}>
        {value}
      </div>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

export function PayrollSimplePage() {
  const invalidate = useInvalidate();

  const [payTarget, setPayTarget] = React.useState<PayrollEntry | null>(null);
  const [periodPayOpen, setPeriodPayOpen] = React.useState(false);

  // دورهٔ جاری (سرور خودش ensure می‌کند)
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["payroll", "current"],
    queryFn: () => api<PayrollData>("/api/payroll"),
    staleTime: 30_000,
  });

  const payEntryMut = useMutation({
    mutationFn: (id: string) =>
      api<{ netPay: number; message: string }>(`/api/payroll/entries/${id}/pay`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      toast.success(res.message);
      setPayTarget(null);
      invalidate(["payroll"]);
      invalidate(["finance"]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payPeriodMut = useMutation({
    mutationFn: (id: string) =>
      api<{ paidCount: number; total: number; message: string }>(
        `/api/payroll/periods/${id}/pay`,
        { method: "POST" }
      ),
    onSuccess: (res) => {
      toast.success(res.message);
      setPeriodPayOpen(false);
      invalidate(["payroll"]);
      invalidate(["finance"]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const current = data?.current;
  const periodOpen = current?.status === "open";
  const entries = React.useMemo(() => {
    const list = current?.entries ?? [];
    return [...list].sort((a, b) =>
      a.status === b.status
        ? a.name.localeCompare(b.name, "fa")
        : a.status === "draft"
          ? -1
          : 1
    );
  }, [current]);

  const totalNet = entries.reduce((s, e) => s + (e.status === "paid" ? e.netPay : liveNet(e)), 0);
  const paidSum = entries.reduce((s, e) => s + (e.status === "paid" ? e.netPay : 0), 0);
  const paidCount = entries.filter((e) => e.status === "paid").length;
  const draftEntries = entries.filter((e) => e.status === "draft");
  const draftNet = draftEntries.reduce((s, e) => s + liveNet(e), 0);
  const remaining = totalNet - paidSum;
  const pastPeriods = (data?.periods ?? []).filter((p) => p.id !== current?.id);

  return (
    <div className="space-y-5">
      <PageHeader
        title="حقوق کارمندان"
        icon="wallet"
        description={
          current
            ? `دورهٔ ${faDigits(current.key)} • بازهٔ ${current.startDate} تا ${current.endDate}`
            : "پرداخت سریع حقوق دورهٔ جاری"
        }
        actions={
          <div className="flex items-center gap-2">
            {current && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  PERIOD_STATUS[current.status]?.cls ?? "bg-muted text-muted-foreground"
                )}
              >
                {PERIOD_STATUS[current.status]?.label ?? current.status}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()} title="به‌روزرسانی">
              <Icon name="refresh" size={14} className={isFetching ? "animate-spin" : ""} />
            </Button>
          </div>
        }
      />

      {isLoading && <LoadingState label="در حال بارگذاری حقوق کارمندان…" />}

      {!isLoading && (error || !current) && (
        <EmptyState
          icon="alertTriangle"
          title="خطا در دریافت حقوق کارمندان"
          description={error instanceof Error ? error.message : "دورهٔ حقوق یافت نشد"}
          action={
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetch()}>
              <Icon name="refresh" size={14} /> تلاش دوباره
            </Button>
          }
        />
      )}

      {!isLoading && current && (
        <>
          {/* راهنما — ویرایش فقط در ماژول مالی */}
          <div className="rounded-xl border bg-muted/30 px-4 py-2.5 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <Icon name="info" size={14} className="text-primary shrink-0" />
            <span>
              این صفحه فقط پرداخت است — <b className="text-foreground">ویرایش ارقام و مساعده در ماژول مالی</b> انجام
              می‌شود (حقوق و دستمزد).
            </span>
          </div>

          {/* نوار جمع‌وجور */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox
              label="جمع خالص دوره"
              value={formatCurrency(totalNet)}
              icon="wallet"
              cls="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            />
            <StatBox
              label="پرداخت‌شده"
              value={formatCurrency(paidSum)}
              icon="checkCircle"
              cls="bg-teal-500/10 text-teal-600 dark:text-teal-400"
            />
            <StatBox
              label="مانده"
              value={formatCurrency(remaining)}
              icon="clock"
              cls="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            />
            <StatBox
              label="کارمندان"
              value={fa(entries.length)}
              icon="userGroup"
              cls="bg-violet-500/10 text-violet-600 dark:text-violet-400"
            />
          </div>

          {/* جدول کارمندان — فقط-خواندنی */}
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
                  <Icon name="userGroup" size={17} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">
                    کارمندان دورهٔ <span dir="ltr" className="tabular-nums">{faDigits(current.key)}</span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {fa(paidCount)} پرداخت‌شده • {fa(draftEntries.length)} آمادهٔ پرداخت
                  </p>
                </div>
              </div>
            </div>

            {entries.length === 0 ? (
              <EmptyState
                icon="userGroup"
                title="کارمندی در این دوره نیست"
                description="ورودی‌های دوره برای کارمندان فعال به‌صورت خودکار ساخته می‌شوند."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="h-10 text-xs font-semibold text-muted-foreground min-w-[180px]">کارمند</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground text-end">خالص</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">وضعیت</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground text-end">پرداخت</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((e) => {
                      const net = e.status === "paid" ? e.netPay : liveNet(e);
                      return (
                        <TableRow key={e.id} className={cn(e.status === "paid" && "text-muted-foreground")}>
                          <TableCell>
                            <div className="font-medium text-sm text-foreground truncate">{e.name}</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {e.modules.map((m) => (
                                <ModuleChip key={m} module={m} />
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-end">
                            <span
                              className={cn(
                                "text-sm font-bold tabular-nums whitespace-nowrap",
                                net <= 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"
                              )}
                              dir="ltr"
                              title={net <= 0 ? "خالص صفر/منفی — ارقام را در ماژول مالی تنظیم کنید" : undefined}
                            >
                              {formatNumber(net)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {e.status === "paid" ? (
                              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" title={e.paidAt ? `پرداخت در ${formatDate(e.paidAt)}` : undefined}>
                                <Icon name="checkCircle" size={12} />
                                پرداخت‌شده
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                آماده
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-end">
                            {periodOpen && e.status === "draft" ? (
                              <Button
                                size="sm"
                                className="h-7 gap-1 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={net <= 0 || payEntryMut.isPending}
                                onClick={() => setPayTarget(e)}
                                title={net <= 0 ? "خالص باید مثبت باشد — ویرایش در ماژول مالی" : "پرداخت حقوق این کارمند"}
                              >
                                <Icon name="money" size={12} />
                                پرداخت
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {/* دکمهٔ بزرگ پرداخت کل دوره */}
          {periodOpen && (
            <Card className="p-4 border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/10">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-10 rounded-xl bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 grid place-items-center shrink-0">
                    <Icon name="money" size={19} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">پرداخت حقوق کل دوره</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {draftEntries.length === 0
                        ? "همهٔ کارمندان پرداخت شده‌اند"
                        : `${fa(draftEntries.length)} کارمند — جمع ${formatCurrency(draftNet)}`}
                    </div>
                  </div>
                </div>
                <Button
                  size="lg"
                  className="w-full sm:w-auto gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={draftEntries.length === 0 || draftNet <= 0 || payPeriodMut.isPending}
                  onClick={() => setPeriodPayOpen(true)}
                >
                  <Icon name={payPeriodMut.isPending ? "loading" : "checkCircle"} size={16} className={payPeriodMut.isPending ? "animate-spin" : ""} />
                  پرداخت حقوق کل دوره
                </Button>
              </div>
            </Card>
          )}

          {/* دوره‌های گذشته — فقط-خواندنی */}
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 grid place-items-center">
                <Icon name="clock" size={17} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">دوره‌های قبلی</h3>
                <p className="text-[11px] text-muted-foreground">{fa(pastPeriods.length)} دوره — فقط نمایش</p>
              </div>
            </div>
            {pastPeriods.length === 0 ? (
              <EmptyState
                icon="calendar"
                title="دورهٔ دیگری ثبت نشده است"
                description="با پایان هر ماه، دورهٔ جدید به‌صورت خودکار ساخته می‌شود."
                className="py-8"
              />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="h-9 text-xs font-semibold text-muted-foreground">دوره</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">بازه</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground text-center">تعداد</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">جمع خالص</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">وضعیت</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pastPeriods.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <span dir="ltr" className="font-mono text-xs font-bold tabular-nums">{faDigits(p.key)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                            {formatDate(p.startDate)} → {formatDate(p.endDate)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-xs tabular-nums">{fa(p.entriesCount)}</TableCell>
                        <TableCell>
                          <span className="text-xs font-semibold tabular-nums" dir="ltr">{formatCurrency(p.totalNet)}</span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                              PERIOD_STATUS[p.status]?.cls ?? "bg-muted text-muted-foreground"
                            )}
                            title={p.paidByName && p.paidAt ? `پرداخت توسط ${p.paidByName} — ${formatDate(p.paidAt)}` : undefined}
                          >
                            {PERIOD_STATUS[p.status]?.label ?? p.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* دیالوگ تأیید پرداخت یک کارمند */}
      <AlertDialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>پرداخت حقوق {payTarget?.name}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>
                  خالص پرداختی:{" "}
                  <b dir="ltr" className="tabular-nums text-foreground">
                    {formatCurrency(payTarget ? liveNet(payTarget) : 0)}
                  </b>
                </div>
                <div>
                  پس از پرداخت، این ردیف قفل می‌شود و به‌عنوان سند هزینهٔ «حقوق» ثبت می‌شود؛ به
                  کارمند هم اطلاع داده می‌شود.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              onClick={() => payTarget && payEntryMut.mutate(payTarget.id)}
            >
              <Icon name="money" size={14} />
              پرداخت
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* دیالوگ تأیید پرداخت کل دوره */}
      <AlertDialog open={periodPayOpen} onOpenChange={setPeriodPayOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              پرداخت حقوق کل دورهٔ <span dir="ltr" className="tabular-nums">{faDigits(current?.key ?? "")}</span>
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>
                  {fa(draftEntries.length)} کارمند پرداخت می‌شود — جمع:{" "}
                  <b dir="ltr" className="tabular-nums text-foreground">{formatCurrency(draftNet)}</b>
                </div>
                <div className="text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                  <Icon name="alertTriangle" size={14} className="shrink-0 mt-0.5" />
                  <span>ردیف‌های پرداخت‌شده قفل می‌شوند و ردیف‌های با خالصِ ≤ 0 رد می‌شوند.</span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              disabled={payPeriodMut.isPending}
              onClick={() => current && payPeriodMut.mutate(current.id)}
            >
              <Icon name={payPeriodMut.isPending ? "loading" : "checkCircle"} size={14} className={payPeriodMut.isPending ? "animate-spin" : ""} />
              تأیید و پرداخت
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
