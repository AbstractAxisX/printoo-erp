"use client";

import * as React from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isWithinInterval, parseISO, isValid } from "date-fns";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

export type CalendarEvent = {
  id: string;
  title: string; // short label (e.g. "#123")
  fullTitle: string; // full title for tooltip/modal
  startDate: string | Date;
  endDate: string | Date;
  color: "blue" | "yellow" | "green" | "red"; // blue=normal order, yellow=urgent order, green=normal task, red=urgent task
  type: "order" | "task";
  meta?: Record<string, unknown>; // extra data for modal
};

export type DayNote = {
  date: string;
  content: string;
  color?: string;
};

type ReusableCalendarProps = {
  events: CalendarEvent[];
  notes?: DayNote[];
  onDayClick?: (date: Date, events: CalendarEvent[]) => void;
  onEventClick?: (event: CalendarEvent) => void;
  filters?: { id: string; label: string; active: boolean; onToggle: () => void }[];
  className?: string;
};

const COLOR_CLASSES: Record<CalendarEvent["color"], { bg: string; text: string; border: string }> = {
  blue: { bg: "bg-blue-500", text: "text-white", border: "border-blue-500" },
  yellow: { bg: "bg-amber-500", text: "text-white", border: "border-amber-500" },
  green: { bg: "bg-emerald-500", text: "text-white", border: "border-emerald-500" },
  red: { bg: "bg-rose-500", text: "text-white", border: "border-rose-500" },
};

const MAX_VISIBLE_EVENTS = 10;

export function ReusableCalendar({ events, notes = [], onDayClick, onEventClick, filters, className }: ReusableCalendarProps) {
  const [cursor, setCursor] = React.useState(new Date());
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 6 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 6 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weekDays = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

  const notesMap = React.useMemo(() => {
    const m = new Map<string, DayNote>();
    for (const n of notes) m.set(n.date, n);
    return m;
  }, [notes]);

  function getEventsForDay(day: Date): CalendarEvent[] {
    return events.filter((e) => {
      try {
        const start = typeof e.startDate === "string" ? parseISO(e.startDate) : new Date(e.startDate);
        const end = typeof e.endDate === "string" ? parseISO(e.endDate) : new Date(e.endDate);
        if (!isValid(start) || !isValid(end)) return false;
        return isWithinInterval(day, { start, end });
      } catch {
        return false;
      }
    });
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor(subMonths(cursor, 1))} className="size-8 rounded-lg border grid place-items-center hover:bg-accent transition" title="ماه قبل">
            <Icon name="chevronRight" size={16} />
          </button>
          <button onClick={() => setCursor(new Date())} className="px-3 py-1.5 rounded-lg border text-xs hover:bg-accent transition">امروز</button>
          <button onClick={() => setCursor(addMonths(cursor, 1))} className="size-8 rounded-lg border grid place-items-center hover:bg-accent transition" title="ماه بعد">
            <Icon name="chevronLeft" size={16} />
          </button>
        </div>
        <h3 className="font-semibold text-base mr-2">{format(cursor, "MMMM yyyy")}</h3>
        {filters && filters.length > 0 && (
          <div className="flex items-center gap-1.5 mr-auto">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={f.onToggle}
                className={cn(
                  "px-2.5 py-1 rounded-lg border text-xs font-medium transition flex items-center gap-1",
                  f.active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-input hover:border-foreground/30"
                )}
              >
                <Icon name={f.active ? "check" : "plus"} size={11} strokeWidth={2.5} />
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1 rounded-xl border bg-card p-2">
        {/* Week day headers */}
        {weekDays.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
        ))}
        {/* Day cells */}
        {days.map((day) => {
          const inMonth = isSameMonth(day, cursor);
          const isToday = isSameDay(day, new Date());
          const dayEvents = getEventsForDay(day);
          const dayKey = format(day, "yyyy-MM-dd");
          const hasNote = notesMap.has(dayKey);
          const visibleEvents = dayEvents.slice(0, MAX_VISIBLE_EVENTS);
          const overflow = dayEvents.length - visibleEvents.length;

          return (
            <button
              key={day.toISOString()}
              onClick={() => onDayClick?.(day, dayEvents)}
              className={cn(
                "relative min-h-[90px] rounded-lg border p-1.5 text-right transition hover:border-primary/40 hover:shadow-sm",
                !inMonth && "opacity-40 bg-muted/30",
                isToday && "ring-2 ring-primary border-primary",
                dayEvents.length > 0 && inMonth && "bg-accent/20"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={cn("text-xs font-medium", isToday && "text-primary")}>{format(day, "d")}</span>
                {hasNote && <Icon name="bookmark" size={11} className="text-amber-500" />}
              </div>
              {/* Small event squares with ID */}
              <div className="flex flex-wrap gap-0.5">
                {visibleEvents.map((e) => {
                  const colors = COLOR_CLASSES[e.color];
                  const startD = typeof e.startDate === "string" ? parseISO(e.startDate) : new Date(e.startDate);
                  const endD = typeof e.endDate === "string" ? parseISO(e.endDate) : new Date(e.endDate);
                  const startStr = isValid(startD) ? format(startD, "yyyy/MM/dd") : "—";
                  const endStr = isValid(endD) ? format(endD, "yyyy/MM/dd") : "—";
                  return (
                    <Tooltip key={e.id}>
                      <TooltipTrigger asChild>
                        <span
                          onClick={(ev) => { ev.stopPropagation(); onEventClick?.(e); }}
                          className={cn(
                            "inline-flex items-center justify-center text-[9px] font-bold rounded size-4 leading-none cursor-pointer hover:scale-110 transition",
                            colors.bg, colors.text
                          )}
                        >
                          {e.title.replace("#", "")}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-[200px]">
                        <div className="font-medium">{e.fullTitle}</div>
                        <div className="text-muted-foreground">{startStr} → {endStr}</div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
                {overflow > 0 && (
                  <span className="text-[9px] text-muted-foreground px-1">+{overflow}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
