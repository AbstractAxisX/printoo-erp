"use client";

// Printoo24 ERP — Users & Roles management page (master-only, Phase 12)
//
// بازسازی فاز ۱۲ — «چند ماژول به هر کاربر»:
// - کاتالوگ ماژول‌ها (با شمار اعضای زنده) به‌جای کاتالوگ نقش‌های تکی
// - ساخت کاربر: چک‌باکس چند-ماژوله (طراح + چاپ + QC + ... هر ترکیبی)
// - ویرایش کاربر: همان چک‌باکس‌ها (جایگزینی کامل دسترسی‌ها) + رمز/وضعیت
// - نمایش چیپ ماژول‌های هر کاربر در فهرست + نقطهٔ حضور آنلاین
//
// Phase 18 — دسترسی صفحه‌محور:
// - زیر هر ماژولِ تیک‌خورده، پنل «صفحات مجاز» (تاگل «همهٔ صفحات» +
//   چک‌باکس تک‌تک صفحات همان ماژول از NAV).
// - modulePages فقط برای ماژول‌های انتخاب‌شده فرستاده می‌شود؛ null = همه.
// - گارد UX: ماژولِ بدون صفحهٔ تیک‌خورده = حذف کامل از سایدبار → «همه»
//   خودکار برمی‌گردد (کاربر قفل نمی‌شود).
// - در فهرست، ماژول محدودشده بج «N/M» با آیکون filter می‌گیرد.
//
// Cognitive-UX:
// - کاتالوگ روی صفحه → مدیر «ساختار سازمان» را قبل از اقدام می‌بیند.
// - یک اکشن اصلی («کاربر جدید») — مسیر بعدیِ بدیهی صفحه.
// - سوییچ وضعیت درجا (با گاردهای self-lockout سمت API).

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { Icon } from "@/lib/icons";
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
import { MODULES, type ModuleKey } from "@/lib/constants";
import { NAV, type NavItem } from "@/lib/nav";
import { formatDate, formatNumber } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────
type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  avatar: string | null;
  modules: string[];
  /** Phase 18: صفحات مجاز هر ماژول — null/غایب = همهٔ صفحات */
  modulePages?: Record<string, string[] | null> | null;
  status?: string;
  createdAt?: string;
  lastSeenAt?: string | null;
  lastLoginAt?: string | null;
  loginCount?: number;
  online?: boolean;
};

type PagesMap = Record<string, string[] | null>;

type FormState = {
  name: string;
  email: string;
  password: string;
  phone: string;
  modules: string[];
  /** Phase 18: صفحات مجاز ماژول‌های تیک‌خورده (null = همه) */
  modulePages: PagesMap;
};

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  password: "",
  phone: "",
  modules: ["designer"],
  modulePages: {},
};

// ─── Phase 18 helpers ─────────────────────────────────────────────

/** فهرست صفحات هر ماژول از NAV — همان منبعی که سایدبار می‌خواند. */
const MODULE_NAV_ITEMS: Record<string, NavItem[]> = Object.fromEntries(
  NAV.map((m) => [m.key, m.groups.flatMap((g) => g.items)])
);

function moduleNavItems(key: string): NavItem[] {
  return MODULE_NAV_ITEMS[key] ?? [];
}

/** نرمال‌سازی pages دریافتی از سرور: [] / undefined → null (همه). */
function normPages(v: string[] | null | undefined): string[] | null {
  return v && v.length > 0 ? v : null;
}

/** فقط ماژول‌های انتخاب‌شده + گارد auto-all (آرایهٔ خالی → null). */
function payloadPages(form: FormState): PagesMap {
  const out: PagesMap = {};
  for (const m of form.modules) out[m] = normPages(form.modulePages[m]);
  return out;
}

/** مقایسهٔ مجموعه‌ای ماژول‌ها (بدون اهمیت ترتیب). */
function sameModuleSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((m) => setB.has(m));
}

// رنگ چیپ ماژول — هم‌خانوادهٔ MODULE_TAG در کل سیستم
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0].slice(0, 1) + parts[1].slice(0, 1);
}

function ModuleChip({ module }: { module: string }) {
  const meta = (MODULES as Record<string, { faLabel: string }>)[module];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        MODULE_COLORS[module] ?? "bg-muted text-muted-foreground"
      )}
    >
      {meta?.faLabel ?? module}
    </span>
  );
}

/** Phase 18 — بج محدودیت صفحه‌ای کنار چیپ ماژول در فهرست. */
function PageLimitBadge({ module, pages }: { module: string; pages: string[] }) {
  const total = moduleNavItems(module).length;
  return (
    <span
      title={`دسترسی محدود به ${formatNumber(pages.length)} صفحه از ${formatNumber(total)}`}
      className="inline-flex items-center gap-0.5 rounded-full bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
    >
      <Icon name="filter" size={10} />
      {formatNumber(pages.length)}/{formatNumber(total)}
    </span>
  );
}

function presenceText(u: ManagedUser): string {
  if (u.online) return "آنلاین";
  if (u.lastSeenAt) {
    const mins = Math.floor((Date.now() - new Date(u.lastSeenAt).getTime()) / 60000);
    if (mins < 60) return `${mins} دقیقه پیش`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} ساعت پیش`;
    return `آخرین بازدید: ${formatDate(u.lastSeenAt)}`;
  }
  return "بدون بازدید";
}

// ─── Main page ────────────────────────────────────────────────────
export function UsersPage() {
  const queryClient = useQueryClient();
  const me = useAppStore((s) => s.user);
  const isMaster = me?.role === "master";

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState<FormState>(EMPTY_FORM);
  const [editUser, setEditUser] = React.useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = React.useState<FormState>(EMPTY_FORM);
  const [newPassword, setNewPassword] = React.useState("");

  // All users (management mode — includes inactive, master-gated server-side).
  const { data, isLoading } = useQuery({
    queryKey: ["users", "all"],
    queryFn: () => api<{ users: ManagedUser[] }>("/api/users?all=1"),
  });
  const users = data?.users ?? [];

  // ── Mutations ──
  const createMut = useMutation({
    mutationFn: (body: FormState) =>
      api("/api/users", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidateUsers();
      toast.success("کاربر جدید ایجاد شد");
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Record<string, unknown>) => {
      const res = await api(`/api/users/${id}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      // Phase 18: وقتی «modules» همراه «modulePages» بیاید، سرور فقط صفحات
      // ماژول‌های «تازه» را می‌نویسد (مسیر مستقل برای ماژول‌های مانده است) →
      // درخواست دوم idempotent صفحات همهٔ ماژول‌های نهایی را تضمین می‌کند.
      if (Array.isArray(patch.modules) && patch.modulePages) {
        await api(`/api/users/${id}`, {
          method: "PUT",
          body: JSON.stringify({ modulePages: patch.modulePages }),
        });
      }
      return res;
    },
    onSuccess: () => {
      invalidateUsers();
      toast.success("کاربر به‌روزرسانی شد");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function invalidateUsers() {
    void queryClient.invalidateQueries({ queryKey: ["users"] });
  }

  function openEdit(u: ManagedUser) {
    setEditUser(u);
    const modules = u.role === "master" ? [] : (u.modules ?? []);
    // Phase 18: هیدراته‌کردن صفحات مجاز (ماژول بدون رکورد → null = همه)
    const modulePages: PagesMap = {};
    for (const m of modules) modulePages[m] = normPages(u.modulePages?.[m]);
    setEditForm({
      name: u.name,
      email: u.email,
      password: "",
      phone: u.phone ?? "",
      modules,
      modulePages,
    });
    setNewPassword("");
  }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim()) return toast.error("نام الزامی است");
    if (!createForm.email.trim()) return toast.error("ایمیل الزامی است");
    if (createForm.password.length < 6)
      return toast.error("رمز عبور باید حداقل ۶ کاراکتر باشد");
    if (createForm.modules.length === 0)
      return toast.error("حداقل یک ماژول (سطح دسترسی) انتخاب کنید");
    // Phase 18: صفحات فقط برای ماژول‌های تیک‌خورده (کلید بیرونی → خطای سرور)
    createMut.mutate({ ...createForm, modulePages: payloadPages(createForm) });
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    if (!editForm.name.trim()) return toast.error("نام نمی‌تواند خالی باشد");
    const isMasterTarget = editUser.role === "master";
    if (!isMasterTarget && editForm.modules.length === 0)
      return toast.error("حداقل یک ماژول (سطح دسترسی) باید فعال بماند");
    // Phase 18: modules فقط وقتی فرستاده می‌شود که مجموع ماژول‌ها تغییر کرده
    // باشد — با مجموع ثابت، modulePages از مسیر مستقل (تک‌درخواستی) می‌رود.
    const modulesChanged =
      !isMasterTarget && !sameModuleSet(editForm.modules, editUser.modules ?? []);
    updateMut.mutate(
      {
        id: editUser.id,
        name: editForm.name,
        phone: editForm.phone || null,
        ...(modulesChanged ? { modules: editForm.modules } : {}),
        ...(!isMasterTarget ? { modulePages: payloadPages(editForm) } : {}),
        ...(newPassword ? { password: newPassword } : {}),
      },
      {
        onSuccess: () => setEditUser(null),
      }
    );
  }

  // Module catalog: count members per module.
  const moduleCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) {
      if (u.role === "master") continue;
      for (const m of u.modules ?? []) counts[m] = (counts[m] ?? 0) + 1;
    }
    return counts;
  }, [users]);

  const masterCount = users.filter((u) => u.role === "master").length;
  const activeCount = users.filter((u) => u.status !== "inactive").length;
  const onlineCount = users.filter((u) => u.online).length;

  // ── Render ──
  return (
    <div className="space-y-5">
      <PageHeader
        title="کاربران و دسترسی‌ها"
        description="تنظیمات سیستم — ساخت کاربر و تعیین ماژول‌های دسترسی (هر کاربر می‌تواند چند ماژول داشته باشد)"
        icon="user"
        actions={
          <Button
            onClick={() => {
              setCreateForm(EMPTY_FORM);
              setCreateOpen(true);
            }}
            className="gap-2"
            disabled={!isMaster}
            title={isMaster ? undefined : "فقط مدیر ارشد می‌تواند کاربر ایجاد کند"}
          >
            <Icon name="plus" size={16} /> کاربر جدید
          </Button>
        }
      />

      {/* ── Module catalog strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {(Object.keys(MODULES) as ModuleKey[]).map((key) => (
          <Card key={key} className="p-4 gap-1">
            <div className="flex items-center justify-between gap-2">
              <ModuleChip module={key} />
              <span className="text-lg font-bold tabular-nums">
                {moduleCounts[key] ?? 0}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              پنل {MODULES[key].faLabel}
            </p>
          </Card>
        ))}
        <Card className="p-4 gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              مدیر ارشد
            </span>
            <span className="text-lg font-bold tabular-nums">{masterCount}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">دسترسی کامل به همه بخش‌ها</p>
        </Card>
      </div>

      {/* ── Users table ── */}
      {isLoading ? (
        <LoadingState />
      ) : users.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon="user"
            title="کاربری وجود ندارد"
            description="اولین کاربر را ایجاد کنید."
            action={
              <Button onClick={() => setCreateOpen(true)} className="gap-2">
                <Icon name="plus" size={16} /> افزودن کاربر
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <span className="text-sm font-semibold">
              فهرست کاربران
              <span className="text-muted-foreground font-normal text-xs mr-2">
                {activeCount} فعال از {users.length}
              </span>
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              {onlineCount} آنلاین
            </span>
          </div>
          <div className="divide-y max-h-[560px] overflow-y-auto scrollbar-thin">
            {users.map((u) => {
              const isSelf = u.id === me?.id;
              const inactive = u.status === "inactive";
              const isMasterRow = u.role === "master";
              return (
                <div
                  key={u.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors flex-wrap",
                    inactive && "opacity-60"
                  )}
                >
                  {/* Avatar + name */}
                  <span className="relative shrink-0">
                    <span
                      className={cn(
                        "size-10 rounded-full grid place-items-center text-xs font-bold shrink-0",
                        isMasterRow
                          ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white"
                          : "bg-primary/10 text-primary"
                      )}
                    >
                      {initials(u.name)}
                    </span>
                    <span
                      className={cn(
                        "absolute -bottom-0.5 -left-0.5 size-2.5 rounded-full ring-2 ring-card",
                        u.online ? "bg-emerald-500" : "bg-muted-foreground/40"
                      )}
                      title={presenceText(u)}
                      aria-label={presenceText(u)}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{u.name}</span>
                      {isSelf && (
                        <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                          شما
                        </span>
                      )}
                      {inactive && (
                        <span className="text-[10px] bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 rounded-full px-1.5 py-0.5">
                          غیرفعال
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                      <span dir="ltr" className="tabular-nums">{u.email}</span>
                      {u.phone && (
                        <>
                          <span className="opacity-50">•</span>
                          <span dir="ltr" className="tabular-nums">{u.phone}</span>
                        </>
                      )}
                      {u.createdAt && (
                        <>
                          <span className="opacity-50">•</span>
                          <span>عضویت: {formatDate(u.createdAt)}</span>
                        </>
                      )}
                      <span className="opacity-50">•</span>
                      <span className={u.online ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}>
                        {presenceText(u)}
                      </span>
                    </div>
                  </div>
                  {/* ماژول‌ها یا نشان master */}
                  <div className="flex items-center gap-1.5 flex-wrap max-w-[280px] justify-end">
                    {isMasterRow ? (
                      <span className="text-[11px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 rounded-full px-2 py-0.5">
                        مدیر ارشد — همه ماژول‌ها
                      </span>
                    ) : (
                      (u.modules ?? []).map((m) => {
                        // Phase 18: ماژول محدودشده → بج «N/M صفحه»
                        const pages = normPages(u.modulePages?.[m]);
                        return (
                          <span key={m} className="inline-flex items-center gap-1">
                            <ModuleChip module={m} />
                            {pages && <PageLimitBadge module={m} pages={pages} />}
                          </span>
                        );
                      })
                    )}
                  </div>
                  {/* Status toggle (not for self — API blocks it anyway) */}
                  {isMaster && !isSelf ? (
                    <Switch
                      checked={!inactive}
                      onCheckedChange={(v) =>
                        updateMut.mutate({
                          id: u.id,
                          status: v ? "active" : "inactive",
                        })
                      }
                      aria-label={`فعال/غیرفعال کردن ${u.name}`}
                    />
                  ) : (
                    <span className="w-9" aria-hidden="true" />
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    onClick={() => openEdit(u)}
                    disabled={!isMaster}
                  >
                    <Icon name="edit" size={13} /> ویرایش
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Create dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="sm:max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin"
        >
          <DialogHeader>
            <DialogTitle>کاربر جدید</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-4">
            <UserFormFields
              form={createForm}
              setForm={setCreateForm}
              withPassword
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                انصراف
              </Button>
              <Button type="submit" disabled={createMut.isPending} className="gap-2">
                {createMut.isPending ? (
                  <Icon name="loading" size={16} className="animate-spin" />
                ) : (
                  <Icon name="check" size={16} />
                )}
                ایجاد کاربر
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent
          aria-describedby={undefined}
          className="sm:max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin"
        >
          <DialogHeader>
            <DialogTitle>ویرایش {editUser?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4">
            <Field label="ایمیل (غیرقابل تغییر)">
              <Input value={editForm.email} disabled dir="ltr" />
            </Field>
            <UserFormFields form={editForm} setForm={setEditForm} />
            {editUser?.role === "master" ? (
              <p className="text-xs text-muted-foreground rounded-lg border border-dashed p-3">
                مدیر ارشد دسترسی ضمنی به همهٔ ماژول‌ها دارد — سطح دسترسی تکی ندارد.
              </p>
            ) : null}
            <Field label="رمز عبور جدید (اختیاری)">
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="برای تغییر رمز پر کنید"
                dir="ltr"
              />
            </Field>
            {editUser && editUser.role !== "master" && (editUser.modules ?? []).length > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2.5 leading-relaxed">
                <Icon name="info" size={12} className="inline ml-1" />
                اگر ماژولی را برمی‌دارید، سفارش‌ها/تسک‌های تخصیص‌یافتهٔ قبلی او حذف
                نمی‌شوند؛ اما پنل آن ماژول دیگر برایش نمایش داده نمی‌شود.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditUser(null)}>
                انصراف
              </Button>
              <Button type="submit" disabled={updateMut.isPending} className="gap-2">
                {updateMut.isPending ? (
                  <Icon name="loading" size={16} className="animate-spin" />
                ) : (
                  <Icon name="check" size={16} />
                )}
                ذخیره تغییرات
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Shared form fields ───────────────────────────────────────────
function UserFormFields({
  form,
  setForm,
  withPassword,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  withPassword?: boolean;
}) {
  function toggleModule(key: string, checked: boolean) {
    setForm((f) => {
      const modules = checked
        ? Array.from(new Set([...f.modules, key]))
        : f.modules.filter((m) => m !== key);
      // Phase 18: کلید ماژول برداشته‌شده از modulePages پاک شود (کلید
      // بیرونی = خطای اعتبارسنجی سرور)؛ تیک جدید بدون رکورد = null (همه).
      const modulePages: PagesMap = { ...f.modulePages };
      if (checked) {
        if (modulePages[key] === undefined) modulePages[key] = null;
      } else {
        delete modulePages[key];
      }
      return { ...f, modules, modulePages };
    });
  }

  function setModulePages(key: string, pages: string[] | null) {
    setForm((f) => ({
      ...f,
      modulePages: { ...f.modulePages, [key]: pages },
    }));
  }

  return (
    <div className="space-y-4">
      <Field label="نام و نام خانوادگی" required>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="مثلاً: سارا احمدی"
          autoFocus
        />
      </Field>
      {withPassword && (
        <Field label="ایمیل" required>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="user@printoo24.com"
            dir="ltr"
          />
        </Field>
      )}
      {withPassword && (
        <Field label="رمز عبور" required>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="حداقل ۶ کاراکتر"
            dir="ltr"
          />
        </Field>
      )}
      <Field label="شماره تماس">
        <Input
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          placeholder="0770..."
          dir="ltr"
        />
      </Field>

      {/* Phase 12 — انتخاب چند ماژول (چک‌باکس) + Phase 18 پنل صفحات */}
      <Field label="ماژول‌های دسترسی (چند انتخاب)" required>
        <div className="grid grid-cols-2 gap-2 items-start">
          {(Object.keys(MODULES) as ModuleKey[]).map((key) => {
            const checked = form.modules.includes(key);
            return (
              <div key={key} className="min-w-0">
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
                    <span className={cn("size-2 rounded-full", checked ? "bg-primary" : "bg-muted-foreground/30")} />
                    {MODULES[key].faLabel}
                  </span>
                </label>
                {/* Phase 18 — صفحات مجازِ همین ماژول (فقط وقتی تیک خورده) */}
                {checked && (
                  <ModulePagesPanel
                    moduleKey={key}
                    pages={form.modulePages[key] ?? null}
                    onChange={(pages) => setModulePages(key, pages)}
                  />
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
          کاربر فقط پنل ماژول‌های تیک‌خورده را می‌بیند — مثلاً هم «کنترل کیفی» هم «چاپ»
          را تیک بزنید تا هر دو پنل برایش باز شود. با برداشتنِ «همهٔ صفحات» می‌توانید
          صفحات همان ماژول را تک‌به‌تک محدود کنید.
        </p>
      </Field>
    </div>
  );
}

// ─── Phase 18: پنل صفحات مجاز یک ماژول ───────────────────────────
// سربرگ + تاگل «همهٔ صفحات» (تیک = null بدون محدودیت)؛ با برداشتنِ آن،
// چک‌باکس تک‌تک صفحاتِ همان ماژول از NAV نمایش داده می‌شود. اگر هیچ صفحه‌ای
// تیک نخورد، «همه» خودکار برمی‌گردد (ماژول بی‌صفحه = حذف کامل از سایدبار).
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

  return (
    <div className="mt-2 rounded-lg border bg-muted/30 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">
          صفحات مجاز در {faLabel}
        </span>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <Checkbox
            checked={isAll}
            onCheckedChange={(v) => toggleAll(v === true)}
            aria-label={`همهٔ صفحات ${faLabel}`}
          />
          <span className="text-[11px] font-medium">همهٔ صفحات</span>
        </label>
      </div>
      {!isAll && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
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
        حداقل یک صفحه باید فعال باشد — اگر هیچ صفحه‌ای تیک نخورد، «همهٔ صفحات» خودکار
        برمی‌گردد.
      </p>
    </div>
  );
}
