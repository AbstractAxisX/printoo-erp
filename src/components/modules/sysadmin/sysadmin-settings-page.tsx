"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/shared";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { useAppStore } from "@/stores/app-store";
import { MODULES, type ModuleKey } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ─── تنظیمات سیستم (ماژول «مدیر سیستم») — Phase 13 ──────────────
//
// نمای کلی سیستم برای مستر: شمار کاربران/ماژول‌ها، شمارنده‌های اسناد
// و نقشهٔ دسترسی‌ها. تنظیمات عملیاتی‌تر (کاربران/مرخصی) از «مانیتورینگ
// کاربران» انجام می‌شود.

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
        title="تنظیمات سیستم"
        description="نمای کلی سیستم، دسترسی‌ها و شمارنده‌ها — ماژول مدیر سیستم"
        icon="settings"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => navigate("sysadmin", "users")}
              className="h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 hover:bg-accent transition"
            >
              <Icon name="userGroup" size={14} /> مانیتورینگ کاربران
            </button>
            <button
              onClick={() => navigate("sysadmin", "modules")}
              className="h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 hover:bg-accent transition"
            >
              <Icon name="chartColumn" size={14} /> مانیتورینگ ماژول
            </button>
          </div>
        }
      />

      {isLoading ? (
        <Card className="p-10 grid place-items-center text-muted-foreground text-sm">
          <Icon name="spinner" size={20} className="animate-spin mb-2" />
          در حال بارگذاری…
        </Card>
      ) : !data ? (
        <EmptyState
          icon="shield"
          title="دسترسی محدود"
          description="تنظیمات سیستم مخصوص مدیر سیستم (master) است."
        />
      ) : (
        <>
          {/* KPI ها */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon="users" label="کاربران" value={data.summary.total} tone="primary" />
            <KpiCard icon="checkCircle" label="فعال" value={data.summary.active} tone="emerald" />
            <KpiCard icon="bell" label="آنلاین الان" value={data.summary.onlineNow} tone="sky" />
            <KpiCard
              icon="calendar"
              label="در مرخصی امروز"
              value={data.summary.onLeaveNow}
              tone="amber"
            />
          </div>

          {/* نقشهٔ ماژول‌ها */}
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
              <Icon name="grid" size={15} className="text-primary" />
              <span className="text-sm font-bold">ماژول‌های سیستم و اعضا</span>
              <span className="text-[10px] text-muted-foreground mr-auto">
                هر کاربر می‌تواند چند ماژول داشته باشد (مثلاً کنترل کیفی + چاپ)
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
                        {count.toLocaleString("fa-IR")} نفر
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {count > 0 ? "مشاهدهٔ برد ماژول ←" : "کاربری ندارد"}
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
              سطح‌های دسترسی
            </div>
            <ul className="text-xs text-muted-foreground leading-relaxed space-y-1 list-disc pr-4">
              <li>
                <b>مدیر سیستم (master):</b> صاحب سیستم — همهٔ ماژول‌ها + مانیتورینگ + تنظیمات.
              </li>
              <li>
                <b>مدیر داخلی (ماژول ادمین):</b> عملیات ثبت سفارش/تسک + دید کامل بُردها + مانیتورینگ.
              </li>
              <li>
                <b>کاربران ماژول‌دار:</b> فقط ماژول‌های تیک‌خورده — سفارش فقط در پنل مجریِ همان آیتم می‌آید.
              </li>
              <li>
                <b>هر آیتم سفارش مجری خودش را دارد</b> (طراح/چاپ) — تغییر مجری، سفارش را از پنل قبلی
                برمی‌دارد و به کاربر جدید اعلان می‌دهد.
              </li>
            </ul>
          </Card>
        </>
      )}
    </div>
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
          {value.toLocaleString("fa-IR")}
        </div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}
