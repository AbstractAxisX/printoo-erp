"use client";

import * as React from "react";
import { PageHeader } from "@/components/shared";
import { Icon, type IconName } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/stores/app-store";
import { getPreset, type TimeRange } from "@/lib/time-ranges";
import { findModule, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { KpiCardsGrid } from "./kpi-cards";
import { QuickStatsRow } from "./quick-stats";
import {
  LatestTasks,
  NearDeadlineOrders,
  RecentOrders,
} from "./dashboard-sections";
import { DASHBOARD_PAGES } from "./use-dashboard-data";

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Flatten all nav items for a given module. */
function useModuleItems(moduleKey: string): NavItem[] {
  return React.useMemo(() => {
    const mod = findModule(moduleKey);
    return mod.groups.flatMap((g) => g.items);
  }, [moduleKey]);
}

/** Resolve a "module:page" shortcut key to its NavItem (or null if missing). */
function resolveShortcut(
  key: string
): { key: string; mod: string; item: NavItem } | null {
  const [mod, page] = key.split(":");
  if (!mod || !page) return null;
  const modNav = findModule(mod);
  const item = modNav.groups.flatMap((g) => g.items).find((i) => i.page === page);
  return item ? { key, mod, item } : null;
}

// ─── Section Card (collapsible wrapper) ────────────────────────────────────

type SectionCardProps = {
  icon: IconName;
  title: string;
  description?: string;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  bodyClassName?: string;
  children: React.ReactNode;
};

function SectionCard({
  icon,
  title,
  description,
  action,
  defaultOpen = true,
  bodyClassName,
  children,
}: SectionCardProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b bg-muted/30">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
              <Icon name={icon} size={17} />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-sm leading-tight">{title}</h2>
              {description && (
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {description}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {action && <div className="hidden sm:block">{action}</div>}
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="size-8 rounded-md hover:bg-accent grid place-items-center text-muted-foreground hover:text-foreground transition"
                title={open ? "جمع کردن بخش" : "باز کردن بخش"}
                aria-label={open ? "جمع کردن بخش" : "باز کردن بخش"}
              >
                <Icon name={open ? "chevronUp" : "chevronDown"} size={16} />
              </button>
            </CollapsibleTrigger>
          </div>
        </div>

        {/* Body — animated height using tw-animate-css collapsible keyframes */}
        <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
          <div className={cn("p-4", bodyClassName)}>{children}</div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ─── "View all" link action ────────────────────────────────────────────────

function ViewAllLink({ onClick, label = "مشاهده همه" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-primary hover:underline flex items-center gap-1 px-2 py-1 rounded hover:bg-primary/5 transition"
    >
      {label} <Icon name="arrowLeft" size={12} />
    </button>
  );
}

/**
 * Wrapper that "merges" an existing section component (RecentOrders,
 * NearDeadlineOrders, LatestTasks — each renders its own Card+header+view-all)
 * into our SectionCard layout. We visually strip the inner Card (border,
 * shadow, bg, rounding, gap) and hide its built-in header so only the body
 * (the list of items) shows up — driven by our collapsible SectionCard header
 * instead. This keeps the existing data-fetching components untouched while
 * giving every dashboard section a consistent collapsible shell.
 */
const MERGE_INNER_CARD =
  "[&_[data-slot=card]]:border-0 [&_[data-slot=card]]:shadow-none " +
  "[&_[data-slot=card]]:rounded-none [&_[data-slot=card]]:bg-transparent " +
  "[&_[data-slot=card]]:gap-0 " +
  "[&_[data-slot=card]>div:first-child]:hidden";

// ─── Shortcuts Section ─────────────────────────────────────────────────────

function ShortcutsSection() {
  const navigate = useAppStore((s) => s.navigate);
  const shortcuts = useAppStore((s) => s.shortcuts);
  const addShortcut = useAppStore((s) => s.addShortcut);
  const removeShortcut = useAppStore((s) => s.removeShortcut);
  const [addOpen, setAddOpen] = React.useState(false);

  const allItems = useModuleItems("admin");

  const shortcutItems = React.useMemo(
    () =>
      shortcuts
        .map(resolveShortcut)
        .filter(
          (x): x is { key: string; mod: string; item: NavItem } => x !== null
        ),
    [shortcuts]
  );

  const availableToAdd = React.useMemo(
    () => allItems.filter((i) => !shortcuts.includes(`admin:${i.page}`)),
    [allItems, shortcuts]
  );

  return (
    <SectionCard
      icon="bookmark"
      title="میانبرها"
      description="دسترسی سریع به صفحه‌های پراستفاده"
      bodyClassName="!p-4"
    >
      <div className="flex flex-wrap gap-3">
        {shortcutItems.length === 0 && (
          <div className="text-sm text-muted-foreground py-3 px-1">
            هنوز میانبری اضافه نشده است. روی «افزودن میانبر» بزنید.
          </div>
        )}

        {shortcutItems.map(({ key, mod, item }) => (
          <div key={key} className="group relative">
            <button
              type="button"
              onClick={() => navigate(mod, item.page)}
              className="w-full flex items-center gap-2.5 ps-3 pe-4 py-2.5 rounded-xl border bg-card hover:bg-accent/40 hover:border-primary/40 transition text-right min-w-[160px]"
              title={item.label}
            >
              <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                <Icon name={item.icon} size={18} />
              </div>
              <span className="font-medium text-sm truncate">{item.label}</span>
            </button>

            <button
              type="button"
              onClick={() => removeShortcut(key)}
              className="absolute -top-1.5 -left-1.5 size-5 rounded-full bg-rose-500 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition hover:bg-rose-600 shadow-sm focus:opacity-100"
              title="حذف میانبر"
              aria-label={`حذف میانبر ${item.label}`}
            >
              <Icon name="cancel" size={11} />
            </button>
          </div>
        ))}

        {/* Add shortcut button */}
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 ps-3 pe-4 py-2.5 rounded-xl border border-dashed hover:border-primary/50 hover:bg-accent/30 transition text-sm text-muted-foreground hover:text-foreground"
            >
              <Icon name="plus" size={16} />
              افزودن میانبر
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0">
            <div className="px-3 py-2.5 border-b">
              <h3 className="text-sm font-semibold">افزودن میانبر جدید</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                یک صفحه را برای میانبر انتخاب کنید
              </p>
            </div>
            <ScrollArea className="max-h-72">
              <div className="p-1">
                {availableToAdd.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    همه صفحه‌ها اضافه شده‌اند
                  </div>
                ) : (
                  availableToAdd.map((item) => (
                    <button
                      key={item.page}
                      type="button"
                      onClick={() => {
                        addShortcut(`admin:${item.page}`);
                        setAddOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent transition text-right"
                    >
                      <div className="size-7 rounded-md bg-muted text-muted-foreground grid place-items-center shrink-0">
                        <Icon name={item.icon} size={15} />
                      </div>
                      <span className="text-sm">{item.label}</span>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>
    </SectionCard>
  );
}

// ─── Admin Dashboard ───────────────────────────────────────────────────────

export function AdminDashboard() {
  const navigate = useAppStore((s) => s.navigate);
  const [globalRange, setGlobalRange] = React.useState<TimeRange>(() =>
    getPreset("this-month")
  );
  const [showChart, setShowChart] = React.useState(false);

  return (
    <div className="space-y-5">
      <PageHeader
        title="داشبورد"
        description="نمای کلی سامانه مدیریت چاپ Printoo24"
        icon="dashboard"
        actions={
          <Button onClick={() => navigate("admin", DASHBOARD_PAGES.newOrder)} className="gap-2">
            <Icon name="plus" size={16} /> سفارش جدید
          </Button>
        }
      />

      {/* 1) Shortcuts */}
      <ShortcutsSection />

      {/* 2) KPI cards */}
      <SectionCard
        icon="chart"
        title="شاخص‌های کلیدی (KPI)"
        description="عملکرد کلی در بازه‌ی زمانی انتخاب‌شده"
        bodyClassName="!p-4"
      >
        <KpiCardsGrid
          globalRange={globalRange}
          onGlobalRangeChange={setGlobalRange}
          showChart={showChart}
          onToggleChart={() => setShowChart(!showChart)}
        />
      </SectionCard>

      {/* 3) Quick stats */}
      <SectionCard icon="grid" title="آمار سریع" bodyClassName="!p-4">
        <QuickStatsRow />
      </SectionCard>

      {/* 4) Recent orders — wrapped in collapsible SectionCard.
          The inner RecentOrders component renders its own Card+header+view-all,
          which we visually merge via MERGE_INNER_CARD so only its list shows. */}
      <SectionCard
        icon="orders"
        title="آخرین سفارشات"
        bodyClassName="!p-0"
        action={<ViewAllLink onClick={() => navigate("admin", DASHBOARD_PAGES.allOrders)} />}
      >
        <div className={MERGE_INNER_CARD}>
          <RecentOrders />
        </div>
      </SectionCard>

      {/* 5) Near-deadline + latest tasks side-by-side, each in a collapsible SectionCard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard
          icon="clock"
          title="سفارشات نزدیک سررسید"
          bodyClassName="!p-0"
          action={<ViewAllLink onClick={() => navigate("admin", DASHBOARD_PAGES.openOrders)} />}
        >
          <div className={MERGE_INNER_CARD}>
            <NearDeadlineOrders />
          </div>
        </SectionCard>

        <SectionCard
          icon="task"
          title="آخرین تسک‌ها"
          bodyClassName="!p-0"
          action={<ViewAllLink onClick={() => navigate("admin", DASHBOARD_PAGES.tasks)} />}
        >
          <div className={MERGE_INNER_CARD}>
            <LatestTasks />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
