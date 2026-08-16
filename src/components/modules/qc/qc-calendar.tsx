"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/shared";
import { ReusableCalendar, type CalendarEvent } from "@/components/shared/reusable-calendar";
import { DayDetailModal } from "@/components/shared/day-detail-modal";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { useQcReportDetail } from "@/lib/use-qc-report-detail";
import type { QcReport } from "./qc-report-detail";

// ─── Module meta (for color coding events) ────────────────────────────
const MODULE_COLOR: Record<string, CalendarEvent["color"]> = {
  designer: "blue",
  print: "yellow",
  warehouse: "green",
};

const MODULE_LABEL: Record<string, string> = {
  designer: "طراح",
  print: "چاپ",
  warehouse: "انبار",
};

const MODULE_ICON: Record<string, IconName> = {
  designer: "design",
  print: "print",
  warehouse: "warehouse",
};

const STATUS_DOT: Record<string, string> = {
  pending: "bg-slate-400",
  reviewing: "bg-amber-500",
  approved: "bg-emerald-500",
  rejected: "bg-rose-500",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "در انتظار",
  reviewing: "در حال بررسی",
  approved: "تأیید شده",
  rejected: "رد شده",
};

// ─── Helpers ──────────────────────────────────────────────────────────
function toReportEvents(reports: QcReport[]): CalendarEvent[] {
  return reports.map((r) => {
    const color = MODULE_COLOR[r.fromModule] ?? "blue";
    return {
      id: r.id,
      title: `#${r.order?.number ?? "؟"}`,
      fullTitle: `گزارش از ${MODULE_LABEL[r.fromModule] ?? r.fromModule} — #${r.order?.number ?? "؟"} (${r.order?.customer?.name ?? "—"})`,
      startDate: r.createdAt,
      endDate: r.createdAt,
      color,
      type: "order",
      meta: { reportId: r.id },
    };
  });
}

// ─── Component ────────────────────────────────────────────────────────
export function QcCalendar() {
  const { openReport, modal } = useQcReportDetail();
  const [dayModal, setDayModal] = React.useState<{
    date: Date;
    events: CalendarEvent[];
  } | null>(null);
  const [filters, setFilters] = React.useState({
    designer: true,
    print: true,
    warehouse: true,
  });

  // Fetch all QC reports
  const { data } = useQuery({
    queryKey: ["qc-reports", "calendar"],
    queryFn: () => api<{ reports: QcReport[] }>("/api/qc-reports"),
    refetchInterval: 30000,
  });

  const reports = data?.reports ?? [];

  const allEvents = React.useMemo(() => {
    let ev = toReportEvents(reports);
    if (!filters.designer) ev = ev.filter((e) => e.color !== "blue");
    if (!filters.print) ev = ev.filter((e) => e.color !== "yellow");
    if (!filters.warehouse) ev = ev.filter((e) => e.color !== "green");
    return ev;
  }, [reports, filters]);

  const filterButtons = [
    {
      id: "designer",
      label: "طراح",
      active: filters.designer,
      onToggle: () => setFilters((f) => ({ ...f, designer: !f.designer })),
    },
    {
      id: "print",
      label: "چاپ",
      active: filters.print,
      onToggle: () => setFilters((f) => ({ ...f, print: !f.print })),
    },
    {
      id: "warehouse",
      label: "انبار",
      active: filters.warehouse,
      onToggle: () => setFilters((f) => ({ ...f, warehouse: !f.warehouse })),
    },
  ];

  function handleEventClick(e: CalendarEvent) {
    if (e.meta?.reportId) {
      openReport(e.meta.reportId as string);
    }
  }

  // Group reports by date for the side list
  const recentByDate = React.useMemo(() => {
    return [...reports]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8);
  }, [reports]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="تقویم کنترل کیفیت"
        description="نمای تقویمی گزارشات کنترل کیفیت بر اساس تاریخ دریافت"
        icon="calendar"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <ReusableCalendar
            events={allEvents}
            onDayClick={(date, evts) =>
              evts.length > 0 && setDayModal({ date, events: evts })
            }
            onEventClick={handleEventClick}
            filters={filterButtons}
          />
        </div>

        {/* Side list: recent reports by date */}
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center gap-2">
            <Icon name="checkList" size={18} className="text-primary" />
            <h3 className="font-semibold text-sm">آخرین گزارشات</h3>
            <span className="text-[11px] text-muted-foreground">({reports.length})</span>
          </div>
          {recentByDate.length === 0 ? (
            <EmptyState
              icon="checkCircle"
              title="گزارشی وجود ندارد"
              description="هنوز گزارشی دریافت نشده است"
            />
          ) : (
            <div className="divide-y max-h-[520px] overflow-y-auto scrollbar-thin">
              {recentByDate.map((r) => {
                const icon = MODULE_ICON[r.fromModule] ?? "shield";
                const dot = STATUS_DOT[r.status] ?? "bg-muted";
                return (
                  <button
                    key={r.id}
                    onClick={() => openReport(r.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-accent/40 transition text-right"
                  >
                    <div className="relative shrink-0">
                      <div className="size-9 rounded-lg bg-muted grid place-items-center">
                        <Icon name={icon} size={16} className="text-muted-foreground" />
                      </div>
                      <span
                        className={cn(
                          "absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card",
                          dot
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs">
                          #{r.order?.number ?? "—"}
                        </span>
                        <span className="font-medium text-sm truncate">
                          {r.order?.customer?.name ?? "—"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {MODULE_LABEL[r.fromModule] ?? r.fromModule} •{" "}
                        {STATUS_LABEL[r.status] ?? r.status}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {formatDate(r.createdAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Day detail modal */}
      <DayDetailModal
        date={dayModal?.date ?? null}
        events={dayModal?.events ?? []}
        open={!!dayModal}
        onOpenChange={(v) => !v && setDayModal(null)}
        onEventClick={(e) => {
          if (e.meta?.reportId) {
            setDayModal(null);
            openReport(e.meta.reportId as string);
          }
        }}
      />

      {modal}
    </div>
  );
}
