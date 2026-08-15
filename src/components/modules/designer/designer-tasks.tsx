"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import {
  PageHeader,
  PriorityBadge,
  StatusBadge,
  EmptyState,
  LoadingState,
} from "@/components/shared";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleButton } from "@/components/ui/toggle-button";
import { formatDate, daysRemaining } from "@/lib/format";
import { TASK_STATUS, type TaskStatus } from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  module: string;
  createdAt: string;
};

// ─── Component ────────────────────────────────────────────────────────
export function DesignerTasks() {
  const invalidate = useInvalidate();

  // Filter state — show todo + in_progress by default, hide done
  const [statusFilters, setStatusFilters] = React.useState<{
    todo: boolean;
    in_progress: boolean;
    done: boolean;
  }>({ todo: true, in_progress: true, done: false });

  // Fetch designer tasks
  const { data, isLoading } = useQuery({
    queryKey: ["tasks", "designer", "list"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks?module=designer"),
    refetchInterval: 30000,
  });

  const allTasks = data?.tasks ?? [];

  // Filter by status
  const tasks = React.useMemo(() => {
    return allTasks.filter((t) => {
      if (t.status === "todo" && !statusFilters.todo) return false;
      if (t.status === "in_progress" && !statusFilters.in_progress) return false;
      if (t.status === "done" && !statusFilters.done) return false;
      return true;
    });
  }, [allTasks, statusFilters]);

  // Sort: urgent first, then by due date ascending (nulls last)
  const sortedTasks = React.useMemo(() => {
    return [...tasks].sort((a, b) => {
      // Urgent first
      if (a.priority === "urgent" && b.priority !== "urgent") return -1;
      if (a.priority !== "urgent" && b.priority === "urgent") return 1;
      // Then by dueDate asc (nulls last)
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return aTime - bTime;
    });
  }, [tasks]);

  // ── Mutation: mark task as done ──────────────────────────────────
  const markDoneMut = useMutation({
    mutationFn: (taskId: string) =>
      api(`/api/tasks/${taskId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "done" }),
      }),
    onSuccess: () => {
      invalidate(["tasks", "dashboard"]);
      toast.success("تسک انجام شد");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Stats per status
  const todoCount = allTasks.filter((t) => t.status === "todo").length;
  const inProgressCount = allTasks.filter((t) => t.status === "in_progress").length;
  const doneCount = allTasks.filter((t) => t.status === "done").length;
  const overdueCount = allTasks.filter((t) => {
    if (t.status === "done" || !t.dueDate) return false;
    return daysRemaining(t.dueDate).status === "overdue";
  }).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="تسک‌های طراح"
        description="تسک‌های اختصاص‌یافته به ماژول طراحی"
        icon="task"
      />

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-300 grid place-items-center">
              <Icon name="inbox" size={16} />
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums">{todoCount}</div>
              <div className="text-[11px] text-muted-foreground">در صف</div>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 grid place-items-center">
              <Icon name="loading" size={16} />
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums">
                {inProgressCount}
              </div>
              <div className="text-[11px] text-muted-foreground">در حال انجام</div>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 grid place-items-center">
              <Icon name="checkCircle" size={16} />
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums">{doneCount}</div>
              <div className="text-[11px] text-muted-foreground">انجام شده</div>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 grid place-items-center">
              <Icon name="alertTriangle" size={16} />
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums">
                {overdueCount}
              </div>
              <div className="text-[11px] text-muted-foreground">گذشته</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter toggles */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">وضعیت:</span>
          <ToggleButton
            checked={statusFilters.todo}
            onChange={(v) => setStatusFilters((s) => ({ ...s, todo: v }))}
            label="در صف"
            size="sm"
            activeColor="primary"
          />
          <ToggleButton
            checked={statusFilters.in_progress}
            onChange={(v) =>
              setStatusFilters((s) => ({ ...s, in_progress: v }))
            }
            label="در حال انجام"
            size="sm"
            activeColor="amber"
          />
          <ToggleButton
            checked={statusFilters.done}
            onChange={(v) => setStatusFilters((s) => ({ ...s, done: v }))}
            label="انجام شده"
            size="sm"
            activeColor="emerald"
          />
          <div className="mr-auto text-xs text-muted-foreground">
            {sortedTasks.length} تسک
          </div>
        </div>
      </Card>

      {/* Task list */}
      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <LoadingState label="در حال بارگذاری تسک‌ها..." />
        ) : sortedTasks.length === 0 ? (
          <EmptyState
            icon="checkCircle"
            title="تسکی برای نمایش نیست"
            description="با تغییر فیلترها می‌توانید سایر تسک‌ها را ببینید"
          />
        ) : (
          <div className="divide-y max-h-[600px] overflow-y-auto scrollbar-thin">
            {sortedTasks.map((t) => {
              const dr = daysRemaining(t.dueDate);
              const statusInfo =
                TASK_STATUS[t.status as TaskStatus] ?? TASK_STATUS.todo;
              const isOverdue =
                t.status !== "done" &&
                t.dueDate &&
                dr.status === "overdue";
              return (
                <div
                  key={t.id}
                  className="flex items-start gap-3 px-5 py-3 hover:bg-accent/30 transition"
                >
                  {/* Status dot */}
                  <div
                    className={cn(
                      "size-2.5 rounded-full shrink-0 mt-2",
                      t.status === "todo" && "bg-slate-400",
                      t.status === "in_progress" && "bg-amber-500",
                      t.status === "done" && "bg-emerald-500"
                    )}
                  />

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          "font-medium text-sm",
                          t.status === "done" && "line-through text-muted-foreground"
                        )}
                      >
                        {t.title}
                      </span>
                      <PriorityBadge priority={t.priority} />
                      <StatusBadge status={t.status} />
                      {isOverdue && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 flex items-center gap-0.5">
                          <Icon name="alertTriangle" size={10} /> {dr.text}
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {t.description}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                      {t.dueDate && (
                        <span className="flex items-center gap-1 tabular-nums">
                          <Icon name="calendar" size={11} />
                          {formatDate(t.dueDate)}
                        </span>
                      )}
                      {!isOverdue && t.dueDate && dr.status !== "none" && t.status !== "done" && (
                        <span
                          className={cn(
                            "flex items-center gap-1",
                            dr.status === "today" && "text-amber-600",
                            dr.status === "remaining" && "text-emerald-600"
                          )}
                        >
                          <Icon name="clock" size={11} />
                          {dr.text}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0">
                    {t.status !== "done" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => markDoneMut.mutate(t.id)}
                        disabled={markDoneMut.isPending}
                      >
                        {markDoneMut.isPending &&
                        markDoneMut.variables === t.id ? (
                          <Icon
                            name="loading"
                            size={14}
                            className="animate-spin"
                          />
                        ) : (
                          <Icon name="check" size={14} />
                        )}
                        انجام شد
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
