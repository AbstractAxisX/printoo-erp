"use client";

import * as React from "react";
import { format, differenceInCalendarDays, parseISO, isValid } from "date-fns";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ToggleButton } from "@/components/ui/toggle-button";
import type { CalendarEvent } from "./reusable-calendar";

type DayDetailModalProps = {
  date: Date | null;
  events: CalendarEvent[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEventClick?: (event: CalendarEvent) => void;
};

function toDate(d: string | Date): Date | null {
  try {
    const parsed = typeof d === "string" ? parseISO(d) : new Date(d);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function diffDays(end: string | Date, ref: Date): number {
  const e = toDate(end);
  if (!e) return NaN;
  return differenceInCalendarDays(e, ref);
}

export function DayDetailModal({ date, events, open, onOpenChange, onEventClick }: DayDetailModalProps) {
  const [tab, setTab] = React.useState<"overview" | "orders" | "tasks">("overview");

  // Reset to overview when opening
  React.useEffect(() => { if (open) setTab("overview"); }, [open, date]);

  const orders = events.filter((e) => e.type === "order");
  const tasks = events.filter((e) => e.type === "task");
  const urgentOrders = orders.filter((e) => e.color === "yellow");
  const urgentTasks = tasks.filter((e) => e.color === "red");
  const normalOrders = orders.filter((e) => e.color === "blue");
  const normalTasks = tasks.filter((e) => e.color === "green");

  // Overview stats
  const totalEvents = events.length;
  const overdue = events.filter((e) => {
    const d = diffDays(e.endDate, new Date());
    return !Number.isNaN(d) && d < 0;
  }).length;
  const dueToday = events.filter((e) => {
    const d = diffDays(e.endDate, new Date());
    return !Number.isNaN(d) && d === 0;
  }).length;
  const upcoming = events.filter((e) => {
    const d = diffDays(e.endDate, new Date());
    return !Number.isNaN(d) && d > 0;
  }).length;

  if (!date) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden p-0 gap-0">
        <DialogTitle className="sr-only">جزئیات روز {format(date, "yyyy/MM/dd")}</DialogTitle>

        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b bg-gradient-to-l from-primary/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
              <Icon name="calendar" size={22} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold tabular-nums">{format(date, "yyyy/MM/dd")}</h2>
              <p className="text-xs text-muted-foreground">{format(date, "EEEE")} — {totalEvents} رویداد</p>
            </div>
            <div className="flex items-center gap-2">
              {urgentOrders.length + urgentTasks.length > 0 && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  <Icon name="alertTriangle" size={11} /> {urgentOrders.length + urgentTasks.length} فوری
                </span>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mt-3">
            {([
              { id: "overview", label: "نمای کلی", icon: "dashboard" as const },
              { id: "orders", label: `سفارشات (${orders.length})`, icon: "orders" as const },
              { id: "tasks", label: `تسک‌ها (${tasks.length})`, icon: "task" as const },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition",
                  tab === t.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent"
                )}
              >
                <Icon name={t.icon} size={13} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto scrollbar-thin px-6 py-4" style={{ maxHeight: "60vh" }}>

          {/* OVERVIEW TAB */}
          {tab === "overview" && (
            <div className="space-y-3">
              {/* Stats boxes — beautiful boxed sections */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatBox label="کل رویدادها" value={totalEvents} icon="inbox" color="bg-primary/10 text-primary" />
                <StatBox label="سفارشات" value={orders.length} icon="orders" color="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400" />
                <StatBox label="تسک‌ها" value={tasks.length} icon="task" color="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400" />
                <StatBox label="فوری" value={urgentOrders.length + urgentTasks.length} icon="alertTriangle" color="bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400" />
              </div>

              {/* Status breakdown */}
              <div className="rounded-lg border p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Icon name="clock" size={13} /> وضعیت زمانی
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="گذشته" value={overdue} color="text-rose-600" />
                  <MiniStat label="موعد امروز" value={dueToday} color="text-amber-600" />
                  <MiniStat label="آینده" value={upcoming} color="text-emerald-600" />
                </div>
              </div>

              {/* Order breakdown */}
              {orders.length > 0 && (
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Icon name="orders" size={13} /> سفارشات
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <MiniStat label="عادی" value={normalOrders.length} color="text-blue-600" />
                    <MiniStat label="فوری" value={urgentOrders.length} color="text-amber-600" />
                  </div>
                </div>
              )}

              {/* Task breakdown */}
              {tasks.length > 0 && (
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Icon name="task" size={13} /> تسک‌ها
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <MiniStat label="عادی" value={normalTasks.length} color="text-emerald-600" />
                    <MiniStat label="فوری" value={urgentTasks.length} color="text-rose-600" />
                  </div>
                </div>
              )}

              {/* Quick preview list */}
              {events.length > 0 && (
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Icon name="list" size={13} /> رویدادهای این روز
                  </div>
                  <div className="space-y-1">
                    {events.slice(0, 5).map((e) => {
                      const daysLeft = diffDays(e.endDate, new Date());
                      return (
                        <div key={e.id} className="flex items-center gap-2 text-xs py-1">
                          <span className={cn("size-2 rounded-full shrink-0", `bg-${e.color === "yellow" ? "amber" : e.color === "blue" ? "blue" : e.color === "green" ? "emerald" : "rose"}-500`)} />
                          <span className="flex-1 truncate font-medium">{e.fullTitle}</span>
                          <span className="text-muted-foreground shrink-0">
                            {Number.isNaN(daysLeft) ? "—" : daysLeft > 0 ? `${daysLeft}روز` : daysLeft === 0 ? "امروز" : `${Math.abs(daysLeft)}روز گذشته`}
                          </span>
                        </div>
                      );
                    })}
                    {events.length > 5 && <div className="text-xs text-muted-foreground text-center pt-1">+{events.length - 5} مورد دیگر</div>}
                  </div>
                </div>
              )}

              {events.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <Icon name="inbox" size={32} className="opacity-30" />
                  <span className="text-sm">رویدادی در این روز نیست</span>
                </div>
              )}
            </div>
          )}

          {/* ORDERS TAB */}
          {tab === "orders" && (
            <EventList events={orders} onEventClick={onEventClick} emptyMessage="سفارشی در این روز نیست" />
          )}

          {/* TASKS TAB */}
          {tab === "tasks" && (
            <EventList events={tasks} onEventClick={onEventClick} emptyMessage="تسکی در این روز نیست" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatBox({ label, value, icon, color }: { label: string; value: number; icon: IconName; color: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className={cn("size-8 rounded-lg grid place-items-center mb-2", color)}>
        <Icon name={icon} size={16} />
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg bg-muted/30 p-2 text-center">
      <div className={cn("text-lg font-bold tabular-nums", color)}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function EventList({ events, onEventClick, emptyMessage }: { events: CalendarEvent[]; onEventClick?: (e: CalendarEvent) => void; emptyMessage: string }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
        <Icon name="inbox" size={32} className="opacity-30" />
        <span className="text-sm">{emptyMessage}</span>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {events.map((e) => {
        const start = toDate(e.startDate);
        const end = toDate(e.endDate);
        if (!start || !end) {
          return (
            <button
              key={e.id}
              onClick={() => onEventClick?.(e)}
              className={cn("w-full text-right rounded-lg border p-3 hover:shadow-md transition", "bg-muted/30 border-border")}
            >
              <div className="flex items-start gap-2.5">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm truncate">{e.fullTitle}</span>
                </div>
              </div>
            </button>
          );
        }
        const totalDays = differenceInCalendarDays(end, start) + 1;
        const daysLeft = differenceInCalendarDays(end, new Date());
        const colorBg = {
          blue: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
          yellow: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
          green: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900",
          red: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900",
        }[e.color];
        const colorText = {
          blue: "text-blue-600 dark:text-blue-400",
          yellow: "text-amber-600 dark:text-amber-400",
          green: "text-emerald-600 dark:text-emerald-400",
          red: "text-rose-600 dark:text-rose-400",
        }[e.color];
        return (
          <button
            key={e.id}
            onClick={() => onEventClick?.(e)}
            className={cn("w-full text-right rounded-lg border p-3 hover:shadow-md transition", colorBg)}
          >
            <div className="flex items-start gap-2.5">
              <div className={cn("size-8 rounded-lg grid place-items-center shrink-0 font-bold text-xs", colorText, "bg-background/50")}>
                {e.title.replace("#", "")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{e.fullTitle}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1"><Icon name="calendar" size={11} /> {format(start, "yyyy/MM/dd")} → {format(end, "yyyy/MM/dd")}</span>
                  <span className="flex items-center gap-1"><Icon name="clock" size={11} /> {totalDays} روز</span>
                  {daysLeft > 0 && <span className="text-emerald-600 flex items-center gap-1"><Icon name="checkCircle" size={11} /> {daysLeft} روز باقی</span>}
                  {daysLeft === 0 && <span className="text-amber-600 flex items-center gap-1"><Icon name="alertTriangle" size={11} /> موعد امروز</span>}
                  {daysLeft < 0 && <span className="text-rose-600 flex items-center gap-1"><Icon name="alertTriangle" size={11} /> {Math.abs(daysLeft)} روز گذشته</span>}
                </div>
              </div>
              <Icon name="chevronLeft" size={14} className="text-muted-foreground shrink-0 mt-1" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
