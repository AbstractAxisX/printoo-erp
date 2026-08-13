"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, LoadingState, StatusBadge, EmptyState } from "@/components/shared";
import { Icon, type IconName } from "@/lib/icons";
import { formatCurrency, formatDate, daysRemaining, relativeTime } from "@/lib/format";
import { useAppStore } from "@/stores/app-store";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Stats = {
  customers: number; orders: number; openOrders: number; completed: number;
  archived: number; payments: number; expenses: number; profit: number;
};
type RecentOrder = {
  id: string; number: number; status: string; endDate: string | null; totalAmount: number;
  createdAt: string; customer: { name: string; phone: string };
  items: { id: string }[];
};

export function AdminDashboard() {
  const navigate = useAppStore((s) => s.navigate);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<{ stats: Stats; recentOrders: RecentOrder[]; byStatus: { status: string; _count: number }[] }>(
      "/api/dashboard"
    ),
  });

  const stats = data?.stats;
  const recent = data?.recentOrders ?? [];

  const cards: { label: string; value: string; icon: IconName; color: string; page: string }[] = [
    { label: "مشتریان", value: String(stats?.customers ?? 0), icon: "customers", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40", page: "customers" },
    { label: "سفارشات", value: String(stats?.orders ?? 0), icon: "orders", color: "text-violet-600 bg-violet-50 dark:bg-violet-950/40", page: "orders" },
    { label: "سفارشات باز", value: String(stats?.openOrders ?? 0), icon: "clock", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40", page: "open-orders" },
    { label: "تکمیل شده", value: String(stats?.completed ?? 0), icon: "checkCircle", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40", page: "orders" },
    { label: "پرداخت‌ها", value: formatCurrency(stats?.payments), icon: "wallet", color: "text-teal-600 bg-teal-50 dark:bg-teal-950/40", page: "customers" },
    { label: "هزینه‌ها", value: formatCurrency(stats?.expenses), icon: "money", color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40", page: "customers" },
    { label: "سود تخمینی", value: formatCurrency(stats?.profit), icon: "trending", color: (stats?.profit ?? 0) >= 0 ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : "text-rose-600 bg-rose-50 dark:bg-rose-950/40", page: "customers" },
    { label: "آرشیو", value: String(stats?.archived ?? 0), icon: "archive", color: "text-slate-600 bg-slate-100 dark:bg-slate-800", page: "archive" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="داشبورد"
        description="نمای کلی سامانه مدیریت چاپ Printoo24"
        icon="dashboard"
        actions={
          <button
            onClick={() => navigate("admin", "orders-new")}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition"
          >
            <Icon name="plus" size={16} /> سفارش جدید
          </button>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {cards.map((c) => (
              <button
                key={c.label}
                onClick={() => navigate("admin", c.page)}
                className="text-right"
              >
                <Card className="p-4 hover:shadow-md transition-shadow h-full">
                  <div className="flex items-start justify-between">
                    <div className={cn("size-10 rounded-xl grid place-items-center", c.color)}>
                      <Icon name={c.icon} size={20} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-xs text-muted-foreground">{c.label}</div>
                    <div className="text-lg font-bold mt-0.5 truncate" dir="ltr">{c.value}</div>
                  </div>
                </Card>
              </button>
            ))}
          </div>

          {/* Recent orders */}
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b">
              <div className="flex items-center gap-2">
                <Icon name="clock" size={18} className="text-primary" />
                <h3 className="font-semibold">آخرین سفارشات</h3>
              </div>
              <button onClick={() => navigate("admin", "orders")} className="text-xs text-primary hover:underline flex items-center gap-1">
                مشاهده همه <Icon name="arrowLeft" size={12} />
              </button>
            </div>
            {recent.length === 0 ? (
              <EmptyState icon="orders" title="سفارشی ثبت نشده" description="اولین سفارش خود را ایجاد کنید." />
            ) : (
              <div className="divide-y">
                {recent.map((o) => {
                  const dr = daysRemaining(o.endDate);
                  return (
                    <button
                      key={o.id}
                      onClick={() => navigate("admin", "orders")}
                      className="w-full flex items-center gap-4 px-5 py-3 hover:bg-accent/50 transition text-right"
                    >
                      <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center text-xs font-bold">
                        #{o.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{o.customer.name}</span>
                          <StatusBadge status={o.status} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {o.items.length} آیتم • {relativeTime(o.createdAt)}
                        </div>
                      </div>
                      <div className="hidden sm:block text-left">
                        <div className="text-sm font-semibold" dir="ltr">{formatCurrency(o.totalAmount)}</div>
                        {dr.status !== "none" && (
                          <div className={cn(
                            "text-[11px] mt-0.5",
                            dr.status === "remaining" && "text-emerald-600",
                            dr.status === "overdue" && "text-rose-600",
                            dr.status === "today" && "text-amber-600"
                          )}>
                            {dr.text}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
