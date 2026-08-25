"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { formatCurrency, formatDate, daysRemaining, relativeTime } from "@/lib/format";
import { EmptyState } from "@/components/shared";
import { useOrderDetail } from "@/lib/use-order-detail";
import {
  useDashboardSections,
  DASHBOARD_PAGES,
  type DashboardOrder,
  type DashboardTask,
} from "./use-dashboard-data";

export function NearDeadlineOrders() {
  const navigate = useAppStore((s) => s.navigate);
  const { openOrder, modal } = useOrderDetail();
  // R6: shares ONE fetch with RecentOrders + LatestTasks + QuickStatsRow via
  // useDashboardSections() (was: own useQuery with staleTime-less all-time range).
  const { data, isLoading } = useDashboardSections();
  const orders: DashboardOrder[] = data?.nearDeadlineOrders ?? [];

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b">
        <div className="flex items-center gap-2">
          <Icon name="clock" size={18} className="text-amber-500" />
          <h3 className="font-semibold text-sm">سفارشات نزدیک به سررسید (۵ روز)</h3>
        </div>
        <button onClick={() => navigate("admin", DASHBOARD_PAGES.openOrders)} className="text-xs text-primary hover:underline flex items-center gap-1">
          مشاهده همه <Icon name="arrowLeft" size={12} />
        </button>
      </div>
      {isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
      ) : orders.length === 0 ? (
        <EmptyState icon="checkCircle" title="سفارش نزدیک به سررسیدی نیست" description="همه چیز تحت کنترل است" />
      ) : (
        <div className="divide-y">
          {orders.map((o) => {
            const dr = daysRemaining(o.endDate);
            return (
              <button key={o.id} onClick={() => openOrder(o.id)} className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-accent/40 transition text-right">
                <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center font-bold text-xs shrink-0">#{o.number}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{o.customer?.name ?? "—"}</span>
                    {o.priority === "urgent" && <Icon name="alertTriangle" size={12} className="text-rose-500" />}
                  </div>
                  <div className="text-xs text-muted-foreground">{o.items?.length ?? 0} آیتم • {formatDate(o.endDate)}</div>
                </div>
                <div className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full shrink-0",
                  dr.status === "remaining" && "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
                  dr.status === "today" && "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                )}>
                  {dr.text}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {modal}
    </Card>
  );
}

export function LatestTasks() {
  const navigate = useAppStore((s) => s.navigate);
  const { data, isLoading } = useDashboardSections();
  const tasks: DashboardTask[] = data?.latestTasks ?? [];

  const statusColor: Record<string, string> = {
    todo: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  };
  const statusLabel: Record<string, string> = { todo: "در صف", in_progress: "در حال انجام", done: "انجام شده" };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b">
        <div className="flex items-center gap-2">
          <Icon name="task" size={18} className="text-primary" />
          <h3 className="font-semibold text-sm">آخرین تسک‌ها</h3>
        </div>
        <button onClick={() => navigate("admin", DASHBOARD_PAGES.tasks)} className="text-xs text-primary hover:underline flex items-center gap-1">
          مشاهده همه <Icon name="arrowLeft" size={12} />
        </button>
      </div>
      {isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
      ) : tasks.length === 0 ? (
        <EmptyState icon="task" title="تسکی وجود ندارد" />
      ) : (
        <div className="divide-y">
          {tasks.map((t) => (
            <button key={t.id} onClick={() => navigate("admin", DASHBOARD_PAGES.tasks)} className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-accent/40 transition text-right">
              <div className={cn("size-2 rounded-full shrink-0", t.status === "todo" ? "bg-slate-400" : t.status === "in_progress" ? "bg-amber-500" : "bg-emerald-500")} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{t.title}</span>
                  {t.priority === "urgent" && <Icon name="alertTriangle" size={12} className="text-rose-500" />}
                </div>
                <div className="text-xs text-muted-foreground">{relativeTime(t.createdAt)}</div>
              </div>
              <span className={cn("text-xs px-2 py-0.5 rounded-full shrink-0", statusColor[t.status] ?? "bg-muted text-muted-foreground")}>{statusLabel[t.status] ?? t.status}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

export function RecentOrders() {
  const navigate = useAppStore((s) => s.navigate);
  const { openOrder, modal } = useOrderDetail();
  const { data, isLoading } = useDashboardSections();
  const orders: DashboardOrder[] = data?.recentOrders ?? [];

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b">
        <div className="flex items-center gap-2">
          <Icon name="orders" size={18} className="text-primary" />
          <h3 className="font-semibold text-sm">آخرین سفارشات</h3>
        </div>
        <button onClick={() => navigate("admin", DASHBOARD_PAGES.allOrders)} className="text-xs text-primary hover:underline flex items-center gap-1">
          مشاهده همه <Icon name="arrowLeft" size={12} />
        </button>
      </div>
      {isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
      ) : orders.length === 0 ? (
        <EmptyState icon="orders" title="سفارشی ثبت نشده" />
      ) : (
        <div className="divide-y">
          {orders.map((o) => (
            <button key={o.id} onClick={() => openOrder(o.id)} className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-accent/40 transition text-right">
              <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center font-bold text-xs shrink-0">#{o.number}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{o.customer?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{o.items?.length ?? 0} آیتم • {relativeTime(o.createdAt)}</div>
              </div>
              <div className="text-sm font-semibold tabular-nums shrink-0" dir="ltr">{formatCurrency(o.totalAmount)}</div>
            </button>
          ))}
        </div>
      )}
      {modal}
    </Card>
  );
}
