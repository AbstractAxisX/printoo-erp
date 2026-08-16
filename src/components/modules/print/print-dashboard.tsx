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

// ─── Helpers ──────────────────────────────────────────────────────────
/** Order needs material if ANY item has needsMaterial=true AND materialConfirmed=false */
function needsMaterial(o: PrintOrder): boolean {
  return (o.items ?? []).some((it) => it.needsMaterial && !it.materialConfirmed);
}

function isReadyForPrint(o: PrintOrder): boolean {
  // Ready = doesn't need material (either no items need material, or all confirmed)
  return !needsMaterial(o);
}

/** Get the first item's printEndDate (used for "near deadline" calc). */
function printEndDate(o: PrintOrder): string | null {
  return o.items?.[0]?.printEndDate ?? null;
}

function isOverdue(o: PrintOrder): boolean {
  const end = printEndDate(o);
  if (!end) return false;
  const dr = daysRemaining(end);
  return dr.status === "overdue";
}

function isUrgent(o: PrintOrder): boolean {
  return o.priority === "urgent";
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
  { bg: string; text: string; ring: string }
> = {
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/20",
  },
  rose: {
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    ring: "ring-rose-500/20",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/20",
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
export function PrintDashboard() {
  const navigate = useAppStore((s) => s.navigate);
  const { openOrder, modal } = usePrintOrderDetail();

  // Print orders: status=in_printing
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["orders", "print", "in_printing"],
    queryFn: () =>
      api<{ orders: PrintOrder[] }>("/api/orders?status=in_printing"),
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

  // KPI computations
  const inPrintCount = orders.length;
  const needsMaterialCount = orders.filter(needsMaterial).length;
  const urgentCount = orders.filter(isUrgent).length;
  const activeTasksCount = tasks.filter(
    (t) => t.status === "todo" || t.status === "in_progress"
  ).length;

  // Lists for compact display
  const needsMaterialOrders = orders.filter(needsMaterial).slice(0, 6);
  const readyOrders = orders.filter(isReadyForPrint).slice(0, 6);
  const overdueOrders = orders.filter(isOverdue);

  return (
    <div className="space-y-5">
      <PageHeader
        title="داشبورد چاپ"
        description="نمای کلی سفارشات در حال چاپ، نیازمند متریال و تسک‌ها"
        icon="print"
        actions={
          <Button onClick={() => navigate("print", "orders")} className="gap-2">
            <Icon name="orders" size={16} /> سفارشات چاپ
          </Button>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon="print"
          label="سفارشات در حال چاپ"
          value={inPrintCount}
          hint="مجموع سفارشات مرحله چاپ"
          color="amber"
          onClick={() => navigate("print", "orders")}
        />
        <KpiCard
          icon="alertTriangle"
          label="نیازمند متریال"
          value={needsMaterialCount}
          hint="در انتظار تأمین متریال"
          color="rose"
          onClick={() => navigate("print", "orders")}
        />
        <KpiCard
          icon="alert"
          label="فوری"
          value={urgentCount}
          hint="اولویت فوری در مرحله چاپ"
          color="violet"
          onClick={() => navigate("print", "orders")}
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
                {overdueOrders.length} سفارش با موعد چاپ گذشته
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                موعد چاپ این سفارشات رسیده است. لطفاً هرچه زودتر اقدام کنید.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {overdueOrders.slice(0, 5).map((o) => {
                  const dr = daysRemaining(printEndDate(o));
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
                    onClick={() => navigate("print", "orders")}
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
              <Icon name="alertTriangle" size={18} className="text-rose-500" />
              <h3 className="font-semibold text-sm">نیازمند متریال</h3>
              <span className="text-[11px] text-muted-foreground">
                ({orders.filter(needsMaterial).length})
              </span>
            </div>
            <button
              onClick={() => navigate("print", "orders")}
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
                const end = printEndDate(o);
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
                        {isUrgent(o) && (
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
                ({orders.filter(isReadyForPrint).length})
              </span>
            </div>
            <button
              onClick={() => navigate("print", "orders")}
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
                const end = printEndDate(o);
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
                        {isUrgent(o) && (
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
