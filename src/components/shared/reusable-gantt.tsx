"use client";

import * as React from "react";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { addDays, differenceInCalendarDays, format, parseISO, isSameDay, startOfWeek, addWeeks, subWeeks, addMonths, subMonths } from "date-fns";
import type { CalendarEvent } from "./reusable-calendar";

type ReusableGanttProps = {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  className?: string;
  title?: string;
  emptyMessage?: string;
};

// Vibrant color palette matching the reference image
const BAR_COLORS: Record<CalendarEvent["color"], { bg: string; bgHover: string; text: string }> = {
  blue: { bg: "#2979FF", bgHover: "#1a6fff", text: "#ffffff" },
  yellow: { bg: "#FFB300", bgHover: "#ffa500", text: "#1a1a1a" },
  green: { bg: "#00BFA5", bgHover: "#00a890", text: "#ffffff" },
  red: { bg: "#F44336", bgHover: "#e53935", text: "#ffffff" },
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

type ValidEvent = CalendarEvent & { _start: Date; _end: Date; _duration: number };

export function ReusableGantt({ events, onEventClick, className, title, emptyMessage = "رویدادی برای نمایش نیست" }: ReusableGanttProps) {
  const [viewMode, setViewMode] = React.useState<"day" | "week" | "month">("day");
  const [viewStart, setViewStart] = React.useState(() => {
    const now = new Date();
    return addDays(now, -7); // start 7 days ago
  });

  // Filter and validate events
  const validEvents: ValidEvent[] = React.useMemo(() => {
    return events
      .map((e) => {
        const start = safeDate(e.startDate);
        const end = safeDate(e.endDate);
        if (!start || !end) return null;
        const safeEnd = end < start ? addDays(start, 1) : end;
        return { ...e, _start: start, _end: safeEnd, _duration: Math.max(1, differenceInCalendarDays(safeEnd, start) + 1) };
      })
      .filter((e): e is ValidEvent => e !== null)
      .sort((a, b) => a._start.getTime() - b._start.getTime());
  }, [events]);

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

  // Calculate visible date range
  const daysToShow = viewMode === "day" ? 21 : viewMode === "week" ? 49 : 90;
  const dayWidth = viewMode === "day" ? 48 : viewMode === "week" ? 22 : 12;
  const leftPanelWidth = 220;
  const timelineWidth = daysToShow * dayWidth;

  // Generate days
  const days: Date[] = [];
  for (let i = 0; i < daysToShow; i++) {
    const d = addDays(viewStart, i);
    days.push(d);
  }
  const todayIndex = days.findIndex((d) => isSameDay(d, new Date()));

  function navigate(dir: "prev" | "next") {
    const step = viewMode === "day" ? 7 : viewMode === "week" ? 14 : 30;
    setViewStart((d) => addDays(d, dir === "next" ? step : -step));
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("rounded-xl border bg-card overflow-hidden shadow-sm", className)}>
        {title && <div className="px-4 py-3 border-b text-sm font-semibold flex items-center gap-2"><Icon name="chart" size={16} className="text-primary" /> {title}</div>}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
          <div className="flex items-center gap-1">
            <button onClick={() => navigate("prev")} className="size-7 rounded-lg border grid place-items-center hover:bg-accent transition" title="قبلی">
              <Icon name="chevronRight" size={14} />
            </button>
            <button onClick={() => setViewStart(addDays(new Date(), -7))} className="px-3 py-1 rounded-lg border text-xs hover:bg-accent transition">امروز</button>
            <button onClick={() => navigate("next")} className="size-7 rounded-lg border grid place-items-center hover:bg-accent transition" title="بعدی">
              <Icon name="chevronLeft" size={14} />
            </button>
          </div>

          <div className="flex items-center rounded-lg border p-0.5">
            {([["day", "روزانه"], ["week", "هفتگی"], ["month", "ماهانه"]] as const).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn("px-2.5 py-1 rounded text-xs font-medium transition", viewMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 mr-auto text-[11px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><span className="size-3 rounded-full" style={{ backgroundColor: BAR_COLORS.blue.bg }} /> سفارش عادی</span>
            <span className="flex items-center gap-1"><span className="size-3 rounded-full" style={{ backgroundColor: BAR_COLORS.yellow.bg }} /> سفارش فوری</span>
            <span className="flex items-center gap-1"><span className="size-3 rounded-full" style={{ backgroundColor: BAR_COLORS.green.bg }} /> تسک عادی</span>
            <span className="flex items-center gap-1"><span className="size-3 rounded-full" style={{ backgroundColor: BAR_COLORS.red.bg }} /> تسک فوری</span>
          </div>
        </div>

        {/* Gantt body */}
        <div className="flex overflow-hidden" style={{ maxHeight: "500px" }}>
          {/* Left panel — task names */}
          <div className="shrink-0 border-l bg-muted/20 overflow-y-auto scrollbar-thin" style={{ width: leftPanelWidth }}>
            <div className="h-14 border-b px-3 flex items-center text-xs font-semibold text-muted-foreground sticky top-0 bg-muted/30 z-10">
              نام رویداد
            </div>
            {validEvents.map((e) => (
              <div key={e.id} className="h-12 border-b px-3 flex items-center gap-2 hover:bg-accent/40 transition cursor-pointer" onClick={() => onEventClick?.(eventMap.get(e.id) ?? e)}>
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: BAR_COLORS[e.color].bg }} />
                <span className="text-xs truncate flex-1">{e.fullTitle}</span>
              </div>
            ))}
          </div>

          {/* Right panel — timeline */}
          <div className="flex-1 min-w-0 overflow-x-auto scrollbar-thin">
            {/* Date header */}
            <div className="flex h-14 border-b bg-muted/30 sticky top-0 z-10" style={{ width: timelineWidth, minWidth: "100%" }}>
              {days.map((d, i) => {
                const isToday = isSameDay(d, new Date());
                const isFriday = d.getDay() === 5;
                return (
                  <div
                    key={i}
                    className={cn("border-l flex flex-col items-center justify-center text-[10px] shrink-0", isFriday && "bg-rose-50/50 dark:bg-rose-950/10", isToday && "bg-primary/10")}
                    style={{ width: dayWidth }}
                  >
                    <span className={cn("font-medium", isToday ? "text-primary" : "text-muted-foreground")}>{format(d, "d")}</span>
                    {dayWidth >= 20 && <span className="opacity-50 text-[9px] text-muted-foreground">{format(d, "EEE")}</span>}
                    {isToday && <span className="text-[8px] text-primary font-bold mt-0.5">امروز</span>}
                  </div>
                );
              })}
            </div>

            {/* Bars area */}
            <div className="relative" style={{ width: timelineWidth, minWidth: "100%" }}>
              {/* Vertical gridlines */}
              {days.map((d, i) => (
                <div
                  key={i}
                  className={cn("absolute top-0 bottom-0 border-l border-border/20", d.getDay() === 5 && "bg-rose-50/20 dark:bg-rose-950/5")}
                  style={{ left: i * dayWidth, width: dayWidth }}
                />
              ))}

              {/* Today line */}
              {todayIndex >= 0 && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none" style={{ left: todayIndex * dayWidth + dayWidth / 2 }}>
                  <div className="absolute -top-0 -translate-x-1/2 size-2.5 rounded-full bg-primary shadow-sm" />
                </div>
              )}

              {/* Bars */}
              {validEvents.map((e, idx) => {
                const startOffset = differenceInCalendarDays(e._start, viewStart);
                // Skip if completely out of view
                if (startOffset + e._duration < 0 || startOffset > daysToShow) {
                  return <div key={e.id} className="h-12 border-b" />;
                }
                const clampedStart = Math.max(0, startOffset);
                const clampedEnd = Math.min(daysToShow, startOffset + e._duration);
                const left = clampedStart * dayWidth;
                const width = Math.max(dayWidth - 4, (clampedEnd - clampedStart) * dayWidth - 4);
                const colors = BAR_COLORS[e.color];
                const daysLeft = differenceInCalendarDays(e._end, new Date());

                return (
                  <div key={e.id} className="h-12 border-b relative">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          onClick={() => onEventClick?.(eventMap.get(e.id) ?? e)}
                          className="absolute top-1.5 h-9 rounded-full flex items-center justify-between px-3 cursor-pointer transition-all hover:shadow-md group"
                          style={{
                            left: left + 2,
                            width: width,
                            backgroundColor: colors.bg,
                            color: colors.text,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                          }}
                        >
                          {/* Left: ID badge */}
                          <span className="text-xs font-bold truncate flex items-center gap-1.5">
                            {e.type === "order" && <Icon name="orders" size={11} />}
                            {e.type === "task" && <Icon name="task" size={11} />}
                            <span className="truncate">{e.title}</span>
                          </span>
                          {/* Right: days remaining or duration */}
                          {width > 80 && (
                            <span className="text-[10px] font-medium opacity-90 shrink-0 flex items-center gap-1">
                              {e._duration} روز
                              {daysLeft >= 0 && daysLeft <= 3 && <Icon name="clock" size={10} />}
                              {daysLeft < 0 && <Icon name="alertTriangle" size={10} />}
                            </span>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-[280px] z-50">
                        <div className="font-semibold">{e.fullTitle}</div>
                        <div className="text-muted-foreground mt-0.5">{format(e._start, "yyyy/MM/dd")} → {format(e._end, "yyyy/MM/dd")}</div>
                        <div className="text-muted-foreground">مدت: {e._duration} روز</div>
                        {daysLeft > 0 && <div className="text-emerald-600 mt-0.5">{daysLeft} روز باقی‌مانده</div>}
                        {daysLeft === 0 && <div className="text-amber-600 mt-0.5">موعد امروز</div>}
                        {daysLeft < 0 && <div className="text-rose-600 mt-0.5">{Math.abs(daysLeft)} روز گذشته</div>}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sync scroll: left panel + timeline scroll together */}
        <SyncScroll />
      </div>
    </TooltipProvider>
  );
}

// Helper to sync scroll between left panel and timeline
function SyncScroll() {
  React.useEffect(() => {
    const containers = document.querySelectorAll(".gantt-scroll-sync");
    const handler = (e: Event) => {
      const target = e.currentTarget as HTMLElement;
      containers.forEach((c) => {
        if (c !== target) c.scrollTop = target.scrollTop;
      });
    };
    containers.forEach((c) => c.addEventListener("scroll", handler));
    return () => containers.forEach((c) => c.removeEventListener("scroll", handler));
  }, []);
  return null;
}
