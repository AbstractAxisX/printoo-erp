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
import { SearchSelect, type SearchOption } from "@/components/shared/search-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate, formatDateTime, daysRemaining } from "@/lib/format";
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
import { t as tr } from "@/lib/i18n";

// ─── Phase 7: وضعیت پیش‌فاکتور — همان رنگ‌های lib/pre-invoice ──────
const PI_STATUS_BADGE = {
  draft: { label: tr("پیش‌نویس"), cls: "bg-muted text-muted-foreground" },
  sent: { label: tr("ارسال‌شده"), cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" },
  approved: { label: tr("تاییدشده"), cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  rejected: { label: tr("ردشده"), cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
  converted: { label: tr("تبدیل به فاکتور"), cls: "bg-primary/15 text-primary" },
} as const;

// ─── Phase 18: کارت «مسئولان سفارش» (تغییر مجری — ادمین) ──────────
//
// خواستهٔ کارفرما: «بشه راحت ادمین بتونه کارمند سفارش رو در هر بخش عوض
// کنه؛ سفارش از پنل کارمند فعلی برداشته بشه و بره تو پنل کارمند جدید.»
// قرارداد: PUT /api/orders/[id]/assignee — آبشار کامل (سطح سفارش +
// آیتم‌های جاری + اعلان «واگذار شد / از شما گرفته شد» + رویداد تاریخچه).
// این کارت فقط UI همان قرارداد است؛ جابجایی بین پنل‌ها سمت سرور رخ می‌دهد.
//
// سطوح دسترسی: اکشن تغییر فقط برای نقش مدیریتی (master / ماژول admin)؛
// سایر نقش‌ها فقط نام فعلی را می‌بینند (بدون دراپ‌داون). فهرست کاربران:
// GET /api/users?module=designer|print (فقط فعال‌ها + وضعیت مرخصی امروز).

type ModuleAssigneeUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  onLeaveToday?: boolean;
  leaveNote?: string | null;
};

function useModuleAssignees(module: "designer" | "print", enabled: boolean) {
  return useQuery({
    queryKey: ["users", "module", module],
    queryFn: () => api<{ users: ModuleAssigneeUser[] }>(`/api/users?module=${module}`),
    staleTime: 60_000,
    enabled,
  });
}

/** آپشن‌های کامبو: «بدون تخصیص» + کاربران فعال همان ماژول + fallback مجری فعلیِ خارج از فهرست. */
function assigneeOptions(
  users: ModuleAssigneeUser[],
  currentId: string | null,
  currentName: string | null
): SearchOption[] {
  const opts: SearchOption[] = [
    { value: "", label: tr("بدون تخصیص (استخر عمومی)") },
    ...users.map((u) => ({
      value: u.id,
      label: u.onLeaveToday ? tr("{p0} — مرخصی", { p0: u.name }) : u.name,
      sub: u.onLeaveToday ? tr("امروز در مرخصی است") : USER_ROLE[u.role]?.label ?? u.role,
    })),
  ];
  // مجری فعلیِ خارج از فهرست فعال (غیرفعال/بی‌ماژول شده) — گزینهٔ fallback تا نامش گم نشود
  if (currentId && !opts.some((o) => o.value === currentId)) {
    opts.push({
      value: currentId,
      label: currentName ?? tr("کاربر تخصیص‌یافته"),
      sub: tr("خارج از فهرست فعال"),
    });
  }
  return opts;
}

function AssigneeRow({
  label,
  icon,
  accent,
  currentId,
  currentName,
  onLeave,
  leaveNote,
  canManage,
  options,
  onChange,
  pending,
  searchPlaceholder,
  ariaLabel,
}: {
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  accent: string;
  currentId: string | null;
  currentName: string | null;
  onLeave: boolean;
  leaveNote: string | null;
  canManage: boolean;
  options: SearchOption[];
  onChange: (v: string | null) => void;
  pending: boolean;
  searchPlaceholder: string;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <span className={cn("size-8 rounded-lg grid place-items-center shrink-0", accent)}>
        <Icon name={icon} size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          {label}
          {onLeave && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-medium"
              title={leaveNote ?? tr("امروز در مرخصی است")}
            >
              {tr("مرخصی")}
            </span>
          )}
          {pending && (
            <Icon name="loading" size={11} className="animate-spin text-muted-foreground" />
          )}
        </div>
        {canManage ? (
          <div role="group" aria-label={ariaLabel} className="mt-1 max-w-[260px]">
            <SearchSelect
              value={currentId ?? ""}
              onChange={onChange}
              options={options}
              placeholder={tr("انتخاب مجری...")}
              searchPlaceholder={searchPlaceholder}
              className="w-full h-8 text-xs"
            />
          </div>
        ) : (
          <div
            className={cn(
              "text-sm font-medium truncate mt-0.5",
              !currentName && "text-muted-foreground"
            )}
          >
            {currentName ?? tr("بدون تخصیص (استخر عمومی)")}
          </div>
        )}
      </div>
    </div>
  );
}

export function OrderAssigneesCard({ order }: { order: OrderDetail }) {
  const user = useAppStore((s) => s.user);
  const invalidate = useInvalidate();
  // اکشن تغییر فقط برای نقش مدیریتی (master / ماژول admin) — بقیه فقط نمایش
  const canManage =
    !!user && (user.role === "master" || (user.modules ?? []).includes("admin"));

  const { data: designerData } = useModuleAssignees("designer", canManage);
  const { data: printerData } = useModuleAssignees("print", canManage);
  const designers = designerData?.users ?? [];
  const printers = printerData?.users ?? [];

  const assignMut = useMutation({
    mutationFn: (v: { field: "designerId" | "printerId"; value: string; name: string | null }) =>
      api<{ ok: boolean; moved: { designItems: number; printItems: number } }>(
        `/api/orders/${order.id}/assignee`,
        { method: "PUT", body: JSON.stringify({ [v.field]: v.value }) }
      ),
    onSuccess: (_data, v) => {
      // مودال (["order", id]) + لیست‌های همهٔ پنل‌ها (["orders", ...]) + اعلان‌ها
      invalidate(["order", "orders", "notifications", "dashboard"]);
      toast.success(
        `مسئول ${v.field === "designerId" ? "طراحی" : "چاپ"} سفارش #${order.number} تغییر کرد — ${
          v.name ?? "بدون تخصیص (استخر عمومی)"
        }`
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // مجری مؤثر — سطح سفارش با fallback به اولین آیتم جاری همان مرحله
  const firstDesignItem = order.items.find((i) => i.stage === "design");
  const firstPrintItem = order.items.find(
    (i) => i.stage === "design" || i.stage === "print"
  );
  const designerId =
    order.assignedDesignerId ?? firstDesignItem?.designAssigneeId ?? null;
  const designerName =
    order.assignedDesigner?.name ?? firstDesignItem?.designAssigneeUser?.name ?? null;
  const printerId =
    order.assignedPrinterId ?? firstPrintItem?.printAssigneeId ?? null;
  const printerName =
    order.assignedPrinter?.name ?? firstPrintItem?.printAssigneeUser?.name ?? null;

  const designerActive = designers.find((u) => u.id === designerId);
  const printerActive = printers.find((u) => u.id === printerId);

  const makeOnChange = (
    field: "designerId" | "printerId",
    users: ModuleAssigneeUser[],
    currentId: string | null
  ) => (v: string | null) => {
    const val = v ?? "";
    // بدون تغییر / در حال ارسال → هیچ (SearchSelect پراپ disabled ندارد؛ گارد نرم)
    if (assignMut.isPending || val === (currentId ?? "")) return;
    assignMut.mutate({
      field,
      value: val,
      name: users.find((u) => u.id === val)?.name ?? null,
    });
  };

  const pendingField = assignMut.isPending ? assignMut.variables?.field ?? null : null;

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
        <span className="text-xs font-medium flex items-center gap-1.5">
          <Icon name="users" size={13} /> {tr("مسئولان سفارش")}
        </span>
        {canManage && (
          <span className="text-[10px] text-muted-foreground">
            {tr("تغییر مجری، سفارش را بین پنل کارکنان جابجا می‌کند")}
          </span>
        )}
      </div>
      <div className="divide-y">
        <AssigneeRow
          label={tr("طراح مسئول")}
          icon="design"
          accent="text-violet-600 bg-violet-500/10"
          currentId={designerId}
          currentName={designerName}
          onLeave={!!designerActive?.onLeaveToday}
          leaveNote={designerActive?.leaveNote ?? null}
          canManage={canManage}
          options={assigneeOptions(designers, designerId, designerName)}
          onChange={makeOnChange("designerId", designers, designerId)}
          pending={pendingField === "designerId"}
          searchPlaceholder={tr("جستجوی طراح...")}
          ariaLabel={tr("تغییر طراح مسئول سفارش")}
        />
        <AssigneeRow
          label={tr("چاپ‌کار مسئول")}
          icon="print"
          accent="text-amber-600 bg-amber-500/10"
          currentId={printerId}
          currentName={printerName}
          onLeave={!!printerActive?.onLeaveToday}
          leaveNote={printerActive?.leaveNote ?? null}
          canManage={canManage}
          options={assigneeOptions(printers, printerId, printerName)}
          onChange={makeOnChange("printerId", printers, printerId)}
          pending={pendingField === "printerId"}
          searchPlaceholder={tr("جستجوی چاپ‌کار...")}
          ariaLabel={tr("تغییر چاپ‌کار مسئول سفارش")}
        />
      </div>
    </div>
  );
}

// ─── 1. Overview tab ────────────────────────────────────────────
// Context-First: identity, next-action CTA, status timeline, note.
const NEXT_ACTION: Partial<Record<OrderStatus, { to: OrderStatus; label: string; icon: Parameters<typeof Icon>[0]["name"]; }>> = {
  pending_design: { to: "in_printing", label: tr("ارسال به چاپ"), icon: "print" },
  in_printing: { to: "warehouse_logistics", label: tr("ارسال به انبار"), icon: "truck" },
  warehouse_logistics: { to: "completed", label: tr("تکمیل سفارش"), icon: "checkCircle" },
  completed: { to: "archived", label: tr("آرشیو سفارش"), icon: "archive" },
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
  onGoTab: (t: "items" | "tasks" | "costs" | "preInvoice" | "invoice" | "history") => void;
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
            <div className="text-sm font-semibold">{tr("گام بعدی")}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {tr("این سفارش در وضعیت «{p0}» است.", { p0: ORDER_STATUS[status].label })}
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
            {tr("این سفارش در وضعیت نهایی")} (
            {tr("{p0}) قرار دارد.", { p0: ORDER_STATUS[status].label })}
          </div>
        </div>
      )}

      {/* Quick stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          onClick={() => onGoTab("items")}
          className="rounded-lg border p-3 text-right hover:bg-accent/30 transition"
        >
          <div className="text-[10px] text-muted-foreground">{tr("آیتم‌ها")}</div>
          <div className="text-lg font-bold mt-0.5 tabular-nums">
            {order.items?.length ?? 0}
          </div>
        </button>
        <button
          onClick={() => onGoTab("tasks")}
          className="rounded-lg border p-3 text-right hover:bg-accent/30 transition"
        >
          <div className="text-[10px] text-muted-foreground">{tr("تسک‌ها")}</div>
          <div className="text-lg font-bold mt-0.5 tabular-nums">
            {tasksCount}
            {tasksCount > 0 && (
              <span className="text-[11px] font-normal text-muted-foreground mr-1">
                {tr("({p0} انجام‌شده)", { p0: doneTasks })}
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => onGoTab("preInvoice")}
          className="rounded-lg border p-3 text-right hover:bg-accent/30 transition"
        >
          <div className="text-[10px] text-muted-foreground">{tr("باقی‌مانده")}</div>
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
          <div className="text-[10px] text-muted-foreground">{tr("اولویت")}</div>
          <div className="text-lg font-bold mt-0.5">
            {PRIORITY[order.priority as keyof typeof PRIORITY]?.label ?? "—"}
          </div>
        </div>
      </div>

      {/* Phase 18: مسئولان سفارش — نمایش/تغییر مجری (طراح/چاپ‌کار) */}
      <OrderAssigneesCard order={order} />

      {/* Blocking items callout */}
      {blockingItems > 0 && (
        <button
          onClick={() => onGoTab("items")}
          className="w-full rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 flex items-center gap-2 text-right hover:opacity-80 transition"
        >
          <Icon name="alert" size={16} className="text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800 dark:text-amber-200">
            {tr("{p0} آیتم نیازمند تأمین متریال است — قبل از چاپ بررسی شود.", { p0: blockingItems })}
          </span>
        </button>
      )}

      {/* Note — Progressive Disclosure: a section, not a tab peer */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
          <span className="text-xs font-medium flex items-center gap-1.5">
            <Icon name="info" size={13} /> {tr("یادداشت سفارش")}
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
            {tr("ذخیره")}
          </Button>
        </div>
        <Textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={3}
          placeholder={tr("یادداشت داخلی درباره این سفارش...")}
          className="border-0 rounded-none focus-visible:ring-0 resize-none text-sm"
        />
      </div>
    </div>
  );
}

// ─── 2. Items tab ───────────────────────────────────────────────
// Phase 10: نمایش تاریخ طراحی/چاپ per-item + ویرایش همان‌جا
// (خواستهٔ 3: «براشون زمان طراحی و چاپ ثبت کنیم همونجا») — ادیتور
// هر آیتم 4 DatePicker دارد و فقط مقادیر غیرتهی ذخیره می‌شوند
// (PUT /api/orders/[id]/item-dates → تاریخ قبلی هرگز پاک نمی‌شود).
export function ItemsTab({ order }: { order: OrderDetail }) {
  const invalidate = useInvalidate();
  const [editing, setEditing] = React.useState<string | null>(null); // itemId در حال ویرایش
  const [draft, setDraft] = React.useState<{
    designStart: string; designEnd: string; printStart: string; printEnd: string;
  }>({ designStart: "", designEnd: "", printStart: "", printEnd: "" });

  const startEdit = (it: OrderDetail["items"][number]) => {
    setEditing(it.id);
    setDraft({
      designStart: it.designStartDate ? it.designStartDate.slice(0, 10) : "",
      designEnd: it.designEndDate ? it.designEndDate.slice(0, 10) : "",
      printStart: it.printStartDate ? it.printStartDate.slice(0, 10) : "",
      printEnd: it.printEndDate ? it.printEndDate.slice(0, 10) : "",
    });
  };

  const saveDates = useMutation({
    mutationFn: (itemId: string) => {
      // فقط تاریخ‌های پرشده ارسال می‌شوند (partial update)
      const updates: Record<string, string> = {};
      if (draft.designStart) updates.designStart = draft.designStart;
      if (draft.designEnd) updates.designEnd = draft.designEnd;
      if (draft.printStart) updates.printStart = draft.printStart;
      if (draft.printEnd) updates.printEnd = draft.printEnd;
      return api(`/api/orders/${order.id}/item-dates`, {
        method: "PUT",
        body: JSON.stringify({ updates: [{ itemId, ...updates }] }),
      });
    },
    onSuccess: () => {
      invalidate(["order", "orders"]);
      toast.success(tr("زمان‌بندی آیتم ذخیره شد"));
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!order.items?.length) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {tr("این سفارش آیتمی ندارد.")}
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
        // Phase 18: مجری مؤثر این آیتم — per-item با fallback به مجری سفارش
        const itemDesigner =
          it.designAssigneeUser?.name ?? order.assignedDesigner?.name ?? null;
        const itemPrinter =
          it.printAssigneeUser?.name ?? order.assignedPrinter?.name ?? null;
        const isEditing = editing === it.id;
        return (
          <div
            key={it.id}
            className={cn(
              "rounded-lg border p-3 hover:bg-accent/30 transition",
              isEditing && "border-primary/40 bg-primary/5"
            )}
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
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="text-left">
                  <div className="text-sm font-semibold tabular-nums" dir="ltr">
                    {formatCurrency(it.totalAmount)}
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums" dir="ltr">
                    {it.quantity} × {formatCurrency(it.pricePerUnit)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="size-7"
                  title={isEditing ? tr("بستن ویرایش") : tr("ویرایش زمان‌بندی این آیتم")}
                  onClick={() => (isEditing ? setEditing(null) : startEdit(it))}
                >
                  <Icon name={isEditing ? "cancel" : "edit"} size={13} />
                </Button>
              </div>
            </div>

            {/* حالت نمایش — تاریخ‌ها per-item */}
            {!isEditing && (
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
                    {it.materialConfirmed ? tr("متریال تأمین شد") : tr("نیازمند متریال")}
                  </span>
                )}
                {/* Phase 18: مجری‌های همین آیتم */}
                <span
                  className="px-1.5 py-0.5 rounded bg-muted flex items-center gap-0.5"
                  title={tr("طراح این آیتم")}
                >
                  <Icon name="user" size={10} /> {tr("طراح: {p0}", { p0: itemDesigner ?? "—" })}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded bg-muted flex items-center gap-0.5"
                  title={tr("چاپ‌کار این آیتم")}
                >
                  <Icon name="user" size={10} /> {tr("چاپ: {p0}", { p0: itemPrinter ?? "—" })}
                </span>
                <span className="text-muted-foreground flex items-center gap-0.5">
                  <Icon name="design" size={10} /> طراحی:{" "}
                  {it.designStartDate
                    ? tr("{p0}{p1}", { p0: formatDate(it.designStartDate), p1: it.designEndDate ? tr(" تا {p0}", { p0: formatDate(it.designEndDate) }) : "" })
                    : tr("ثبت نشده")}
                  {designLate && (
                    <span className="text-rose-600 mr-0.5">{tr("(معوق)")}</span>
                  )}
                </span>
                <span className="text-muted-foreground flex items-center gap-0.5">
                  <Icon name="print" size={10} /> چاپ:{" "}
                  {it.printStartDate
                    ? tr("{p0}{p1}", { p0: formatDate(it.printStartDate), p1: it.printEndDate ? tr(" تا {p0}", { p0: formatDate(it.printEndDate) }) : "" })
                    : tr("ثبت نشده")}
                  {printLate && (
                    <span className="text-rose-600 mr-0.5">{tr("(معوق)")}</span>
                  )}
                </span>
                {it.note && (
                  <span className="text-muted-foreground flex items-center gap-0.5 truncate max-w-[200px]">
                    <Icon name="info" size={10} /> {it.note}
                  </span>
                )}
              </div>
            )}

            {/* حالت ویرایش — 4 تاریخ per-item */}
            {isEditing && (
              <div className="mt-3 rounded-lg border bg-card p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex items-center gap-1.5 text-primary">
                    <Icon name="calendar" size={13} /> {tr("زمان‌بندی این آیتم")}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    خالی = بدون تغییر
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <DatePicker
                    value={draft.designStart || null}
                    onChange={(d) => setDraft((s) => ({ ...s, designStart: d ? format(d, "yyyy-MM-dd") : "" }))}
                    placeholder={tr("شروع طراحی")}
                    className="w-full bg-transparent"
                  />
                  <DatePicker
                    value={draft.designEnd || null}
                    onChange={(d) => setDraft((s) => ({ ...s, designEnd: d ? format(d, "yyyy-MM-dd") : "" }))}
                    placeholder={tr("پایان طراحی")}
                    className="w-full bg-transparent"
                  />
                  <DatePicker
                    value={draft.printStart || null}
                    onChange={(d) => setDraft((s) => ({ ...s, printStart: d ? format(d, "yyyy-MM-dd") : "" }))}
                    placeholder={tr("شروع چاپ")}
                    className="w-full bg-transparent"
                  />
                  <DatePicker
                    value={draft.printEnd || null}
                    onChange={(d) => setDraft((s) => ({ ...s, printEnd: d ? format(d, "yyyy-MM-dd") : "" }))}
                    placeholder={tr("پایان چاپ")}
                    className="w-full bg-transparent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => saveDates.mutate(it.id)} disabled={saveDates.isPending} className="gap-1.5">
                    {saveDates.isPending ? <Icon name="loading" size={13} className="animate-spin" /> : <Icon name="check" size={13} />}
                    {tr("ذخیره زمان‌بندی")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    {tr("انصراف")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 3. Tasks tab (Phase 4: inline quick-create — ارجاع در <5 ثانیه) ──
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
      toast.success(tr("تسک ایجاد و به سفارش متصل شد"));
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
              toast.error(tr("عنوان الزامی است"));
              return;
            }
            createMut.mutate();
          }}
          className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2.5"
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <Icon name="taskAdd" size={13} />
            {tr("تسک جدید برای سفارش #{p0}", { p0: order.number })}
          </div>
          <Input
            value={qcTitle}
            onChange={(e) => setQcTitle(e.target.value)}
            placeholder={tr("مثلاً: طراحی فایل لگو — نسخه 2")}
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
              placeholder={tr("مسئول انجام")}
              searchPlaceholder={tr("جستجوی نام کارمند...")}
              options={assigneeOptions}
              className="h-9 text-xs"
            />
            <DatePicker
              value={qcDueDate ? new Date(qcDueDate) : null}
              onChange={(d) => setQcDueDate(d ? format(d, "yyyy-MM-dd") : "")}
              placeholder={tr("سررسید (اختیاری)")}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={createMut.isPending} className="gap-1.5">
              {createMut.isPending ? (
                <Icon name="loading" size={14} className="animate-spin" />
              ) : (
                <Icon name="check" size={14} />
              )}
              {tr("ایجاد و ارجاع")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setQcOpen(false)}
            >
              {tr("انصراف")}
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
          <Icon name="plus" size={14} /> {tr("تسک جدید برای این سفارش")}
        </Button>
      )}

      {/* Task list */}
      {tasks.length === 0 ? (
        <div className="py-6 text-center space-y-1">
          <Icon name="task" size={28} className="mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {tr("این سفارش هنوز تسکی ندارد — با فرم بالا در چند ثانیه ارجاع دهید.")}
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
                        {isOverdue && tr(" (معوق)")}
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
                          <Icon name="user" size={10} /> {tr("بدون مسئول")}
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
        <Icon name="arrowLeft" size={12} /> {tr("مدیریت همه تسک‌ها در بورد کانبان")}
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
  pending: { label: tr("در انتظار"), badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  approved: { label: tr("تأیید شده"), badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  rejected: { label: tr("رد شده"), badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
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
          {tr("هزینه متریال/چاپ برای این سفارش ثبت نشده است.")}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">{tr("کل هزینه‌ها")}</div>
          <div className="text-sm font-bold mt-0.5 tabular-nums" dir="ltr">
            {formatCurrency(total)}
          </div>
        </div>
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">{tr("تأیید شده")}</div>
          <div className="text-sm font-bold mt-0.5 text-emerald-600 tabular-nums" dir="ltr">
            {formatCurrency(approved)}
          </div>
        </div>
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">{tr("در انتظار")}</div>
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
                    {c.expenseType?.name ?? tr("هزینه")} — {c.supplier?.name ?? tr("بدون تأمین‌کننده")}
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
        <Icon name="arrowLeft" size={12} /> {tr("مدیریت در ماژول تأمین‌کنندگان")}
      </Button>
    </div>
  );
}

// ─── 5. Pre-invoice tab (فاز 9 → بازسازی Phase 10) ─────────────
// به‌ازای چه پیش‌فاکتور صادر می‌شود؟
//   • سفارش تفکیکی (مجزا) → هر آیتم = سفارش خودش → سند تک-آیتمی
//   • چند-مشتری گروهی → هر آیتمِ مشتری سند خودش (تفکیک مشتری)
//   • گروهیِ تک-مشتری → یک سند برای کل گروه (زمان‌بندی کل گروه روی سند)
// UI: ردیف هر آیتم (تاریخ‌های طراحی/چاپ + سند خودش یا دکمهٔ صدور) +
// بخش «کل گروه» با خلاصهٔ زمان‌بندی و سندهای گروهی.
export function PreInvoiceTab({
  order,
  onIssue,
  onOpenDoc,
}: {
  order: OrderDetail;
  /** Phase 10: صدور — itemId مشخص یعنی سند همان آیتم؛ null یعنی کل گروه */
  onIssue: (itemId: string | null) => void;
  onOpenDoc: (piId: string) => void;
}) {
  const unpaid = Math.max(0, order.totalAmount - order.paidAmount);
  const preInvoices = order.preInvoices ?? [];
  const itemDocs = preInvoices.filter((pi) => !!pi.itemId);
  const groupDocs = preInvoices.filter((pi) => !pi.itemId);
  // حالت per-item: مجزا یا سابقهٔ چند-مشتری (سندهای per-item موجود)
  const perItemMode =
    order.splitMode === "separated" || itemDocs.length > 0;
  const customerName = order.customer?.name;

  // خلاصهٔ زمان‌بندی گروه (min شروع / max پایان)
  const groupSchedule = (() => {
    const items = order.items ?? [];
    const min = (arr: (string | null | undefined)[]) =>
      arr.filter(Boolean).sort()[0] || null;
    const max = (arr: (string | null | undefined)[]) =>
      arr.filter(Boolean).sort().slice(-1)[0] || null;
    return {
      designFrom: min(items.map((i) => i.designStartDate)),
      designTo: max(items.map((i) => i.designEndDate)),
      printFrom: min(items.map((i) => i.printStartDate)),
      printTo: max(items.map((i) => i.printEndDate)),
    };
  })();
  const hasAnySchedule = !!(
    groupSchedule.designFrom || groupSchedule.designTo ||
    groupSchedule.printFrom || groupSchedule.printTo
  );

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">{tr("مبلغ کل سفارش")}</div>
          <div className="text-sm font-bold mt-0.5 tabular-nums" dir="ltr">
            {formatCurrency(order.totalAmount)}
          </div>
        </div>
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">{tr("پرداخت‌شده")}</div>
          <div className="text-sm font-bold mt-0.5 text-emerald-600 tabular-nums" dir="ltr">
            {formatCurrency(order.paidAmount)}
          </div>
        </div>
        <div className="rounded-lg border p-2.5">
          <div className="text-[10px] text-muted-foreground">{tr("باقی‌مانده")}</div>
          <div className={cn("text-sm font-bold mt-0.5 tabular-nums", unpaid > 0 ? "text-rose-600" : "text-emerald-600")} dir="ltr">
            {formatCurrency(unpaid)}
          </div>
        </div>
      </div>

      {/* حالت سندگذاری */}
      <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
        <Icon name="info" size={13} className="mt-0.5 shrink-0 text-primary" />
        <span>
          {perItemMode ? (
            <>
              <b>{tr("پیش‌فاکتور به‌ازای هر آیتم:")}</b> {tr("هر آیتم سند مجزای خودش را دارد")}
              {customerName && <> (آیتم‌های {customerName})</>}{tr("}؛ زمان طراحی/چاپ همان")}
              {tr("آیتم روی سندش درج می‌شود.")}
            </>
          ) : (
            <>
              <b>{tr("یک پیش‌فاکتور برای کل گروه:")}</b> {tr("زمان‌بندی طراحی/چاپ کل گروه روی")}
              {tr("سند درج می‌شود.")}
            </>
          )}
        </span>
      </div>

      {/* ═══ بخش per-item: ردیف هر آیتم ═══ */}
      {perItemMode && (order.items ?? []).length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between gap-2">
            <span className="text-xs font-medium flex items-center gap-1.5">
              <Icon name="checkList" size={13} /> {tr("پیش‌فاکتور آیتم‌ها")}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {tr("{p0} از {p1} آیتم سند دارد", { p0: fmtNum(itemDocs.length), p1: fmtNum(order.items.length) })}
            </span>
          </div>
          <div className="divide-y">
            {(order.items ?? []).map((it, i) => {
              const doc = itemDocs.find((pi) => pi.itemId === it.id);
              const badge = doc
                ? PI_STATUS_BADGE[(doc.status ?? "draft") as keyof typeof PI_STATUS_BADGE] ?? PI_STATUS_BADGE.draft
                : null;
              const isConverted = doc?.status === "converted";
              const isExpired =
                doc?.validUntil && !isConverted ? new Date(doc.validUntil) < new Date() : false;
              const dSchedule = it.designStartDate || it.designEndDate;
              const pSchedule = it.printStartDate || it.printEndDate;
              return (
                <div
                  key={it.id}
                  className="px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-accent/30 transition"
                >
                  <button
                    onClick={() => doc && onOpenDoc(doc.id)}
                    className="flex-1 min-w-0 text-right"
                  >
                    <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-muted-foreground tabular-nums">{i + 1}.</span>
                      {it.product?.name ?? tr("آیتم")}
                      {badge ? (
                        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", badge.cls)}>
                          {badge.label}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {tr("بدون سند")}
                        </span>
                      )}
                      {isExpired && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                          {tr("منقضی")}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span dir="ltr" className="tabular-nums">
                        {it.quantity} × {formatCurrency(it.pricePerUnit)} = {formatCurrency(it.totalAmount)}
                      </span>
                      {dSchedule && (
                        <span className="flex items-center gap-0.5">
                          <Icon name="design" size={10} /> {formatDate(it.designStartDate!)}
                          {it.designEndDate ? tr(" تا {p0}", { p0: formatDate(it.designEndDate) }) : ""}
                        </span>
                      )}
                      {pSchedule && (
                        <span className="flex items-center gap-0.5">
                          <Icon name="print" size={10} /> {formatDate(it.printStartDate!)}
                          {it.printEndDate ? tr(" تا {p0}", { p0: formatDate(it.printEndDate) }) : ""}
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="shrink-0 flex items-center gap-1">
                    {doc ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="size-7"
                          onClick={() => onOpenDoc(doc.id)}
                          title={isConverted ? tr("مشاهده و چاپ") : tr("مشاهده / ویرایش / چاپ")}
                        >
                          <Icon name="edit" size={13} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="size-7 hover:text-emerald-600"
                          onClick={() => onOpenDoc(doc.id)}
                          title={tr("چاپ / PDF")}
                        >
                          <Icon name="print" size={13} />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] gap-1"
                        onClick={() => onIssue(it.id)}
                      >
                        <Icon name="plus" size={12} /> {tr("صدور")}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ بخش کل گروه ═══ */}
      {!(order.items ?? []).length ? (
        <div className="rounded-xl border border-dashed p-8 flex flex-col items-center gap-3 text-center">
          <div className="size-12 rounded-2xl bg-primary/10 text-primary grid place-items-center">
            <Icon name="receipt" size={24} />
          </div>
          <div className="font-semibold text-sm">{tr("این سفارش آیتمی ندارد")}</div>
          <div className="text-xs text-muted-foreground">
            {tr("ابتدا از ویزارد سفارش، آیتم اضافه کنید.")}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-medium flex items-center gap-1.5">
              <Icon name="receipt" size={13} />
              {perItemMode ? tr("سندهای کل گروه (اختیاری)") : tr("پیش‌فاکتور کل گروه")}
            </span>
            {/* زمان‌بندی کل گروه — خواستهٔ 3 */}
            {hasAnySchedule && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                {groupSchedule.designFrom && (
                  <span className="flex items-center gap-0.5">
                    <Icon name="design" size={10} />
                    {formatDate(groupSchedule.designFrom)}
                    {groupSchedule.designTo ? tr(" تا {p0}", { p0: formatDate(groupSchedule.designTo) }) : ""}
                  </span>
                )}
                {groupSchedule.printFrom && (
                  <span className="flex items-center gap-0.5">
                    <Icon name="print" size={10} />
                    {formatDate(groupSchedule.printFrom)}
                    {groupSchedule.printTo ? tr(" تا {p0}", { p0: formatDate(groupSchedule.printTo) }) : ""}
                  </span>
                )}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={() => onIssue(null)}
            >
              <Icon name="plus" size={12} /> {groupDocs.length ? tr("سند جدید گروه") : tr("صدور سند گروه")}
            </Button>
          </div>
          {groupDocs.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {perItemMode
                ? tr("برای کل گروه سندی صادر نشده — آیتم‌ها سندهای خودشان را دارند.")
                : tr("هنوز پیش‌فاکتوری برای این سفارش صادر نشده است.")}
            </div>
          ) : (
            <div className="divide-y">
              {groupDocs.map((pi) => {
                const st = (pi.status ?? "draft") as keyof typeof PI_STATUS_BADGE;
                const badge = PI_STATUS_BADGE[st] ?? PI_STATUS_BADGE.draft;
                const isConverted = st === "converted";
                const isExpired =
                  pi.validUntil && !isConverted ? new Date(pi.validUntil) < new Date() : false;
                return (
                  <div
                    key={pi.id}
                    className="px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-accent/30 transition"
                  >
                    <button
                      onClick={() => onOpenDoc(pi.id)}
                      className="flex-1 min-w-0 text-right"
                    >
                      <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                        {tr("پیش‌فاکتور #{p0}", { p0: pi.number })}
                        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", badge.cls)}>
                          {badge.label}
                        </span>
                        {isExpired && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                            {tr("منقضی")}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {pi.issueDate || pi.date ? formatDate(pi.issueDate ?? pi.date!) : ""}
                      </div>
                    </button>
                    <div className="text-left shrink-0">
                      <div className="text-sm font-semibold tabular-nums" dir="ltr">
                        {formatCurrency(pi.totalAmount)}
                      </div>
                      <div className="text-[11px] text-emerald-600 tabular-nums" dir="ltr">
                        {tr("پرداخت: {p0}", { p0: formatCurrency(pi.paidAmount) })}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-7"
                        onClick={() => onOpenDoc(pi.id)}
                        title={isConverted ? tr("مشاهده و چاپ") : tr("مشاهده / ویرایش / چاپ")}
                      >
                        <Icon name="edit" size={13} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-7 hover:text-emerald-600"
                        onClick={() => onOpenDoc(pi.id)}
                        title={tr("چاپ / PDF")}
                      >
                        <Icon name="print" size={13} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmtNum(n: number) {
  return n.toLocaleString("en-US");
}

// ─── 6. History tab — Phase 14: رویدادهای واقعی OrderEvent ──
type TimelineEvent = {
  date: string;
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  subtitle?: string;
  tone: "neutral" | "emerald" | "amber" | "rose" | "violet";
  stage?: string;
  type?: string;
};

export function HistoryTab({ order }: { order: OrderDetail }) {
  // ─── Phase 14: تاریخچهٔ واقعی از OrderEvent (audit گردش کار) ──
  // هر اقدام ماژولی روی سفارش با «مرحله + تاریخ + عامل» ثبت شده و
  // اینجا نمایش داده می‌شود. رویدادهای مالی (sensitive) سمت سرور برای
  // ادمین داخلی فیلتر شده‌اند — اسناد مالی دیده نمی‌شوند.
  const [stageFilter, setStageFilter] = React.useState<string>("all");

  const events: TimelineEvent[] = (order.events ?? []).map((ev) => {
    const meta = EVENT_META[ev.type] ?? {
      icon: "info" as Parameters<typeof Icon>[0]["name"],
      tone: "neutral" as TimelineEvent["tone"],
      label: ev.type,
    };
    return {
      date: ev.createdAt,
      icon: meta.icon,
      title: ev.title,
      subtitle:
        [ev.description, ev.actorName ? tr("توسط {p0}", { p0: ev.actorName }) : null]
          .filter(Boolean)
          .join(" — ") || undefined,
      tone: meta.tone,
      stage: ev.stage ?? undefined,
      type: ev.type,
    };
  });

  // فیلتر مرحله
  const stageOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) if (ev.stage) set.add(ev.stage);
    return ["all", ...Array.from(set)];
  }, [events]);

  const filtered =
    stageFilter === "all"
      ? events
      : events.filter((ev) => (ev.stage ?? null) === stageFilter);

  // نمایش: جدیدترین در بالا (سفرداده‌شده desc از سرور)
  const shown = [...filtered].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const toneClass: Record<TimelineEvent["tone"], string> = {
    neutral: "bg-muted text-muted-foreground",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  };

  const stageLabel: Record<string, string> = {
    design: tr("طراحی"),
    print: tr("چاپ"),
    warehouse: tr("انبار"),
    qc: tr("کنترل کیفیت"),
    material: tr("متریال"),
  };

  if (events.length === 0) {
    return (
      <div className="py-10 text-center space-y-2">
        <div className="mx-auto size-12 rounded-2xl bg-muted grid place-items-center">
          <Icon name="route" size={22} className="text-muted-foreground" />
        </div>
        <div className="text-sm font-medium">{tr("رویدادی ثبت نشده است")}</div>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
          {tr("اقدام‌های ماژول‌ها (طراحی، چاپ، متریال، کنترل کیفیت و…) روی این")}
          {tr("سفارش به‌مرور در این تب با ذکر مرحله و تاریخ نمایش داده می‌شوند.")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* فیلتر مرحله */}
      {stageOptions.length > 2 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Icon name="filter" size={12} /> {tr("مرحله:")}
          </span>
          {stageOptions.map((st) => (
            <button
              key={st}
              onClick={() => setStageFilter(st)}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded-full border transition",
                stageFilter === st
                  ? "bg-primary/10 border-primary/30 text-primary font-medium"
                  : "bg-muted/40 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {st === "all" ? tr("همه") : stageLabel[st] ?? st}
            </button>
          ))}
        </div>
      )}

      {/* Timeline */}
      <div className="relative pr-5 pt-1">
        <div className="absolute right-[9px] top-3 bottom-3 w-px bg-border" />
        <div className="space-y-3">
          {shown.map((ev, i) => (
            <motion.div
              key={`${ev.date}-${i}`}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.4) }}
              className="relative flex items-start gap-3"
            >
              <span
                className={cn(
                  "size-4 rounded-full grid place-items-center shrink-0 mt-1 ring-4 ring-background",
                  toneClass[ev.tone]
                )}
              >
                <Icon name={ev.icon} size={9} className="opacity-90" />
              </span>
              <div className="flex-1 min-w-0 bg-muted/20 rounded-lg border px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm font-medium">{ev.title}</div>
                  {ev.stage && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                      {stageLabel[ev.stage] ?? ev.stage}
                    </span>
                  )}
                </div>
                {ev.subtitle && (
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {ev.subtitle}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground/70 mt-1 tabular-nums flex items-center gap-1">
                  <Icon name="clock" size={9} />
                  {formatDateTime(ev.date)}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Phase 14: متادیتای رویدادها (آیکون + رنگ + برچسب) ──────────
const EVENT_META: Record<
  string,
  { icon: Parameters<typeof Icon>[0]["name"]; tone: TimelineEvent["tone"]; label: string }
> = {
  created: { icon: "plus", tone: "neutral", label: tr("ایجاد") },
  design_completed: { icon: "design", tone: "violet", label: tr("تکمیل طراحی") },
  sent_to_print: { icon: "print", tone: "amber", label: tr("ارسال به چاپ") },
  material_confirmed: { icon: "boxes", tone: "amber", label: tr("تأمین متریال") },
  print_completed: { icon: "checkCircle", tone: "amber", label: tr("تکمیل چاپ") },
  sent_to_warehouse: { icon: "warehouse", tone: "emerald", label: tr("ارسال به انبار") },
  qc_reported: { icon: "shield", tone: "rose", label: tr("گزارش QC") },
  qc_reviewed: { icon: "shield", tone: "rose", label: tr("بررسی QC") },
  qc_returned: { icon: "route", tone: "rose", label: tr("بازگشت از QC") },
  status_changed: { icon: "edit", tone: "neutral", label: tr("تغییر وضعیت") },
  reassigned: { icon: "customers", tone: "violet", label: tr("تغییر مجری") },
  cost_registered: { icon: "money", tone: "emerald", label: tr("ثبت هزینه") },
  // Phase 17: گیت خروج از انبار
  invoice_flagged: { icon: "route", tone: "emerald", label: tr("فاکتور همراه بسته") },
  invoice_unflagged: { icon: "route", tone: "neutral", label: tr("برداشتن علامت فاکتور") },
};