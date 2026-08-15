"use client";

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
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { formatDate, daysRemaining } from "@/lib/format";
import {
  TASK_STATUS,
  PRIORITY,
  MODULES,
  type ModuleKey,
  type TaskStatus,
} from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  module: string;
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
};

// ─── Main page ────────────────────────────────────────────────────
export function TasksPage() {
  const invalidate = useInvalidate();
  const [moduleFilter, setModuleFilter] = React.useState<"all" | ModuleKey>("all");
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

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", moduleFilter],
    queryFn: () =>
      api<{ tasks: Task[] }>(
        moduleFilter === "all" ? "/api/tasks" : `/api/tasks?module=${moduleFilter}`
      ),
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

  // ── Mutations ──────────────────────────────────────────────────
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
        }),
      }),
    onSuccess: () => {
      invalidate(["tasks"]);
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
          invalidate(["tasks"]);
          toast.success(`به «${TASK_STATUS[destStatus as TaskStatus].label}» منتقل شد`);
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
          invalidate(["tasks"]);
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
        invalidate(["tasks"]);
        toast.success("تسک حذف شد");
        onClose?.();
      },
      onError: (err: Error) => toast.error(err.message),
    });
  }

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

      {isLoading ? (
        <LoadingState />
      ) : tasks.length === 0 && !createOpen ? (
        <Card className="p-0">
          <EmptyState
            icon="task"
            title="تسکی وجود ندارد"
            description="اولین تسک را ایجاد کنید و آن را روی بورد بکشید."
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
              />
            ))}
          </div>

          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18,0.67,0.6,1.22)" }}>
            {activeTask ? <TaskCardOverlay task={activeTask} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
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
            <TaskFormFields form={createForm} setForm={setCreateForm} />
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ویرایش تسک</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4">
            <TaskFormFields form={editForm} setForm={setEditForm} withStatus />
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
}: {
  col: (typeof COLUMNS)[number];
  tasks: Task[];
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
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
            <TaskCard key={t.id} task={t} onEdit={onEdit} onDelete={onDelete} />
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
}: {
  task: Task;
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
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

      {/* Linked order */}
      {task.order && (
        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
          <Icon name="orders" size={11} />
          <span>
            سفارش #{task.order.number}
            {task.order.customer?.name ? ` · ${task.order.customer.name}` : ""}
          </span>
        </div>
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
      </div>
    </div>
  );
}

// ─── Shared form fields (create + edit) ───────────────────────────
function TaskFormFields({
  form,
  setForm,
  withStatus,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  withStatus?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>عنوان *</Label>
        <Input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="عنوان تسک"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label>توضیحات</Label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={2}
          placeholder="توضیحات اختیاری..."
        />
      </div>

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

        <div className="space-y-1.5">
          <Label>تاریخ سررسید</Label>
          <DatePicker
            value={form.dueDate || null}
            onChange={(d) =>
              setForm((f) => ({ ...f, dueDate: d ? d.toISOString().slice(0, 10) : "" }))
            }
            placeholder="انتخاب تاریخ"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>ماژول</Label>
          <Select
            value={form.module}
            onValueChange={(v) => setForm((f) => ({ ...f, module: v as ModuleKey }))}
          >
            <SelectTrigger>
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
        </div>

        {withStatus && (
          <div className="space-y-1.5">
            <Label>وضعیت</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as TaskStatus }))}
            >
              <SelectTrigger>
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
          </div>
        )}
      </div>
    </div>
  );
}
