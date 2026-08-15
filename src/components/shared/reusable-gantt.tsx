"use client";

import * as React from "react";
import { Gantt, ViewMode, type Task as GanttTask } from "gantt-task-react";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import type { CalendarEvent } from "./reusable-calendar";

type ReusableGanttProps = {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  className?: string;
  title?: string;
  emptyMessage?: string;
};

// Color mapping for event types
const COLOR_STYLES: Record<CalendarEvent["color"], { bg: string; bgSelected: string; progress: string }> = {
  blue: { bg: "#3b82f6", bgSelected: "#2563eb", progress: "#1d4ed8" },
  yellow: { bg: "#f59e0b", bgSelected: "#d97706", progress: "#b45309" },
  green: { bg: "#10b981", bgSelected: "#059669", progress: "#047857" },
  red: { bg: "#f43f5e", bgSelected: "#e11d48", progress: "#be123c" },
};

export function ReusableGantt({ events, onEventClick, className, title, emptyMessage = "رویدادی برای نمایش نیست" }: ReusableGanttProps) {
  const [viewMode, setViewMode] = React.useState<ViewMode>(ViewMode.Day);
  const [viewDate, setViewDate] = React.useState(new Date());
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(1000);

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

  // Convert events to Gantt tasks
  const ganttTasks: GanttTask[] = React.useMemo(() => {
    return events.map((e) => {
      const start = typeof e.startDate === "string" ? parseISO(e.startDate) : e.startDate;
      const end = typeof e.endDate === "string" ? parseISO(e.endDate) : e.endDate;
      // Ensure end is at least same day as start
      const safeEnd = end < start ? addDays(start, 1) : end;
      const styles = COLOR_STYLES[e.color];
      return {
        id: e.id,
        type: "task" as const,
        name: e.title,
        start,
        end: safeEnd,
        progress: 0,
        styles: {
          backgroundColor: styles.bg,
          backgroundSelectedColor: styles.bgSelected,
          progressColor: styles.progress,
          progressSelectedColor: styles.progress,
        },
        isDisabled: false,
        displayOrder: events.indexOf(e),
      };
    });
  }, [events]);

  // Event → meta map for click handling
  const eventMap = React.useMemo(() => {
    const m = new Map<string, CalendarEvent>();
    for (const e of events) m.set(e.id, e);
    return m;
  }, [events]);

  function handleSelect(task: GanttTask, isSelected: boolean) {
    if (isSelected) {
      const event = eventMap.get(task.id);
      if (event) onEventClick?.(event);
    }
  }

  function navigateView(direction: "prev" | "next") {
    const days = viewMode === ViewMode.Day ? 14 : viewMode === ViewMode.Week ? 28 : 90;
    setViewDate((d) => addDays(d, direction === "next" ? days : -days));
  }

  if (events.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16 text-muted-foreground", className)}>
        <Icon name="chart" size={32} className="opacity-30 mb-2" />
        <span className="text-sm">{emptyMessage}</span>
      </div>
    );
  }

  const viewModeOptions: { mode: ViewMode; label: string }[] = [
    { mode: ViewMode.Day, label: "روزانه" },
    { mode: ViewMode.Week, label: "هفتگی" },
    { mode: ViewMode.Month, label: "ماهانه" },
  ];

  return (
    <div ref={containerRef} className={cn("rounded-xl border bg-card overflow-hidden", className)}>
      {title && <div className="px-4 py-2.5 border-b text-sm font-medium">{title}</div>}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b bg-muted/20">
        {/* View navigation */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8" onClick={() => navigateView("prev")} title="قبلی">
            <Icon name="chevronRight" size={14} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setViewDate(new Date())} className="text-xs">امروز</Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => navigateView("next")} title="بعدی">
            <Icon name="chevronLeft" size={14} />
          </Button>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center rounded-lg border p-0.5">
          {viewModeOptions.map((opt) => (
            <button
              key={opt.mode}
              onClick={() => setViewMode(opt.mode)}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-medium transition",
                viewMode === opt.mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mr-auto text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-blue-500" /> سفارش عادی</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-amber-500" /> سفارش فوری</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-emerald-500" /> تسک عادی</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-rose-500" /> تسک فوری</span>
        </div>
      </div>

      {/* Gantt chart — fits within container width */}
      <div style={{ maxWidth: containerWidth - 2, overflow: "hidden" }}>
        <Gantt
          tasks={ganttTasks}
          viewMode={viewMode}
          viewDate={viewDate}
          onSelect={handleSelect}
          onClick={(task) => {
            const event = eventMap.get(task.id);
            if (event) onEventClick?.(event);
          }}
          listCellWidth="155px"
          rowHeight={42}
          headerHeight={56}
          barCornerRadius={4}
          fontFamily="var(--font-vazirmatn), Tahoma, sans-serif"
          fontSize="12px"
          rtl
          locale="fa"
          todayColor="rgba(16, 185, 129, 0.15)"
          viewListCellWidth="155px"
        />
      </div>
    </div>
  );
}
