"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/shared";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAppStore } from "@/stores/app-store";
import { MODULES, type ModuleKey } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

// ─── تنظیمات سیستم (ماژول «مدیر سیستم») — Phase 13 ──────────────
//
// نمای کلی سیستم برای مستر: شمار کاربران/ماژول‌ها، شمارنده‌های اسناد
// و نقشهٔ دسترسی‌ها. تنظیمات عملیاتی‌تر (کاربران/مرخصی) از «مانیتورینگ
// کاربران» انجام می‌شود.
//
// Phase 23: بخش «کاربران دمو» — ساخت/فهرست/اکسپایر حساب‌های دمو
// (فقط مشاهدهٔ کل سیستم، بدون هیچ امکان تغییر).

type MonitorSummary = {
  summary: {
    total: number;
    active: number;
    onlineNow: number;
    onLeaveNow: number;
    delayedOrders: number;
    delayedTasks: number;
  };
  users: {
    id: string;
    modules: string[];
    status: string;
  }[];
};

type DemoUser = {
  id: string;
  name: string;
  email: string;
  status: string;
  demoExpiresAt: string | null;
  lastLoginAt: string | null;
  loginCount: number;
  createdAt: string;
  expired: boolean;
};

export function SysadminSettingsPage() {
  const navigate = useAppStore((s) => s.navigate);
  const { data, isLoading } = useQuery({
    queryKey: ["monitoring", "users", "for-settings"],
    queryFn: () => api<MonitorSummary>("/api/monitoring/users"),
  });

  const users = data?.users ?? [];
  const moduleMembers = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const u of users) for (const mod of u.modules) m[mod] = (m[mod] ?? 0) + 1;
    return m;
  }, [users]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("تنظیمات سیستم")}
        description={t("نمای کلی سیستم، دسترسی‌ها، کاربران دمو و شمارنده‌ها — ماژول مدیر سیستم")}
        icon="settings"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => navigate("sysadmin", "users")}
              className="h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 hover:bg-accent transition"
            >
              <Icon name="userGroup" size={14} /> {t("مانیتورینگ کاربران")}
            </button>
            <button
              onClick={() => navigate("sysadmin", "modules")}
              className="h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 hover:bg-accent transition"
            >
              <Icon name="chartColumn" size={14} /> {t("مانیتورینگ ماژول")}
            </button>
          </div>
        }
      />

      {isLoading ? (
        <Card className="p-10 grid place-items-center text-muted-foreground text-sm">
          <Icon name="spinner" size={20} className="animate-spin mb-2" />
          {t("در حال بارگذاری…")}
        </Card>
      ) : !data ? (
        <EmptyState
          icon="shield"
          title={t("دسترسی محدود")}
          description={t("تنظیمات سیستم مخصوص مدیر سیستم (master) است.")}
        />
      ) : (
        <>
          {/* KPI ها */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon="users" label={t("کاربران")} value={data.summary.total} tone="primary" />
            <KpiCard icon="checkCircle" label={t("فعال")} value={data.summary.active} tone="emerald" />
            <KpiCard icon="bell" label={t("آنلاین الان")} value={data.summary.onlineNow} tone="sky" />
            <KpiCard
              icon="calendar"
              label={t("در مرخصی امروز")}
              value={data.summary.onLeaveNow}
              tone="amber"
            />
          </div>

          {/* Phase 23: کاربران دمو */}
          <DemoUsersSection />

          {/* نقشهٔ ماژول‌ها */}
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
              <Icon name="grid" size={15} className="text-primary" />
              <span className="text-sm font-bold">{t("ماژول‌های سیستم و اعضا")}</span>
              <span className="text-[10px] text-muted-foreground mr-auto">
                {t("هر کاربر می‌تواند چند ماژول داشته باشد (مثلاً کنترل کیفی + چاپ)")}
              </span>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {(Object.entries(MODULES) as [ModuleKey, { faLabel: string }][]).map(([key, info]) => {
                const count = moduleMembers[key] ?? 0;
                return (
                  <button
                    key={key}
                    onClick={() => navigate("sysadmin", "modules")}
                    className={cn(
                      "rounded-xl border p-3 text-right transition hover:border-primary/40 hover:bg-accent/40",
                      count === 0 && "opacity-60"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{info.faLabel}</span>
                      <span
                        className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full",
                          count > 0
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {t("{p0} نفر", { p0: count.toLocaleString("en-US") })}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {count > 0 ? t("مشاهدهٔ برد ماژول ←") : t("کاربری ندارد")}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* یادداشت معماری */}
          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Icon name="shieldKey" size={16} className="text-primary" />
              {t("سطح‌های دسترسی")}
            </div>
            <ul className="text-xs text-muted-foreground leading-relaxed space-y-1 list-disc pr-4">
              <li>
                <b>{t("مدیر سیستم (master):")}</b> {t("صاحب سیستم — همهٔ ماژول‌ها + مانیتورینگ + تنظیمات.")}
              </li>
              <li>
                <b>{t("مدیر داخلی (ماژول ادمین):")}</b> {t("عملیات ثبت سفارش/تسک + دید کامل بُردها + مانیتورینگ.")}
              </li>
              <li>
                <b>{t("کاربران ماژول‌دار:")}</b> {t("فقط ماژول‌های تیک‌خورده — سفارش فقط در پنل مجریِ همان آیتم می‌آید.")}
              </li>
              <li>
                <b>{t("کاربر دمو:")}</b> {t("همهٔ ماژول‌ها حتی ادمین سراسری را می‌بیند — اما فقط مشاهده؛ هیچ")}
                {t("ثبت/ویرایش/حذفی ممکن نیست (هم در مرورگر بلاک می‌شود هم در سرور).")}
              </li>
              <li>
                <b>{t("هر آیتم سفارش مجری خودش را دارد")}</b> {t("(طراح/چاپ) — تغییر مجری، سفارش را از پنل قبلی")}
                {t("برمی‌دارد و به کاربر جدید اعلان می‌دهد.")}
              </li>
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Phase 23: بخش کاربران دمو ────────────────────────────────────

function DemoUsersSection() {
  const qc = useQueryClient();
  const [label, setLabel] = React.useState("");
  const [creds, setCreds] = React.useState<{ email: string; password: string } | null>(null);
  const [credsOpen, setCredsOpen] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["users", "demo"],
    queryFn: () => api<{ demos: DemoUser[] }>("/api/users/demo"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users", "demo"] });

  const createDemo = useMutation({
    mutationFn: () =>
      api<{ user: unknown; credentials: { email: string; password: string } }>("/api/users/demo", {
        method: "POST",
        body: JSON.stringify({ label: label.trim() || undefined }),
      }),
    onSuccess: (res) => {
      setCreds(res.credentials);
      setCredsOpen(true);
      setLabel("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const expireDemo = useMutation({
    mutationFn: (id: string) => api(`/api/users/${id}/demo-expire`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t("حساب دمو اکسپایر شد — کاربر در اولین حرکت بعدی بیرون می‌رود"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const demos = data?.demos ?? [];
  const activeDemos = demos.filter((d) => !d.expired && d.status === "active").length;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("کپی شد"));
    } catch {
      toast.error(t("کپی نشد — دستی انتخاب و کپی کنید"));
    }
  };

  return (
    <Card className="p-0 overflow-hidden" data-guide="demo-users-card">
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2 flex-wrap">
        <Icon name="eye" size={15} className="text-amber-500" />
        <span className="text-sm font-bold">{t("کاربران دمو (فقط مشاهده)")}</span>
        <span className="text-[10px] text-muted-foreground">
          {t("دمو همهٔ ماژول‌ها را می‌بیند — حتی ادمین سراسری — اما هیچ تغییری نمی‌تواند بدهد")}
        </span>
        <span className="mr-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          {t("{p0} دموی فعال", { p0: activeDemos.toLocaleString("en-US") })}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* ساخت دموی جدید */}
        <div className="rounded-xl border border-dashed p-3 bg-muted/20 space-y-2" data-guide="demo-create-form">
          <div className="text-[11px] font-bold flex items-center gap-1.5">
            <Icon name="add" size={13} /> {t("ساخت دموی جدید")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("برچسب دلخواه (اختیاری — مثلاً: نمایش به مشتری)")}
              className="h-8 flex-1 min-w-48 text-xs"
            />
            <Button
              size="sm"
              className="h-8"
              disabled={createDemo.isPending}
              onClick={() => createDemo.mutate()}
            >
              {createDemo.isPending ? (
                <Icon name="spinner" size={14} className="animate-spin" />
              ) : (
                <Icon name="add" size={14} />
              )}
              {t("ساخت دموی جدید")}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {t("نام کاربری و رمز به‌صورت خودکار ساخته می‌شود و فقط یک بار نمایش داده خواهد شد — همان لحظه کپی کنید.")}
          </p>
        </div>

        {/* فهرست دموها */}
        {isLoading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            <Icon name="spinner" size={16} className="animate-spin inline ml-1" /> {t("در حال بارگذاری…")}
          </div>
        ) : demos.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            {t("هنوز کاربر دمویی ساخته نشده است — با دکمهٔ بالا اولین دمو را بسازید")}
          </div>
        ) : (
          <div className="space-y-2">
            {demos.map((d) => (
              <div
                key={d.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-2.5 transition",
                  d.expired ? "opacity-60" : "hover:bg-accent/40"
                )}
              >
                <span
                  className={cn(
                    "size-8 rounded-lg grid place-items-center shrink-0",
                    d.expired
                      ? "bg-muted text-muted-foreground"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  )}
                >
                  <Icon name="eye" size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold truncate">{d.name}</span>
                    {d.expired ? (
                      <span className="rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 px-2 py-0.5 text-[10px] font-bold shrink-0">
                        {t("منقضی‌شده")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold shrink-0">
                        {t("فعال")}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate" dir="ltr">
                    {d.email}
                  </div>
                  <div className="text-[10px] text-muted-foreground/80">
                    {t("ساخته‌شده: {p0}", { p0: formatDate(d.createdAt) })}
                    {d.lastLoginAt ? t(" • آخرین ورود: {p0}", { p0: formatDate(d.lastLoginAt, true) }) : t(" • هنوز وارد نشده")}
                  </div>
                </div>
                {!d.expired && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] text-rose-600 border-rose-200 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 dark:border-rose-900 shrink-0"
                    disabled={expireDemo.isPending}
                    onClick={() => expireDemo.mutate(d.id)}
                  >
                    <Icon name="lock" size={12} />
                    {t("اکسپایر")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* نمایش یک‌بارهٔ credentials دموی جدید */}
      <Dialog open={credsOpen} onOpenChange={setCredsOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="checkCircle" size={18} className="text-emerald-500" />
              {t("کاربر دمو ساخته شد")}
            </DialogTitle>
            <DialogDescription>
              {t("نام کاربری و رمز فقط همین یک بار نمایش داده می‌شود — الان کپی کنید و برای کسی که قرار است")}
              {t("سیستم را فقط ببیند بفرستید.")}
            </DialogDescription>
          </DialogHeader>
          {creds && (
            <div className="space-y-3">
              <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] text-muted-foreground mb-0.5">{t("نام کاربری (ایمیل)")}</div>
                    <div className="text-xs font-mono font-bold truncate" dir="ltr">{creds.email}</div>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 shrink-0" onClick={() => copy(creds.email)}>
                    <Icon name="copy" size={12} /> {t("کپی")}
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] text-muted-foreground mb-0.5">{t("رمز عبور")}</div>
                    <div className="text-xs font-mono font-bold truncate" dir="ltr">{creds.password}</div>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 shrink-0" onClick={() => copy(creds.password)}>
                    <Icon name="copy" size={12} /> {t("کپی")}
                  </Button>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-dashed p-2.5 text-[11px] text-muted-foreground">
                <Icon name="info" size={14} className="shrink-0 mt-0.5" />
                {t("این حساب همهٔ ماژول‌ها را می‌بیند ولی فقط مشاهده‌گر است؛ هر وقت خواستید از همان")}
                {t("لیست بالا دکمهٔ «اکسپایر» را بزنید.")}
              </div>
              <Button className="w-full" onClick={() => setCredsOpen(false)}>
                {t("متوجه شدم")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  value: number;
  tone: "primary" | "emerald" | "amber" | "sky";
}) {
  const toneCls = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
    sky: "bg-sky-500/10 text-sky-600",
  }[tone];
  return (
    <Card className="p-4 flex items-center gap-3">
      <span className={cn("size-10 rounded-xl grid place-items-center shrink-0", toneCls)}>
        <Icon name={icon} size={20} />
      </span>
      <div>
        <div className="text-xl font-bold tabular-nums" dir="ltr">
          {value.toLocaleString("en-US")}
        </div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}
