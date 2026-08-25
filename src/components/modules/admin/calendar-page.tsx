"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared";
import { ReusableCalendar, type CalendarEvent } from "@/components/shared/reusable-calendar";
import { ReusableGantt } from "@/components/shared/reusable-gantt";
import { DayDetailModal } from "@/components/shared/day-detail-modal";
import { useOrderDetail } from "@/lib/use-order-detail";
import { api } from "@/lib/api";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

type Order = {
  id: string; number: number; status: string; endDate: string | null; noEndDate: boolean;
  totalAmount: number; priority: string; createdAt: string;
  customer: { name: string };
  items: { id: string; designStartDate: string | null; designEndDate: string | null; printStartDate: string | null; printEndDate: string | null; product: { name: string } }[];
};

// R8: Task carries `module` so a calendar click can route the user to the
// owning panel's tasks board (where the task can actually be edited).
type Task = {
  id: string; title: string; priority: string; dueDate: string | null; module: string;
};

function toOrderEvents(orders: Order[]): CalendarEvent[] {
  return orders
    .filter((o) => o.endDate && !o.noEndDate)
    .map((o) => {
      // Start date: earliest of createdAt, first designStartDate, first printStartDate
      // (guard against invalid date strings — invalid → skipped)
      const candidates: string[] = [o.createdAt];
      const firstItem = o.items?.[0];
      if (firstItem?.designStartDate) candidates.push(firstItem.designStartDate);
      if (firstItem?.printStartDate) candidates.push(firstItem.printStartDate);
      const validTimes = candidates
        .map((c) => new Date(c).getTime())
        .filter((t) => !Number.isNaN(t));
      const startMs = validTimes.length > 0 ? Math.min(...validTimes) : Date.now();
      const startDate = new Date(startMs);
      return {
        id: o.id,
        title: `#${o.number}`,
        fullTitle: `${o.customer?.name ?? "—"} — #${o.number}`,
        startDate: startDate.toISOString(),
        endDate: o.endDate!,
        color: (o.priority === "urgent" ? "yellow" : "blue") as CalendarEvent["color"],
        type: "order" as const,
        meta: { orderId: o.id },
      };
    });
}

function toTaskEvents(tasks: Task[]): CalendarEvent[] {
  return tasks
    .filter((t) => t.dueDate)
    .map((t) => ({
      id: t.id,
      title: t.title.slice(0, 4),
      fullTitle: t.title,
      startDate: t.dueDate!,
      endDate: t.dueDate!,
      color: (t.priority === "urgent" ? "red" : "green") as CalendarEvent["color"],
      type: "task" as const,
      meta: { taskId: t.id, module: t.module },
    }));
}

export function CalendarPage() {
  const { openOrder, modal } = useOrderDetail();
  const navigate = useAppStore((s) => s.navigate);
  const [dayModal, setDayModal] = React.useState<{ date: Date; events: CalendarEvent[] } | null>(null);
  const [filters, setFilters] = React.useState({ orders: true, tasks: true, urgent: false });

  // R11: query keys moved under the ["orders"]/["tasks"] prefix family
  // so mutations from admin's orders/tasks pages invalidate the calendar
  // instantly (TanStack prefix-match). Was: ["orders-calendar"]/["tasks-calendar"]
  // — single-string keys that no mutation ever touched (calendar was stale
  // for up to 30s until refetchInterval fired).
  const { data: ordersData } = useQuery({
    queryKey: ["orders", "calendar"],
    queryFn: () => api<{ orders: Order[] }>("/api/orders"),
    refetchInterval: 30000,
  });
  const { data: tasksData } = useQuery({
    queryKey: ["tasks", "calendar"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks"),
    refetchInterval: 30000,
  });

  const orderEvents = React.useMemo(() => toOrderEvents(ordersData?.orders ?? []), [ordersData]);
  const taskEvents = React.useMemo(() => toTaskEvents(tasksData?.tasks ?? []), [tasksData]);

  const allEvents = React.useMemo(() => {
    let ev = [...orderEvents, ...taskEvents];
    if (!filters.orders) ev = ev.filter((e) => e.type !== "order");
    if (!filters.tasks) ev = ev.filter((e) => e.type !== "task");
    if (filters.urgent) ev = ev.filter((e) => e.color === "yellow" || e.color === "red");
    return ev;
  }, [orderEvents, taskEvents, filters]);

  const [activeTab, setActiveTab] = React.useState("calendar");

  const filterButtons = [
    { id: "orders", label: "سفارشات", active: filters.orders, onToggle: () => setFilters((f) => ({ ...f, orders: !f.orders })) },
    { id: "tasks", label: "تسک‌ها", active: filters.tasks, onToggle: () => setFilters((f) => ({ ...f, tasks: !f.tasks })) },
    { id: "urgent", label: "فقط فوری", active: filters.urgent, onToggle: () => setFilters((f) => ({ ...f, urgent: !f.urgent })) },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="تقویم و گانت چارت" description="نمای کامل سفارشات و تسک‌ها در دو نمای تقویمی و گانت" icon="calendar" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="calendar" className="gap-1.5"><Icon name="calendar" size={14} /> تقویم</TabsTrigger>
          <TabsTrigger value="gantt" className="gap-1.5"><Icon name="chart" size={14} /> گانت چارت</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <ReusableCalendar
            events={allEvents}
            onDayClick={(date, evts) => setDayModal({ date, events: evts })}
            onEventClick={(e) => {
              // R8: orphan task click fixed — task clicks now route to the
              // owning panel's tasks board. R23: meta is type-safe via the
              // discriminated union (no more `as string` cast).
              if (e.type === "order") {
                openOrder(e.meta.orderId);
              } else if (e.type === "task") {
                navigate(e.meta.module, "tasks");
              }
            }}
            filters={filterButtons}
          />
        </TabsContent>

        <TabsContent value="gantt">
          <ReusableGantt
            events={allEvents}
            onEventClick={(e) => {
              if (e.type === "order") {
                openOrder(e.meta.orderId);
              } else if (e.type === "task") {
                navigate(e.meta.module, "tasks");
              }
            }}
            title="گانت چارت سفارشات و تسک‌ها"
            emptyMessage="رویدادی برای نمایش در گانت نیست"
            filters={filterButtons}
          />
        </TabsContent>
      </Tabs>

      {/* Day detail modal */}
      <DayDetailModal
        date={dayModal?.date ?? null}
        events={dayModal?.events ?? []}
        open={!!dayModal}
        onOpenChange={(v) => !v && setDayModal(null)}
        onEventClick={(e) => {
          if (e.type === "order") {
            setDayModal(null);
            openOrder(e.meta.orderId);
          } else if (e.type === "task") {
            setDayModal(null);
            navigate(e.meta.module, "tasks");
          }
        }}
      />

      {modal}
    </div>
  );
}
