"use client";

import * as React from "react";
import { differenceInCalendarDays, parseISO, format, isWithinInterval, isSameDay } from "date-fns";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
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

export function ReusableGantt({ events, onEventClick, className, title, emptyMessage = "رویدادی برای نمایش نیست" }: ReusableGanttProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(800);

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

  // Calculate date range from events
  const { timelineStart, totalDays, dayWidth, leftPanelWidth } = React.useMemo(() => {
    if (events.length === 0) {
      const now = new Date();
      return { timelineStart: now, totalDays: 30, dayWidth: 30, leftPanelWidth: 200 };
    }
    const dates: Date[] = [];
    for (const e of events) {
      dates.push(typeof e.startDate === "string" ? parseISO(e.startDate) : e.startDate);
      dates.push(typeof e.endDate === "string" ? parseISO(e.endDate) : e.endDate);
    }
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    // Add 1 day padding on each side
    minDate.setDate(minDate.getDate() - 1);
    maxDate.setDate(maxDate.getDate() + 1);
    const days = differenceInCalendarDays(maxDate, minDate) + 1;
    const leftW = 200;
    const availableWidth = Math.max(300, containerWidth - leftW - 20);
    const dw = Math.max(8, Math.min(40, Math.floor(availableWidth / days)));
    return { timelineStart: minDate, totalDays: days, dayWidth: dw, leftPanelWidth: leftW };
  }, [events, containerWidth]);

  const days = React.useMemo(() => {
    return Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(timelineStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [timelineStart, totalDays]);

  const todayIndex = React.useMemo(() => {
    return days.findIndex(d => isSameDay(d, new Date()));
  }, [days]);

  if (events.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16 text-muted-foreground", className)}>
        <Icon name="chart" size={32} className="opacity-30 mb-2" />
        <span className="text-sm">{emptyMessage}</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("rounded-xl border bg-card overflow-hidden", className)}>
      {title && <div className="px-4 py-2.5 border-b text-sm font-medium">{title}</div>}
      <div className="flex">
        {/* Left panel: event names */}
        <div className="shrink-0 border-l" style={{ width: leftPanelWidth }}>
          <div className="h-10 border-b px-3 flex items-center text-xs font-medium text-muted-foreground bg-muted/30">نام</div>
          {events.map((e) => (
            <div key={e.id} className="h-10 border-b px-3 flex items-center gap-2 hover:bg-accent/30 transition cursor-pointer" onClick={() => onEventClick?.(e)}>
              <span className={cn("size-2 rounded-full shrink-0", COLOR_BG[e.color])} />
              <span className="text-xs truncate flex-1">{e.fullTitle}</span>
            </div>
          ))}
        </div>

        {/* Right panel: timeline */}
        <div className="flex-1 min-w-0 overflow-hidden relative">
          {/* Day headers */}
          <div className="h-10 border-b flex bg-muted/30" style={{ width: totalDays * dayWidth }}>
            {days.map((d, i) => (
              <div key={i} className="border-l flex flex-col items-center justify-center text-[9px] text-muted-foreground shrink-0" style={{ width: dayWidth }}>
                <span className="font-medium">{format(d, "d")}</span>
                {dayWidth >= 20 && <span className="opacity-60">{format(d, "MMM").slice(0, 3)}</span>}
              </div>
            ))}
          </div>

          {/* Event bars */}
          <div className="relative" style={{ width: totalDays * dayWidth }}>
            {/* Today line */}
            {todayIndex >= 0 && (
              <div className="absolute top-0 bottom-0 w-px bg-rose-500 z-10" style={{ left: todayIndex * dayWidth + dayWidth / 2 }} />
            )}
            {events.map((e, idx) => {
              const start = typeof e.startDate === "string" ? parseISO(e.startDate) : e.startDate;
              const end = typeof e.endDate === "string" ? parseISO(e.endDate) : e.endDate;
              const startOffset = differenceInCalendarDays(start, timelineStart);
              const duration = differenceInCalendarDays(end, start) + 1;
              const left = startOffset * dayWidth;
              const width = Math.max(dayWidth, duration * dayWidth);
              return (
                <Tooltip key={e.id}>
                  <TooltipTrigger asChild>
                    <div
                      onClick={() => onEventClick?.(e)}
                      className={cn("h-7 my-1.5 rounded-md flex items-center justify-center text-[10px] text-white font-medium cursor-pointer hover:opacity-80 transition shrink-0", COLOR_BG[e.color])}
                      style={{ marginLeft: left, width: width - 2, minWidth: dayWidth }}
                    >
                      {width > 30 && <span className="truncate px-1">{e.title}</span>}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[250px]">
                    <div className="font-medium">{e.fullTitle}</div>
                    <div className="text-muted-foreground">{format(start, "yyyy/MM/dd")} → {format(end, "yyyy/MM/dd")}</div>
                    <div className="text-muted-foreground">{duration} روز</div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
