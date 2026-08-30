"use client";

// Printoo24 ERP — Order Detail Modal tabs (Phase 2)
//
// Presentational components (one file, 6 tabs — honors the 3-file atomic rule;
// Open-Closed: a future tab = a new export here, no modal rewrite).
// Each tab receives `order` + focused callbacks. Heavy tabs (Costs) lazy-fetch
// their own data — only mounted when active (natural code-splitting).

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchSelect } from "@/components/shared/search-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate, daysRemaining } from "@/lib/format";
import {
  ORDER_STATUS,
  ITEM_STAGE,
  TASK_STATUS,
  PRIORITY,
  MODULES,
  USER_ROLE,
  type OrderStatus,
  type ModuleKey,
} from "@/lib/constants";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import type { OrderDetail } from "./order-detail-modal";

// ─── Phase 7: وضعیت پیش‌فاکتور — همان رنگ‌های lib/pre-invoice ──────
const PI_STATUS_BADGE = {
  draft: { label: "پیش‌نویس", cls: "bg-muted text-muted-foreground" },
  sent: { label: "ارسال‌شده", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" },
  approved: { label: "تاییدشده", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  rejected: { label: "ردشده", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
  converted: { label: "تبدیل به فاکتور", cls: "bg-primary/15 text-primary" },
} as const;

// ─── 1. Overview tab ────────────────────────────────────────────
// Context-First: identity, next-action CTA, status timeline, note.
const NEXT_ACTION: Partial<Record<OrderStatus, { to: OrderStatus; label: string; icon: Parameters<typeof Icon>[0]["name"]; }>> = {
  pending_design: { to: "in_printing", label: "ارسال به چاپ", icon: "print" },
  in_printing: { to: "warehouse_logistics", label: "ارسال به انبار", icon: "truck" },
  warehouse_logistics: { to: "completed", label: "تکمیل سفارش", icon: "checkCircle" },
  completed: { to: "archived", label: "آرشیو سفارش", icon: "archive" },
};

export function OverviewTab({
  order,
  status,
  onAdvance,
  advancing,
  note,
  onNoteChange,
  onSaveNote,
  savingNote,
  onGoTab,
}: {
  order: OrderDetail;
  status: OrderStatus;
  onAdvance: (s: OrderStatus) => void;
  advancing: boolean;
  note: string;
  onNoteChange: (v: string) => void;
  onSaveNote: () => void;
  savingNote: boolean;
  onGoTab: (t: "items" | "tasks" | "costs" | "finance" | "history") => void;
}) {
  const next = NEXT_ACTION[status];
  const unpaid = Math.max(0, order.totalAmount - order.paidAmount);
  const tasksCount = order.tasks?.length ?? 0;
  const doneTasks = order.tasks?.filter((t) => t.status === "done").length ?? 0;
  const blockingItems =
    order.items?.filter(
      (i) => i.needsMaterial && !i.materialConfirmed && i.stage !== "completed"
    ).length ?? 0;

  return (
    <div className="space-y-4">
      {/* Next-action CTA — Action-Forward principle */}
      {next ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
          <div className="size-10 rounded-lg bg-primary/15 text-primary grid place-items-center shrink-0">
            <Icon name={next.icon} size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">گام بعدی</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              این سفارش در وضعیت «{ORDER_STATUS[status].label}» است.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => onAdvance(next.to)}
            disabled={advancing}
            className="gap-1.5 shrink-0"
          >
            {advancing ? (
              <Icon name="loading" size={14} className="animate-spin" />
            ) : (
              <Icon name="arrowLeft" size={14} />
            )}
            {next.label}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-muted/30 p-4 flex items-center gap-3">
          <div className="size-10 rounded-lg bg-muted text-muted-foreground grid place-items-center shrink-0">
            <Icon name="checkBadge" size={20} />
          </div>
          <div className="text-sm">
            این سفارش در وضعیت نهایی (
            {ORDER_STATUS[status].label}) قرار دارد.
          </div>
        </div>
      )}

      {/* Quick stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          onClick={() => onGoTab("items")}
          className="rounded-lg border p-3 text-right hover:bg-accent/30 transition"
        >
          <div className="text-[10px] text-muted-foreground">آیتم‌ها</div>
          <div className="text-lg font-bold mt-0.5 tabular-nums">
            {order.items?.length ?? 0}
          </div>
        </button>
        <button
          onClick={() => onGoTab("tasks")}
          className="rounded-lg border p-3 text-right hover:bg-accent/30 transition"
        >
          <div className="text-[10px] text-muted-foreground">تسک‌ها</div>
          <div className="text-lg font-bold mt-0.5 tabular-nums">
            {tasksCount}
            {tasksCount > 0 && (
              <span className="text-[11px] font-normal text-muted-foreground mr-1">
                ({doneTasks} انجام‌شده)
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => onGoTab("finance")}
          className="rounded-lg border p-3 text-right hover:bg-accent/30 transition"
        >
          <div className="text-[10px] text-muted-foreground">باقی‌مانده</div>
          <div
            className={cn(
              "text-lg font-bold mt-0.5 tabular-nums",
              unpaid > 0 ? "text-rose-600" : "text-emerald-600"
            )}
            dir="ltr"
          >
            {formatCurrency(unpaid)}
          </div>
        </button>
        <div className="rounded-lg border p-3">
          <div className="text-[10px] text-muted-foreground">اولویت</div>
          <div className="text-lg font-bold mt-0.5">
            {PRIORITY[order.priority as keyof typeof PRIORITY]?.label ?? "—"}
          </div>
        </div>
      </div>

      {/* Blocking items callout */}
      {blockingItems > 0 && (
        <button
          onClick={() => onGoTab("items")}
          className="w-full rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 flex items-center gap-2 text-right hover:opacity-80 transition"
        >
          <Icon name="alert" size={16} className="text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800 dark:text-amber-200">
            {blockingItems} آیتم نیازمند تأمین متریال است — قبل از چاپ بررسی شود.
          </span>
        </button>
      )}

      {/* Note — Progressive Disclosure: a section, not a tab peer */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
          <span className="text-xs font-medium flex items-center gap-1.5">
            <Icon name="info" size={13} /> یادداشت سفارش
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={onSaveNote}
            disabled={savingNote || note === (order.note ?? "")}
            className="h-7 gap-1 text-xs"
          >
            {savingNote ? (
              <Icon name="loading" size={12} className="animate-spin" />
            ) : (
              <Icon name="check" size={12} />
            )}
            ذخیره
          </Button>
        </div>
        <Textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={3}
          placeholder="یادداشت داخلی درباره این سفارش..."
          className="border-0 rounded-none focus-visible:ring-0 resize-none text-sm"
        />
      </div>
    </div>
  );
}

// ─── 2. Items tab ───────────────────────────────────────────────
export function ItemsTab({ order }: { order: OrderDetail }) {
  if (!order.items?.length) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        این سفارش آیتمی ندارد.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {order.items.map((it, i) => {
        const stage = ITEM_STAGE[it.stage as keyof typeof ITEM_STAGE];
        const designLate =
          it.designEndDate &&
          it.stage === "design" &&
          new Date(it.designEndDate) < new Date();
        const printLate =
          it.printEndDate &&
          it.stage === "print" &&
          new Date(it.printEndDate) < new Date();
        return (
          <div
            key={it.id}
            className="rounded-lg border p-3 hover:bg-accent/30 transition"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="size-6 rounded-md bg-muted text-muted-foreground grid place-items-center text-xs font-bold shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">
                    {it.product?.name ?? "—"}
                  </div>
                  {it.description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {it.description}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-left shrink-0">
                <div className="text-sm font-semibold tabular-nums" dir="ltr">
                  {formatCurrency(it.totalAmount)}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums" dir="ltr">
                  {it.quantity} × {formatCurrency(it.pricePerUnit)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px]">
              <span className="px-1.5 py-0.5 rounded bg-muted">
                {stage?.label ?? it.stage}
              </span>
              {it.needsMaterial && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded flex items-center gap-0.5",
                    it.materialConfirmed
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                  )}
                >
                  <Icon name={it.materialConfirmed ? "check" : "alert"} size={10} />
                  {it.materialConfirmed ? "متریال تأمین شد" : "نیازمند متریال"}
                </span>
              )}
              {it.designStartDate && (
                <span className="text-muted-foreground flex items-center gap-0.5">
                  <Icon name="design" size={10} /> طراحی:{" "}
                  {formatDate(it.designStartDate)}
                  {it.designEndDate && ` تا ${formatDate(it.designEndDate)}`}
                  {designLate && (
                    <span className="text-rose-600 mr-0.5">(معوق)</span>
                  )}
                </span>
              )}
              {it.printStartDate && (
                <span className="text-muted-foreground flex items-center gap-0.5">
                  <Icon name="print" size={10} /> چاپ:{" "}
                  {formatDate(it.printStartDate)}
                  {it.printEndDate && ` تا ${formatDate(it.printEndDate)}`}
                  {printLate && (
                    <span className="text-rose-600 mr-0.5">(معوق)</span>
                  )}
                </span>
              )}
              {it.note && (
                <span className="text-muted-foreground flex items-center gap-0.5 truncate max-w-[200px]">
                  <Icon name="info" size={10} /> {it.note}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── 3. Tasks tab (Phase 4: inline quick-create — ارجاع در <۵ ثانیه) ──
//
// Scenario-3 (cross-panel referral): from an open order, the admin creates
// a task ALREADY linked to this order (orderId pre-filled), routes it to the
// right panel (module), and hands it to a person (assignee) — without ever
// leaving the modal. Zero-Learning-Curve: one compact form, one click.
export function TasksTab({ order }: { order: OrderDetail }) {
  const navigate = useAppStore((s) => s.navigate);
  const invalidate = useInvalidate();
  const tasks = order.tasks ?? [];

  // Active users for the assignee picker.
  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () =>
      api<{ users: { id: string; name: string; role: string }[] }>("/api/users"),
    staleTime: 60_000,
  });
  const assigneeOptions = (usersData?.users ?? []).map((u) => ({
    value: u.id,
    label: u.name,
    sub: USER_ROLE[u.role]?.label ?? u.role,
  }));

  // Quick-create state — deliberately minimal (title + module + assignee).
  const [qcOpen, setQcOpen] = React.useState(false);
  const [qcTitle, setQcTitle] = React.useState("");
  const [qcModule, setQcModule] = React.useState<ModuleKey>(
    order.status === "pending_design"
      ? "designer"
      : order.status === "in_printing"
      ? "print"
      : order.status === "warehouse_logistics"
      ? "warehouse"
      : "admin"
  );
  const [qcAssignee, setQcAssignee] = React.useState<string | null>(null);
  const [qcDueDate, setQcDueDate] = React.useState("");

  const createMut = useMutation({
    mutationFn: () =>
      api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: qcTitle,
          module: qcModule,
          orderId: order.id,
          customerId: order.customer?.id ?? null,
          assignedTo: qcAssignee,
          dueDate: qcDueDate || null,
        }),
      }),
    onSuccess: () => {
      invalidate(["tasks", "dashboard", "order"]);
      toast.success("تسک ایجاد و به سفارش متصل شد");
      setQcOpen(false);
      setQcTitle("");
      setQcAssignee(null);
      setQcDueDate("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {/* Quick-create — the <5-second referral path */}
      {qcOpen ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!qcTitle.trim()) {
              toast.error("عنوان الزامی است");
              return;
            }
            createMut.mutate();
          }}
          className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2.5"
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <Icon name="taskAdd" size={13} />
            تسک جدید برای سفارش #{order.number}
          </div>
          <Input
            value={qcTitle}
            onChange={(e) => setQcTitle(e.target.value)}
            placeholder="مثلاً: طراحی فایل لگو — نسخه ۲"
            autoFocus
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Select
              value={qcModule}
              onValueChange={(v) => setQcModule(v as ModuleKey)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MODULES) as ModuleKey[]).map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">
                    {MODULES[m].faLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SearchSelect
              value={qcAssignee}
              onChange={setQcAssignee}
              placeholder="مسئول انجام"
              searchPlaceholder="جستجوی نام کارمند..."
              options={assigneeOptions}
              className="h-9 text-xs"
            />
            <DatePicker
              value={qcDueDate ? new Date(qcDueDate) : null}
              onChange={(d) => setQcDueDate(d ? format(d, "yyyy-MM-dd") : "")}
              placeholder="سررسید (اختیاری)"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={createMut.isPending} className="gap-1.5">
              {createMut.isPending ? (
                <Icon name="loading" size={14} className="animate-spin" />
              ) : (
                <Icon name="check" size={14} />
              )}
              ایجاد و ارجاع
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setQcOpen(false)}
            >
              انصراف
            </Button>
          </div>
        </form>
      ) : (
        <Button
          size="sm"
          variant={tasks.length === 0 ? "default" : "outline"}
          onClick={() => setQcOpen(true)}
          className="gap-1.5 w-full sm:w-auto"
        >
          <Icon name="plus" size={14} /> تسک جدید برای این سفارش
        </Button>
      )}

      {/* Task list */}
      {tasks.length === 0 ? (
        <div className="py-6 text-center space-y-1">
          <Icon name="task" size={28} className="mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            این سفارش هنوز تسکی ندارد — با فرم بالا در چند ثانیه ارجاع دهید.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => {
            const ts = TASK_STATUS[t.status as keyof typeof TASK_STATUS];
            const dr = daysRemaining(t.dueDate ?? null);
            const isOverdue = t.dueDate && t.status !== "done" && new Date(t.dueDate) < new Date();
            return (
              <div
                key={t.id}
                className="rounded-lg border p-3 flex items-start gap-2.5"
              >
                <span
                  className={cn(
                    "size-2 rounded-full mt-1.5 shrink-0",
                    t.status === "done"
                      ? "bg-emerald-500"
                      : t.status === "in_progress"
                      ? "bg-amber-500"
                      : "bg-slate-400"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  {t.description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {t.description}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-muted">
                      {ts?.label ?? t.status}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-muted">
                      {MODULES[t.module as ModuleKey]?.faLabel ?? t.module}
                    </span>
                    <span>
                      {PRIORITY[t.priority as keyof typeof PRIORITY]?.label ?? t.priority}
                    </span>
                    {t.dueDate && (
                      <span
                        className={cn(
                          "flex items-center gap-0.5",
                          isOverdue && "text-rose-600"
                        )}
                      >
                        <Icon name="clock" size={10} />
                        {formatDate(t.dueDate)}
                        {isOverdue && " (معوق)"}
                        {!isOverdue && dr.status !== "none" && ` (${dr.text})`}
                      </span>
                    )}
                    {t.assignedUser ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 font-medium">
                        <Icon name="user" size={10} /> {t.assignedUser.name}
                      </span>
                    ) : (
                      t.status !== "done" && (
                        <span className="inline-flex items-center gap-0.5 text-muted-foreground/70">
                          <Icon name="user" size={10} /> بدون مسئول
                        </span>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={() => navigate("admin", "tasks")}
        className="gap-1.5 text-xs"
      >
        <Icon name="arrowLeft" size={12} /> مدیریت همه تسک‌ها در بورد کانبان
      </Button>
    </div>
  );
}

// ─── 4. Costs tab (lazy-fetch — only mounts when active) ────────
type MaterialCostRow = {
  id: string;
  amount: number;
  status: string;
  module: string;
  description: string | null;
  supplier: { id: string; name: string } | null;
  expenseType: { id: string; name: string } | null;
  createdAt: string;
};

const COST_STATUS: Record<string, { label: string; badge: string }> = {
  pending: { label: "در انتظار", badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  approved: { label: "تأیید شده", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  rejected: { label: "رد شده", badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
};

export function CostsTab({ order }: { order: OrderDetail }) {
  const navigate = useAppStore((s) => s.navigate);
  const { data, isLoading } = useQuery({
    queryKey: ["order-costs", order.id],
    queryFn: () => api<{ costs: MaterialCostRow[] }>(`/api/material-costs?orderId=${order.id}`),
  });
  const costs = data?.costs ?? [];
  const total = costs.reduce((s, c) => s + c.amount, 0);
  const approved = costs.filter((c) => c.status === "approved").reduce((s, c) => s + c.amount, 0);
  const pending = costs.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }
  if (costs.length === 0) {
    return (
      <div className="py-8 text-center space-y-2">
        <Icon name="coins" size={28} className="mx-auto text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          هزینه متریال/چاپ برای این سفارش ثبت نشده است.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">کل هزینه‌ها</div>
          <div className="text-sm font-bold mt-0.5 tabular-nums" dir="ltr">
            {formatCurrency(total)}
          </div>
        </div>
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">تأیید شده</div>
          <div className="text-sm font-bold mt-0.5 text-emerald-600 tabular-nums" dir="ltr">
            {formatCurrency(approved)}
          </div>
        </div>
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">در انتظار</div>
          <div className="text-sm font-bold mt-0.5 text-amber-600 tabular-nums" dir="ltr">
            {formatCurrency(pending)}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {costs.map((c) => {
          const st = COST_STATUS[c.status] ?? { label: c.status, badge: "bg-muted text-muted-foreground" };
          return (
            <div key={c.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {c.expenseType?.name ?? "هزینه"} — {c.supplier?.name ?? "بدون تأمین‌کننده"}
                  </div>
                  {c.description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {c.description}
                    </div>
                  )}
                </div>
                <div className="text-left shrink-0">
                  <div className="text-sm font-semibold tabular-nums" dir="ltr">
                    {formatCurrency(c.amount)}
                  </div>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded inline-block mt-0.5", st.badge)}>
                    {st.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => navigate("admin", "suppliers")}
        className="gap-1.5 text-xs"
      >
        <Icon name="arrowLeft" size={12} /> مدیریت در ماژول تأمین‌کنندگان
      </Button>
    </div>
  );
}

// ─── 5. Finance tab (replaces the no-op "فاکتور" button — R5 fix) ──
export function FinanceTab({
  order,
  onPreInvoice,
}: {
  order: OrderDetail;
  onPreInvoice: () => void;
}) {
  const unpaid = Math.max(0, order.totalAmount - order.paidAmount);
  const hasPreInvoice = (order.preInvoices?.length ?? 0) > 0;
  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">مبلغ کل سفارش</div>
          <div className="text-sm font-bold mt-0.5 tabular-nums" dir="ltr">
            {formatCurrency(order.totalAmount)}
          </div>
        </div>
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">پرداخت‌شده</div>
          <div className="text-sm font-bold mt-0.5 text-emerald-600 tabular-nums" dir="ltr">
            {formatCurrency(order.paidAmount)}
          </div>
        </div>
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">باقی‌مانده</div>
          <div className={cn("text-sm font-bold mt-0.5 tabular-nums", unpaid > 0 ? "text-rose-600" : "text-emerald-600")} dir="ltr">
            {formatCurrency(unpaid)}
          </div>
        </div>
      </div>

      {/* Pre-invoices — Phase 7: status-aware rows, click opens management */}
      <div className="rounded-lg border">
        <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
          <span className="text-xs font-medium flex items-center gap-1.5">
            <Icon name="receipt" size={13} /> پیش‌فاکتورها
          </span>
          <Button size="sm" variant="outline" onClick={onPreInvoice} className="h-7 gap-1 text-xs">
            <Icon name="plus" size={12} />
            {hasPreInvoice ? "مدیریت" : "صدور"}
          </Button>
        </div>
        <div className="divide-y">
          {order.preInvoices?.length ? (
            order.preInvoices.map((pi) => {
              const st = (pi.status ?? "draft") as keyof typeof PI_STATUS_BADGE;
              const badge = PI_STATUS_BADGE[st] ?? PI_STATUS_BADGE.draft;
              return (
                <button
                  key={pi.id}
                  onClick={onPreInvoice}
                  className="w-full text-right px-3 py-2 flex items-center justify-between hover:bg-accent/40 transition"
                >
                  <div>
                    <div className="text-sm font-medium flex items-center gap-2">
                      پیش‌فاکتور #{pi.number}
                      <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", badge.cls)}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {pi.issueDate || pi.date ? formatDate(pi.issueDate ?? pi.date!) : ""}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold tabular-nums" dir="ltr">
                      {formatCurrency(pi.totalAmount)}
                    </div>
                    <div className="text-[11px] text-emerald-600 tabular-nums" dir="ltr">
                      پرداخت: {formatCurrency(pi.paidAmount)}
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              پیش‌فاکتوری صادر نشده است.
            </div>
          )}
        </div>
      </div>

      {/* Invoice (real display — was a no-op button, R5 fixed) */}
      <div className="rounded-lg border">
        <div className="px-3 py-2 border-b bg-muted/30">
          <span className="text-xs font-medium flex items-center gap-1.5">
            <Icon name="invoice" size={13} /> فاکتور رسمی
          </span>
        </div>
        <div className="px-3 py-2">
          {order.invoice ? (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">فاکتور #{order.invoice.number}</div>
                <div className="text-[11px] text-muted-foreground">
                  {order.invoice.date ? formatDate(order.invoice.date) : ""}
                </div>
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold tabular-nums" dir="ltr">
                  {formatCurrency(order.invoice.totalAmount)}
                </div>
                <div className="text-[11px] text-emerald-600 tabular-nums" dir="ltr">
                  پرداخت: {formatCurrency(order.invoice.paidAmount)}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-1">
              فاکتور رسمی صادر نشده. (صدور فاکتور در ماژول مالی فعال خواهد شد.)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 6. History tab (reconstructed timeline; AuditLog deferred) ──
type TimelineEvent = {
  date: string;
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  subtitle?: string;
  tone: "neutral" | "emerald" | "amber" | "rose" | "violet";
};

export function HistoryTab({ order }: { order: OrderDetail }) {
  const events: TimelineEvent[] = [];

  events.push({
    date: order.createdAt,
    icon: "plus",
    title: `سفارش #${order.number} ایجاد شد`,
    subtitle: order.createdBy ? `توسط ${order.createdBy}` : undefined,
    tone: "neutral",
  });

  for (const t of order.tasks ?? []) {
    events.push({
      date: t.createdAt,
      icon: "task",
      title: `تسک «${t.title}» ثبت شد`,
      subtitle: t.assignedTo ? `ارجاع به ${t.assignedTo}` : undefined,
      tone: "violet",
    });
  }
  for (const pi of order.preInvoices ?? []) {
    events.push({
      date: pi.date ?? pi.id,
      icon: "receipt",
      title: `پیش‌فاکتور #${pi.number} صادر شد`,
      subtitle: `مبلغ: ${formatCurrency(pi.totalAmount)}`,
      tone: "emerald",
    });
  }
  if (order.invoice) {
    events.push({
      date: order.invoice.date ?? order.invoice.id,
      icon: "invoice",
      title: `فاکتور رسمی #${order.invoice.number} صادر شد`,
      subtitle: `مبلغ: ${formatCurrency(order.invoice.totalAmount)}`,
      tone: "emerald",
    });
  }

  events.sort((a, b) => (new Date(a.date).getTime() - new Date(b.date).getTime()));

  const toneClass: Record<TimelineEvent["tone"], string> = {
    neutral: "bg-muted text-muted-foreground",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  };

  if (events.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        رویدادی برای نمایش وجود ندارد.
      </div>
    );
  }
  return (
    <div className="relative pr-4">
      <div className="absolute right-[7px] top-2 bottom-2 w-px bg-border" />
      <div className="space-y-3">
        {events.map((ev, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="relative flex items-start gap-3"
          >
            <span
              className={cn(
                "size-3.5 rounded-full grid place-items-center shrink-0 mt-0.5 ring-4 ring-background",
                toneClass[ev.tone]
              )}
            >
              <Icon name={ev.icon} size={8} className="opacity-80" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{ev.title}</div>
              {ev.subtitle && (
                <div className="text-xs text-muted-foreground">{ev.subtitle}</div>
              )}
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                {formatDate(ev.date)}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
