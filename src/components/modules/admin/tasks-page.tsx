"use client";

// Printoo24 ERP — Admin Tasks page (Phase 4 rebuild)
//
// Kanban board + cross-panel assignment logic:
// - Assignee picker (SearchSelect over /api/users — active users only)
// - Assignee chip on every card (who owns the work)
// - Assignee header filter ("who is drowning?")
// - Linked order chip opens the Order Detail Modal in place
//   (cross-panel referral: task → order context in one click)
// - R10 fixed: mutations invalidate ["tasks", "dashboard", "order"]
//   (dashboard shows latest tasks; an open order modal refreshes too)
//
// Preserved from the previous build (no regression, per roadmap law):
// - DnD status flow with optimistic local override + rollback on error
// - Module filter (?module= contract feeds designer/print panels too)
// - Create/Edit dialogs, delete with confirm-free single click on card
//   (undo lives in the API's 404 fence, board refetches)

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { useOrderDetail } from "@/lib/use-order-detail";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { SearchSelect } from "@/components/shared/search-select";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { DatePicker } from "@/components/ui/date-picker";
import { ToggleButton } from "@/components/ui/toggle-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { formatDate, daysRemaining } from "@/lib/format";
import {
  TASK_STATUS,
  PRIORITY,
  MODULES,
  USER_ROLE,
  type ModuleKey,
  type TaskStatus,
} from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────
type Assignee = {
  id: string;
  name: string;
  role: string;
  avatar: string | null;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  module: string;
  assignedTo: string | null;
  assignedUser: Assignee | null;
  createdAt: string;
  order: { id: string; number: number; customer: { name: string } } | null;
};

type FormState = {
  title: string;
  description: string;
  priority: "normal" | "urgent";
  dueDate: string; // yyyy-mm-dd or ""
  module: ModuleKey;
  status: TaskStatus;
  assignedTo: string | null; // user id | null
};

// ─── Static column config ─────────────────────────────────────────
const COLUMNS: {
  key: TaskStatus;
  label: string;
  dot: string;
  ring: string;
  hover: string;
}[] = [
  {
    key: "todo",
    label: "در صف",
    dot: "bg-slate-400",
    ring: "ring-slate-300/60",
    hover: "hover:border-slate-300",
  },
  {
    key: "in_progress",
    label: "در حال انجام",
    dot: "bg-amber-500",
    ring: "ring-amber-300/60",
    hover: "hover:border-amber-300",
  },
  {
    key: "done",
    label: "انجام شده",
    dot: "bg-emerald-500",
    ring: "ring-emerald-300/60",
    hover: "hover:border-emerald-300",
  },
];

const MODULE_OPTIONS = Object.keys(MODULES) as ModuleKey[];

const MODULE_TAG_COLOR: Record<string, string> = {
  admin: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  designer: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  print: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  warehouse: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
  finance: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  qc: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  crm: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
  srm: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  priority: "normal",
  dueDate: "",
  module: "admin",
  status: "todo",
  assignedTo: null,
};

// Avatar initials for the assignee chip (e.g. "سارا احمدی" → "سا").
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0].slice(0, 1) + parts[1].slice(0, 1);
}

// ─── Main page ────────────────────────────────────────────────────
export function TasksPage() {
  const invalidate = useInvalidate();
  const { openOrder, modal: orderModal } = useOrderDetail();
  const [moduleFilter, setModuleFilter] = React.useState<"all" | ModuleKey>("all");
  const [assigneeFilter, setAssigneeFilter] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState<FormState>(EMPTY_FORM);
  const [editTask, setEditTask] = React.useState<Task | null>(null);
  const [editForm, setEditForm] = React.useState<FormState>(EMPTY_FORM);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  // Local optimistic overrides for status (so a drag feels instant until refetch).
  const [statusOverride, setStatusOverride] = React.useState<Record<string, string>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Active users — powers both the assignee picker and the header filter.
  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ users: Assignee[] }>("/api/users"),
    staleTime: 60_000, // roster rarely changes mid-session
  });
  const users = usersData?.users ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", moduleFilter, assigneeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (moduleFilter !== "all") params.set("module", moduleFilter);
      if (assigneeFilter) params.set("assignedTo", assigneeFilter);
      const qs = params.toString();
      return api<{ tasks: Task[] }>(qs ? `/api/tasks?${qs}` : "/api/tasks");
    },
    refetchInterval: 30000,
  });

  const serverTasks = data?.tasks ?? [];

  // Drop overrides once the server has caught up with the new status.
  React.useEffect(() => {
    if (Object.keys(statusOverride).length === 0) return;
    setStatusOverride((prev) => {
      const next: Record<string, string> = {};
      for (const [id, status] of Object.entries(prev)) {
        const t = serverTasks.find((x) => x.id === id);
        if (!t || t.status !== status) next[id] = status;
      }
      return next;
    });
  }, [serverTasks, statusOverride]);

  const tasks = React.useMemo(
    () =>
      serverTasks.map((t) =>
        statusOverride[t.id] ? { ...t, status: statusOverride[t.id] } : t
      ),
    [serverTasks, statusOverride]
  );

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  // ── Board stats (scannable summary — same pattern as Open Orders) ──
  const stats = React.useMemo(() => {
    const open = tasks.filter((t) => t.status !== "done");
    return {
      total: tasks.length,
      open: open.length,
      overdue: open.filter(
        (t) => t.dueDate && new Date(t.dueDate) < new Date()
      ).length,
      urgent: open.filter((t) => t.priority === "urgent").length,
      unassigned: open.filter((t) => !t.assignedUser).length,
    };
  }, [tasks]);

  // ── Mutations ──────────────────────────────────────────────────
  // R10: every success ALSO invalidates ["dashboard"] (dashboard's
  // LatestTasks/NearDeadlineOrders tiles were silently stale before)
  // and ["order"] (an open Order Detail Modal's Tasks tab stays live).
  const createMut = useMutation({
    mutationFn: (body: FormState) =>
      api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: body.title,
          description: body.description || null,
          priority: body.priority,
          dueDate: body.dueDate || null,
          module: body.module,
          assignedTo: body.assignedTo,
        }),
      }),
    onSuccess: () => {
      invalidate(["tasks", "dashboard", "order"]);
      toast.success("تسک ایجاد شد");
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<FormState>) => {
      const payload: Record<string, unknown> = {};
      if (patch.title !== undefined) payload.title = patch.title;
      if (patch.description !== undefined) payload.description = patch.description || null;
      if (patch.priority !== undefined) payload.priority = patch.priority;
      if (patch.dueDate !== undefined) payload.dueDate = patch.dueDate || null;
      if (patch.module !== undefined) payload.module = patch.module;
      if (patch.status !== undefined) payload.status = patch.status;
      if (patch.assignedTo !== undefined) payload.assignedTo = patch.assignedTo;
      return api(`/api/tasks/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/tasks/${id}`, { method: "DELETE" }),
  });

  // ── DnD handlers ───────────────────────────────────────────────
  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // Resolve the destination column.
    let destStatus: TaskStatus | null = null;
    if (COLUMNS.some((c) => c.key === overIdStr)) {
      destStatus = overIdStr as TaskStatus;
    } else {
      const overTask = tasks.find((t) => t.id === overIdStr);
      destStatus = (overTask?.status as TaskStatus) ?? null;
    }

    const activeTaskItem = tasks.find((t) => t.id === activeIdStr);
    if (!activeTaskItem || !destStatus) return;
    if (activeTaskItem.status === destStatus) return;

    // Optimistic local override for instant feedback.
    setStatusOverride((prev) => ({ ...prev, [activeIdStr]: destStatus as string }));

    updateMut.mutate(
      { id: activeIdStr, status: destStatus },
      {
        onSuccess: () => {
          invalidate(["tasks", "dashboard", "order"]);
          const label = TASK_STATUS[destStatus as TaskStatus]?.label ?? destStatus;
          toast.success(`به «${label}» منتقل شد`);
        },
        onError: (err: Error) => {
          setStatusOverride((prev) => {
            const next = { ...prev };
            delete next[activeIdStr];
            return next;
          });
          toast.error(err.message);
          invalidate(["tasks"]);
        },
      }
    );
  }

  // ── Edit dialog helpers ────────────────────────────────────────
  function openEdit(task: Task) {
    setEditTask(task);
    setEditForm({
      title: task.title,
      description: task.description ?? "",
      priority: (task.priority === "urgent" ? "urgent" : "normal"),
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
      module: (MODULE_OPTIONS.includes(task.module as ModuleKey) ? task.module : "admin") as ModuleKey,
      status: (Object.keys(TASK_STATUS).includes(task.status) ? task.status : "todo") as TaskStatus,
      assignedTo: task.assignedTo ?? null,
    });
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTask) return;
    if (!editForm.title.trim()) {
      toast.error("عنوان الزامی است");
      return;
    }
    updateMut.mutate(
      { id: editTask.id, ...editForm },
      {
        onSuccess: () => {
          invalidate(["tasks", "dashboard", "order"]);
          toast.success("تسک به‌روزرسانی شد");
          setEditTask(null);
        },
        onError: (err: Error) => toast.error(err.message),
      }
    );
  }

  function handleDelete(id: string, onClose?: () => void) {
    deleteMut.mutate(id, {
      onSuccess: () => {
        invalidate(["tasks", "dashboard", "order"]);
        toast.success("تسک حذف شد");
        onClose?.();
      },
      onError: (err: Error) => toast.error(err.message),
    });
  }

  // ── Assignee options for SearchSelect ──────────────────────────
  const assigneeOptions = users.map((u) => ({
    value: u.id,
    label: u.name,
    sub: USER_ROLE[u.role]?.label ?? u.role,
  }));

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <PageHeader
        title="تسک‌ها"
        description="مدیریت کارها و وظایف به سبک کانبان"
        icon="task"
        actions={
          <div className="flex items-center gap-2">
            <Select
              value={moduleFilter}
              onValueChange={(v) => setModuleFilter(v as "all" | ModuleKey)}
            >
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه ماژول‌ها</SelectItem>
                {MODULE_OPTIONS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODULES[m].faLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SearchSelect
              value={assigneeFilter}
              onChange={(v) => setAssigneeFilter(v)}
              placeholder="همه مسئول‌ها"
              searchPlaceholder="جستجوی نام مسئول..."
              options={assigneeOptions}
              className="w-[170px] h-9"
            />
            <Button
              onClick={() => {
                setCreateForm(EMPTY_FORM);
                setCreateOpen(true);
              }}
              className="gap-2"
            >
              <Icon name="plus" size={16} /> تسک جدید
            </Button>
          </div>
        }
      />

      {/* ── Board summary chips ─────────────────────────────────── */}
      {tasks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground tabular-nums">
            {stats.open} باز از {stats.total}
          </span>
          {stats.overdue > 0 && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 tabular-nums flex items-center gap-1">
              <Icon name="clock" size={11} /> {stats.overdue} معوق
            </span>
          )}
          {stats.urgent > 0 && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 tabular-nums flex items-center gap-1">
              <Icon name="alertTriangle" size={11} /> {stats.urgent} فوری
            </span>
          )}
          {stats.unassigned > 0 && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 tabular-nums flex items-center gap-1">
              <Icon name="user" size={11} /> {stats.unassigned} بدون مسئول
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <LoadingState />
      ) : tasks.length === 0 && !createOpen ? (
        <Card className="p-0">
          <EmptyState
            icon="task"
            title="تسکی وجود ندارد"
            description={
              assigneeFilter
                ? "برای این مسئول تسکی در این فیلتر نیست."
                : "اولین تسک را ایجاد کنید و آن را روی بورد بکشید."
            }
            action={
              <Button onClick={() => setCreateOpen(true)} className="gap-2">
                <Icon name="plus" size={16} /> افزودن تسک
              </Button>
            }
          />
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {COLUMNS.map((col) => (
              <Column
                key={col.key}
                col={col}
                tasks={tasks.filter((t) => t.status === col.key)}
                onEdit={openEdit}
                onDelete={(id) => handleDelete(id)}
                onOpenOrder={(orderId) => openOrder(orderId)}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18,0.67,0.6,1.22)" }}>
            {activeTask ? <TaskCardOverlay task={activeTask} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Order Detail Modal — opened from a task's linked-order chip */}
      {orderModal}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>تسک جدید</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!createForm.title.trim()) {
                toast.error("عنوان الزامی است");
                return;
              }
              createMut.mutate(createForm);
            }}
            className="space-y-4"
          >
            <TaskFormFields
              form={createForm}
              setForm={setCreateForm}
              assigneeOptions={assigneeOptions}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                انصراف
              </Button>
              <Button type="submit" disabled={createMut.isPending} className="gap-2">
                {createMut.isPending ? (
                  <Icon name="loading" size={16} className="animate-spin" />
                ) : (
                  <Icon name="check" size={16} />
                )}
                ذخیره
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTask} onOpenChange={(o) => !o && setEditTask(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>ویرایش تسک</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4">
            <TaskFormFields
              form={editForm}
              setForm={setEditForm}
              assigneeOptions={assigneeOptions}
              withStatus
            />
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="destructive"
                onClick={() => handleDelete(editTask!.id, () => setEditTask(null))}
                className="gap-2"
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? (
                  <Icon name="loading" size={16} className="animate-spin" />
                ) : (
                  <Icon name="trash" size={16} />
                )}
                حذف
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setEditTask(null)}>
                  انصراف
                </Button>
                <Button type="submit" disabled={updateMut.isPending} className="gap-2">
                  {updateMut.isPending ? (
                    <Icon name="loading" size={16} className="animate-spin" />
                  ) : (
                    <Icon name="check" size={16} />
                  )}
                  ذخیره تغییرات
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Column (droppable) ───────────────────────────────────────────
function Column({
  col,
  tasks,
  onEdit,
  onDelete,
  onOpenOrder,
}: {
  col: (typeof COLUMNS)[number];
  tasks: Task[];
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", col.dot)} />
          <span className="font-semibold text-sm">{col.label}</span>
        </div>
        <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5 tabular-nums">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 min-h-[220px] rounded-xl border bg-muted/30 p-2 space-y-2 transition-colors",
          col.hover,
          isOver && cn("ring-2 bg-background/60", col.ring)
        )}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              onEdit={onEdit}
              onDelete={onDelete}
              onOpenOrder={onOpenOrder}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-10 select-none">
            کارتی اینجا نیست — بکشید و رها کنید
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sortable task card ───────────────────────────────────────────
function TaskCard({
  task,
  onEdit,
  onDelete,
  onOpenOrder,
}: {
  task: Task;
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const due = daysRemaining(task.dueDate);
  const isOverdue = due.status === "overdue" && task.status !== "done";
  const isToday = due.status === "today" && task.status !== "done";
  const isUrgent = task.priority === "urgent";

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const priorityMeta =
    (PRIORITY as Record<string, { label: string; badge: string }>)[task.priority] ??
    PRIORITY.normal;
  const moduleLabel =
    (MODULES as Record<string, { faLabel: string }>)[task.module]?.faLabel ?? task.module;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onEdit(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit(task);
        }
      }}
      className={cn(
        "group relative rounded-lg border border-s-4 bg-card p-3 cursor-grab active:cursor-grabbing",
        "hover:shadow-md hover:-translate-y-0.5 transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        isUrgent ? "border-s-rose-500" : "border-s-transparent",
        isOverdue && "bg-rose-50/70 dark:bg-rose-950/20",
        isDragging && "opacity-40"
      )}
    >
      {/* Title + delete */}
      <div className="flex items-start justify-between gap-2 pe-6">
        <h4 className="font-semibold text-sm leading-snug">{task.title}</h4>
      </div>

      {task.description && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
          {task.description}
        </p>
      )}

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
            priorityMeta.badge
          )}
        >
          {isUrgent && <Icon name="alertTriangle" size={10} />}
          {priorityMeta.label}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
            MODULE_TAG_COLOR[task.module] ?? "bg-muted text-muted-foreground"
          )}
        >
          {moduleLabel}
        </span>
      </div>

      {/* Assignee chip — WHO owns this work (Phase 4) */}
      {task.assignedUser ? (
        <span className="inline-flex items-center gap-1.5 mt-2 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[11px] font-medium">
          <span className="size-4 rounded-full bg-primary text-primary-foreground grid place-items-center text-[9px] font-bold leading-none">
            {initials(task.assignedUser.name)}
          </span>
          {task.assignedUser.name}
        </span>
      ) : (
        task.status !== "done" && (
          <span className="inline-flex items-center gap-1 mt-2 rounded-full bg-muted/70 text-muted-foreground px-1.5 py-0.5 text-[10px]">
            <Icon name="user" size={10} /> بدون مسئول
          </span>
        )
      )}

      {/* Due date */}
      {task.dueDate && (
        <div
          className={cn(
            "text-[11px] mt-2 flex items-center gap-1",
            isOverdue
              ? "text-rose-600 dark:text-rose-400 font-medium"
              : isToday
              ? "text-amber-600 dark:text-amber-400 font-medium"
              : "text-muted-foreground"
          )}
        >
          <Icon name="calendar" size={11} />
          <span className="tabular-nums">{formatDate(task.dueDate)}</span>
          <span className="opacity-70">· {due.text}</span>
        </div>
      )}

      {/* Linked order — click opens the order detail modal in place */}
      {task.order && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenOrder(task.order!.id);
          }}
          title="مشاهده جزئیات سفارش"
          className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1 hover:text-primary transition-colors"
        >
          <Icon name="orders" size={11} />
          <span>
            سفارش #{task.order.number}
            {task.order.customer?.name ? ` · ${task.order.customer.name}` : ""}
          </span>
          <Icon name="arrowLeft" size={10} className="opacity-50" />
        </button>
      )}

      {/* Delete button (on hover) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(task.id);
        }}
        title="حذف تسک"
        className="absolute top-2 end-2 size-6 rounded-md grid place-items-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/60 transition-opacity"
      >
        <Icon name="trash" size={13} />
      </button>
    </div>
  );
}

// ─── Drag overlay (preview) ───────────────────────────────────────
function TaskCardOverlay({ task }: { task: Task }) {
  const isUrgent = task.priority === "urgent";
  const priorityMeta =
    (PRIORITY as Record<string, { label: string; badge: string }>)[task.priority] ??
    PRIORITY.normal;
  const moduleLabel =
    (MODULES as Record<string, { faLabel: string }>)[task.module]?.faLabel ?? task.module;
  return (
    <div
      className={cn(
        "w-72 rounded-lg border border-s-4 bg-card p-3 shadow-xl rotate-2",
        isUrgent ? "border-s-rose-500" : "border-s-transparent"
      )}
    >
      <h4 className="font-semibold text-sm">{task.title}</h4>
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
            priorityMeta.badge
          )}
        >
          {isUrgent && <Icon name="alertTriangle" size={10} />}
          {priorityMeta.label}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
            MODULE_TAG_COLOR[task.module] ?? "bg-muted text-muted-foreground"
          )}
        >
          {moduleLabel}
        </span>
        {task.assignedUser && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-medium">
            <Icon name="user" size={10} /> {task.assignedUser.name}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Shared form fields (create + edit) ───────────────────────────
function TaskFormFields({
  form,
  setForm,
  assigneeOptions,
  withStatus,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  assigneeOptions: { value: string; label: string; sub?: string }[];
  withStatus?: boolean;
}) {
  return (
    <div className="space-y-4">
      <Field label="عنوان" required>
        <Input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          autoFocus
        />
      </Field>

      <Field label="توضیحات">
        <Textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={2}
          placeholder="توضیحات اختیاری..."
        />
      </Field>

      <Field
        label="مسئول انجام"
        hint={
          <>تسک علاوه بر این پنل، در پنل «{MODULES[form.module]?.faLabel}» هم دیده می‌شود.</>
        }
      >
        <SearchSelect
          value={form.assignedTo}
          onChange={(v) => setForm((f) => ({ ...f, assignedTo: v }))}
          placeholder="به کسی ارجاع نشده"
          searchPlaceholder="جستجوی نام کارمند..."
          options={assigneeOptions}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>اولویت</Label>
          <div className="flex gap-3 pt-1">
            <ToggleButton
              checked={form.priority === "normal"}
              onChange={(v) => v && setForm((f) => ({ ...f, priority: "normal" }))}
              label="معمولی"
              activeColor="emerald"
              activeIcon="check"
            />
            <ToggleButton
              checked={form.priority === "urgent"}
              onChange={(v) => v && setForm((f) => ({ ...f, priority: "urgent" }))}
              label="فوری"
              activeColor="amber"
              activeIcon="alert"
            />
          </div>
        </div>

        <Field label="تاریخ سررسید">
          <DatePicker
            value={form.dueDate || null}
            onChange={(d) =>
              setForm((f) => ({ ...f, dueDate: d ? format(d, "yyyy-MM-dd") : "" }))
            }
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="ماژول">
          <Select
            value={form.module}
            onValueChange={(v) => setForm((f) => ({ ...f, module: v as ModuleKey }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODULE_OPTIONS.map((m) => (
                <SelectItem key={m} value={m}>
                  {MODULES[m].faLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {withStatus && (
          <Field label="وضعیت">
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as TaskStatus }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TASK_STATUS) as TaskStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {TASK_STATUS[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>
    </div>
  );
}
