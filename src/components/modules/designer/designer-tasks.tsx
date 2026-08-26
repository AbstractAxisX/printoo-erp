"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, PriorityBadge, StatusBadge, EmptyState, LoadingState } from "@/components/shared";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleButton } from "@/components/ui/toggle-button";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { formatDate, daysRemaining, relativeTime } from "@/lib/format";
import { TASK_STATUS, type TaskStatus } from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

export function DesignerTasks() {
  const invalidate = useInvalidate();
  const [statusFilters, setStatusFilters] = React.useState({ todo: true, in_progress: true, done: false });
  const [detailTask, setDetailTask] = React.useState<Task | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", "designer", "list"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks?module=designer"),
    refetchInterval: 30000,
  });

  const allTasks = data?.tasks ?? [];

  const tasks = React.useMemo(() => {
    return allTasks.filter((t) => {
      if (t.status === "todo" && !statusFilters.todo) return false;
      if (t.status === "in_progress" && !statusFilters.in_progress) return false;
      if (t.status === "done" && !statusFilters.done) return false;
      return true;
    });
  }, [allTasks, statusFilters]);

  const sortedTasks = React.useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.priority === "urgent" && b.priority !== "urgent") return -1;
      if (a.priority !== "urgent" && b.priority === "urgent") return 1;
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return aTime - bTime;
    });
  }, [tasks]);

  const updateStatusMut = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      api(`/api/tasks/${taskId}`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: (_data, vars) => {
      invalidate(["tasks", "dashboard"]);
      const label = vars.status === "in_progress" ? "در حال انجام" : vars.status === "done" ? "انجام شد" : "در صف";
      toast.success(`تسک "${label}" شد`);
      // Update detail modal if open
      setDetailTask((prev) => prev && prev.id === vars.taskId ? { ...prev, status: vars.status } : prev);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const todoCount = allTasks.filter((t) => t.status === "todo").length;
  const inProgressCount = allTasks.filter((t) => t.status === "in_progress").length;
  const doneCount = allTasks.filter((t) => t.status === "done").length;
  const overdueCount = allTasks.filter((t) => {
    if (t.status === "done" || !t.dueDate) return false;
    return daysRemaining(t.dueDate).status === "overdue";
  }).length;

  return (
    <div className="space-y-5">
      <PageHeader title="تسک‌های طراح" description="تسک‌های اختصاص‌یافته به ماژول طراحی" icon="task" />

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard count={todoCount} label="در صف" icon="inbox" color="slate" />
        <StatCard count={inProgressCount} label="در حال انجام" icon="loading" color="amber" />
        <StatCard count={doneCount} label="انجام شده" icon="checkCircle" color="emerald" />
        <StatCard count={overdueCount} label="گذشته" icon="alertTriangle" color="rose" />
      </div>

      {/* Filter toggles */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">وضعیت:</span>
          <ToggleButton checked={statusFilters.todo} onChange={(v) => setStatusFilters((s) => ({ ...s, todo: v }))} label="در صف" size="sm" activeColor="primary" />
          <ToggleButton checked={statusFilters.in_progress} onChange={(v) => setStatusFilters((s) => ({ ...s, in_progress: v }))} label="در حال انجام" size="sm" activeColor="amber" />
          <ToggleButton checked={statusFilters.done} onChange={(v) => setStatusFilters((s) => ({ ...s, done: v }))} label="انجام شده" size="sm" activeColor="emerald" />
          <div className="mr-auto text-xs text-muted-foreground">{sortedTasks.length} تسک</div>
        </div>
      </Card>

      {/* Task list */}
      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <LoadingState label="در حال بارگذاری تسک‌ها..." />
        ) : sortedTasks.length === 0 ? (
          <EmptyState icon="checkCircle" title="تسکی برای نمایش نیست" description="با تغییر فیلترها می‌توانید سایر تسک‌ها را ببینید" />
        ) : (
          <div className="divide-y max-h-[600px] overflow-y-auto scrollbar-thin">
            {sortedTasks.map((t) => {
              const dr = daysRemaining(t.dueDate);
              const isOverdue = t.status !== "done" && t.dueDate && dr.status === "overdue";
              return (
                <div key={t.id} className="flex items-start gap-3 px-5 py-3 hover:bg-accent/30 transition cursor-pointer" onClick={() => setDetailTask(t)}>
                  <div className={cn("size-2.5 rounded-full shrink-0 mt-2", t.status === "todo" && "bg-slate-400", t.status === "in_progress" && "bg-amber-500", t.status === "done" && "bg-emerald-500")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("font-medium text-sm", t.status === "done" && "line-through text-muted-foreground")}>{t.title}</span>
                      <PriorityBadge priority={t.priority} />
                      <StatusBadge status={t.status} />
                      {isOverdue && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 flex items-center gap-0.5">
                          <Icon name="alertTriangle" size={10} /> {dr.text}
                        </span>
                      )}
                    </div>
                    {t.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</div>}
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                      {t.dueDate && <span className="flex items-center gap-1 tabular-nums"><Icon name="calendar" size={11} /> {formatDate(t.dueDate)}</span>}
                      {!isOverdue && t.dueDate && dr.status !== "none" && t.status !== "done" && (
                        <span className={cn("flex items-center gap-1", dr.status === "today" && "text-amber-600", dr.status === "remaining" && "text-emerald-600")}>
                          <Icon name="clock" size={11} /> {dr.text}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Actions — click stopPropagation to not open detail */}
                  <div className="shrink-0 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {t.status === "todo" && (
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => updateStatusMut.mutate({ taskId: t.id, status: "in_progress" })} disabled={updateStatusMut.isPending}>
                        <Icon name="play" size={14} /> شروع
                      </Button>
                    )}
                    {t.status === "in_progress" && (
                      <Button size="sm" variant="outline" className="gap-1.5 hover:text-emerald-600" onClick={() => updateStatusMut.mutate({ taskId: t.id, status: "done" })} disabled={updateStatusMut.isPending}>
                        <Icon name="check" size={14} /> پایان
                      </Button>
                    )}
                    {t.status === "done" && (
                      <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => updateStatusMut.mutate({ taskId: t.id, status: "todo" })} disabled={updateStatusMut.isPending}>
                        <Icon name="refresh" size={14} /> بازگردان
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Task detail modal */}
      <TaskDetailModal task={detailTask} onClose={() => setDetailTask(null)} onUpdateStatus={(status) => {
        if (detailTask) updateStatusMut.mutate({ taskId: detailTask.id, status });
      }} />
    </div>
  );
}

function StatCard({ count, label, icon, color }: { count: number; label: string; icon: "inbox" | "loading" | "checkCircle" | "alertTriangle"; color: string }) {
  const colorCls: Record<string, string> = {
    slate: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  };
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <div className={cn("size-8 rounded-lg grid place-items-center", colorCls[color])}>
          <Icon name={icon} size={16} />
        </div>
        <div>
          <div className="text-lg font-bold tabular-nums">{count}</div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
        </div>
      </div>
    </Card>
  );
}

function TaskDetailModal({ task, onClose, onUpdateStatus }: { task: Task | null; onClose: () => void; onUpdateStatus: (status: string) => void }) {
  if (!task) return null;
  const dr = daysRemaining(task.dueDate);
  const isOverdue = task.status !== "done" && task.dueDate && dr.status === "overdue";

  return (
    <Dialog open={!!task} onOpenChange={(v) => !v && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-w-md p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Icon name="task" size={18} className="text-primary" />
            {task.title}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-3">
          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
            {isOverdue && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 flex items-center gap-0.5">
                <Icon name="alertTriangle" size={10} /> {dr.text}
              </span>
            )}
          </div>

          {/* Description */}
          {task.description && (
            <div className="rounded-lg border p-3 bg-muted/20">
              <div className="text-[11px] text-muted-foreground mb-1">توضیحات</div>
              <div className="text-sm whitespace-pre-wrap">{task.description}</div>
            </div>
          )}

          {/* Info */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border p-2.5">
              <div className="text-muted-foreground">سررسید</div>
              <div className="font-medium mt-0.5 tabular-nums">{task.dueDate ? formatDate(task.dueDate) : "—"}</div>
              {task.dueDate && dr.status !== "none" && task.status !== "done" && (
                <div className={cn("text-[10px] mt-0.5", dr.status === "overdue" && "text-rose-600", dr.status === "remaining" && "text-emerald-600", dr.status === "today" && "text-amber-600")}>
                  {dr.text}
                </div>
              )}
            </div>
            <div className="rounded-lg border p-2.5">
              <div className="text-muted-foreground">ساخت</div>
              <div className="font-medium mt-0.5">{relativeTime(task.createdAt)}</div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-3 border-t bg-muted/30 flex items-center gap-2">
          {task.status === "todo" && (
            <Button size="sm" className="gap-1.5" onClick={() => onUpdateStatus("in_progress")}>
              <Icon name="play" size={14} /> شروع کار
            </Button>
          )}
          {task.status === "in_progress" && (
            <Button size="sm" className="gap-1.5" onClick={() => onUpdateStatus("done")}>
              <Icon name="check" size={14} /> پایان کار
            </Button>
          )}
          {task.status === "done" && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onUpdateStatus("todo")}>
              <Icon name="refresh" size={14} /> بازگردان به صف
            </Button>
          )}
          <Button size="sm" variant="ghost" className="mr-auto" onClick={onClose}>بستن</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
