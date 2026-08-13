"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, LoadingState, EmptyState, StatusBadge, PriorityBadge } from "@/components/shared";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, daysRemaining } from "@/lib/format";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

type Order = {
  id: string; number: number; status: string; endDate: string | null; totalAmount: number;
  priority: string; createdAt: string; customer: { name: string; phone: string };
  items: { id: string; product: { name: string } }[];
};

export function OpenOrdersPage() {
  const navigate = useAppStore((s) => s.navigate);
  const { data, isLoading } = useQuery({
    queryKey: ["open-orders"],
    queryFn: () => api<{ orders: Order[] }>("/api/orders?excludeArchived=true"),
  });
  const orders = (data?.orders ?? []).filter((o) => o.status !== "completed" && o.status !== "archived" && o.status !== "cancelled");

  return (
    <div className="space-y-5">
      <PageHeader
        title="سفارشات باز"
        description="سفارش‌های در حال پردازش که هنوز تکمیل نشده‌اند"
        icon="clock"
        actions={<Button onClick={() => navigate("admin", "orders-new")} className="gap-2"><Icon name="plus" size={16} /> سفارش جدید</Button>}
      />

      <Card className="p-0 overflow-hidden">
        {isLoading ? <LoadingState /> : orders.length === 0 ? (
          <EmptyState icon="checkCircle" title="همه سفارش‌ها تکمیل شده‌اند" description="سفارش بازی وجود ندارد." />
        ) : (
          <div className="divide-y">
            {orders.map((o) => {
              const dr = daysRemaining(o.endDate);
              return (
                <button key={o.id} onClick={() => navigate("admin", "orders")} className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-accent/40 transition text-right">
                  <div className="size-10 rounded-xl bg-primary/10 text-primary grid place-items-center font-bold text-sm">#{o.number}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{o.customer.name}</span>
                      <StatusBadge status={o.status} />
                      <PriorityBadge priority={o.priority} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {o.items.length} آیتم • {o.items.slice(0, 2).map((i) => i.product.name).join("، ")}{o.items.length > 2 ? "..." : ""}
                    </div>
                  </div>
                  <div className="hidden md:block text-left">
                    <div className="text-sm font-semibold" dir="ltr">{formatCurrency(o.totalAmount)}</div>
                    {dr.status !== "none" && (
                      <div className={cn("text-[11px] mt-0.5", dr.status === "remaining" && "text-emerald-600", dr.status === "overdue" && "text-rose-600", dr.status === "today" && "text-amber-600")}>
                        {dr.text}
                      </div>
                    )}
                  </div>
                  <Icon name="chevronLeft" size={16} className="text-muted-foreground" />
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
