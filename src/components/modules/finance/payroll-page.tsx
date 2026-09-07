"use client";

// ─── Phase 16: حقوق و دستمزد — مالی (فول) ──────────────────────────────
// ساختار (تخصصی واحد مالی):
//   ۱) نوار دوره‌ها — چیپ‌های افقی (مرتب نزولی): دورهٔ بازِ جاری emerald؛
//      دوره‌های پرداخت‌شده فقط-خواندنی
//   ۲) ردیف کارت‌های جمع: جمع حقوق دوره • پرداخت‌شده • کارمندان •
//      اضافه‌کاری+پاداش • کسورات • مساعدهٔ کسرنشده
//   ۳) جدول ورودی‌ها (قلب صفحه): ویرایش اینلاین در دورهٔ باز (الگوی
//      آیتم‌ردیف ویزارد: اینپوت‌های جمع‌وجور با نمایش گروه‌بندی‌شده)،
//      خالصِ زنده، ذخیرهٔ per-row + پرداخت با تأیید؛ ردیف paid قفل با
//      لینک «سند هزینه»
//   ۴) نوار «پرداخت کل دوره» (AlertDialog + جمع خالص draft)
//   ۵) پنل مساعده‌ها: فرم ثبت اینلاین + جدول وضعیت/حذف (فقط کسرنشده)
//   ۶) تاریخچهٔ دوره‌های گذشته

import * as React from "react";
import { useQuery, useMutation, type UseMutationResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, EmptyState, LoadingState } from "@/components/shared";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency, formatNumber, formatDateTime, formatDate } from "@/lib/format";
import { MODULES, USER_ROLE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types (قرارداد /api/payroll) ───────────────────────────────────────

type PayrollEntry = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  userStatus: string;
  modules: string[];
  userBaseSalary: number;
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
  costId: string | null;
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
  note: string | null;
};

type Advance = {
  id: string;
  userId: string;
  name: string;
  modules: string[];
  amount: number;
  note: string | null;
  costId: string | null;
  createdAt: string;
  createdByName: string | null;
  deductedPeriodKey: string | null;
  deductedAt: string | null;
};

type PayrollData = {
  current: {
    id: string;
    key: string;
    status: string;
    startDate: string;
    endDate: string;
    note: string | null;
    paidAt: string | null;
    paidByName: string | null;
    totalNet: number;
    entriesCount: number;
    entries: PayrollEntry[];
    totals: {
      count: number;
      base: number;
      overtime: number;
      bonus: number;
      deduction: number;
      insurance: number;
      tax: number;
      advance: number;
      net: number;
      paidCount: number;
      paidSum: number;
    };
  };
  periods: Period[];
  advances: Advance[];
};

// ─── رنگ چیپ ماژول — الگوی клиент سیستم (monitoring-users) ─────────────

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

function moduleLabel(key: string): string {
  const meta = (MODULES as Record<string, { faLabel: string }>)[key];
  return meta?.faLabel ?? key;
}

function roleLabel(role: string): string {
  return USER_ROLE[role]?.label ?? role;
}

function groupDigits(n: number): string {
  return n.toLocaleString("en-US");
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

// ─── اینپوت عددی با نمایش گروه‌بندی‌شده (الگوی فرم هزینه) ─────────────

function NumInput({
  value,
  onChange,
  className,
  disabled,
  title,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [text, setText] = React.useState<string>(() => (value > 0 ? groupDigits(value) : ""));
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    if (!focused) setText(value > 0 ? groupDigits(value) : "");
  }, [value, focused]);

  return (
    <Input
      inputMode="numeric"
      dir="ltr"
      disabled={disabled}
      title={title}
      value={text}
      placeholder="0"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 12);
        setText(digits ? groupDigits(Number(digits)) : "");
        onChange(digits ? Number(digits) : 0);
      }}
      className={cn("h-8 text-xs text-center tabular-nums px-1.5", className)}
    />
  );
}

// ─── ویرایش اینلاین: state دلتا per-row ────────────────────────────────

type RowEdit = {
  baseSalary?: number;
  overtimeHours?: number;
  overtimeRate?: number;
  bonus?: number;
  deduction?: number;
  insurance?: number;
  tax?: number;
  advanceDeducted?: number;
  note?: string;
  updateContract?: boolean;
};

type EntryVals = {
  baseSalary: number;
  overtimeHours: number;
  overtimeRate: number;
  bonus: number;
  deduction: number;
  insurance: number;
  tax: number;
  advanceDeducted: number;
  note: string;
};

function mergedVals(entry: PayrollEntry, edit?: RowEdit): EntryVals {
  return {
    baseSalary: edit?.baseSalary ?? entry.baseSalary,
    overtimeHours: edit?.overtimeHours ?? entry.overtimeHours,
    overtimeRate: edit?.overtimeRate ?? entry.overtimeRate,
    bonus: edit?.bonus ?? entry.bonus,
    deduction: edit?.deduction ?? entry.deduction,
    insurance: edit?.insurance ?? entry.insurance,
    tax: edit?.tax ?? entry.tax,
    advanceDeducted: edit?.advanceDeducted ?? entry.advanceDeducted,
    note: edit?.note ?? entry.note ?? "",
  };
}

function computeNet(v: EntryVals): number {
  return Math.round(
    v.baseSalary +
      v.overtimeHours * v.overtimeRate +
      v.bonus -
      v.deduction -
      v.insurance -
      v.tax -
      v.advanceDeducted
  );
}

function rowDirty(entry: PayrollEntry, edit?: RowEdit): boolean {
  if (!edit) return false;
  const v = mergedVals(entry, edit);
  return (
    v.baseSalary !== entry.baseSalary ||
    v.overtimeHours !== entry.overtimeHours ||
    v.overtimeRate !== entry.overtimeRate ||
    v.bonus !== entry.bonus ||
    v.deduction !== entry.deduction ||
    v.insurance !== entry.insurance ||
    v.tax !== entry.tax ||
    v.advanceDeducted !== entry.advanceDeducted ||
    v.note !== (entry.note ?? "")
  );
}

// ─── کارت جمع (KPI) ────────────────────────────────────────────────────

const TONE: Record<string, { bg: string; text: string; ring: string }> = {
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/20" },
  teal: { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400", ring: "ring-teal-500/20" },
  violet: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", ring: "ring-violet-500/20" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/20" },
  rose: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", ring: "ring-rose-500/20" },
};

function StatCard({
  icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: IconName;
  tone: keyof typeof TONE;
  label: string;
  value: string;
  hint?: string;
}) {
  const c = TONE[tone];
  return (
    <Card className={cn("p-4 ring-1", c.ring)}>
      <div className={cn("size-9 rounded-xl grid place-items-center shrink-0", c.bg, c.text)}>
        <Icon name={icon} size={18} />
      </div>
      <div className="text-xl font-bold tabular-nums mt-2.5 truncate" dir="ltr" title={value}>
        {value}
      </div>
      <div className="text-xs font-medium text-muted-foreground mt-1">{label}</div>
      {hint && <div className="text-[10px] text-muted-foreground/70 mt-1.5 pt-1.5 border-t">{hint}</div>}
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

export function PayrollPage() {
  const invalidate = useInvalidate();
  const navigate = useAppStore((s) => s.navigate);

  // "" = دورهٔ جاری (سرور خودش ensure می‌کند)؛ در غیر این صورت id دوره
  const [periodId, setPeriodId] = React.useState("");
  const [edits, setEdits] = React.useState<Record<string, RowEdit>>({});
  const [noteOpenIds, setNoteOpenIds] = React.useState<Set<string>>(new Set());
  const [payTarget, setPayTarget] = React.useState<PayrollEntry | null>(null);
  const [periodPayOpen, setPeriodPayOpen] = React.useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["payroll", periodId],
    queryFn: () => api<PayrollData>(`/api/payroll${periodId ? `?periodId=${periodId}` : ""}`),
    staleTime: 30_000,
  });

  // تعویض دوره → پاک‌سازی ویرایش‌ها/دیالوگ‌ها
  React.useEffect(() => {
    setEdits({});
    setNoteOpenIds(new Set());
    setPayTarget(null);
    setPeriodPayOpen(false);
  }, [periodId]);

  const current = data?.current;
  const periodOpen = current?.status === "open";

  // draftها اول (قابل ویرایش بالا) سپس name
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

  const editRow = (id: string, patch: Partial<RowEdit>) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const toggleNote = (id: string) =>
    setNoteOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── Mutations (پس از هر تغییر: payroll + finance — سند هزینه ساخته می‌شود) ──

  const saveEntryMut = useMutation({
    mutationFn: (p: { entry: PayrollEntry; vals: EntryVals; updateContract: boolean }) =>
      api<{ entry: { id: string }; netPay: number }>(`/api/payroll/entries/${p.entry.id}`, {
        method: "PUT",
        body: JSON.stringify({
          baseSalary: p.vals.baseSalary,
          overtimeHours: p.vals.overtimeHours,
          overtimeRate: p.vals.overtimeRate,
          bonus: p.vals.bonus,
          deduction: p.vals.deduction,
          insurance: p.vals.insurance,
          tax: p.vals.tax,
          advanceDeducted: p.vals.advanceDeducted,
          note: p.vals.note,
          updateContract: p.updateContract,
        }),
      }),
    onSuccess: (res, v) => {
      toast.success(
        `حقوق ${v.entry.name} ذخیره شد — خالص ${formatNumber(res.netPay)} IQD`
      );
      setEdits((prev) => {
        const next = { ...prev };
        delete next[v.entry.id];
        return next;
      });
      invalidate(["payroll"]);
      invalidate(["finance"]);
    },
    onError: (e: Error) => toast.error(e.message),
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

  const createAdvMut = useMutation({
    mutationFn: (p: { userId: string; amount: number; note: string }) =>
      api<{ message: string }>("/api/payroll/advances", {
        method: "POST",
        body: JSON.stringify(p),
      }),
    onSuccess: (res) => {
      toast.success(res.message);
      invalidate(["payroll"]);
      invalidate(["finance"]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAdvMut = useMutation({
    mutationFn: (id: string) =>
      api<{ message: string }>(`/api/payroll/advances/${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      toast.success(res.message);
      invalidate(["payroll"]);
      invalidate(["finance"]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── محاسبات زنده (واکنش به ویرایش‌های ذخیره‌نشده) ──

  const rows = React.useMemo(
    () => entries.map((e) => ({ e, v: mergedVals(e, edits[e.id]) })),
    [entries, edits]
  );

  const liveNet = rows.reduce(
    (s, r) => s + (r.e.status === "paid" ? r.e.netPay : computeNet(r.v)),
    0
  );
  const paidSum = rows.reduce((s, r) => s + (r.e.status === "paid" ? r.e.netPay : 0), 0);
  const paidCount = rows.filter((r) => r.e.status === "paid").length;
  const draftRows = rows.filter((r) => r.e.status === "draft");
  const draftNet = draftRows.reduce((s, r) => s + computeNet(r.v), 0);
  const otBonus = rows.reduce((s, r) => s + r.v.overtimeHours * r.v.overtimeRate + r.v.bonus, 0);
  const deductions = rows.reduce(
    (s, r) => s + r.v.deduction + r.v.insurance + r.v.tax + r.v.advanceDeducted,
    0
  );

  const colSums = React.useMemo(
    () => ({
      base: rows.reduce((s, r) => s + r.v.baseSalary, 0),
      ot: rows.reduce((s, r) => s + r.v.overtimeHours * r.v.overtimeRate, 0),
      bonus: rows.reduce((s, r) => s + r.v.bonus, 0),
      deduction: rows.reduce((s, r) => s + r.v.deduction, 0),
      insurance: rows.reduce((s, r) => s + r.v.insurance, 0),
      tax: rows.reduce((s, r) => s + r.v.tax, 0),
      advance: rows.reduce((s, r) => s + r.v.advanceDeducted, 0),
    }),
    [rows]
  );

  const pendingAdvances = (data?.advances ?? []).filter((a) => a.deductedPeriodKey === null);
  const pendingAdvSum = pendingAdvances.reduce((s, a) => s + a.amount, 0);

  // خالصِ هدف دیالوگ پرداخت — از فرمول سرور روی ارقام ذخیره‌شدهٔ ردیف
  const payTargetNet = payTarget ? computeNet(mergedVals(payTarget)) : 0;

  const saveRow = (entry: PayrollEntry) => {
    const edit = edits[entry.id];
    const vals = mergedVals(entry, edit);
    saveEntryMut.mutate({
      entry,
      vals,
      updateContract: edit?.updateContract === true,
    });
  };

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <PageHeader
        title="حقوق و دستمزد"
        icon="wallet"
        description={
          current
            ? `دورهٔ ${faDigits(current.key)} • ${fa(entries.length)} کارمند • هر پرداخت به‌عنوان سند هزینهٔ «حقوق» ثبت می‌شود`
            : "مدیریت دوره‌های حقوق، مساعده و پرداخت — ثبت خودکار به‌عنوان هزینه"
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            title="به‌روزرسانی"
          >
            <Icon name="refresh" size={14} className={isFetching ? "animate-spin" : ""} />
          </Button>
        }
      />

      {isLoading && <LoadingState label="در حال بارگذاری حقوق و دستمزد…" />}

      {!isLoading && (error || !current) && (
        <EmptyState
          icon="alertTriangle"
          title="خطا در دریافت حقوق و دستمزد"
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
          {/* ۱) نوار دوره‌ها */}
          <Card className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-medium text-muted-foreground shrink-0 flex items-center gap-1">
                <Icon name="calendar" size={13} />
                دوره‌ها:
              </span>
              <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 py-0.5">
                {(data?.periods ?? []).map((p) => {
                  const active = p.id === current.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPeriodId(p.id)}
                      disabled={active}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition shrink-0",
                        active
                          ? p.status === "open"
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                            : "bg-muted text-foreground border-foreground/25 font-semibold"
                          : "bg-background text-muted-foreground border-input hover:border-foreground/30 hover:text-foreground"
                      )}
                      title={
                        active
                          ? "دورهٔ در حال نمایش"
                          : `بازهٔ ${p.startDate} تا ${p.endDate}${p.paidByName ? ` — پرداخت توسط ${p.paidByName}` : ""}`
                      }
                    >
                      <Icon
                        name={p.status === "paid" ? "checkCircle" : "calendar"}
                        size={12}
                        className="opacity-70"
                      />
                      <span dir="ltr" className="tabular-nums">{faDigits(p.key)}</span>
                      {p.status === "open" && (
                        <span
                          className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded-full",
                            active ? "bg-white/20" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                          )}
                        >
                          جاری
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* بنر فقط-خواندنی برای دوره‌های پرداخت‌شده/بسته */}
          {!periodOpen && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10 px-4 py-2.5 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 flex-wrap">
              <Icon name="lock" size={14} className="shrink-0 mt-0.5" />
              <span>
                دورهٔ <b dir="ltr" className="tabular-nums">{faDigits(current.key)}</b>{" "}
                {PERIOD_STATUS[current.status]?.label ?? current.status} است — نمایش فقط-خواندنی؛
                ویرایش ارقام فقط در دورهٔ باز ممکن است.
                {current.paidByName && current.paidAt && (
                  <span className="text-muted-foreground">
                    {" "}
                    (پرداخت توسط {current.paidByName} در {formatDateTime(current.paidAt)})
                  </span>
                )}
              </span>
            </div>
          )}

          {/* ۲) کارت‌های جمع */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              icon="wallet"
              tone="emerald"
              label="جمع حقوق دوره"
              value={formatCurrency(liveNet)}
              hint={`خالص ${fa(rows.length)} ورودی`}
            />
            <StatCard
              icon="checkCircle"
              tone="teal"
              label="پرداخت‌شده"
              value={formatCurrency(paidSum)}
              hint={`${fa(paidCount)} از ${fa(rows.length)} نفر`}
            />
            <StatCard
              icon="userGroup"
              tone="violet"
              label="کارمندان"
              value={fa(rows.length)}
              hint={`${fa(draftRows.length)} آمادهٔ پرداخت`}
            />
            <StatCard
              icon="clock"
              tone="amber"
              label="اضافه‌کاری + پاداش"
              value={formatCurrency(otBonus)}
              hint="مشوق‌های دوره"
            />
            <StatCard
              icon="alertTriangle"
              tone="rose"
              label="کسورات"
              value={formatCurrency(deductions)}
              hint="کمکرد + بیمه + مالیات + مساعده"
            />
            <StatCard
              icon="giftCard"
              tone="amber"
              label="مساعدهٔ کسرنشده"
              value={formatCurrency(pendingAdvSum)}
              hint={`${fa(pendingAdvances.length)} مساعده — کسر در دورهٔ بعد`}
            />
          </div>

          {/* ۳) جدول ورودی‌ها */}
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
                  <Icon name="users" size={17} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">
                    ورودی‌های حقوق — دورهٔ <span dir="ltr" className="tabular-nums">{faDigits(current.key)}</span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {fa(rows.length)} کارمند • بازهٔ {current.startDate} تا {current.endDate} •{" "}
                    {periodOpen ? "ویرایش اینلاین فعال" : "فقط-خواندنی"}
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  PERIOD_STATUS[current.status]?.cls ?? "bg-muted text-muted-foreground"
                )}
              >
                {PERIOD_STATUS[current.status]?.label ?? current.status}
              </span>
            </div>

            {entries.length === 0 ? (
              <EmptyState
                icon="userGroup"
                title="کارمندی در این دوره نیست"
                description="ورودی دورهٔ جاری برای کارمندان فعالِ غیر-مدیر سیستم به‌صورت خودکار ساخته می‌شود."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[1180px]">
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="h-10 text-xs font-semibold text-muted-foreground min-w-[170px]">کارمند</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">حقوق پایه</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">اضافه‌کاری (ساعت × نرخ)</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">پاداش</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">کمکرد</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">بیمه</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">مالیات</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">کسر مساعده</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground text-center">خالص</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">وضعیت</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(({ e: entry, v }) => {
                      const editable = periodOpen && entry.status === "draft";
                      const dirty = editable && rowDirty(entry, edits[entry.id]);
                      const net = computeNet(v);
                      const shownNet = entry.status === "paid" ? entry.netPay : net;
                      const noteOpen = noteOpenIds.has(entry.id);
                      return (
                        <React.Fragment key={entry.id}>
                          <TableRow
                            className={cn(
                              "transition-colors",
                              entry.status === "paid" && "text-muted-foreground"
                            )}
                          >
                            {/* کارمند */}
                            <TableCell>
                              <div className="font-medium text-sm text-foreground truncate">{entry.name}</div>
                              <div className="text-[10px] text-muted-foreground mb-1">
                                {roleLabel(entry.role)}
                                {entry.userStatus !== "active" && (
                                  <span className="text-rose-600 dark:text-rose-400"> • غیرفعال</span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {entry.modules.map((m) => (
                                  <ModuleChip key={m} module={m} />
                                ))}
                              </div>
                            </TableCell>

                            {/* حقوق پایه */}
                            <TableCell>
                              {editable ? (
                                <div className="space-y-1">
                                  <NumInput value={v.baseSalary} onChange={(n) => editRow(entry.id, { baseSalary: n })} className="w-28" title="حقوق پایهٔ ماه" />
                                  <label
                                    className={cn(
                                      "flex items-center gap-1 text-[10px] cursor-pointer select-none transition",
                                      v.baseSalary !== entry.userBaseSalary ? "text-primary" : "text-muted-foreground"
                                    )}
                                    title={`ذخیرهٔ حقوق پایهٔ جدید در قرارداد کارمند (قرارداد فعلی: ${formatNumber(entry.userBaseSalary)} IQD)`}
                                  >
                                    <Checkbox
                                      checked={edits[entry.id]?.updateContract === true}
                                      onCheckedChange={(c) => editRow(entry.id, { updateContract: c === true })}
                                      className="size-3.5"
                                    />
                                    قرارداد
                                  </label>
                                </div>
                              ) : (
                                <span className="text-xs font-medium tabular-nums" dir="ltr">{formatNumber(entry.baseSalary)}</span>
                              )}
                            </TableCell>

                            {/* اضافه‌کاری */}
                            <TableCell>
                              {editable ? (
                                <div className="flex items-center gap-1">
                                  <NumInput value={v.overtimeHours} onChange={(n) => editRow(entry.id, { overtimeHours: n })} className="w-12" title="ساعت اضافه‌کاری" />
                                  <span className="text-[10px] text-muted-foreground">×</span>
                                  <NumInput value={v.overtimeRate} onChange={(n) => editRow(entry.id, { overtimeRate: n })} className="w-24" title="نرخ هر ساعت" />
                                </div>
                              ) : (
                                <span className="text-xs tabular-nums" dir="ltr">
                                  {fa(entry.overtimeHours)} × {formatNumber(entry.overtimeRate)}
                                </span>
                              )}
                              {v.overtimeHours * v.overtimeRate > 0 && (
                                <div className="text-[10px] text-muted-foreground mt-0.5" dir="ltr">
                                  = {formatNumber(v.overtimeHours * v.overtimeRate)}
                                </div>
                              )}
                            </TableCell>

                            {/* پاداش / کمکرد / بیمه / مالیات */}
                            {(
                              [
                                ["bonus", "پاداش"],
                                ["deduction", "کمکرد"],
                                ["insurance", "بیمه"],
                                ["tax", "مالیات"],
                              ] as const
                            ).map(([field]) => (
                              <TableCell key={field}>
                                {editable ? (
                                  <NumInput value={v[field]} onChange={(n) => editRow(entry.id, { [field]: n })} className="w-24" />
                                ) : (
                                  <span className="text-xs tabular-nums" dir="ltr">{formatNumber(entry[field])}</span>
                                )}
                              </TableCell>
                            ))}

                            {/* کسر مساعده */}
                            <TableCell>
                              {editable ? (
                                <div className="space-y-1">
                                  <NumInput
                                    value={v.advanceDeducted}
                                    onChange={(n) => editRow(entry.id, { advanceDeducted: Math.min(n, entry.pendingAdvanceSum) })}
                                    className="w-24"
                                    title={
                                      entry.pendingAdvanceSum > 0
                                        ? `سقف: ${formatNumber(entry.pendingAdvanceSum)} IQD`
                                        : "مساعدهٔ کسرنشده ندارد"
                                    }
                                  />
                                  {entry.pendingAdvanceSum > 0 && (
                                    <span
                                      className="block text-[9px] text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 rounded-full px-1.5 py-0.5 text-center whitespace-nowrap"
                                      dir="ltr"
                                      title="مجموع مساعده‌های کسرنشدهٔ این کارمند"
                                    >
                                      مساعدهٔ مانده: {formatNumber(entry.pendingAdvanceSum)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs tabular-nums" dir="ltr">
                                  {formatNumber(entry.advanceDeducted)}
                                </span>
                              )}
                            </TableCell>

                            {/* خالص */}
                            <TableCell
                              className={cn(
                                "text-center",
                                shownNet <= 0 ? "bg-rose-50/60 dark:bg-rose-950/20" : "bg-emerald-50/40 dark:bg-emerald-950/10"
                              )}
                            >
                              <span
                                className={cn(
                                  "text-sm font-bold tabular-nums whitespace-nowrap",
                                  shownNet <= 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"
                                )}
                                dir="ltr"
                                title={
                                  shownNet <= 0
                                    ? "خالص منفی/صفر — قبل از پرداخت، کسورات را تنظیم کنید"
                                    : "پایه + اضافه‌کاری + پاداش − کمکرد − بیمه − مالیات − مساعده"
                                }
                              >
                                {formatNumber(shownNet)}
                              </span>
                            </TableCell>

                            {/* وضعیت */}
                            <TableCell>
                              {entry.status === "paid" ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 cursor-help">
                                      <Icon name="checkCircle" size={12} />
                                      پرداخت‌شده
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    پرداخت در {formatDateTime(entry.paidAt)}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                  آماده
                                </span>
                              )}
                            </TableCell>

                            {/* عملیات */}
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={cn("size-7", v.note.trim() && "text-primary")}
                                      onClick={() => toggleNote(entry.id)}
                                    >
                                      <Icon name="document" size={13} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>یادداشت ردیف (در شرح سند هزینه درج می‌شود)</TooltipContent>
                                </Tooltip>
                                {editable ? (
                                  <>
                                    <Button
                                      size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]"
                                      disabled={!dirty || saveEntryMut.isPending}
                                      onClick={() => saveRow(entry)}
                                      title={dirty ? "ذخیرهٔ ارقام این ردیف" : "تغییرتی ثبت نشده است"}
                                    >
                                      <Icon
                                        name={saveEntryMut.isPending ? "loading" : "check"}
                                        size={12}
                                        className={saveEntryMut.isPending ? "animate-spin" : ""}
                                      />
                                      ذخیره
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="h-7 gap-1 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                                      disabled={shownNet <= 0 || dirty}
                                      onClick={() => setPayTarget(entry)}
                                      title={
                                        dirty
                                          ? "ابتدا تغییرات را ذخیره کنید"
                                          : shownNet <= 0
                                            ? "خالص باید مثبت باشد"
                                            : "پرداخت حقوق این کارمند"
                                      }
                                    >
                                      <Icon name="money" size={12} />
                                      پرداخت
                                    </Button>
                                  </>
                                ) : entry.costId ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => navigate("finance", "costs")}
                                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition"
                                      >
                                        <Icon name="receipt" size={12} />
                                        سند هزینه
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>در تاریخچه هزینه‌ها</TooltipContent>
                                  </Tooltip>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>

                          {/* ردیف یادداشت (جمع‌شونده) */}
                          {noteOpen && (
                            <TableRow className="bg-muted/20 hover:bg-muted/20">
                              <TableCell colSpan={11} className="py-2">
                                <div className="flex items-center gap-2 max-w-xl">
                                  <Icon name="document" size={13} className="text-muted-foreground shrink-0" />
                                  {editable ? (
                                    <Input
                                      value={v.note}
                                      onChange={(e) => editRow(entry.id, { note: e.target.value })}
                                      placeholder="یادداشت این ردیف — در شرح سند هزینه درج می‌شود"
                                      className="h-8 text-xs"
                                    />
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      {entry.note?.trim() || "بدون یادداشت"}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                  {/* جمع ستون‌ها */}
                  <tfoot>
                    <TableRow className="bg-muted/40 hover:bg-muted/40 font-semibold">
                      <TableCell className="text-xs">
                        جمع دوره ({fa(rows.length)} ردیف)
                      </TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">{formatNumber(colSums.base)}</TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">{formatNumber(colSums.ot)}</TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">{formatNumber(colSums.bonus)}</TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">{formatNumber(colSums.deduction)}</TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">{formatNumber(colSums.insurance)}</TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">{formatNumber(colSums.tax)}</TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">{formatNumber(colSums.advance)}</TableCell>
                      <TableCell
                        className={cn(
                          "text-xs font-bold tabular-nums text-center",
                          liveNet > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"
                        )}
                        dir="ltr"
                      >
                        {formatNumber(liveNet)}
                      </TableCell>
                      <TableCell colSpan={2} className="text-[10px] text-muted-foreground font-normal">
                        {fa(paidCount)} پرداخت‌شده • {fa(draftRows.length)} آماده
                      </TableCell>
                    </TableRow>
                  </tfoot>
                </Table>
              </div>
            )}
          </Card>

          {/* ۴) نوار پرداخت کل دوره */}
          {periodOpen && (
            <Card className="p-4 border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/10">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-10 rounded-xl bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 grid place-items-center shrink-0">
                    <Icon name="money" size={19} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      پرداخت یکجای دورهٔ <span dir="ltr" className="tabular-nums">{faDigits(current.key)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {draftRows.length === 0
                        ? "همهٔ ورودی‌ها پرداخت شده‌اند"
                        : `${fa(draftRows.length)} ردیف آماده — جمع خالص ${formatCurrency(draftNet)} • ردیف‌های خالصِ ≤ 0 رد می‌شوند`}
                    </div>
                  </div>
                </div>
                <Button
                  size="lg"
                  className="w-full sm:w-auto gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={draftRows.length === 0 || draftNet <= 0 || payPeriodMut.isPending}
                  onClick={() => setPeriodPayOpen(true)}
                >
                  <Icon name={payPeriodMut.isPending ? "loading" : "checkCircle"} size={16} className={payPeriodMut.isPending ? "animate-spin" : ""} />
                  پرداخت کل دوره
                </Button>
              </div>
            </Card>
          )}

          {/* ۵) پنل مساعده‌ها */}
          <AdvancesPanel
            advances={data?.advances ?? []}
            employees={entries.map((e) => ({ userId: e.userId, name: e.name }))}
            createMut={createAdvMut}
            deleteMut={deleteAdvMut}
          />

          {/* ۶) تاریخچهٔ دوره‌ها */}
          <PeriodsHistory periods={data?.periods ?? []} currentId={current.id} />
        </>
      )}

      {/* دیالوگ تأیید پرداخت یک ردیف — خالص از فرمول سرور (netPay ذخیره‌شده فقط بعد از ذخیره/پرداخت معتبر است) */}
      <AlertDialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>پرداخت حقوق {payTarget?.name}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>
                  خالص پرداختی:{" "}
                  <b dir="ltr" className="tabular-nums text-foreground">
                    {formatCurrency(payTargetNet)}
                  </b>
                </div>
                <div>
                  پس از پرداخت، این ردیف قفل می‌شود، سند هزینهٔ «حقوق» در تاریخچه هزینه‌ها ثبت
                  می‌شود و مساعده‌های کسرنشده (تا سقف کسر همین ردیف) به‌صورت FIFO بسته می‌شوند.
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
              پرداخت {formatCurrency(payTargetNet)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* دیالوگ تأیید پرداخت کل دوره */}
      <AlertDialog open={periodPayOpen} onOpenChange={setPeriodPayOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              پرداخت کل دورهٔ <span dir="ltr" className="tabular-nums">{faDigits(current?.key ?? "")}</span>
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>
                  {fa(draftRows.length)} ردیف پرداخت می‌شود — جمع خالص:{" "}
                  <b dir="ltr" className="tabular-nums text-foreground">
                    {formatCurrency(draftNet)}
                  </b>
                </div>
                <div className="text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                  <Icon name="alertTriangle" size={14} className="shrink-0 mt-0.5" />
                  <span>
                    ورودی‌های پرداخت‌شده برای همیشه قفل می‌شوند؛ ردیف‌های با خالص ≤ 0 رد شده و
                    گزارش می‌شوند.
                  </span>
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

// ─── ۵) پنل مساعده‌ها ───────────────────────────────────────────────────

type EmployeeOption = { userId: string; name: string };

type CreateAdvMut = UseMutationResult<
  { message: string },
  Error,
  { userId: string; amount: number; note: string }
>;
type DeleteAdvMut = UseMutationResult<{ message: string }, Error, string>;

function AdvancesPanel({
  advances,
  employees,
  createMut,
  deleteMut,
}: {
  advances: Advance[];
  employees: EmployeeOption[];
  createMut: CreateAdvMut;
  deleteMut: DeleteAdvMut;
}) {
  // فرم ثبت
  const [advUserId, setAdvUserId] = React.useState("");
  const [advAmount, setAdvAmount] = React.useState(0);
  const [advNote, setAdvNote] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<Advance | null>(null);

  const employeeOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employees) if (!map.has(e.userId)) map.set(e.userId, e.name);
    return [...map.entries()].map(([userId, name]) => ({ userId, name }));
  }, [employees]);

  const pending = advances.filter((a) => a.deductedPeriodKey === null);
  const pendingSum = pending.reduce((s, a) => s + a.amount, 0);

  const canSubmit = !!advUserId && advAmount > 0 && !createMut.isPending;

  const submit = () => {
    if (!canSubmit) return;
    createMut.mutate(
      { userId: advUserId, amount: advAmount, note: advNote.trim() },
      {
        onSuccess: () => {
          setAdvUserId("");
          setAdvAmount(0);
          setAdvNote("");
        },
      }
    );
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 grid place-items-center">
            <Icon name="giftCard" size={17} />
          </div>
          <div>
            <h3 className="font-semibold text-sm">مساعده‌ها و پیش‌پرداخت‌ها</h3>
            <p className="text-[11px] text-muted-foreground">
              پول الان خارج می‌شود (سند هزینهٔ «حقوق») و در حقوق دورهٔ بعد کسر می‌شود (FIFO)
            </p>
          </div>
        </div>
        {pending.length > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
            title={`${fa(pending.length)} مساعدهٔ کسرنشده`}
          >
            <Icon name="clock" size={12} />
            کسرنشده: <span dir="ltr" className="tabular-nums">{formatCurrency(pendingSum)}</span>
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* ثبت مساعده — فرم جمع‌وجور */}
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="flex items-center gap-1.5 mb-2.5 text-xs font-medium text-muted-foreground">
            <Icon name="plusCircle" size={13} className="text-primary" />
            ثبت مساعده جدید
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 items-end">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">کارمند</label>
              <Select value={advUserId} onValueChange={setAdvUserId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="انتخاب کارمند…" />
                </SelectTrigger>
                <SelectContent>
                  {employeeOptions.map((e) => (
                    <SelectItem key={e.userId} value={e.userId}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">مبلغ (IQD)</label>
              <NumInput
                value={advAmount}
                onChange={setAdvAmount}
                className="h-9 text-sm"
                title="مبلغ مساعده"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">یادداشت (اختیاری)</label>
              <Input
                value={advNote}
                onChange={(e) => setAdvNote(e.target.value)}
                placeholder="مثلاً پیش‌پرداخت اجاره…"
                className="h-9 text-xs"
              />
            </div>
            <Button className="h-9 gap-1.5" disabled={!canSubmit} onClick={submit}>
              <Icon name={createMut.isPending ? "loading" : "plus"} size={14} className={createMut.isPending ? "animate-spin" : ""} />
              ثبت مساعده
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
            <Icon name="info" size={11} />
            همان لحظه به‌عنوان هزینهٔ تأییدشدهٔ «حقوق» ثبت می‌شود و به کارمند اطلاع داده می‌شود.
          </div>
        </div>

        {/* جدول مساعده‌ها */}
        {advances.length === 0 ? (
          <EmptyState
            icon="giftCard"
            title="مساعده‌ای ثبت نشده است"
            description="با فرم بالا پیش‌پرداخت حقوق به کارمندان بدهید — در دورهٔ بعد به‌صورت خودکار کسر می‌شود."
            className="py-8"
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="h-9 text-xs font-semibold text-muted-foreground min-w-[160px]">کارمند</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">مبلغ</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">ثبت‌کننده و تاریخ</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">وضعیت</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">حذف</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advances.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="text-xs font-medium truncate">{a.name}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {a.modules.map((m) => (
                          <ModuleChip key={m} module={m} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-bold tabular-nums" dir="ltr">
                        {formatCurrency(a.amount)}
                      </span>
                      {a.note?.trim() && (
                        <div className="text-[10px] text-muted-foreground truncate max-w-[180px] mt-0.5" title={a.note}>
                          {a.note}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">{a.createdByName ?? "—"}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
                        {formatDateTime(a.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {a.deductedPeriodKey ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 cursor-help">
                              <Icon name="checkCircle" size={12} />
                              کسرشده
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            کسر در حقوق دورهٔ <span dir="ltr" className="tabular-nums">{faDigits(a.deductedPeriodKey)}</span>
                            {a.deductedAt ? ` — ${formatDateTime(a.deductedAt)}` : ""}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                          <Icon name="clock" size={12} />
                          کسر در دورهٔ بعد
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-rose-600 hover:text-rose-700 disabled:opacity-40"
                        disabled={!!a.deductedPeriodKey}
                        onClick={() => setDeleteTarget(a)}
                        title={
                          a.deductedPeriodKey
                            ? "کسرشده در حقوق — قابل حذف نیست"
                            : "حذف مساعده و سند هزینهٔ آن (برگشت پول)"
                        }
                      >
                        <Icon name="trash" size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* دیالوگ حذف مساعده */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف مساعدهٔ {deleteTarget?.name}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>
                  مبلغ:{" "}
                  <b dir="ltr" className="tabular-nums text-foreground">
                    {formatCurrency(deleteTarget?.amount ?? 0)}
                  </b>
                </div>
                <div>
                  مساعده به‌همراه سند هزینهٔ وصل‌شدهٔ آن حذف می‌شود (برگشت کامل پول). این عمل
                  قابل بازگشت نیست.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
              disabled={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              <Icon name="trash" size={14} />
              حذف قطعی
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ─── ۶) تاریخچهٔ دوره‌ها ────────────────────────────────────────────────

function PeriodsHistory({ periods, currentId }: { periods: Period[]; currentId: string }) {
  const past = periods.filter((p) => p.id !== currentId);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center gap-2.5">
        <div className="size-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 grid place-items-center">
          <Icon name="clock" size={17} />
        </div>
        <div>
          <h3 className="font-semibold text-sm">دوره‌های حقوق</h3>
          <p className="text-[11px] text-muted-foreground">
            تاریخچهٔ دوره‌های قبلی — {fa(past.length)} دوره
          </p>
        </div>
      </div>
      {past.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="دورهٔ دیگری ثبت نشده است"
          description="با پایان هر ماه، دورهٔ جدید به‌صورت خودکار ساخته می‌شود."
          className="py-8"
        />
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="h-9 text-xs font-semibold text-muted-foreground">دوره</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">بازه</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-center">تعداد</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">جمع خالص</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">پرداخت‌کننده و تاریخ</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">وضعیت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {past.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <span dir="ltr" className="font-mono text-xs font-bold tabular-nums">
                      {faDigits(p.key)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                      {formatDate(p.startDate)} → {formatDate(p.endDate)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-xs tabular-nums">
                    {fa(p.entriesCount)}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-semibold tabular-nums" dir="ltr">
                      {formatCurrency(p.totalNet)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {p.paidByName ? (
                      <>
                        <div className="text-xs">{p.paidByName}</div>
                        <div className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
                          {formatDateTime(p.paidAt)}
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        PERIOD_STATUS[p.status]?.cls ?? "bg-muted text-muted-foreground"
                      )}
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
  );
}
