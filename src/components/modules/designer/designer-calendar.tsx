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
import { useDesignerOrderDetail } from "@/lib/use-designer-order-detail";
import { useAppStore } from "@/stores/app-store";

// ─── Types ────────────────────────────────────────────────────────────
type DesignerOrder = {
  id: string;
  number: number;
  status: string;
  priority: string;
  createdAt: string;
  customer: { name: string };
  items: {
    id: string;
    product: { name: string };
    designStartDate: string | null;
    designEndDate: string | null;
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
function toOrderEvents(orders: DesignerOrder[]): CalendarEvent[] {
  return orders
    .filter((o) => {
      // Only orders that have at least one item with design dates
      const item = o.items?.[0];
      return item && item.designStartDate && item.designEndDate;
    })
    .map((o) => {
      const item = o.items[0];
      return {
        id: o.id,
        title: `#${o.number}`,
        fullTitle: `${o.customer?.name ?? "—"} — #${o.number}`,
        startDate: item.designStartDate!,
        endDate: item.designEndDate!,
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
export function DesignerCalendar() {
  const { openOrder, modal } = useDesignerOrderDetail();
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

  // Fetch designer orders (status=pending_design)
  // یادداشت روزها — پین مداد روی سلول‌های تقویم (Phase 6)
  const { data: notesData } = useQuery({
    queryKey: ["day-notes"],
    queryFn: () => api<{ notes: { id: string; date: string; content: string; color: string }[] }>("/api/day-notes"),
    staleTime: 60_000,
  });
  const noteDays = React.useMemo(
    () => (notesData?.notes ?? []).filter((n) => n.content?.trim()).map((n) => n.date),
    [notesData]
  );

  const { data: ordersData } = useQuery({
    queryKey: ["orders", "designer", "pending_design", "calendar"],
    queryFn: () =>
      api<{ orders: DesignerOrder[] }>("/api/orders?status=pending_design&board=designer"),
    refetchInterval: 30000,
  });

  // Fetch designer tasks (module=designer)
  const { data: tasksData } = useQuery({
    queryKey: ["tasks", "designer", "calendar"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks?module=designer"),
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

  // Click handler: if it's an order, open the designer modal;
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
        title="تقویم طراحی"
        description="نمای تقویمی و گانت سفارشات در حال طراحی و تسک‌های طراح"
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
            noteDays={noteDays}
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
            title="گانت چارت سفارشات و تسک‌های طراحی"
            emptyMessage="رویدادی برای نمایش در گانت نیست"
            filters={filterButtons}
          />
        </TabsContent>
      </Tabs>

      {/* Day detail modal — clicks on an order open the designer modal */}
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
