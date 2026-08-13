"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, LoadingState, EmptyState, StatusBadge } from "@/components/shared";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, addMonths, subMonths, format,
} from "date-fns";

type Order = {
  id: string; number: number; status: string; endDate: string | null; totalAmount: number;
  priority: string; customer: { name: string };
};

export function CalendarPage() {
  const navigate = useAppStore((s) => s.navigate);
  const [cursor, setCursor] = React.useState(new Date());

  const { data, isLoading } = useQuery({
    queryKey: ["orders-all"],
    queryFn: () => api<{ orders: Order[] }>("/api/orders"),
  });
  const orders = (data?.orders ?? []).filter((o) => o.endDate);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 6 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 6 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const weekDays = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

  return (
    <div className="space-y-5">
      <PageHeader
        title="تقویم"
        description="نمای تقویمی سفارشات بر اساس تاریخ پایان"
        icon="calendar"
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setCursor(subMonths(cursor, 1))}><Icon name="chevronRight" size={16} /></Button>
            <Button variant="outline" onClick={() => setCursor(new Date())}>امروز</Button>
            <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}><Icon name="chevronLeft" size={16} /></Button>
          </div>
        }
      />

      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">{format(cursor, "MMMM yyyy")}</h3>
        </div>

        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {weekDays.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
          ))}
        </div>

        {isLoading ? <LoadingState /> : (
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((day) => {
              const inMonth = isSameMonth(day, cursor);
              const dayOrders = orders.filter((o) => o.endDate && isSameDay(new Date(o.endDate!), day));
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[88px] rounded-lg border p-1.5 text-right transition",
                    !inMonth && "opacity-40 bg-muted/30",
                    isToday && "ring-2 ring-primary border-primary",
                    dayOrders.length > 0 && inMonth && "bg-accent/30"
                  )}
                >
                  <div className={cn("text-xs font-medium mb-1", isToday && "text-primary")}>{format(day, "d")}</div>
                  <div className="space-y-1">
                    {dayOrders.slice(0, 2).map((o) => (
                      <button
                        key={o.id}
                        onClick={() => navigate("admin", "orders")}
                        className="w-full text-right text-[10px] rounded px-1.5 py-0.5 bg-primary/15 text-primary hover:bg-primary/25 transition truncate"
                        title={`#${o.number} - ${o.customer.name}`}
                      >
                        #{o.number} {o.customer.name}
                      </button>
                    ))}
                    {dayOrders.length > 2 && (
                      <div className="text-[10px] text-muted-foreground px-1.5">+{dayOrders.length - 2} مورد</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Upcoming deadlines */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3.5 border-b flex items-center gap-2">
          <Icon name="clock" size={18} className="text-amber-500" />
          <h3 className="font-semibold">موعدهای پیش‌رو</h3>
        </div>
        {orders.length === 0 ? <EmptyState icon="calendarCheck" title="موعدی ثبت نشده" /> : (
          <div className="divide-y">
            {orders
              .filter((o) => o.endDate && new Date(o.endDate!) >= new Date())
              .sort((a, b) => new Date(a.endDate!).getTime() - new Date(b.endDate!).getTime())
              .slice(0, 6)
              .map((o) => (
                <button key={o.id} onClick={() => navigate("admin", "orders")} className="w-full flex items-center gap-4 px-5 py-3 hover:bg-accent/40 text-right">
                  <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center font-bold text-xs">#{o.number}</div>
                  <div className="flex-1"><div className="font-medium text-sm">{o.customer.name}</div><div className="text-xs text-muted-foreground">{formatDate(o.endDate)}</div></div>
                  <StatusBadge status={o.status} />
                  <div className="text-sm font-semibold" dir="ltr">{formatCurrency(o.totalAmount)}</div>
                </button>
              ))}
          </div>
        )}
      </Card>
    </div>
  );
}
