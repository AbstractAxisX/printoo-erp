"use client";

// ─── Phase 19: رادار رئیس — «با یه نگاه ببینم کجا مشکل دارم» ──────
//
// خواستهٔ صریح کارفرما (بازگویی رئیس):
//   «من باید تو داشبورد خودم با یه نگاه ببینم کجا مشکل دارم وارد شم؛
//    کجا بدهکاری زیاد شده، کجا خودم زیاد بدهکارم، سفارش‌های تاخیری،
//    سودها و در آخر هم لاگ‌ها»
//
// پنج کارت هشدار (کلیک → مستقیم صفحهٔ همان مشکل):
//   ۱) طلب از مشتریان (بدهکارترین‌ها با عدد) → صفحهٔ مشتریان با فیلتر تسویه‌نشده
//   ۲) بدهی ما به تامین‌کنندگان → صفحهٔ تامین‌کنندگان
//   ۳) سفارش‌های تاخیری (قدیمی‌ترین تاخیر) → سفارشات باز
//   ۴) هزینه‌های در انتظار تأیید مالی → هزینه‌های مالی
//   ۵) سود دوره (درآمد دریافتی − هزینه) → درآمدهای مالی
// داده‌ها point-in-time هستند (بدون فیلتر بازه) — «الان» مهم است.

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/lib/icons";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useDashboardSections } from "./use-dashboard-data";

type RadarCard = {
  key: string;
  label: string;
  icon: IconName;
  tone: "rose" | "amber" | "emerald" | "violet" | "teal";
  headline: string;
  detail: React.ReactNode;
  onClick?: () => void;
};

const TONE_MAP: Record<RadarCard["tone"], { chip: string; ring: string }> = {
  rose: { chip: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400", ring: "hover:ring-rose-300 dark:hover:ring-rose-800" },
  amber: { chip: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400", ring: "hover:ring-amber-300 dark:hover:ring-amber-800" },
  emerald: { chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400", ring: "hover:ring-emerald-300 dark:hover:ring-emerald-800" },
  violet: { chip: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400", ring: "hover:ring-violet-300 dark:hover:ring-violet-800" },
  teal: { chip: "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400", ring: "hover:ring-teal-300 dark:hover:ring-teal-800" },
};

function DebtList({ items, valueKey }: { items: Record<string, unknown>[]; valueKey: string }) {
  if (items.length === 0) {
    return <span className="text-[11px] text-muted-foreground">هیچ‌کس بدهکار نیست ✓</span>;
  }
  return (
    <div className="space-y-1">
      {items.slice(0, 3).map((it, i) => {
        const name = String(it.name ?? "—");
        const due = Number(it[valueKey] ?? 0);
        return (
          <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate text-muted-foreground min-w-0">{name}</span>
            <span className="tabular-nums font-semibold text-foreground shrink-0" dir="ltr">
              {formatCurrency(due)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function BossRadar() {
  const navigate = useAppStore((s) => s.navigate);
  const setBoardFilter = useAppStore((s) => s.setBoardFilter);
  // رادار point-in-time است — با sections fetch مشترک (all-time) می‌آید.
  const { data } = useDashboardSections();
  const radar = data?.radar;

  if (!radar) return null;

  const netProfit = radar.profit.net;
  const cards: RadarCard[] = [
    {
      key: "customersDue",
      label: "طلب از مشتریان",
      icon: "customers",
      tone: "rose",
      headline: radar.customersDue.count > 0
        ? `${formatCurrency(radar.customersDue.sum)}`
        : "۰",
      detail: radar.customersDue.count > 0 ? (
        <div className="space-y-1">
          <span className="text-[10px] text-muted-foreground block mb-0.5">
            {formatNumber(radar.customersDue.count)} مشتری بدهکار — بدهکارترین‌ها:
          </span>
          <DebtList items={radar.customersDue.top as unknown as Record<string, unknown>[]} valueKey="due" />
        </div>
      ) : (
        <span className="text-[11px] text-muted-foreground">همه تسویه شده‌اند ✓</span>
      ),
      onClick: () => {
        setBoardFilter("admin", "customers:unsettled");
        navigate("admin", "customers");
      },
    },
    {
      key: "supplierDebt",
      label: "بدهی ما (تامین‌کنندگان)",
      icon: "suppliers",
      tone: "amber",
      headline: formatCurrency(radar.supplierDebt.sum),
      detail: radar.supplierDebt.count > 0 ? (
        <div className="space-y-1">
          <span className="text-[10px] text-muted-foreground block mb-0.5">
            {formatNumber(radar.supplierDebt.count)} تامین‌کننده — بزرگ‌ترین بدهی‌ها:
          </span>
          <DebtList items={radar.supplierDebt.top as unknown as Record<string, unknown>[]} valueKey="balanceDue" />
        </div>
      ) : (
        <span className="text-[11px] text-muted-foreground">بدون بدهی معوق ✓</span>
      ),
      onClick: () => navigate("admin", "suppliers"),
    },
    {
      key: "overdue",
      label: "سفارش‌های تاخیری",
      icon: "alertTriangle",
      tone: radar.overdue.count > 0 ? "rose" : "emerald",
      headline: formatNumber(radar.overdue.count),
      detail: radar.overdue.count > 0 ? (
        <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
          قدیمی‌ترین تاخیر: {formatNumber(radar.overdue.oldestDays)} روز
        </span>
      ) : (
        <span className="text-[11px] text-muted-foreground">بدون تاخیر ✓</span>
      ),
      onClick: () => navigate("admin", "open-orders"),
    },
    {
      key: "pendingCosts",
      label: "هزینه‌های در انتظار تأیید",
      icon: "money",
      tone: radar.pendingCosts.count > 0 ? "amber" : "emerald",
      headline: formatNumber(radar.pendingCosts.count),
      detail: radar.pendingCosts.count > 0 ? (
        <span className="text-[11px] text-muted-foreground">
          جمع: <span className="tabular-nums font-semibold text-foreground" dir="ltr">{formatCurrency(radar.pendingCosts.sum)}</span> — منتظر مالی
        </span>
      ) : (
        <span className="text-[11px] text-muted-foreground">صف تأیید خالی ✓</span>
      ),
      onClick: () => navigate("finance", "costs"),
    },
    {
      key: "profit",
      label: "سود (الان)",
      icon: netProfit >= 0 ? "trending" : "arrowDown",
      tone: netProfit >= 0 ? "emerald" : "rose",
      headline: formatCurrency(Math.abs(netProfit)),
      detail: (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-emerald-600 dark:text-emerald-400 tabular-nums" dir="ltr">
            +{formatCurrency(radar.profit.revenue)}
          </span>
          <span className="text-muted-foreground">−</span>
          <span className="text-rose-600 dark:text-rose-400 tabular-nums" dir="ltr">
            {formatCurrency(radar.profit.costs)}
          </span>
        </div>
      ),
      onClick: () => navigate("finance", "revenues"),
    },
  ];

  const hasAnyIssue =
    radar.customersDue.count > 0 ||
    radar.supplierDebt.count > 0 ||
    radar.overdue.count > 0 ||
    radar.pendingCosts.count > 0;

  return (
    <section aria-label="رادار مشکلات — نگاه یک‌ثانیه‌ای">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <div className={cn("size-9 rounded-xl grid place-items-center", hasAnyIssue ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
            <Icon name={hasAnyIssue ? "alertTriangle" : "checkCircle"} size={19} />
          </div>
          <div>
            <h2 className="text-sm font-bold leading-tight">نگاه یک‌ثانیه‌ای</h2>
            <p className="text-[11px] text-muted-foreground">
              {hasAnyIssue ? "مشکلات باز — کلیک کنید و مستقیم وارد شوید" : "همه‌چیز روبراه است"}
            </p>
          </div>
        </div>
        {/* وضعیت کلی */}
        <span
          className={cn(
            "text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0",
            hasAnyIssue ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
          )}
        >
          {hasAnyIssue ? "نیاز به توجه" : "سالم"}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {cards.map((c) => {
          const tone = TONE_MAP[c.tone];
          return (
            <Card
              key={c.key}
              className={cn(
                "p-3.5 group relative overflow-hidden transition-all",
                c.onClick && "cursor-pointer hover:shadow-md active:scale-[0.99] hover:ring-2",
                c.onClick && tone.ring
              )}
              onClick={c.onClick}
              role={c.onClick ? "button" : undefined}
              tabIndex={c.onClick ? 0 : undefined}
              aria-label={c.label}
              onKeyDown={
                c.onClick
                  ? (e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        c.onClick?.();
                      }
                    }
                  : undefined
              }
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("size-8 rounded-lg grid place-items-center shrink-0", tone.chip)}>
                  <Icon name={c.icon} size={16} />
                </div>
                <span className="text-xs font-bold leading-tight">{c.label}</span>
              </div>
              <div className="text-lg font-bold tabular-nums truncate mb-1.5" dir="ltr">
                {c.headline}
              </div>
              <div className="min-h-[34px]">{c.detail}</div>
              {c.onClick && (
                <div className="absolute top-3 left-3 text-muted-foreground/0 group-hover:text-muted-foreground/70 transition-colors">
                  <Icon name="arrowLeft" size={13} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

// ─── آخرین رویدادها — «در آخر، لاگ‌ها» ─────────────────────────────
// فید جمع‌شده از OrderEvent (ایجاد/تکمیل/تخصیص/هزینه/پرداخت…) با
// آیکون per-type و زمان نسبی. جای «آخرین سفارشات» نیست — پایین داشبورد.

const EVENT_ICON: Record<string, IconName> = {
  created: "plus",
  design_completed: "design",
  sent_to_print: "print",
  material_confirmed: "boxes",
  print_completed: "checkCircle",
  sent_to_warehouse: "truck",
  qc_reported: "info",
  qc_reviewed: "checkCircle",
  qc_returned: "refresh",
  status_changed: "refresh",
  reassigned: "userMultiple",
  cost_registered: "money",
  cost_invoiced: "invoice",
  cost_approved: "check",
  cost_rejected: "cancel",
  payment_recorded: "wallet",
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "همین الان";
  if (m < 60) return `${m.toLocaleString("fa-IR")} دقیقه پیش`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h.toLocaleString("fa-IR")} ساعت پیش`;
  const d = Math.floor(h / 24);
  return `${d.toLocaleString("fa-IR")} روز پیش`;
}

export function LatestEvents() {
  const events = (useDashboardSections().data?.latestEvents ?? []).slice(0, 8);
  if (events.length === 0) return null;
  return (
    <div className="divide-y">
      {events.map((ev) => (
        <div key={ev.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors">
          <div className={cn(
            "size-8 rounded-lg grid place-items-center shrink-0",
            ev.sensitive
              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
              : "bg-primary/10 text-primary"
          )}>
            <Icon name={EVENT_ICON[ev.type] ?? "info"} size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium truncate">{ev.title}</div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
              {ev.order?.number != null && <span className="font-mono font-bold">#{ev.order.number}</span>}
              {ev.actorName && <span>• {ev.actorName}</span>}
              <span className="mr-auto shrink-0">{relTime(ev.createdAt)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
