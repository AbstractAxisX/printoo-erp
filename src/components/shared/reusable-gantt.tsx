"use client";

import * as React from "react";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { addDays, differenceInCalendarDays, format, parseISO, isSameDay } from "date-fns";
import type { CalendarEvent } from "./reusable-calendar";

type ReusableGanttProps = {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  className?: string;
  title?: string;
  emptyMessage?: string;
};

const COLOR_BG: Record<CalendarEvent["color"], string> = {
  blue: "bg-blue-500",
  yellow: "bg-amber-500",
  green: "bg-emerald-500",
  red: "bg-rose-500",
};

const COLOR_TEXT: Record<CalendarEvent["color"], string> = {
  blue: "text-blue-600 dark:text-blue-400",
  yellow: "text-amber-600 dark:text-amber-400",
  green: "text-emerald-600 dark:text-emerald-400",
  red: "text-rose-600 dark:text-rose-400",
};

function safeDate(d: string | Date): Date | null {
  try {
    const date = typeof d === "string" ? parseISO(d) : new Date(d);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

type ValidEvent = CalendarEvent & { _start: Date; _end: Date };

export function ReusableGantt({ events, onEventClick, className, title, emptyMessage = "رویدادی برای نمایش نیست" }: ReusableGanttProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(1000);
  const [zoom, setZoom] = React.useState<"day" | "week">("day");

  React.useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Filter and validate events
  const validEvents: ValidEvent[] = React.useMemo(() => {
    return events
      .map((e) => {
        const start = safeDate(e.startDate);
        const end = safeDate(e.endDate);
        if (!start || !end) return null;
        const safeEnd = end < start ? addDays(start, 1) : end;
        return { ...e, _start: start, _end: safeEnd };
      })
      .filter((e): e is ValidEvent => e !== null);
  }, [events]);

  // Event map for click handling
  const eventMap = React.useMemo(() => {
    const m = new Map<string, CalendarEvent>();
    for (const e of events) m.set(e.id, e);
    return m;
  }, [events]);

  if (validEvents.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16 text-muted-foreground", className)}>
        <Icon name="chart" size={32} className="opacity-30 mb-2" />
        <span className="text-sm">{emptyMessage}</span>
      </div>
    );
  }

  // Calculate timeline range
  const allDates: Date[] = [];
  for (const e of validEvents) {
    allDates.push(e._start);
    allDates.push(e._end);
  }
  const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())));
  // Add 1 day padding on each side
  minDate.setDate(minDate.getDate() - 1);
  maxDate.setDate(maxDate.getDate() + 1);
  const totalDays = Math.max(1, differenceInCalendarDays(maxDate, minDate) + 1);

  // Calculate column width based on container and zoom
  const leftPanelWidth = 200;
  const availableWidth = Math.max(300, containerWidth - leftPanelWidth - 20);
  const dayWidth = zoom === "day" ? Math.max(20, Math.min(40, Math.floor(availableWidth / totalDays))) : Math.max(8, Math.min(20, Math.floor(availableWidth / totalDays)));
  const timelineWidth = totalDays * dayWidth;

  // Generate days array
  const days: Date[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(minDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  const todayIndex = days.findIndex((d) => isSameDay(d, new Date()));

  return (
    <TooltipProvider delayDuration={300}>
      <div ref={containerRef} className={cn("rounded-xl border bg-card overflow-hidden", className)}>
        {title && <div className="px-4 py-2.5 border-b text-sm font-medium">{title}</div>}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b bg-muted/20">
          <div className="flex items-center rounded-lg border p-0.5">
            <button
              onClick={() => setZoom("day")}
              className={cn("px-2.5 py-1 rounded text-xs font-medium transition", zoom === "day" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              روزانه
            </button>
            <button
              onClick={() => setZoom("week")}
              className={cn("px-2.5 py-1 rounded text-xs font-medium transition", zoom === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              هفتگی
            </button>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 mr-auto text-[11px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-blue-500" /> سفارش عادی</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-amber-500" /> سفارش فوری</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-emerald-500" /> تسک عادی</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-rose-500" /> تسک فوری</span>
          </div>
        </div>

        {/* Gantt body */}
        <div className="flex overflow-hidden">
          {/* Left panel: event names */}
          <div className="shrink-0 border-l bg-muted/10" style={{ width: leftPanelWidth }}>
            <div className="h-10 border-b px-3 flex items-center text-xs font-medium text-muted-foreground bg-muted/30 sticky top-0 z-10">
              نام رویداد
            </div>
            {validEvents.map((e) => (
              <div
                key={e.id}
                className="h-10 border-b px-3 flex items-center gap-2 hover:bg-accent/30 transition cursor-pointer"
                onClick={() => onEventClick?.(eventMap.get(e.id) ?? e)}
              >
                <span className={cn("size-2 rounded-full shrink-0", COLOR_BG[e.color])} />
                <span className="text-xs truncate flex-1">{e.fullTitle}</span>
                <span className={cn("text-[10px] shrink-0", COLOR_TEXT[e.color])}>{e.title}</span>
              </div>
            ))}
          </div>

          {/* Right panel: timeline — scrollable horizontally */}
          <div className="flex-1 min-w-0 overflow-x-auto scrollbar-thin">
            {/* Day headers */}
            <div className="flex h-10 border-b bg-muted/30 sticky top-0 z-10" style={{ width: timelineWidth, minWidth: "100%" }}>
              {days.map((d, i) => {
                const isToday = isSameDay(d, new Date());
                const isFriday = d.getDay() === 5;
                return (
                  <div
                    key={i}
                    className={cn(
                      "border-l flex flex-col items-center justify-center text-[9px] text-muted-foreground shrink-0",
                      isFriday && "bg-rose-50/50 dark:bg-rose-950/10",
                      isToday && "bg-primary/10 text-primary font-bold"
                    )}
                    style={{ width: dayWidth }}
                  >
                    <span className={cn(isToday && "text-primary")}>{format(d, "d")}</span>
                    {dayWidth >= 20 && <span className="opacity-60 text-[8px]">{format(d, "MMM")}</span>}
                  </div>
                );
              })}
            </div>

            {/* Event bars */}
            <div className="relative" style={{ width: timelineWidth, minWidth: "100%" }}>
              {/* Today line */}
              {todayIndex >= 0 && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-rose-500 z-10 pointer-events-none"
                  style={{ left: todayIndex * dayWidth + dayWidth / 2 }}
                >
                  <div className="absolute -top-0 -translate-x-1/2 size-2 rounded-full bg-rose-500" />
                </div>
              )}

              {/* Vertical gridlines */}
              {days.map((d, i) => (
                <div
                  key={i}
                  className={cn("absolute top-0 bottom-0 border-l border-border/30", d.getDay() === 5 && "bg-rose-50/30 dark:bg-rose-950/5")}
                  style={{ left: i * dayWidth, width: dayWidth }}
                />
              ))}

              {/* Bars */}
              {validEvents.map((e) => {
                const startOffset = differenceInCalendarDays(e._start, minDate);
                const duration = Math.max(1, differenceInCalendarDays(e._end, e._start) + 1);
                const left = startOffset * dayWidth;
                const width = Math.max(dayWidth, duration * dayWidth - 2);
                return (
                  <Tooltip key={e.id}>
                    <TooltipTrigger asChild>
                      <div
                        onClick={() => onEventClick?.(eventMap.get(e.id) ?? e)}
                        className={cn(
                          "h-7 my-1.5 rounded-md flex items-center justify-center text-[10px] text-white font-medium cursor-pointer hover:opacity-80 transition shrink-0 relative z-20",
                          COLOR_BG[e.color]
                        )}
                        style={{ marginLeft: left, width: width }}
                      >
                        {width > 30 && <span className="truncate px-2">{e.title}</span>}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs max-w-[250px] z-50">
                      <div className="font-medium">{e.fullTitle}</div>
                      <div className="text-muted-foreground">{format(e._start, "yyyy/MM/dd")} → {format(e._end, "yyyy/MM/dd")}</div>
                      <div className="text-muted-foreground">{duration} روز</div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
