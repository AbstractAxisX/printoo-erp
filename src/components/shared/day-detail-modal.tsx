"use client";

import * as React from "react";
import { format, differenceInCalendarDays, parseISO, isWithinInterval } from "date-fns";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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

export function DayDetailModal({ date, events, open, onOpenChange, onEventClick }: DayDetailModalProps) {
  const [filter, setFilter] = React.useState<"all" | "orders" | "tasks" | "urgent">("all");

  const filtered = React.useMemo(() => {
    if (filter === "orders") return events.filter((e) => e.type === "order");
    if (filter === "tasks") return events.filter((e) => e.type === "task");
    if (filter === "urgent") return events.filter((e) => e.color === "yellow" || e.color === "red");
    return events;
  }, [events, filter]);

  if (!date) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden p-0 gap-0">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
              <Icon name="calendar" size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold">{format(date, "yyyy/MM/dd")}</h2>
              <p className="text-xs text-muted-foreground">{format(date, "EEEE")}</p>
            </div>
            <div className="mr-auto text-left">
              <div className="text-2xl font-bold tabular-nums">{events.length}</div>
              <div className="text-[11px] text-muted-foreground">رویداد</div>
            </div>
          </div>
          {/* Filters */}
          <div className="flex items-center gap-2 mt-3">
            <ToggleButton checked={filter === "all"} onChange={() => setFilter("all")} label="همه" size="sm" />
            <ToggleButton checked={filter === "orders"} onChange={() => setFilter("orders")} label="سفارشات" size="sm" activeColor="emerald" />
            <ToggleButton checked={filter === "tasks"} onChange={() => setFilter("tasks")} label="تسک‌ها" size="sm" activeColor="emerald" />
            <ToggleButton checked={filter === "urgent"} onChange={() => setFilter("urgent")} label="فوری" size="sm" activeColor="amber" />
          </div>
        </div>

        {/* Events list */}
        <div className="overflow-y-auto scrollbar-thin px-4 py-3" style={{ maxHeight: "60vh" }}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <Icon name="inbox" size={32} className="opacity-30" />
              <span className="text-sm">رویدادی در این روز نیست</span>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((e) => {
                const start = typeof e.startDate === "string" ? parseISO(e.startDate) : e.startDate;
                const end = typeof e.endDate === "string" ? parseISO(e.endDate) : e.endDate;
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
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", colorText, "bg-background/50")}>
                            {e.type === "order" ? "سفارش" : "تسک"}
                          </span>
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
