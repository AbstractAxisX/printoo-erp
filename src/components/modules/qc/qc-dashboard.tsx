"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { PageHeader, EmptyState } from "@/components/shared";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { useQcReportDetail } from "@/lib/use-qc-report-detail";
import type { QcReport } from "./qc-report-detail";

// ─── Module & status meta ─────────────────────────────────────────────
const MODULE_META: Record<
  string,
  { label: string; icon: IconName; color: string; bar: string }
> = {
  designer: {
    label: "طراح",
    icon: "design",
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    bar: "bg-violet-500",
  },
  print: {
    label: "چاپ",
    icon: "print",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
  },
  warehouse: {
    label: "انبار",
    icon: "warehouse",
    color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    bar: "bg-cyan-500",
  },
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  reviewing: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "در انتظار",
  reviewing: "در حال بررسی",
  approved: "تأیید شده",
  rejected: "رد شده",
};

// ─── KPI Card ─────────────────────────────────────────────────────────
type KpiCardProps = {
  icon: IconName;
  label: string;
  value: number;
  hint?: string;
  color: "amber" | "emerald" | "rose" | "violet";
  onClick?: () => void;
};

const KPI_COLOR_MAP: Record<
  KpiCardProps["color"],
  { bg: string; text: string; ring: string }
> = {
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/20",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/20",
  },
  rose: {
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    ring: "ring-rose-500/20",
  },
  violet: {
    bg: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
    ring: "ring-violet-500/20",
  },
};

function KpiCard({ icon, label, value, hint, color, onClick }: KpiCardProps) {
  const c = KPI_COLOR_MAP[color];
  return (
    <Card
      className={cn(
        "p-4 ring-1 transition",
        c.ring,
        onClick && "cursor-pointer hover:shadow-md hover:scale-[1.01]"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className={cn("size-10 rounded-lg grid place-items-center", c.bg, c.text)}>
          <Icon name={icon} size={20} />
        </div>
        <span className="text-3xl font-bold tabular-nums">{value}</span>
      </div>
      <div className="mt-2">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
    </Card>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────
export function QcDashboard() {
  const navigate = useAppStore((s) => s.navigate);
  const { openReport, modal } = useQcReportDetail();

  // Fetch all QC reports
  const { data, isLoading } = useQuery({
    queryKey: ["qc-reports", "dashboard"],
    queryFn: () => api<{ reports: QcReport[] }>("/api/qc-reports"),
    refetchInterval: 30000,
  });

  const reports = data?.reports ?? [];

  // KPI computations
  const pendingCount = reports.filter((r) => r.status === "pending").length;
  const reviewingCount = reports.filter((r) => r.status === "reviewing").length;
  const approvedCount = reports.filter((r) => r.status === "approved").length;
  const rejectedCount = reports.filter((r) => r.status === "rejected").length;

  // Module breakdown
  const moduleBreakdown = React.useMemo(() => {
    const map: Record<string, number> = {
      designer: 0,
      print: 0,
      warehouse: 0,
    };
    for (const r of reports) {
      if (map[r.fromModule] !== undefined) map[r.fromModule]++;
      else map[r.fromModule] = (map[r.fromModule] ?? 0) + 1;
    }
    return map;
  }, [reports]);

  const totalReports = reports.length || 1; // avoid divide by zero

  // Recent reports (compact list, top 6)
  const recentReports = reports.slice(0, 6);

  return (
    <div className="space-y-5">
      <PageHeader
        title="داشبورد کنترل کیفیت"
        description="نمای کلی گزارشات دریافتی از ماژول‌های طراح، چاپ و انبار"
        icon="shield"
        actions={
          <Button onClick={() => navigate("qc", "reports")} className="gap-2">
            <Icon name="checkList" size={16} /> همه گزارشات
          </Button>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon="clock"
          label="گزارشات در انتظار"
          value={pendingCount}
          hint="نیازمند بررسی کنترل کیفیت"
          color="amber"
          onClick={() => navigate("qc", "reports")}
        />
        <KpiCard
          icon="eye"
          label="در حال بررسی"
          value={reviewingCount}
          hint="در فرآیند بررسی"
          color="violet"
          onClick={() => navigate("qc", "reports")}
        />
        <KpiCard
          icon="checkCircle"
          label="تأیید شده"
          value={approvedCount}
          hint="گزارشات تأیید شده"
          color="emerald"
          onClick={() => navigate("qc", "reports")}
        />
        <KpiCard
          icon="cancel"
          label="رد شده"
          value={rejectedCount}
          hint="گزارشات رد شده"
          color="rose"
          onClick={() => navigate("qc", "reports")}
        />
      </div>

      {/* Two-column layout: recent reports + module breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent reports (compact list) */}
        <Card className="p-0 overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Icon name="checkList" size={18} className="text-primary" />
              <h3 className="font-semibold text-sm">گزارشات اخیر</h3>
              <span className="text-[11px] text-muted-foreground">
                ({reports.length})
              </span>
            </div>
            <button
              onClick={() => navigate("qc", "reports")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              مشاهده همه <Icon name="arrowLeft" size={12} />
            </button>
          </div>
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Icon name="loading" size={16} className="animate-spin" />
              در حال بارگذاری...
            </div>
          ) : recentReports.length === 0 ? (
            <EmptyState
              icon="checkCircle"
              title="گزارشی وجود ندارد"
              description="هنوز گزارشی از ماژول‌ها دریافت نشده است"
            />
          ) : (
            <div className="divide-y max-h-[420px] overflow-y-auto scrollbar-thin">
              {recentReports.map((r) => {
                const meta =
                  MODULE_META[r.fromModule] ?? {
                    label: r.fromModule,
                    icon: "shield" as IconName,
                    color: "bg-muted text-muted-foreground",
                    bar: "bg-muted",
                  };
                return (
                  <button
                    key={r.id}
                    onClick={() => openReport(r.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-accent/40 transition text-right"
                  >
                    <div
                      className={cn(
                        "size-10 rounded-lg grid place-items-center shrink-0",
                        meta.color
                      )}
                    >
                      <Icon name={meta.icon} size={18} />
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
                        {r.description}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={cn(
                          "text-[11px] font-medium px-1.5 py-0.5 rounded-full",
                          STATUS_BADGE[r.status] ??
                            "bg-muted text-muted-foreground"
                        )}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {formatDate(r.createdAt)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Module breakdown */}
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center gap-2">
            <Icon name="grid" size={18} className="text-primary" />
            <h3 className="font-semibold text-sm">گزارشات بر اساس ماژول</h3>
          </div>
          <div className="p-5 space-y-4">
            {Object.entries(MODULE_META).map(([key, meta]) => {
              const count = moduleBreakdown[key] ?? 0;
              const pct = Math.round((count / totalReports) * 100);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "size-7 rounded-md grid place-items-center",
                          meta.color
                        )}
                      >
                        <Icon name={meta.icon} size={14} />
                      </div>
                      <span className="text-sm font-medium">{meta.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {pct}%
                      </span>
                      <span className="text-sm font-bold tabular-nums">
                        {count}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", meta.bar)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {/* Total at the bottom */}
            <div className="pt-3 border-t flex items-center justify-between">
              <span className="text-xs text-muted-foreground">مجموع گزارشات</span>
              <span className="text-lg font-bold tabular-nums">
                {reports.length}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {modal}
    </div>
  );
}
