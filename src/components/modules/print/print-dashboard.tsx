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
import { formatDate, daysRemaining } from "@/lib/format";
import { usePrintOrderDetail } from "@/lib/use-print-order-detail";

// ─── Types ────────────────────────────────────────────────────────────
type PrintOrder = {
  id: string;
  number: number;
  status: string;
  priority: string;
  createdAt: string;
  customer: { name: string };
  items: {
    id: string;
    product: { name: string };
    stage: string;
    needsMaterial: boolean;
    materialConfirmed: boolean;
    printStartDate: string | null;
    printEndDate: string | null;
  }[];
};

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  module: string;
  createdAt: string;
};

// ─── Time-filter semantics (shared with print orders page) ──────────
export type TimeFilter = "all" | "overdue" | "today" | "near";

/** موعد مؤثر = نزدیک‌ترین موعد چاپِ آیتم‌های فعال به امروز */
export function effectivePrintDeadline(o: PrintOrder): string | null {
  const active = (o.items ?? []).filter((i) => i.stage === "print");
  const dates = (active.length > 0 ? active : (o.items ?? []))
    .map((i) => i.printEndDate)
    .filter((d): d is string => !!d);
  if (dates.length === 0) return null;
  const now = Date.now();
  const times = dates
    .map((d) => new Date(d).getTime())
    .filter((t) => Number.isFinite(t));
  if (times.length === 0) return null;
  const nearest = times.reduce((a, b) => (Math.abs(b - now) < Math.abs(a - now) ? b : a));
  return new Date(nearest).toISOString();
}

export function orderTimeState(o: PrintOrder): "overdue" | "today" | "near" | "later" | "none" {
  const end = effectivePrintDeadline(o);
  if (!end) return "none";
  const dr = daysRemaining(end);
  if (dr.status === "overdue") return "overdue";
  if (dr.status === "today") return "today";
  if (dr.status === "remaining" && dr.days <= 2) return "near";
  return "later";
}

export function matchesTimeFilter(o: PrintOrder, f: TimeFilter): boolean {
  if (f === "all") return true;
  return orderTimeState(o) === f;
}

// ─── Helpers ──────────────────────────────────────────────────────────
/** Order needs material if ANY item has needsMaterial=true AND materialConfirmed=false */
function needsMaterial(o: PrintOrder): boolean {
  return (o.items ?? []).some((it) => it.needsMaterial && !it.materialConfirmed);
}

function isReadyForPrint(o: PrintOrder): boolean {
  return !needsMaterial(o);
}

// ─── KPI Card ─────────────────────────────────────────────────────────
type KpiCardProps = {
  icon: IconName;
  label: string;
  value: number;
  hint?: string;
  color: "amber" | "rose" | "emerald" | "violet";
  onClick?: () => void;
};

const KPI_COLOR_MAP: Record<
  KpiCardProps["color"],
  { bg: string; text: string; ring: string; hoverRing: string }
> = {
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/20",
    hoverRing: "hover:ring-amber-500/50",
  },
  rose: {
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    ring: "ring-rose-500/20",
    hoverRing: "hover:ring-rose-500/50",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/20",
    hoverRing: "hover:ring-emerald-500/50",
  },
  violet: {
    bg: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
    ring: "ring-violet-500/20",
    hoverRing: "hover:ring-violet-500/50",
  },
};

function KpiCard({ icon, label, value, hint, color, onClick }: KpiCardProps) {
  const c = KPI_COLOR_MAP[color];
  return (
    <Card
      className={cn(
        "p-4 ring-1 transition",
        c.ring,
        onClick &&
          cn("cursor-pointer hover:shadow-md hover:scale-[1.01] focus-visible:ring-2 outline-none", c.hoverRing)
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between">
        <div className={cn("size-10 rounded-lg grid place-items-center", c.bg, c.text)}>
          <Icon name={icon} size={20} />
        </div>
        <span className="text-3xl font-bold tabular-nums">{value.toLocaleString("fa-IR")}</span>
      </div>
      <div className="mt-2">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
    </Card>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────
export function PrintDashboard() {
  const navigate = useAppStore((s) => s.navigate);
  const setBoardFilter = useAppStore((s) => s.setBoardFilter);
  const { openOrder, modal } = usePrintOrderDetail();

  // Print orders: status=in_printing
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["orders", "print", "in_printing"],
    queryFn: () =>
      api<{ orders: PrintOrder[] }>("/api/orders?status=in_printing&board=print"),
    refetchInterval: 30000,
  });

  // Print tasks: module=print
  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", "print"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks?module=print"),
    refetchInterval: 30000,
  });

  const orders = ordersData?.orders ?? [];
  const tasks = tasksData?.tasks ?? [];

  // KPI computations — Phase 14: موعد گذشته/امروز + کارت‌های کلیک‌شون
  const inPrintCount = orders.length;
  const needsMaterialCount = orders.filter(needsMaterial).length;
  const urgentCount = orders.filter((o) => o.priority === "urgent").length;
  const overdueCount = orders.filter((o) => orderTimeState(o) === "overdue").length;
  const todayCount = orders.filter((o) => orderTimeState(o) === "today").length;
  const activeTasksCount = tasks.filter(
    (t) => t.status === "todo" || t.status === "in_progress"
  ).length;

  // کلیک روی کارت → صفحهٔ سفارشات با همان فیلتر
  const goWithFilter = (f: TimeFilter) => {
    setBoardFilter("print", f === "all" ? null : f);
    navigate("print", "orders");
  };

  // Lists for compact display
  const needsMaterialOrders = orders.filter(needsMaterial).slice(0, 6);
  const readyOrders = orders.filter(isReadyForPrint).slice(0, 6);
  const overdueOrders = orders.filter((o) => orderTimeState(o) === "overdue");

  return (
    <div className="space-y-5">
      <PageHeader
        title="داشبورد چاپ"
        description="نمای کلی سفارشات در حال چاپ، موعدها، متریال و تسک‌ها — روی هر کارت کلیک کنید تا همان سفارشات فیلترشده نمایش داده شوند"
        icon="print"
        actions={
          <Button onClick={() => goWithFilter("all")} className="gap-2">
            <Icon name="orders" size={16} /> سفارشات چاپ
          </Button>
        }
      />

      {/* KPI cards — همهٔ کارت‌ها کلیک‌شون و فیلترمی‌کنند */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiCard
          icon="print"
          label="در حال چاپ"
          value={inPrintCount}
          hint="مجموع سفارشات مرحله چاپ"
          color="amber"
          onClick={() => goWithFilter("all")}
        />
        <KpiCard
          icon="alertTriangle"
          label="موعد گذشته"
          value={overdueCount}
          hint="موعد چاپ‌شان رسیده و گذشته"
          color="rose"
          onClick={() => goWithFilter("overdue")}
        />
        <KpiCard
          icon="clock"
          label="موعد امروز"
          value={todayCount}
          hint="امروز باید چاپ شوند"
          color="rose"
          onClick={() => goWithFilter("today")}
        />
        <KpiCard
          icon="calendar"
          label="نزدیک موعد"
          value={orders.filter((o) => orderTimeState(o) === "near").length}
          hint="۲ روز یا کمتر تا موعد چاپ"
          color="violet"
          onClick={() => goWithFilter("near")}
        />
        <KpiCard
          icon="boxes"
          label="نیازمند متریال"
          value={needsMaterialCount}
          hint="در انتظار تأمین متریال"
          color="amber"
          onClick={() => goWithFilter("all")}
        />
        <KpiCard
          icon="task"
          label="تسک‌های فعال"
          value={activeTasksCount}
          hint="در صف یا در حال انجام"
          color="emerald"
          onClick={() => navigate("print", "tasks")}
        />
      </div>

      {/* Overdue banner */}
      {overdueOrders.length > 0 && (
        <Card className="p-4 border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/10">
          <div className="flex items-start gap-3">
            <div className="size-9 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 grid place-items-center shrink-0">
              <Icon name="alertTriangle" size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">
                {overdueOrders.length.toLocaleString("fa-IR")} سفارش با موعد چاپ گذشته
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                موعد چاپ این سفارشات رسیده است. لطفاً هرچه زودتر اقدام کنید.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {overdueOrders.slice(0, 5).map((o) => {
                  const dr = daysRemaining(effectivePrintDeadline(o));
                  return (
                    <button
                      key={o.id}
                      onClick={() => openOrder(o.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-card px-2.5 py-1 text-xs hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                    >
                      <span className="font-mono font-bold">#{o.number}</span>
                      <span className="text-muted-foreground">•</span>
                      <span className="truncate max-w-[120px]">
                        {o.customer?.name ?? "—"}
                      </span>
                      <span className="text-rose-600 dark:text-rose-400 font-medium">
                        {dr.days} روز گذشته
                      </span>
                    </button>
                  );
                })}
                {overdueOrders.length > 5 && (
                  <button
                    onClick={() => goWithFilter("overdue")}
                    className="inline-flex items-center gap-1 rounded-lg border border-dashed px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition"
                  >
                    +{overdueOrders.length - 5} مورد دیگر
                  </button>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Two-column layout: needs material + ready for print */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Needs material orders (compact list) */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Icon name="boxes" size={18} className="text-rose-500" />
              <h3 className="font-semibold text-sm">نیازمند متریال</h3>
              <span className="text-[11px] text-muted-foreground">
                ({orders.filter(needsMaterial).length.toLocaleString("fa-IR")})
              </span>
            </div>
            <button
              onClick={() => goWithFilter("all")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              مشاهده همه <Icon name="arrowLeft" size={12} />
            </button>
          </div>
          {ordersLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Icon name="loading" size={16} className="animate-spin" />
              در حال بارگذاری...
            </div>
          ) : needsMaterialOrders.length === 0 ? (
            <EmptyState
              icon="checkCircle"
              title="سفارش نیازمند متریال نیست"
              description="همه سفارشات متریال خود را دریافت کرده‌اند"
            />
          ) : (
            <div className="divide-y max-h-[420px] overflow-y-auto scrollbar-thin">
              {needsMaterialOrders.map((o) => {
                const end = effectivePrintDeadline(o);
                const dr = daysRemaining(end);
                return (
                  <button
                    key={o.id}
                    onClick={() => openOrder(o.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-accent/40 transition text-right"
                  >
                    <div className="size-10 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 grid place-items-center font-bold text-xs shrink-0">
                      #{o.number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {o.customer?.name ?? "—"}
                        </span>
                        {o.priority === "urgent" && (
                          <Icon
                            name="alertTriangle"
                            size={12}
                            className="text-rose-500 shrink-0"
                          />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {(o.items ?? []).length} آیتم •{" "}
                        {(o.items ?? [])
                          .filter((it) => it.needsMaterial && !it.materialConfirmed)
                          .length}{" "}
                        نیاز به متریال
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {end ? (
                        <>
                          <div className="text-xs tabular-nums text-muted-foreground">
                            {formatDate(end)}
                          </div>
                          <div
                            className={cn(
                              "text-[11px] font-medium px-1.5 py-0.5 rounded-full",
                              dr.status === "overdue" &&
                                "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
                              dr.status === "today" &&
                                "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
                              dr.status === "remaining" &&
                                "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                            )}
                          >
                            {dr.text}
                          </div>
                        </>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          بدون موعد چاپ
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Ready for print orders */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Icon name="print" size={18} className="text-amber-500" />
              <h3 className="font-semibold text-sm">آماده چاپ</h3>
              <span className="text-[11px] text-muted-foreground">
                ({orders.filter(isReadyForPrint).length.toLocaleString("fa-IR")})
              </span>
            </div>
            <button
              onClick={() => goWithFilter("all")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              مشاهده همه <Icon name="arrowLeft" size={12} />
            </button>
          </div>
          {ordersLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Icon name="loading" size={16} className="animate-spin" />
              در حال بارگذاری...
            </div>
          ) : readyOrders.length === 0 ? (
            <EmptyState
              icon="checkCircle"
              title="سفارش آماده چاپ نیست"
              description="سفارشات در انتظار تأمین متریال هستند"
            />
          ) : (
            <div className="divide-y max-h-[420px] overflow-y-auto scrollbar-thin">
              {readyOrders.map((o) => {
                const end = effectivePrintDeadline(o);
                const dr = daysRemaining(end);
                return (
                  <button
                    key={o.id}
                    onClick={() => openOrder(o.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-accent/40 transition text-right"
                  >
                    <div className="size-10 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 grid place-items-center font-bold text-xs shrink-0">
                      #{o.number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {o.customer?.name ?? "—"}
                        </span>
                        {o.priority === "urgent" && (
                          <Icon
                            name="alertTriangle"
                            size={12}
                            className="text-rose-500 shrink-0"
                          />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {(o.items ?? []).length} آیتم •{" "}
                        {(o.items ?? [])
                          .slice(0, 2)
                          .map((it) => it.product?.name ?? "—")
                          .join("، ")}
                        {(o.items ?? []).length > 2 && "..."}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {end ? (
                        <>
                          <div className="text-xs tabular-nums text-muted-foreground">
                            {formatDate(end)}
                          </div>
                          <div
                            className={cn(
                              "text-[11px] font-medium px-1.5 py-0.5 rounded-full",
                              dr.status === "overdue" &&
                                "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
                              dr.status === "today" &&
                                "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
                              dr.status === "remaining" &&
                                "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                            )}
                          >
                            {dr.text}
                          </div>
                        </>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          بدون موعد چاپ
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Active tasks strip */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Icon name="task" size={18} className="text-emerald-500" />
            <h3 className="font-semibold text-sm">تسک‌های فعال چاپ</h3>
          </div>
          <button
            onClick={() => navigate("print", "tasks")}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            همه <Icon name="arrowLeft" size={12} />
          </button>
        </div>
        {tasksLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Icon name="loading" size={16} className="animate-spin" />
            در حال بارگذاری...
          </div>
        ) : (
          <ActiveTasksList tasks={tasks} onNavigate={() => navigate("print", "tasks")} />
        )}
      </Card>

      {modal}
    </div>
  );
}

// ─── Active Tasks List (compact) ──────────────────────────────────────
function ActiveTasksList({
  tasks,
  onNavigate,
}: {
  tasks: Task[];
  onNavigate: () => void;
}) {
  const active = tasks.filter((t) => t.status !== "done").slice(0, 6);
  if (active.length === 0) {
    return <EmptyState icon="task" title="تسک فعالی نیست" />;
  }
  return (
    <div className="divide-y max-h-[280px] overflow-y-auto scrollbar-thin">
      {active.map((t) => {
        const dr = daysRemaining(t.dueDate);
        return (
          <button
            key={t.id}
            onClick={onNavigate}
            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-accent/40 transition text-right"
          >
            <div
              className={cn(
                "size-2 rounded-full shrink-0",
                t.status === "todo" ? "bg-slate-400" : "bg-amber-500"
              )}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{t.title}</span>
                {t.priority === "urgent" && (
                  <Icon
                    name="alertTriangle"
                    size={12}
                    className="text-rose-500 shrink-0"
                  />
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {t.status === "todo" ? "در صف" : "در حال انجام"}
              </div>
            </div>
            {t.dueDate && (
              <div
                className={cn(
                  "text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 tabular-nums",
                  dr.status === "overdue"
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                    : dr.status === "today"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {dr.text}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
