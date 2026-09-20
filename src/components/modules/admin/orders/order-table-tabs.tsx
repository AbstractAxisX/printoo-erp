"use client";

// Printoo24 ERP — Order table aspect tabs (Phase 20, خواستهٔ 5)
//
// نوار تب مشترک بالای جدول سفارش‌ها — همان تب‌های مودال جزئیات سفارش،
// این‌بار روی «همه سفارشات» و «سفارشات باز»:
//   همه | آیتم‌ها | هزینه‌ها | پیوست‌ها | یادداشت‌ها
// تب «همه» = ستون‌های کامل امروز؛ بقیه تب‌ها همان یک دید tabular فشرده
// از آن جنبه برای «همهٔ» سفارش‌های جدول (columns-by-tab.tsx).
//
// کامپکت: دکمه‌های h-9 سگمنتی؛ فعال = bg-primary text-primary-foreground.

import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type OrderTableTab = "all" | "items" | "costs" | "attachments" | "notes";

const TABS: { id: OrderTableTab; label: string; icon: IconName }[] = [
  { id: "all", label: "همه", icon: "layers" },
  { id: "items", label: "آیتم‌ها", icon: "orders" },
  { id: "costs", label: "هزینه‌ها", icon: "coins" },
  { id: "attachments", label: "پیوست‌ها", icon: "file" },
  { id: "notes", label: "یادداشت‌ها", icon: "info" },
];

export function OrderTableTabs({
  value,
  onChange,
  className,
}: {
  value: OrderTableTab;
  onChange: (v: OrderTableTab) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="نمای جنبه‌های جدول سفارشات"
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1",
        className
      )}
    >
      {TABS.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "h-9 px-3 rounded-md text-sm font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
