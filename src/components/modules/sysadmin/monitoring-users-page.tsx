"use client";

// Printoo24 ERP — Phase 13: «مانیتورینگ کاربران» (sysadmin/users — master)
//
// صفحهٔ اصلی ماژول «مدیر سیستم»: ادغام «مدیریت کاربران» (ساخت/ویرایش +
// تخصیص چند-ماژول — همان الگوی users-page فاز 12) با «مانیتورینگ»
// (حضور زنده + آمار per-item هر کاربر + تاخیرها + مرخصی).
//
// داده:   GET /api/monitoring/users → { users, summary } — refetchInterval
//         30 ثانیه (حضور زنده، همان heartbeat/lastSeenAt سرور).
// CRUD:   POST /api/users و PUT /api/users/[id] (قرارداد دقیق فاز 12).
//
// UX کلیدی (خواستهٔ صریح کاربر): دابل‌کلیک روی هر ردیف → صفحهٔ اختصاصی
// همان کاربر — navigate("sysadmin", "user", row.id).
//
// Cognitive-UX:
// - KPIهای بالا تصویر لحظه‌ای سازمان را می‌سازند (حضور/تاخیر/مرخصی).
// - فیلترهای چیپِ ماژول + حضور → «کی آنلاینه، کی تاخیر داره، کی نیست».
// - ستون‌های آماری ریز (طراحی/چاپ/تسک) با tone رنگی — بدون نیاز به کلیک.
// - همهٔ اعداد فارسی، همهٔ تاریخ‌ها میلادی (formatDate — هرگز شمسی).

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { MODULE_LEVEL_META, type ModuleLevel } from "@/lib/module-pages";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MODULES, type ModuleKey } from "@/lib/constants";
import { NAV } from "@/lib/nav";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

// ─── انواع (قرارداد GET /api/monitoring/users) ─────────────────────
type UserStats = {
  design: { open: number; completed: number; delayed: number; delayedDays: number };
  print: { open: number; completed: number; delayed: number; delayedDays: number };
  tasks: { open: number; done: number; overdue: number; overdueDays: number };
  qc: { reported: number; reviewed: number };
  createdOrders: number;
};

type MonitorUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  modules: string[];
  // Phase 18: صفحات مجاز هر ماژول (null = همه) — بج محدودیت در لیست
  modulePages?: Record<string, string[] | null>;
  // Phase 24: سطح ۳لایهٔ هر ماژول — view / edit / delete
  moduleLevels?: Record<string, ModuleLevel>;
  online: boolean;
  lastSeenAt: string | null;
  lastLoginAt: string | null;
  loginCount: number;
  onLeaveToday: boolean;
  leaveUntil: string | null;
  leaveNote: string | null;
  stats: UserStats;
};

type MonitorSummary = {
  total: number;
  active: number;
  onlineNow: number;
  onLeaveNow: number;
  delayedOrders: number;
  delayedTasks: number;
};

type MonitorReport = { users: MonitorUser[]; summary: MonitorSummary };

// ─── فرم CRUD (POST /api/users + PUT /api/users/[id]) ──────────────
type FormState = {
  name: string;
  email: string;
  password: string;
  phone: string;
  status: "active" | "inactive";
  modules: string[];
  // Phase 18: صفحات مجاز هر ماژول — null = همهٔ صفحات همان ماژول
  modulePages: Record<string, string[] | null>;
  // Phase 24: سطح ۳لایهٔ هر ماژول — delete = کامل (دیفالت)
  moduleLevels: Record<string, ModuleLevel>;
};

type CreateUserBody = {
  name: string;
  email: string;
  password: string;
  phone: string | null;
  status: "active" | "inactive";
  modules: string[];
  // Phase 18
  modulePages?: Record<string, string[] | null>;
  // Phase 24
  moduleLevels?: Record<string, ModuleLevel>;
};

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  password: "",
  phone: "",
  status: "active",
  modules: ["designer"],
  modulePages: {},
  moduleLevels: {},
};

/** Phase 18: آیتم‌های سایدبار یک ماژول (برچسب/صفحه) — از NAV. */
function moduleNavItems(moduleKey: string): { id: string; label: string; page: string }[] {
  const m = NAV.find((x) => x.key === moduleKey);
  if (!m) return [];
  return m.groups.flatMap((g) => g.items.map((i) => ({ id: i.id, label: i.label, page: i.page })));
}

/** Phase 18: فقط کلیدهای ماژول‌های انتخاب‌شده + نرمال‌سازی آرایهٔ خالی → null. */
function payloadPages(form: FormState): Record<string, string[] | null> {
  const out: Record<string, string[] | null> = {};
  for (const m of form.modules) {
    const pages = form.modulePages[m];
    out[m] = pages && pages.length > 0 ? Array.from(new Set(pages)) : null;
  }
  return out;
}

/** Phase 24: سطح ۳لایهٔ فقط ماژول‌های انتخاب‌شده (بدون کلید → delete). */
function payloadLevels(form: FormState): Record<string, ModuleLevel> {
  const out: Record<string, ModuleLevel> = {};
  for (const m of form.modules) out[m] = form.moduleLevels[m] ?? "delete";
  return out;
}

// ─── فیلتر/مرتب‌سازی ────────────────────────────────────────────────
type PresenceFilter = "all" | "online" | "offline" | "leave";
type SortKey = "name" | "modules" | "presence" | "leave" | "design" | "print" | "tasks";
type SortDir = "asc" | "desc";

// ─── رنگ چیپ ماژول — هم‌خانوادهٔ users-page (الگوی MODULE_TAG کل سیستم) ──
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

// نقطهٔ رنگی داخل چک‌باکس ماژول (دیالوگ) — هم‌رنگ چیپ همان ماژول
const MODULE_DOT: Record<string, string> = {
  admin: "bg-teal-500",
  designer: "bg-violet-500",
  print: "bg-amber-500",
  warehouse: "bg-cyan-500",
  finance: "bg-rose-500",
  qc: "bg-blue-500",
  crm: "bg-teal-500",
  srm: "bg-orange-500",
};

const MASTER_CHIP =
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300";

const KPI_TONES: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
  cyan: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400",
};

// ─── کمکی‌ها ────────────────────────────────────────────────────────
function fa(n: number): string {
  return n.toLocaleString("en-US");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0].slice(0, 1) + parts[1].slice(0, 1);
}

function moduleLabel(key: string): string {
  const meta = (MODULES as Record<string, { faLabel: string }>)[key];
  return meta?.faLabel ?? key;
}

/** مقدار مرتب‌سازی هر ستون — عدد/رشته؛ tie-break با نام (fa locale). */
function sortValue(u: MonitorUser, key: SortKey): number | string {
  switch (key) {
    case "name":
      return u.name;
    case "modules":
      // master همهٔ ماژول‌ها را دارد — همیشه صدر لیست شمار ماژول
      return u.role === "master" ? 99 : u.modules.length;
    case "presence":
      return u.online ? 1 : 0;
    case "leave":
      return u.onLeaveToday ? 1 : 0;
    case "design":
      // باز primary + تاخیر ثانویه (ضریب 100 — تاخیر به‌عنوان tie-break)
      return u.stats.design.open * 100 + u.stats.design.delayed;
    case "print":
      return u.stats.print.open * 100 + u.stats.print.delayed;
    case "tasks":
      return u.stats.tasks.open * 100 + u.stats.tasks.overdue;
  }
}

function compareUsers(a: MonitorUser, b: MonitorUser, key: SortKey, dir: 1 | -1): number {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  let cmp: number;
  if (typeof va === "string" || typeof vb === "string") {
    cmp = String(va).localeCompare(String(vb), "fa");
  } else {
    cmp = va - vb;
  }
  if (cmp !== 0) return cmp * dir;
  return a.name.localeCompare(b.name, "fa");
}

function userMatchesFilters(
  u: MonitorUser,
  f: {
    search: string;
    moduleFilters: Set<string>;
    presenceFilter: PresenceFilter;
    activeOnly: boolean;
  }
): boolean {
  const q = f.search.trim().toLowerCase();
  if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) {
    return false;
  }
  if (f.moduleFilters.size > 0) {
    const matches =
      (f.moduleFilters.has("master") && u.role === "master") ||
      u.modules.some((m) => f.moduleFilters.has(m));
    if (!matches) return false;
  }
  if (f.presenceFilter === "online" && !u.online) return false;
  if (f.presenceFilter === "offline" && u.online) return false;
  if (f.presenceFilter === "leave" && !u.onLeaveToday) return false;
  if (f.activeOnly && u.status !== "active") return false;
  return true;
}

// ─── اجزای کوچک ────────────────────────────────────────────────────
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

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
  pulseDot,
}: {
  icon: IconName;
  label: string;
  value: number;
  sub?: string;
  tone: keyof typeof KPI_TONES;
  pulseDot?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2.5 mb-2.5">
        <div
          className={cn(
            "size-9 rounded-xl grid place-items-center shrink-0",
            KPI_TONES[tone] ?? KPI_TONES.primary
          )}
        >
          <Icon name={icon} size={18} />
        </div>
        <span className="text-sm font-bold leading-tight">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {pulseDot && (
          <span className="size-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
        )}
        <span className="text-2xl font-bold tabular-nums">{fa(value)}</span>
      </div>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </Card>
  );
}

/** سلول آماری ریز — «3 باز · 1 تاخیر» + خط تکمیل‌شدهٔ کوچک. */
function WorkStatCell({
  open,
  delayed,
  done,
  delayedDays,
  doneLabel,
}: {
  open: number;
  delayed: number;
  done: number;
  delayedDays: number;
  doneLabel: string;
}) {
  if (open === 0 && delayed === 0 && done === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return (
    <div
      className="flex flex-col leading-tight"
      title={t("{p0}: {p1} · جمع دیرکرد: {p2} روز", { p0: doneLabel, p1: fa(done), p2: fa(delayedDays) })}
    >
      <span className="text-xs">
        <span className="font-bold tabular-nums">{fa(open)}</span>
        <span className="text-muted-foreground"> {t("باز")}</span>
        {delayed > 0 && (
          <>
            <span className="text-muted-foreground/50"> · </span>
            <span className="text-rose-600 dark:text-rose-400 font-medium tabular-nums">
              {fa(delayed)}
            </span>
            <span className="text-rose-600 dark:text-rose-400"> {t("تاخیر")}</span>
          </>
        )}
      </span>
      {done > 0 && (
        <span className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
          {fa(done)} {doneLabel}
        </span>
      )}
    </div>
  );
}

/** سرستون مرتب‌شونده — کلیک: تعویض جهت؛ آیکون وضعیت مرتب‌سازی. */
function SortableHead({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === activeKey;
  return (
    <TableHead className={cn("text-right", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-primary transition-colors"
        aria-label={t("مرتب‌سازی بر اساس {p0}", { p0: label })}
      >
        {label}
        <Icon
          name={active ? (dir === "asc" ? "arrowUp" : "arrowDown") : "arrowUpDown"}
          size={12}
          className={active ? "text-primary" : "text-muted-foreground/40"}
        />
      </button>
    </TableHead>
  );
}

// ─── صفحهٔ اصلی ────────────────────────────────────────────────────
export function MonitoringUsersPage() {
  const navigate = useAppStore((s) => s.navigate);
  const me = useAppStore((s) => s.user);
  const isMaster = me?.role === "master";
  const queryClient = useQueryClient();

  // ── CRUD dialog state (الگوی users-page) ──
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState<FormState>(EMPTY_FORM);
  const [editUser, setEditUser] = React.useState<MonitorUser | null>(null);
  const [editForm, setEditForm] = React.useState<FormState>(EMPTY_FORM);
  const [newPassword, setNewPassword] = React.useState("");

  // ── فیلتر/مرتب‌سازی ──
  const [search, setSearch] = React.useState("");
  const [moduleFilters, setModuleFilters] = React.useState<Set<string>>(
    () => new Set<string>()
  );
  const [presenceFilter, setPresenceFilter] = React.useState<PresenceFilter>("all");
  const [activeOnly, setActiveOnly] = React.useState(false);
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");

  // ── داده: حضور + آمار — به‌روزرسانی خودکار هر 30 ثانیه ──
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["monitoring", "users"],
    queryFn: () => api<MonitorReport>("/api/monitoring/users"),
    refetchInterval: 30000,
  });

  const users = data?.users ?? [];
  const summary = data?.summary;
  const loginSum = React.useMemo(
    () => users.reduce((s, u) => s + (u.loginCount ?? 0), 0),
    [users]
  );

  const filtered = React.useMemo(
    () =>
      users.filter((u) =>
        userMatchesFilters(u, { search, moduleFilters, presenceFilter, activeOnly })
      ),
    [users, search, moduleFilters, presenceFilter, activeOnly]
  );

  const sorted = React.useMemo(() => {
    const dir: 1 | -1 = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => compareUsers(a, b, sortKey, dir));
  }, [filtered, sortKey, sortDir]);

  const hasActiveFilters =
    search.trim() !== "" ||
    moduleFilters.size > 0 ||
    presenceFilter !== "all" ||
    activeOnly;

  // ── Mutations (قرارداد POST/PUT فاز 12) ──
  function invalidateUserQueries() {
    void queryClient.invalidateQueries({ queryKey: ["monitoring", "users"] });
    void queryClient.invalidateQueries({ queryKey: ["users"] });
    void queryClient.invalidateQueries({ queryKey: ["me"] });
  }

  const createMut = useMutation({
    mutationFn: (body: CreateUserBody) =>
      api("/api/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidateUserQueries();
      toast.success(t("کاربر جدید ایجاد شد"));
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Record<string, unknown>) =>
      api(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
    onSuccess: () => {
      invalidateUserQueries();
      toast.success(t("کاربر به‌روزرسانی شد"));
      setEditUser(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── کنش‌ها ──
  function openEdit(u: MonitorUser) {
    setEditUser(u);
    setEditForm({
      name: u.name,
      email: u.email,
      password: "",
      phone: u.phone ?? "",
      status: u.status === "inactive" ? "inactive" : "active",
      modules: u.role === "master" ? [] : (u.modules ?? []),
      // Phase 18: هیدراته از modulePages کاربر (null = همه)
      modulePages: u.role === "master" ? {} : { ...(u.modulePages ?? {}) },
      // Phase 24: هیدراته از سطح ۳لایه (بدون رکورد → delete)
      moduleLevels: u.role === "master" ? {} : { ...(u.moduleLevels ?? {}) },
    });
    setNewPassword("");
  }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim()) return toast.error(t("نام الزامی است"));
    if (!createForm.email.trim()) return toast.error(t("ایمیل الزامی است"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email.trim()))
      return toast.error(t("ایمیل معتبر وارد کنید"));
    if (createForm.password.length < 6)
      return toast.error(t("رمز عبور باید حداقل 6 کاراکتر باشد"));
    if (createForm.modules.length === 0)
      return toast.error(t("حداقل یک ماژول (سطح دسترسی) انتخاب کنید"));
    createMut.mutate({
      name: createForm.name.trim(),
      email: createForm.email.trim(),
      password: createForm.password,
      phone: createForm.phone.trim() || null,
      status: createForm.status,
      modules: createForm.modules,
      // Phase 18: صفحات مجاز فقط برای ماژول‌های انتخاب‌شده
      modulePages: payloadPages(createForm),
      // Phase 24: سطح ۳لایهٔ هر ماژول
      moduleLevels: payloadLevels(createForm),
    });
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    if (!editForm.name.trim()) return toast.error(t("نام نمی‌تواند خالی باشد"));
    if (editUser.role !== "master" && editForm.modules.length === 0)
      return toast.error(t("حداقل یک ماژول (سطح دسترسی) باید فعال بماند"));
    if (newPassword && newPassword.length < 6)
      return toast.error(t("رمز عبور باید حداقل 6 کاراکتر باشد"));
    updateMut.mutate({
      id: editUser.id,
      name: editForm.name.trim(),
      phone: editForm.phone.trim() || null,
      status: editForm.status,
      // master ماژول تکی ندارد — PUT برای او modules را رد می‌کند (400)
      ...(editUser.role !== "master" ? { modules: editForm.modules } : {}),
      // Phase 18: صفحات مجاز (سرور مجموع ماژول ثابت را مستقل اعمال می‌کند)
      ...(editUser.role !== "master" ? { modulePages: payloadPages(editForm) } : {}),
      // Phase 24: سطح ۳لایهٔ هر ماژول
      ...(editUser.role !== "master" ? { moduleLevels: payloadLevels(editForm) } : {}),
      ...(newPassword ? { password: newPassword } : {}),
    });
  }

  function toggleModuleFilter(key: string) {
    setModuleFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function clearFilters() {
    setSearch("");
    setModuleFilters(new Set());
    setPresenceFilter("all");
    setActiveOnly(false);
  }

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // نام الفبایی (صعودی)؛ بقیه: بیشترین/مهم‌ترین اول (نزولی)
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  // ── Render ──
  return (
    <div className="space-y-5">
      <PageHeader
        title={t("مانیتورینگ کاربران")}
        description={t("حضور، عملکرد و دسترسی همهٔ کاربران — دابل‌کلیک برای صفحهٔ اختصاصی هر کاربر")}
        icon="userGroup"
        actions={
          <Button
            onClick={() => {
              setCreateForm(EMPTY_FORM);
              setCreateOpen(true);
            }}
            className="gap-2"
            disabled={!isMaster}
            title={isMaster ? undefined : t("فقط مدیر سیستم می‌تواند کاربر ایجاد کند")}
          >
            <Icon name="plus" size={16} /> {t("کاربر جدید")}
          </Button>
        }
      />

      {/* ── KPI — تصویر لحظه‌ای سازمان ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <KpiCard
          icon="userGroup"
          label={t("کاربران")}
          value={summary?.total ?? 0}
          sub={t("{p0} فعال", { p0: fa(summary?.active ?? 0) })}
          tone="primary"
        />
        <KpiCard
          icon="userMultiple"
          label={t("آنلاین الان")}
          value={summary?.onlineNow ?? 0}
          sub={t("فعال در 3 دقیقهٔ اخیر")}
          tone="emerald"
          pulseDot
        />
        <KpiCard
          icon="calendar"
          label={t("در مرخصی امروز")}
          value={summary?.onLeaveNow ?? 0}
          sub={t("مرخصی فعال امروز")}
          tone="amber"
        />
        <KpiCard
          icon="alertTriangle"
          label={t("سفارش‌های تاخیری")}
          value={summary?.delayedOrders ?? 0}
          sub={t("طراحی + چاپ معوق")}
          tone="rose"
        />
        <KpiCard
          icon="task"
          label={t("تسک‌های تاخیری")}
          value={summary?.delayedTasks ?? 0}
          sub={t("موعد گذشته")}
          tone="rose"
        />
        <KpiCard
          icon="login"
          label={t("ورودها")}
          value={loginSum}
          sub={t("مجموع ورود کاربران")}
          tone="cyan"
        />
      </div>

      {/* ── نوار فیلتر ── */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Icon
              name="search"
              size={15}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("جستجوی نام یا ایمیل…")}
              className="pr-9"
              aria-label={t("جستجوی کاربر")}
            />
          </div>

          {/* حضور: همه / آنلاین / آفلاین / مرخصی */}
          <div
            className="flex items-center gap-0.5 rounded-lg border p-0.5"
            role="group"
            aria-label={t("فیلتر حضور")}
          >
            {(
              [
                ["all", t("همه")],
                ["online", t("آنلاین")],
                ["offline", t("آفلاین")],
                ["leave", t("مرخصی")],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPresenceFilter(k)}
                className={cn(
                  "h-7 px-2.5 rounded-md text-xs font-medium transition-colors",
                  presenceFilter === k
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 h-9 px-3 rounded-lg border cursor-pointer select-none">
            <Switch
              checked={activeOnly}
              onCheckedChange={setActiveOnly}
              aria-label={t("فقط کاربران فعال")}
            />
            <span className="text-xs font-medium">{t("فقط فعال‌ها")}</span>
          </label>

          <span className="text-xs text-muted-foreground mr-auto whitespace-nowrap">
            {t("{p0} کاربر", { p0: fa(filtered.length) })}
            {filtered.length !== users.length && (
              <span className="opacity-60"> {t("از {p0}", { p0: fa(users.length) })}</span>
            )}
          </span>
        </div>

        {/* چیپ ماژول‌ها — چند-انتخاب (شامل مدیر سیستم) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Icon name="filter" size={12} /> {t("ماژول:")}
          </span>
          {(Object.keys(MODULES) as ModuleKey[]).map((key) => {
            const active = moduleFilters.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleModuleFilter(key)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors select-none",
                  active
                    ? cn(MODULE_COLORS[key], "border-transparent")
                    : "border-border text-muted-foreground hover:bg-accent/50"
                )}
                aria-pressed={active}
              >
                {MODULES[key].faLabel}
                {active && <Icon name="cancel" size={10} />}
              </button>
            );
          })}
          {/* چیپ master (مدیر سیستم — دسترسی ضمنی به همه) */}
          <button
            type="button"
            onClick={() => toggleModuleFilter("master")}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors select-none",
              moduleFilters.has("master")
                ? cn(MASTER_CHIP, "border-transparent")
                : "border-border text-muted-foreground hover:bg-accent/50"
            )}
            aria-pressed={moduleFilters.has("master")}
          >
            {t("مدیر سیستم")}
            {moduleFilters.has("master") && <Icon name="cancel" size={10} />}
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 mr-1"
            >
              <Icon name="cancel" size={11} /> {t("پاک‌کردن فیلترها")}
            </button>
          )}
        </div>
      </Card>

      {/* ── بدنهٔ اصلی ── */}
      {isLoading ? (
        <LoadingState label={t("در حال بارگذاری مانیتورینگ…")} />
      ) : isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 p-4 text-sm text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3 flex-wrap">
          <span>
            {error instanceof Error ? error.message : t("خطا در بارگذاری مانیتورینگ کاربران.")}
          </span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {t("تلاش دوباره")}
          </Button>
        </div>
      ) : users.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon="userGroup"
            title={t("کاربری وجود ندارد")}
            description={t("اولین کاربر را ایجاد کنید.")}
            action={
              isMaster ? (
                <Button
                  onClick={() => {
                    setCreateForm(EMPTY_FORM);
                    setCreateOpen(true);
                  }}
                  className="gap-2"
                >
                  <Icon name="plus" size={16} /> {t("افزودن کاربر")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon="search"
            title={t("کاربری یافت نشد")}
            description={t("با فیلترهای فعلی کاربری مطابقت ندارد.")}
            action={
              hasActiveFilters ? (
                <Button variant="outline" onClick={clearFilters} className="gap-2">
                  <Icon name="cancel" size={14} /> {t("پاک‌کردن فیلترها")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          {/* سربرگ جدول — شمار + حضور زنده + رفرش دستی */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-muted/30 flex-wrap">
            <span className="text-sm font-semibold">
              {t("فهرست کاربران")}
              <span className="text-muted-foreground font-normal text-xs mr-2">
                {t("{p0} کاربر", { p0: fa(filtered.length) })}
              </span>
            </span>
            <span className="text-[11px] text-muted-foreground flex items-center gap-2">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                {t("{p0} آنلاین", { p0: fa(summary?.onlineNow ?? 0) })}
              </span>
              <span className="opacity-40">•</span>
              <span>{t("به‌روزرسانی خودکار هر 30 ثانیه")}</span>
              <button
                type="button"
                onClick={() => void refetch()}
                className="size-7 rounded-lg border grid place-items-center hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                title={t("به‌روزرسانی")}
                aria-label={t("به‌روزرسانی")}
              >
                <Icon
                  name="refresh"
                  size={13}
                  className={isFetching ? "animate-spin" : undefined}
                />
              </button>
            </span>
          </div>

          {/* جدول — دابل‌کلیک روی ردیف = صفحهٔ اختصاصی کاربر */}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortableHead
                  label={t("کاربر")}
                  sortKey="name"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  label={t("ماژول‌ها")}
                  sortKey="modules"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSort}
                  className="hidden lg:table-cell"
                />
                <SortableHead
                  label={t("حضور")}
                  sortKey="presence"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  label={t("مرخصی")}
                  sortKey="leave"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSort}
                  className="hidden xl:table-cell"
                />
                <SortableHead
                  label={t("طراحی")}
                  sortKey="design"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSort}
                  className="text-center hidden md:table-cell"
                />
                <SortableHead
                  label={t("چاپ")}
                  sortKey="print"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSort}
                  className="text-center hidden md:table-cell"
                />
                <SortableHead
                  label={t("تسک‌ها")}
                  sortKey="tasks"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSort}
                  className="text-center hidden md:table-cell"
                />
                <TableHead className="text-right">{t("اقدامات")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((u) => {
                const isSelf = u.id === me?.id;
                const inactive = u.status === "inactive";
                const isMasterRow = u.role === "master";
                return (
                  <TableRow
                    key={u.id}
                    onDoubleClick={() => navigate("sysadmin", "user", u.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigate("sysadmin", "user", u.id);
                    }}
                    tabIndex={0}
                    title={t("دابل‌کلیک: صفحهٔ اختصاصی {p0}", { p0: u.name })}
                    className={cn(
                      "cursor-pointer",
                      inactive && "opacity-60"
                    )}
                  >
                    {/* کاربر — آواتار + نام + ایمیل + نشان‌ها */}
                    <TableCell className="min-w-[190px]">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "size-9 rounded-full grid place-items-center text-[11px] font-bold shrink-0",
                            isMasterRow
                              ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white"
                              : "bg-primary/10 text-primary"
                          )}
                        >
                          {initials(u.name)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium truncate max-w-[160px]">
                              {u.name}
                            </span>
                            {isSelf && (
                              <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                                {t("شما")}
                              </span>
                            )}
                            {isMasterRow && (
                              <span
                                className={cn(
                                  "text-[10px] font-medium rounded-full px-1.5 py-0.5",
                                  MASTER_CHIP
                                )}
                              >
                                {t("مدیر سیستم")}
                              </span>
                            )}
                            {inactive && (
                              <span className="text-[10px] bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 rounded-full px-1.5 py-0.5">
                                {t("غیرفعال")}
                              </span>
                            )}
                          </div>
                          <span
                            dir="ltr"
                            className="text-[11px] text-muted-foreground block truncate max-w-[190px]"
                          >
                            {u.email}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    {/* ماژول‌ها — چیپ رنگی + شمار */}
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex items-center gap-1 flex-wrap max-w-[230px]">
                        {isMasterRow ? (
                          <span
                            className={cn(
                              "text-[11px] font-medium rounded-full px-2 py-0.5",
                              MASTER_CHIP
                            )}
                          >
                            {t("همه ماژول‌ها")}
                          </span>
                        ) : (u.modules ?? []).length === 0 ? (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        ) : (
                          <>
                            {(u.modules ?? []).map((m) => {
                              const pages = u.modulePages?.[m] ?? null;
                              const total = moduleNavItems(m).length;
                              const restricted = pages !== null && pages.length > 0;
                              return (
                                <span key={m} className="inline-flex items-center gap-1">
                                  <ModuleChip module={m} />
                                  {restricted && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span
                                          className="text-[9px] font-medium tabular-nums rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 px-1.5 py-0.5 cursor-help"
                                          title={undefined}
                                        >
                                          {fa(pages.length)}/{fa(total)}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs max-w-[240px]">
                                        {t("دسترسی محدود به {p0} صفحه از {p1} صفحهٔ ماژول", { p0: fa(pages.length), p1: fa(total) })}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </span>
                              );
                            })}
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {t("{p0} ماژول", { p0: fa(u.modules.length) })}
                            </span>
                          </>
                        )}
                      </div>
                    </TableCell>

                    {/* حضور — نقطهٔ آنلاین + آخرین بازدید + ورودها */}
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 text-xs font-medium">
                          <span
                            className={cn(
                              "size-2 rounded-full shrink-0",
                              u.online
                                ? "bg-emerald-500 animate-pulse"
                                : "bg-muted-foreground/40"
                            )}
                          />
                          {u.online ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {t("آنلاین")}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{t("آفلاین")}</span>
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                          {u.lastSeenAt ? (
                            <>
                              {t("آخرین بازدید:{p0}", { p0: " " })}
                              <span dir="ltr" className="tabular-nums">
                                {formatDate(u.lastSeenAt, true)}
                              </span>
                            </>
                          ) : (
                            t("بدون بازدید")
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {t("{p0} ورود", { p0: fa(u.loginCount) })}
                        </span>
                      </div>
                    </TableCell>

                    {/* مرخصی — نشان کهربایی + توضیح (tooltip) */}
                    <TableCell className="hidden xl:table-cell">
                      {u.onLeaveToday ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium cursor-help whitespace-nowrap",
                                "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                              )}
                            >
                              <Icon name="calendar" size={11} />
                              {t("مرخصی تا{p0}", { p0: " " })}
                              <span dir="ltr" className="tabular-nums">
                                {formatDate(u.leaveUntil)}
                              </span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-56">
                            {u.leaveNote?.trim()
                              ? u.leaveNote
                              : t("مرخصی بدون توضیح ثبت شده است")}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>

                    {/* طراحی / چاپ / تسک — باز (بولد) + تاخیر (رز) */}
                    <TableCell className="text-center hidden md:table-cell">
                      <WorkStatCell
                        open={u.stats.design.open}
                        delayed={u.stats.design.delayed}
                        done={u.stats.design.completed}
                        delayedDays={u.stats.design.delayedDays}
                        doneLabel={t("تکمیل")}
                      />
                    </TableCell>
                    <TableCell className="text-center hidden md:table-cell">
                      <WorkStatCell
                        open={u.stats.print.open}
                        delayed={u.stats.print.delayed}
                        done={u.stats.print.completed}
                        delayedDays={u.stats.print.delayedDays}
                        doneLabel={t("تکمیل")}
                      />
                    </TableCell>
                    <TableCell className="text-center hidden md:table-cell">
                      <WorkStatCell
                        open={u.stats.tasks.open}
                        delayed={u.stats.tasks.overdue}
                        done={u.stats.tasks.done}
                        delayedDays={u.stats.tasks.overdueDays}
                        doneLabel={t("انجام‌شده")}
                      />
                    </TableCell>

                    {/* اقدامات — مانیتورینگ + ویرایش */}
                    <TableCell>
                      <div
                        className="flex items-center gap-1.5"
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 gap-1 text-xs"
                          onClick={() => navigate("sysadmin", "user", u.id)}
                          title={t("صفحهٔ اختصاصی {p0}", { p0: u.name })}
                        >
                          <Icon name="userCircle" size={13} /> {t("مانیتورینگ")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2.5 gap-1 text-xs"
                          onClick={() => openEdit(u)}
                          disabled={!isMaster}
                          title={isMaster ? undefined : t("فقط مدیر سیستم می‌تواند ویرایش کند")}
                        >
                          <Icon name="edit" size={13} /> {t("ویرایش")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ── دیالوگ ساخت کاربر ── */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setCreateForm(EMPTY_FORM);
        }}
      >
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("کاربر جدید")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-4">
            <UserFormFields form={createForm} setForm={setCreateForm} mode="create" />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                {t("انصراف")}
              </Button>
              <Button type="submit" disabled={createMut.isPending} className="gap-2">
                {createMut.isPending ? (
                  <Icon name="loading" size={16} className="animate-spin" />
                ) : (
                  <Icon name="check" size={16} />
                )}
                {t("ایجاد کاربر")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── دیالوگ ویرایش کاربر ── */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("ویرایش {p0}", { p0: editUser?.name })}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4">
            <Field label={t("ایمیل (غیرقابل تغییر)")}>
              <Input value={editForm.email} disabled dir="ltr" />
            </Field>
            <UserFormFields
              form={editForm}
              setForm={setEditForm}
              mode="edit"
              isSelf={!!editUser && editUser.id === me?.id}
              isMasterUser={editUser?.role === "master"}
            />
            <Field label={t("رمز عبور جدید (اختیاری)")}>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("برای تغییر رمز پر کنید")}
                dir="ltr"
              />
            </Field>
            {editUser?.role === "master" ? (
              <p className="text-xs text-muted-foreground rounded-lg border border-dashed p-3">
                {t("مدیر سیستم دسترسی ضمنی به همهٔ ماژول‌ها دارد — سطح دسترسی تکی ندارد.")}
              </p>
            ) : null}
            {editUser && editUser.role !== "master" && (editUser.modules ?? []).length > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2.5 leading-relaxed">
                <Icon name="info" size={12} className="inline ml-1" />
                {t("اگر ماژولی را برمی‌دارید، سفارش‌ها/تسک‌های تخصیص‌یافتهٔ قبلی او حذف")}
                {t("نمی‌شوند؛ اما پنل آن ماژول دیگر برایش نمایش داده نمی‌شود.")}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditUser(null)}>
                {t("انصراف")}
              </Button>
              <Button type="submit" disabled={updateMut.isPending} className="gap-2">
                {updateMut.isPending ? (
                  <Icon name="loading" size={16} className="animate-spin" />
                ) : (
                  <Icon name="check" size={16} />
                )}
                {t("ذخیره تغییرات")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── فیلدهای مشترک فرم کاربر (ساخت/ویرایش — الگوی users-page) ──────
function UserFormFields({
  form,
  setForm,
  mode,
  isSelf,
  isMasterUser,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  mode: "create" | "edit";
  isSelf?: boolean;
  isMasterUser?: boolean;
}) {
  function toggleModule(key: string, checked: boolean) {
    setForm((f) => {
      const modules = checked
        ? Array.from(new Set([...f.modules, key]))
        : f.modules.filter((m) => m !== key);
      // Phase 18: کلید ماژولِ تازه تیک‌خورده بدون رکورد → null (همهٔ صفحات)؛
      // ماژولِ برداشته‌شده از modulePages حذف می‌شود (payload فقط ماژول‌های انتخابی)
      const modulePages = { ...f.modulePages };
      // Phase 24: همان قرارداد برای سطح ۳لایه
      const moduleLevels = { ...f.moduleLevels };
      if (checked) {
        if (modulePages[key] === undefined) modulePages[key] = null;
        if (moduleLevels[key] === undefined) moduleLevels[key] = "delete";
      } else {
        delete modulePages[key];
        delete moduleLevels[key];
      }
      return { ...f, modules, modulePages, moduleLevels };
    });
  }

  return (
    <div className="space-y-4">
      <Field label={t("نام و نام خانوادگی")} required>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder={t("مثلاً: سارا احمدی")}
          autoFocus
        />
      </Field>
      {mode === "create" && (
        <>
          <Field label={t("ایمیل")} required>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="user@printoo24.com"
              dir="ltr"
            />
          </Field>
          <Field label={t("رمز عبور")} required>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={t("حداقل 6 کاراکتر")}
              dir="ltr"
            />
          </Field>
        </>
      )}
      <Field label={t("شماره تماس")}>
        <Input
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          placeholder="0770..."
          dir="ltr"
        />
      </Field>

      {/* وضعیت فعال/غیرفعال — POST و PUT هر دو status را می‌پذیرند */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg border p-3",
          isSelf && "opacity-70"
        )}
      >
        <div>
          <div className="text-xs font-medium">{t("حساب فعال")}</div>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
            {isSelf
              ? t("حساب خودتان را نمی‌توانید غیرفعال کنید")
              : t("کاربر غیرفعال از ورود و انتخاب‌گرهای تخصیص حذف می‌شود (تاریخچه می‌ماند)")}
          </p>
        </div>
        <Switch
          checked={form.status === "active"}
          onCheckedChange={(v) =>
            setForm((f) => ({ ...f, status: v ? "active" : "inactive" }))
          }
          disabled={isSelf}
          aria-label={t("حساب فعال")}
        />
      </div>

      {/* ماژول‌های دسترسی — چند انتخاب (چک‌باکس + نقطهٔ رنگ ماژول) + صفحات مجاز */}
      {isMasterUser ? null : (
        <Field label={t("ماژول‌های دسترسی و صفحات مجاز")} required>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(Object.keys(MODULES) as ModuleKey[]).map((key) => {
              const checked = form.modules.includes(key);
              return (
                <div key={key} className="space-y-0">
                  <label
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition-colors select-none",
                      checked
                        ? "border-primary/50 bg-primary/5"
                        : "border-border hover:bg-accent/40"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => toggleModule(key, v === true)}
                      aria-label={MODULES[key].faLabel}
                    />
                    <span className="text-xs font-medium flex items-center gap-1.5">
                      <span
                        className={cn(
                          "size-2 rounded-full shrink-0",
                          checked
                            ? MODULE_DOT[key] ?? "bg-primary"
                            : "bg-muted-foreground/30"
                        )}
                      />
                      {MODULES[key].faLabel}
                    </span>
                  </label>
                  {/* Phase 24: سطح دسترسی ۳لایه این ماژول — فقط وقتی تیک خورده */}
                  {checked && (
                    <ModuleLevelPanel
                      moduleKey={key}
                      level={form.moduleLevels[key] ?? "delete"}
                      onChange={(lv) =>
                        setForm((f) => ({
                          ...f,
                          moduleLevels: { ...f.moduleLevels, [key]: lv },
                        }))
                      }
                    />
                  )}
                  {/* Phase 18: صفحات مجاز این ماژول — فقط وقتی تیک خورده */}
                  {checked && (
                    <ModulePagesPanel
                      moduleKey={key}
                      pages={form.modulePages[key] ?? null}
                      onChange={(pages) =>
                        setForm((f) => ({
                          ...f,
                          modulePages: { ...f.modulePages, [key]: pages },
                        }))
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
            {t("ماژول را تیک بزنید تا پنلش باز شود؛ زیر هر ماژول اول «سطح دسترسی» را")}
            {t("انتخاب کنید (مشاهده / ادیت / حذف) و بعد در صورت نیاز صفحات مجاز همان")}
            {t("ماژول را محدود کنید — مثلاً «چاپ» تیک + سطح ادیت + فقط «سفارشات چاپ».")}
          </p>
        </Field>
      )}
    </div>
  );
}

// ─── Phase 24: پنل «سطح دسترسی ۳لایه در ماژول» ──────────────────────
// مشاهده = فقط خواندن؛ ادیت = ثبت/ویرایش بدون حذف؛ حذف = کامل (دیفالت).
// گیت مرکزی proxy متدهای نوشتاری/DELETE را طبق همین سطح می‌بندد.
const LEVEL_VISUALS: Record<ModuleLevel, { dot: string; active: string }> = {
  view: { dot: "bg-sky-500", active: "border-sky-400 bg-sky-50 dark:bg-sky-950/40" },
  edit: { dot: "bg-amber-500", active: "border-amber-400 bg-amber-50 dark:bg-amber-950/40" },
  delete: { dot: "bg-rose-500", active: "border-rose-400 bg-rose-50 dark:bg-rose-950/40" },
};

function ModuleLevelPanel({
  moduleKey,
  level,
  onChange,
}: {
  moduleKey: string;
  level: ModuleLevel;
  onChange: (level: ModuleLevel) => void;
}) {
  const meta = (MODULES as Record<string, { faLabel: string }>)[moduleKey];
  const faLabel = meta?.faLabel ?? moduleKey;
  return (
    <div className="mt-2 rounded-lg border bg-muted/30 p-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">
          {t("سطح دسترسی در {p0}", { p0: faLabel })}
        </span>
        <span className="text-[11px] font-medium text-foreground">
          {MODULE_LEVEL_META[level].label}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {(["view", "edit", "delete"] as const).map((lv) => {
          const active = level === lv;
          return (
            <button
              key={lv}
              type="button"
              onClick={() => onChange(lv)}
              title={MODULE_LEVEL_META[lv].hint}
              className={cn(
                "rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors select-none flex items-center justify-center gap-1.5",
                active
                  ? LEVEL_VISUALS[lv].active
                  : "border-border bg-background text-muted-foreground hover:bg-accent/40"
              )}
            >
              <span className={cn("size-1.5 rounded-full", LEVEL_VISUALS[lv].dot)} />
              {MODULE_LEVEL_META[lv].label}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        {t("{p0} — حداکثر ۴۵ ثانیه بعد نزد کاربر فعال می‌شود.", { p0: MODULE_LEVEL_META[level].hint })}
      </p>
    </div>
  );
}

// ─── Phase 18: پنل «صفحات مجاز در ماژول» ────────────────────────────
// null = همهٔ صفحات (پیش‌فرض). برداشتن «همهٔ صفحات» → انتخاب صریح تک‌تک.
// گارد UX: تخلیهٔ کامل → auto-all (ماژول بدون صفحه = حذف کامل از سایدبار).
function ModulePagesPanel({
  moduleKey,
  pages,
  onChange,
}: {
  moduleKey: string;
  pages: string[] | null;
  onChange: (pages: string[] | null) => void;
}) {
  const items = moduleNavItems(moduleKey);
  const allValues = items.map((i) => i.page);
  const isAll = pages === null || pages.length === 0;
  const meta = (MODULES as Record<string, { faLabel: string }>)[moduleKey];
  const faLabel = meta?.faLabel ?? moduleKey;
  const selected = new Set(isAll ? [] : pages);

  function toggleAll(checked: boolean) {
    // برداشتن «همه» → همهٔ صفحات صریح تیک‌خورده (معادل همان همه)
    onChange(checked ? null : allValues);
  }

  function togglePage(page: string, checked: boolean) {
    if (isAll) return;
    const next = checked
      ? Array.from(new Set([...(pages ?? []), page]))
      : (pages ?? []).filter((p) => p !== page);
    // گارد UX: ماژول بدون صفحه = حذف کامل از سایدبار → auto-all
    if (next.length === 0) {
      onChange(null);
      return;
    }
    onChange(next);
  }

  if (items.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border bg-muted/30 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">
          {t("صفحات مجاز در {p0}", { p0: faLabel })}
        </span>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <Checkbox
            checked={isAll}
            onCheckedChange={(v) => toggleAll(v === true)}
            aria-label={t("همهٔ صفحات {p0}", { p0: faLabel })}
          />
          <span className="text-[11px] font-medium">{t("همهٔ صفحات")}</span>
        </label>
      </div>
      {!isAll && (
        <div className="grid grid-cols-1 gap-x-3 gap-y-1">
          {items.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-1.5 cursor-pointer select-none"
              title={item.label}
            >
              <Checkbox
                checked={selected.has(item.page)}
                onCheckedChange={(v) => togglePage(item.page, v === true)}
                aria-label={item.label}
              />
              <span className="text-[11px] truncate">{item.label}</span>
            </label>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        {t("حداقل یک صفحه باید فعال باشد — اگر هیچ صفحه‌ای تیک نخورد، «همهٔ صفحات» خودکار")}
        {t("برمی‌گردد.")}
      </p>
    </div>
  );
}
