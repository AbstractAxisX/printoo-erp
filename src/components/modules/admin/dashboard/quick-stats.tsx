"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useDashboardSections, DASHBOARD_PAGES } from "./use-dashboard-data";

type QuickStat = {
  key: string;
  label: string;
  value: number;
  icon: IconName;
  color: string;
  page: string;
};

export function QuickStatsRow() {
  const navigate = useAppStore((s) => s.navigate);
  // R6: shares ONE fetch with RecentOrders + LatestTasks + NearDeadlineOrders
  const { data } = useDashboardSections();

  const qs = data?.quickStats;
  const stats: QuickStat[] = [
    { key: "nearDeadline", label: "نزدیک به سررسید", value: qs?.nearDeadline ?? 0, icon: "clock", color: "amber", page: DASHBOARD_PAGES.openOrders },
    { key: "overdue", label: "سررسید گذشته", value: qs?.overdueOrders ?? 0, icon: "alertTriangle", color: "rose", page: DASHBOARD_PAGES.openOrders },
    { key: "noEndDate", label: "بدون زمان پایان", value: qs?.noEndDate ?? 0, icon: "calendar", color: "slate", page: DASHBOARD_PAGES.allOrders },
    { key: "pendingTasks", label: "تسک‌های در صف", value: qs?.pendingTasks ?? 0, icon: "task", color: "violet", page: DASHBOARD_PAGES.tasks },
  ];

  const COLOR_MAP: Record<string, string> = {
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s) => (
        <button key={s.key} onClick={() => navigate("admin", s.page)} className="text-right">
          <Card className="p-3.5 hover:shadow-md transition-shadow flex items-center gap-3">
            <div className={cn("size-10 rounded-xl grid place-items-center shrink-0", COLOR_MAP[s.color] ?? "bg-muted text-muted-foreground")}>
              <Icon name={s.icon} size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-bold tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground truncate">{s.label}</div>
            </div>
          </Card>
        </button>
      ))}
    </div>
  );
}
