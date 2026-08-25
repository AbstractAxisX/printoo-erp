"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { ReusableCalendar, type CalendarEvent } from "@/components/shared/reusable-calendar";
import { ReusableGantt } from "@/components/shared/reusable-gantt";
import { DayDetailModal } from "@/components/shared/day-detail-modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Icon } from "@/lib/icons";
import { usePrintOrderDetail } from "@/lib/use-print-order-detail";
import { useAppStore } from "@/stores/app-store";

// ─── Types ────────────────────────────────────────────────────────────
type PrintOrder = {
  id: string;
  number: number;
  status: string;
  priority: string;
  createdAt: string;
  customer: { name: string };
  items: {
    id: string;
    product: { name: string };
    printStartDate: string | null;
    printEndDate: string | null;
  }[];
};

type Task = {
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  module: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────
function toOrderEvents(orders: PrintOrder[]): CalendarEvent[] {
  return orders
    .filter((o) => {
      // Only orders that have at least one item with print dates
      const item = o.items?.[0];
      return item && item.printStartDate && item.printEndDate;
    })
    .map((o) => {
      const item = o.items[0];
      return {
        id: o.id,
        title: `#${o.number}`,
        fullTitle: `${o.customer?.name ?? "—"} — #${o.number}`,
        startDate: item.printStartDate!,
        endDate: item.printEndDate!,
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

// ─── Component ────────────────────────────────────────────────────────
export function PrintCalendar() {
  const { openOrder, modal } = usePrintOrderDetail();
  const navigate = useAppStore((s) => s.navigate);
  const [dayModal, setDayModal] = React.useState<{
    date: Date;
    events: CalendarEvent[];
  } | null>(null);
  const [filters, setFilters] = React.useState({
    orders: true,
    tasks: true,
    urgent: false,
  });
  const [activeTab, setActiveTab] = React.useState("calendar");

  // Fetch print orders (status=in_printing)
  const { data: ordersData } = useQuery({
    queryKey: ["orders", "print", "in_printing", "calendar"],
    queryFn: () =>
      api<{ orders: PrintOrder[] }>("/api/orders?status=in_printing"),
    refetchInterval: 30000,
  });

  // Fetch print tasks (module=print)
  const { data: tasksData } = useQuery({
    queryKey: ["tasks", "print", "calendar"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks?module=print"),
    refetchInterval: 30000,
  });

  const orderEvents = React.useMemo(
    () => toOrderEvents(ordersData?.orders ?? []),
    [ordersData]
  );
  const taskEvents = React.useMemo(
    () => toTaskEvents(tasksData?.tasks ?? []),
    [tasksData]
  );

  const allEvents = React.useMemo(() => {
    let ev = [...orderEvents, ...taskEvents];
    if (!filters.orders) ev = ev.filter((e) => e.type !== "order");
    if (!filters.tasks) ev = ev.filter((e) => e.type !== "task");
    if (filters.urgent)
      ev = ev.filter((e) => e.color === "yellow" || e.color === "red");
    return ev;
  }, [orderEvents, taskEvents, filters]);

  const filterButtons = [
    {
      id: "orders",
      label: "سفارشات",
      active: filters.orders,
      onToggle: () => setFilters((f) => ({ ...f, orders: !f.orders })),
    },
    {
      id: "tasks",
      label: "تسک‌ها",
      active: filters.tasks,
      onToggle: () => setFilters((f) => ({ ...f, tasks: !f.tasks })),
    },
    {
      id: "urgent",
      label: "فقط فوری",
      active: filters.urgent,
      onToggle: () => setFilters((f) => ({ ...f, urgent: !f.urgent })),
    },
  ];

  // Click handler: if it's an order, open the print modal;
  // R8: if it's a task, route to the owning panel's tasks board
  // (the task's `module` field tells us which panel owns it).
  function handleEventClick(e: CalendarEvent) {
    if (e.type === "order") {
      openOrder(e.meta.orderId);
    } else if (e.type === "task") {
      navigate(e.meta.module, "tasks");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="تقویم چاپ"
        description="نمای تقویمی و گانت سفارشات در حال چاپ و تسک‌های چاپ"
        icon="calendar"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="calendar" className="gap-1.5">
            <Icon name="calendar" size={14} /> تقویم
          </TabsTrigger>
          <TabsTrigger value="gantt" className="gap-1.5">
            <Icon name="chart" size={14} /> گانت چارت
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <ReusableCalendar
            events={allEvents}
            onDayClick={(date, evts) =>
              setDayModal({ date, events: evts })
            }
            onEventClick={handleEventClick}
            filters={filterButtons}
          />
        </TabsContent>

        <TabsContent value="gantt">
          <ReusableGantt
            events={allEvents}
            onEventClick={handleEventClick}
            title="گانت چارت سفارشات و تسک‌های چاپ"
            emptyMessage="رویدادی برای نمایش در گانت نیست"
            filters={filterButtons}
          />
        </TabsContent>
      </Tabs>

      {/* Day detail modal — clicks on an order open the print modal */}
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
