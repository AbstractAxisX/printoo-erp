"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { addDays, differenceInCalendarDays, format, parseISO, isSameDay } from "date-fns";
import type { CalendarEvent } from "./reusable-calendar";

type ReusableGanttProps = {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  className?: string;
  title?: string;
  emptyMessage?: string;
  filters?: { id: string; label: string; active: boolean; onToggle: () => void }[];
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

const ROW_HEIGHT = 48; // h-12 — both left label row and right bar row
const HEADER_HEIGHT = 56; // h-14 sticky date header

export function ReusableGantt({ events, onEventClick, className, title, emptyMessage = "رویدادی برای نمایش نیست", filters }: ReusableGanttProps) {
  const [viewMode, setViewMode] = React.useState<"day" | "week" | "month">("day");
  const [viewStart, setViewStart] = React.useState(() => {
    const now = new Date();
    return addDays(now, -7); // start 7 days ago
  });

  // R15+R16: refs drive the virtualizer AND the bidirectional scroll-sync.
  // The previous SyncScroll component queried a CSS class NOTHING had —
  // it was a complete no-op. Now both panels carry refs, the left panel
  // is the virtualizer's scroll parent, and a single scroll listener
  // mirrors scrollTop to the right panel (and vice-versa).
  const leftRef = React.useRef<HTMLDivElement>(null);
  const rightRef = React.useRef<HTMLDivElement>(null);

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

  // ─── R15: virtualize the rows ──────────────────────────────────────
  // The left panel is the scroll parent; the virtualizer windows rows
  // so 100+ events only render ~10-15 DOM nodes (overscan=8 each side).
  // The right panel mirrors the same virtual window via scroll-sync.
  const rowVirtualizer = useVirtualizer({
    count: validEvents.length,
    getScrollElement: () => leftRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

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

  // R16: bidirectional scroll-sync. When left scrolls, mirror to right;
  // when right scrolls, mirror to left. Plain function (not useCallback)
  // because it reads stable refs only — and it's used as a DOM onScroll
  // handler, so React doesn't need a stable identity for effect deps.
  function onScrollSync(source: "left" | "right") {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
    const from = source === "left" ? left : right;
    const to = source === "left" ? right : left;
    if (from.scrollTop === to.scrollTop) return;
    to.scrollTop = from.scrollTop;
  }

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

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

          {/* Filters */}
          {filters && filters.length > 0 && (
            <div className="flex items-center gap-1.5">
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

          {/* Legend */}
          <div className="flex items-center gap-3 mr-auto text-[11px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><span className="size-3 rounded-full" style={{ backgroundColor: BAR_COLORS.blue.bg }} /> سفارش عادی</span>
            <span className="flex items-center gap-1"><span className="size-3 rounded-full" style={{ backgroundColor: BAR_COLORS.yellow.bg }} /> سفارش فوری</span>
            <span className="flex items-center gap-1"><span className="size-3 rounded-full" style={{ backgroundColor: BAR_COLORS.green.bg }} /> تسک عادی</span>
            <span className="flex items-center gap-1"><span className="size-3 rounded-full" style={{ backgroundColor: BAR_COLORS.red.bg }} /> تسک فوری</span>
          </div>
        </div>

        {/* Gantt body — single outer row, two scroll panels synced */}
        <div className="flex overflow-hidden" style={{ maxHeight: 500 }}>
          {/* Left panel — task names (virtualized; drives the virtualizer) */}
          <div
            ref={leftRef}
            onScroll={() => onScrollSync("left")}
            className="shrink-0 border-l bg-muted/20 overflow-y-auto scrollbar-thin"
            style={{ width: leftPanelWidth }}
          >
            {/* Sticky date-header spacer to align with the right panel's header */}
            <div className="border-b bg-muted/30 sticky top-0 z-10" style={{ height: HEADER_HEIGHT }} />
            {/* Virtualized rows container */}
            <div style={{ height: totalHeight, position: "relative" }}>
              {virtualItems.map((vi) => {
                const e = validEvents[vi.index];
                return (
                  <div
                    key={e.id}
                    className="absolute left-0 right-0 border-b px-3 flex items-center gap-2 hover:bg-accent/40 transition cursor-pointer"
                    style={{ top: vi.start, height: vi.size }}
                    onClick={() => onEventClick?.(e)}
                  >
                    <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: BAR_COLORS[e.color].bg }} />
                    <span className="text-xs truncate flex-1">{e.fullTitle}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right panel — timeline (virtualized; mirrors left scroll) */}
          <div
            ref={rightRef}
            onScroll={() => onScrollSync("right")}
            className="flex-1 min-w-0 overflow-x-auto scrollbar-thin"
          >
            {/* Date header — horizontally scrollable with the bars; sticky top */}
            <div className="flex border-b bg-muted/30 sticky top-0 z-10" style={{ width: timelineWidth, minWidth: "100%", height: HEADER_HEIGHT }}>
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

            {/* Bars area — also horizontally scrollable; virtualized vertically */}
            <div className="relative" style={{ width: timelineWidth, minWidth: "100%", height: totalHeight }}>
              {/* Vertical gridlines (one per day column) */}
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

              {/* Virtualized bars (same window as left panel) */}
              {virtualItems.map((vi) => {
                const e = validEvents[vi.index];
                const startOffset = differenceInCalendarDays(e._start, viewStart);
                // Skip rendering the bar if completely out of view (still reserve the row space)
                if (startOffset + e._duration < 0 || startOffset > daysToShow) {
                  return null; // R15: was an empty <div> — now skipped entirely (virtualizer already reserves the space)
                }
                const clampedStart = Math.max(0, startOffset);
                const clampedEnd = Math.min(daysToShow, startOffset + e._duration);
                const left = clampedStart * dayWidth;
                const width = Math.max(dayWidth - 4, (clampedEnd - clampedStart) * dayWidth - 4);
                const colors = BAR_COLORS[e.color];
                const daysLeft = differenceInCalendarDays(e._end, new Date());

                return (
                  <div key={e.id} className="absolute left-0 right-0 border-b" style={{ top: vi.start, height: vi.size }}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          onClick={() => onEventClick?.(e)}
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
                            {e.type === "report" && <Icon name="alertTriangle" size={11} />}
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
      </div>
    </TooltipProvider>
  );
}
