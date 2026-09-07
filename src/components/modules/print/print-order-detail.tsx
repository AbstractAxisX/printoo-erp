"use client";

// ─── Phase 15: مودال سفارش چاپ — بازطراحی کامل (tabs) ───────────────
// ساختار جدید: مودال عریض (5xl) با دو تب:
//   ۱) «جزئیات سفارش» — آیتم‌ها، متریال، اقدامات چاپ
//   ۲) «ثبت هزینه» — فرم اینلاین (عین افزودن آیتم ویزارد) + لیست هزینه‌ها
// دیالوگ ثبت هزینه حذف شد — فرم داخل تب می‌نشیند (خواستهٔ صریح:
// «فرم ثبت هزینه اولا نباید مودال باز بشه براش»).

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon, type IconName } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { CostEntryForm } from "@/components/shared/cost-entry-form";
import { formatDate, daysRemaining, formatCurrency, formatDateTime } from "@/lib/format";
import { PRIORITY, ITEM_STAGE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────
// Print-safe projection: NO prices, NO customer phone, NO overall endDate.
export type PrintOrder = {
  id: string;
  number: number;
  status: string;
  splitMode: string;
  priority: string;
  designerNote: string | null;
  createdAt: string;
  customer: { id: string; name: string };
  items: {
    id: string;
    product: { name: string };
    description: string | null;
    note: string | null;
    needsMaterial: boolean;
    materialConfirmed: boolean;
    stage: string;
    printStartDate: string | null;
    printEndDate: string | null;
    printCompletedAt: string | null;
  }[];
};

// Reuse the shape returned by GET /api/orders/[id]
type FullOrder = PrintOrder;

// ─── Print-safe projection ────────────────────────────────────────────
function toPrintOrder(o: FullOrder | null | undefined): PrintOrder | null {
  if (!o) return null;
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    splitMode: o.splitMode ?? "grouped",
    priority: o.priority,
    designerNote: o.designerNote ?? null,
    createdAt: o.createdAt,
    customer: { id: o.customer?.id ?? "", name: o.customer?.name ?? "—" },
    items: (o.items ?? []).map((it) => ({
      id: it.id,
      product: { name: it.product?.name ?? "—" },
      description: it.description ?? null,
      note: it.note ?? null,
      needsMaterial: !!it.needsMaterial,
      materialConfirmed: !!it.materialConfirmed,
      stage: it.stage,
      printStartDate: it.printStartDate ?? null,
      printEndDate: it.printEndDate ?? null,
      printCompletedAt: it.printCompletedAt ?? null,
    })),
  };
}

// ─── Cost types ───────────────────────────────────────────────────────
type CostAttachment = {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
};
type MaterialCost = {
  id: string;
  title: string | null;
  amount: number;
  description: string | null;
  status: string;
  module: string;
  createdAt: string;
  createdByName?: string | null;
  supplierId: string | null;
  supplier?: { name: string } | null;
  expenseTypeId: string | null;
  expenseType?: { name: string } | null;
  fileUrl1: string | null;
  fileUrl2: string | null;
  attachments?: CostAttachment[];
};

// ─── Cost module meta ─────────────────────────────────────────────────
const COST_MODULE_META: Record<string, { label: string; color: string; icon: IconName }> = {
  print: {
    label: "چاپ",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    icon: "print",
  },
  material: {
    label: "متریال",
    color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
    icon: "boxes",
  },
  warehouse: {
    label: "انبار",
    color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    icon: "warehouse",
  },
};

const COST_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "در انتظار تأیید مالی", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  approved: { label: "تأیید شده", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  rejected: { label: "رد شده", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
};

function fileIconFor(name: string): IconName {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "file2";
  if (["xls", "xlsx", "csv"].includes(ext)) return "grid";
  return "file";
}

// ─── Component ────────────────────────────────────────────────────────
export function PrintOrderDetailModal({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const invalidate = useInvalidate();
  const qc = useQueryClient();

  // QC report description
  const [qcDescription, setQcDescription] = React.useState("");
  const [qcOpen, setQcOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<string>("details");

  // Fetch the order via the existing GET /api/orders/[id] endpoint.
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api<{ order: FullOrder }>(`/api/orders/${orderId}`),
    enabled: !!orderId && open,
    refetchInterval: 30000,
  });

  const order = toPrintOrder(data?.order);

  // Fetch existing material costs for this order
  const { data: costsData, isLoading: costsLoading } = useQuery({
    queryKey: ["material-costs", "order", orderId],
    queryFn: () =>
      api<{ costs: MaterialCost[] }>(
        `/api/material-costs?orderId=${orderId}&module=print,material`
      ),
    enabled: !!orderId && open,
  });
  const costs = costsData?.costs ?? [];

  // Reset QC dialog state when closed
  React.useEffect(() => {
    if (!qcOpen) setQcDescription("");
  }, [qcOpen]);

  // ── Action: confirm material ─────────────────────────────────────
  const confirmMaterialMut = useMutation({
    mutationFn: () =>
      api(`/api/orders/${orderId}/print-action`, {
        method: "POST",
        body: JSON.stringify({ action: "confirm_material" }),
      }),
    onSuccess: () => {
      toast.success("تأمین متریال تأیید شد");
      invalidate(["orders", "dashboard"]);
      qc.invalidateQueries({ queryKey: ["order", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Action: report to QC ─────────────────────────────────────────
  const reportQcMut = useMutation({
    mutationFn: () =>
      api(`/api/orders/${orderId}/print-action`, {
        method: "POST",
        body: JSON.stringify({
          action: "report_qc",
          description: qcDescription,
        }),
      }),
    onSuccess: () => {
      toast.success("گزارش به کنترل کیفیت ارسال شد");
      invalidate(["orders", "dashboard"]);
      setQcOpen(false);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Action: send to warehouse ────────────────────────────────────
  const sendWarehouseMut = useMutation({
    mutationFn: () =>
      api(`/api/orders/${orderId}/print-action`, {
        method: "POST",
        body: JSON.stringify({ action: "send_warehouse" }),
      }),
    onSuccess: () => {
      toast.success("سفارش به انبار و لجستیک ارسال شد");
      invalidate(["orders", "dashboard"]);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Action: تکمیل چاپ یک آیتم ──────────────────────────────────
  const completeItemMut = useMutation({
    mutationFn: (itemId: string) =>
      api<{ ok: boolean; advanced: boolean; remainingPrint: number; orderStatus: string }>(
        `/api/orders/${orderId}/print-action`,
        {
          method: "POST",
          body: JSON.stringify({ action: "complete_item", itemId }),
        }
      ),
    onSuccess: (res) => {
      invalidate(["orders", "dashboard", "open-orders"]);
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      if (res.advanced) {
        toast.success("چاپ سفارش کامل شد — سفارش به انبار و لجستیک ارسال شد");
        setTimeout(() => onOpenChange(false), 900);
      } else {
        toast.success(
          `چاپ آیتم تکمیل شد — ${res.remainingPrint} آیتم چاپ باقی مانده`
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Action: delete cost ──────────────────────────────────────────
  const deleteCostMut = useMutation({
    mutationFn: (costId: string) =>
      api(`/api/material-costs/${costId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("هزینه حذف شد");
      invalidate(["material-costs", "dashboard"]);
      qc.invalidateQueries({
        queryKey: ["material-costs", "order", orderId],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Loading / empty ──────────────────────────────────────────────
  if (!order) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined} className="max-w-2xl p-0 gap-0">
          <DialogTitle className="sr-only">جزئیات سفارش چاپ</DialogTitle>
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            {isLoading ? (
              <>
                <Icon name="loading" size={28} className="animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  در حال بارگذاری سفارش...
                </span>
              </>
            ) : isError ? (
              <>
                <Icon name="alertTriangle" size={28} className="text-rose-500" />
                <span className="text-sm font-medium text-rose-600 text-center leading-relaxed max-w-md">
                  {(error as Error)?.message || "خطا در بارگذاری سفارش — سرور پاسخ نداد"}
                </span>
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  تلاش دوباره
                </Button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">سفارش یافت نشد</span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // موعد مؤثر چاپ = نزدیک‌ترین موعد آیتم‌های فعال به امروز
  const printItemsActive = (order.items ?? []).filter((i) => i.stage === "print");
  const deadlineDates = (printItemsActive.length > 0 ? printItemsActive : order.items ?? [])
    .map((i) => i.printEndDate)
    .filter((d): d is string => !!d);
  const printStart = printItemsActive[0]?.printStartDate ?? order.items?.[0]?.printStartDate ?? null;
  const printEnd = deadlineDates.length
    ? new Date(
        deadlineDates
          .map((d) => new Date(d).getTime())
          .reduce((a, b) => (Math.abs(b - Date.now()) < Math.abs(a - Date.now()) ? b : a))
      ).toISOString()
    : null;
  const dr = daysRemaining(printEnd);
  const priorityInfo =
    PRIORITY[order.priority as keyof typeof PRIORITY] ?? PRIORITY.normal;

  // Material logic
  const itemsNeedingMaterial = (order.items ?? []).filter(
    (it) => it.needsMaterial && !it.materialConfirmed
  );
  const hasUnconfirmedMaterial = itemsNeedingMaterial.length > 0;

  // Action disabled states
  const actionPending =
    confirmMaterialMut.isPending ||
    reportQcMut.isPending ||
    sendWarehouseMut.isPending ||
    completeItemMut.isPending;

  // هزینه‌ها: تجمیع
  const totalCosts = costs.reduce((s, c) => s + (c.amount || 0), 0);
  const pendingCosts = costs.filter((c) => c.status === "pending").length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined} className="max-w-5xl w-[calc(100%-2rem)] max-h-[92vh] overflow-hidden p-0 gap-0 rounded-xl">
          {/* Header — عریض، متریک‌های ۴تایی */}
          <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-l from-amber-500/8 via-amber-500/3 to-transparent">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-13 rounded-2xl bg-gradient-to-br from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400 grid place-items-center shrink-0 border border-amber-500/10 p-3">
                  <Icon name="print" size={24} />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-bold truncate flex items-center gap-2">
                    سفارش #{order.number}
                    {order.splitMode === "separated" && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted">
                        تفکیک‌شده
                      </span>
                    )}
                    {(order.items ?? []).length > 1 && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                        گروهی • {(order.items ?? []).length} آیتم
                      </span>
                    )}
                  </DialogTitle>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Icon name="customers" size={12} />
                      {order.customer?.name ?? "—"}
                    </span>
                    <span>•</span>
                    <span className="tabular-nums">{formatDate(order.createdAt)}</span>
                    <span>•</span>
                    <span className="text-[11px]">
                      {printItemsActive.length.toLocaleString("fa-IR")} آیتم فعال چاپ
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={cn(
                    "text-xs font-medium px-2.5 py-1 rounded-full",
                    priorityInfo.badge
                  )}
                >
                  {priorityInfo.label}
                </span>
              </div>
            </div>

            {/* Print dates + progress — ۴ تایل */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
              <div className="rounded-xl bg-background/70 backdrop-blur-sm p-3 border shadow-sm">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span className="size-5 rounded-md bg-amber-500/10 text-amber-600 grid place-items-center">
                    <Icon name="play" size={10} />
                  </span>
                  شروع چاپ
                </div>
                <div className="text-sm font-bold mt-1.5 tabular-nums">
                  {formatDate(printStart)}
                </div>
              </div>
              <div className="rounded-xl bg-background/70 backdrop-blur-sm p-3 border shadow-sm">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span className="size-5 rounded-md bg-amber-500/10 text-amber-600 grid place-items-center">
                    <Icon name="calendar" size={10} />
                  </span>
                  پایان چاپ
                </div>
                <div className="text-sm font-bold mt-1.5 tabular-nums">
                  {formatDate(printEnd)}
                </div>
              </div>
              <div className="rounded-xl bg-background/70 backdrop-blur-sm p-3 border shadow-sm">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span
                    className={cn(
                      "size-5 rounded-md grid place-items-center",
                      dr.status === "overdue"
                        ? "bg-rose-500/10 text-rose-600"
                        : dr.status === "today"
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-emerald-500/10 text-emerald-600"
                    )}
                  >
                    <Icon name="clock" size={10} />
                  </span>
                  باقی‌مانده
                </div>
                <div
                  className={cn(
                    "text-sm font-bold mt-1.5 tabular-nums",
                    dr.status === "overdue" && "text-rose-600",
                    dr.status === "remaining" && "text-emerald-600",
                    dr.status === "today" && "text-amber-600",
                    dr.status === "none" && "text-muted-foreground"
                  )}
                >
                  {dr.status === "none" ? "—" : dr.text}
                </div>
              </div>
              <div className="rounded-xl bg-background/70 backdrop-blur-sm p-3 border shadow-sm">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span className="size-5 rounded-md bg-emerald-500/10 text-emerald-600 grid place-items-center">
                    <Icon name="layers" size={10} />
                  </span>
                  پیشرفت چاپ
                </div>
                <div className="text-sm font-bold mt-1.5 tabular-nums">
                  {(() => {
                    const printScope = (order.items ?? []).filter(
                      (i) => i.stage === "print" || i.printCompletedAt
                    );
                    const done = printScope.filter((i) => i.printCompletedAt).length;
                    return `${done.toLocaleString("fa-IR")} از ${printScope.length.toLocaleString("fa-IR")}`;
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs: جزئیات | هزینه‌ها */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pt-3 pb-0 border-b bg-muted/20">
              <TabsList className="bg-transparent p-0 h-auto gap-1">
                <TabsTrigger
                  value="details"
                  className="px-4 py-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:shadow-none rounded-t-lg text-sm gap-1.5"
                >
                  <Icon name="orders" size={15} />
                  جزئیات سفارش
                </TabsTrigger>
                <TabsTrigger
                  value="costs"
                  className="px-4 py-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:shadow-none rounded-t-lg text-sm gap-1.5"
                >
                  <Icon name="money" size={15} />
                  ثبت هزینه
                  {costs.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                      {costs.length.toLocaleString("fa-IR")}
                    </span>
                  )}
                  {pendingCosts > 0 && (
                    <span className="size-2 rounded-full bg-amber-500" title={`${pendingCosts} در انتظار تأیید مالی`} />
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ── Tab 1: جزئیات سفارش ── */}
            <TabsContent value="details" className="mt-0 flex-1 min-h-0 data-[state=inactive]:hidden">
              <div
                className="overflow-y-auto scrollbar-thin px-6 py-4"
                style={{ maxHeight: "52vh" }}
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* ستون اصلی: آیتم‌ها */}
                  <div className="lg:col-span-2 space-y-4">
                    {/* Material confirm callout */}
                    {hasUnconfirmedMaterial && (
                      <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/10 p-4">
                        <div className="flex items-start gap-3">
                          <div className="size-9 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 grid place-items-center shrink-0">
                            <Icon name="boxes" size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold flex items-center gap-2">
                              تأمین متریال
                              <span className="text-[11px] font-normal text-muted-foreground">
                                ({itemsNeedingMaterial.length.toLocaleString("fa-IR")} آیتم منتظر)
                              </span>
                            </div>
                            <ul className="mt-2 space-y-1">
                              {itemsNeedingMaterial.map((it) => (
                                <li key={it.id} className="text-xs flex items-center gap-1.5">
                                  <Icon name="circleAlert" size={11} className="text-amber-500 shrink-0" />
                                  <span className="truncate">{it.product?.name ?? "—"}</span>
                                </li>
                              ))}
                            </ul>
                            <Button
                              size="sm"
                              className="mt-3 gap-1.5"
                              onClick={() => confirmMaterialMut.mutate()}
                              disabled={actionPending}
                            >
                              {confirmMaterialMut.isPending ? (
                                <Icon name="loading" size={14} className="animate-spin" />
                              ) : (
                                <Icon name="check" size={14} />
                              )}
                              تأیید تأمین متریال
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Items list */}
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-2.5 flex items-center gap-1.5">
                        <Icon name="orders" size={13} /> آیتم‌های سفارش
                        <span className="text-[10px] font-normal text-muted-foreground/70">
                          ({(order.items ?? []).length.toLocaleString("fa-IR")})
                        </span>
                      </div>
                      <div className="space-y-2">
                        {(order.items ?? []).map((it, i) => {
                          const inPrint = it.stage === "print";
                          return (
                            <div
                              key={it.id}
                              className={cn(
                                "rounded-xl border p-3.5 hover:bg-accent/30 transition",
                                inPrint &&
                                  "border-amber-200 dark:border-amber-900/50 bg-amber-500/[0.03] shadow-sm"
                              )}
                            >
                              <div className="flex items-start gap-2.5">
                                <span
                                  className={cn(
                                    "size-7 rounded-md grid place-items-center text-xs font-bold shrink-0",
                                    inPrint
                                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                                      : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm">
                                    {it.product?.name ?? "—"}
                                  </div>
                                  {it.description && (
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {it.description}
                                    </div>
                                  )}
                                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                    {it.printStartDate && (
                                      <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-0.5">
                                        <Icon name="calendar" size={9} />
                                        {formatDate(it.printStartDate)}
                                        {it.printEndDate && ` → ${formatDate(it.printEndDate)}`}
                                      </span>
                                    )}
                                    {it.printCompletedAt && (
                                      <span className="text-[10px] text-emerald-600 tabular-nums flex items-center gap-0.5">
                                        <Icon name="check" size={9} /> چاپ شد:{" "}
                                        {formatDate(it.printCompletedAt)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted">
                                    {ITEM_STAGE[it.stage as keyof typeof ITEM_STAGE]?.label ?? it.stage}
                                  </span>
                                  {it.needsMaterial && (
                                    <span
                                      className={cn(
                                        "text-[11px] px-1.5 py-0.5 rounded flex items-center gap-0.5",
                                        it.materialConfirmed
                                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                          : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                                      )}
                                    >
                                      <Icon name={it.materialConfirmed ? "check" : "alert"} size={10} />
                                      {it.materialConfirmed ? "متریال تأیید شد" : "نیازمند متریال"}
                                    </span>
                                  )}
                                  {inPrint && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => completeItemMut.mutate(it.id)}
                                      disabled={actionPending}
                                      className="h-7 gap-1 border-amber-300 dark:border-amber-800 hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300"
                                    >
                                      {completeItemMut.isPending && completeItemMut.variables === it.id ? (
                                        <Icon name="loading" size={12} className="animate-spin" />
                                      ) : (
                                        <Icon name="checkCircle" size={12} />
                                      )}
                                      تکمیل چاپ
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {it.note && (
                                <div className="mt-2.5 pt-2.5 border-t text-xs text-muted-foreground flex items-start gap-1">
                                  <Icon name="info" size={11} className="mt-0.5 shrink-0" />
                                  <span>{it.note}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {(order.items ?? []).length === 0 && (
                          <div className="text-xs text-muted-foreground py-3 text-center">
                            آیتمی برای این سفارش ثبت نشده است.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ستون کناری: یادداشت طراح + خلاصه هزینه */}
                  <div className="space-y-4">
                    {order.designerNote && (
                      <div className="rounded-xl border bg-violet-500/[0.04] p-3.5">
                        <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Icon name="edit" size={13} className="text-violet-500" /> یادداشت طراح
                        </div>
                        <div className="rounded-lg bg-background/60 border p-2.5 text-xs whitespace-pre-wrap leading-relaxed">
                          {order.designerNote}
                        </div>
                      </div>
                    )}

                    {/* خلاصه هزینه — لینک به تب هزینه‌ها */}
                    <button
                      onClick={() => setActiveTab("costs")}
                      className="w-full rounded-xl border p-3.5 text-right hover:bg-accent/40 transition group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                            <Icon name="money" size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">هزینه‌های سفارش</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {costs.length.toLocaleString("fa-IR")} ثبت • مجموع{" "}
                              <span dir="ltr" className="tabular-nums">
                                {formatCurrency(totalCosts)}
                              </span>
                              {pendingCosts > 0 && ` • ${pendingCosts.toLocaleString("fa-IR")} در انتظار مالی`}
                            </div>
                          </div>
                        </div>
                        <Icon
                          name="arrowLeft"
                          size={16}
                          className="text-muted-foreground group-hover:text-primary group-hover:-translate-x-0.5 transition shrink-0"
                        />
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Tab 2: هزینه‌ها — فرم اینلاین + لیست ── */}
            <TabsContent value="costs" className="mt-0 flex-1 min-h-0 data-[state=inactive]:hidden">
              <div
                className="overflow-y-auto scrollbar-thin px-6 py-4 space-y-5"
                style={{ maxHeight: "52vh" }}
              >
                {/* فرم ثبت هزینه — عین افزودن آیتم ویزارد (اینلاین، نه دیالوگ) */}
                <div className="rounded-xl border bg-gradient-to-l from-primary/[0.04] to-transparent p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="size-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                      <Icon name="money" size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold">ثبت هزینه جدید</div>
                      <div className="text-[11px] text-muted-foreground">
                        نام و مبلغ الزامی است — ثبت برای تأیید به مالی می‌رود
                      </div>
                    </div>
                  </div>
                  <CostEntryForm
                    mode="order"
                    orderId={order.id}
                    modules={["material", "print"]}
                    onSubmitted={() => {
                      invalidate(["material-costs", "dashboard"]);
                      qc.invalidateQueries({
                        queryKey: ["material-costs", "order", orderId],
                      });
                    }}
                  />
                </div>

                {/* هزینه‌های ثبت‌شده — لیست عریض */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Icon name="checkList" size={13} /> هزینه‌های ثبت‌شده
                      <span className="text-[10px] font-normal text-muted-foreground/70">
                        ({costs.length.toLocaleString("fa-IR")})
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      مجموع:{" "}
                      <b dir="ltr" className="text-foreground tabular-nums">
                        {formatCurrency(totalCosts)}
                      </b>
                    </div>
                  </div>
                  {costsLoading ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                      <Icon name="loading" size={14} className="animate-spin" />
                      در حال بارگذاری هزینه‌ها...
                    </div>
                  ) : costs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-muted-foreground rounded-xl border border-dashed">
                      <Icon name="inbox" size={24} className="opacity-30" />
                      <span className="text-xs">هنوز هزینه‌ای ثبت نشده است</span>
                      <span className="text-[10px] text-muted-foreground/70">
                        ثبت هزینهٔ متریال و چاپ الزامی است — فرم بالا را پر کنید
                      </span>
                    </div>
                  ) : (
                    <div className="rounded-xl border overflow-hidden">
                      {/* سربرگ جدول */}
                      <div className="grid grid-cols-[1fr_120px_100px_90px_150px_36px] items-center gap-2 px-3 py-2 bg-muted/50 text-[10px] font-medium text-muted-foreground">
                        <span>هزینه</span>
                        <span className="text-center">مبلغ</span>
                        <span className="text-center">بخش</span>
                        <span className="text-center">وضعیت</span>
                        <span className="text-center">ثبت</span>
                        <span />
                      </div>
                      <div className="divide-y">
                        {costs.map((c) => {
                          const mod = COST_MODULE_META[c.module] ?? {
                            label: c.module,
                            color: "bg-muted text-muted-foreground",
                            icon: "wallet" as IconName,
                          };
                          const st = COST_STATUS_META[c.status] ?? {
                            label: c.status,
                            cls: "bg-muted text-muted-foreground",
                          };
                          const filesCount =
                            (c.attachments?.length ?? 0) +
                            [c.fileUrl1, c.fileUrl2].filter(Boolean).length;
                          return (
                            <div
                              key={c.id}
                              className="grid grid-cols-[1fr_120px_100px_90px_150px_36px] items-center gap-2 px-3 py-2.5 hover:bg-accent/30 transition group text-sm"
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-sm truncate flex items-center gap-1.5">
                                  {c.title || c.description || "هزینه"}
                                  {filesCount > 0 && (
                                    <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5 shrink-0">
                                      <Icon name="file" size={9} />
                                      {filesCount.toLocaleString("fa-IR")}
                                    </span>
                                  )}
                                </div>
                                {(c.expenseType?.name || c.supplier?.name) && (
                                  <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                                    {c.expenseType?.name ?? ""}
                                    {c.supplier?.name ? ` • ${c.supplier.name}` : ""}
                                  </div>
                                )}
                                {c.description && !c.title && (
                                  <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                                    {c.description}
                                  </div>
                                )}
                              </div>
                              <span className="text-center font-semibold tabular-nums" dir="ltr">
                                {formatCurrency(c.amount)}
                              </span>
                              <span className="text-center">
                                <span
                                  className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-0.5",
                                    mod.color
                                  )}
                                >
                                  <Icon name={mod.icon} size={9} />
                                  {mod.label}
                                </span>
                              </span>
                              <span className="text-center">
                                <span className={cn("text-[10px] px-1.5 py-0.5 rounded", st.cls)}>
                                  {st.label}
                                </span>
                              </span>
                              <span className="text-center text-[10px] text-muted-foreground tabular-nums">
                                {formatDateTime(c.createdAt)}
                                {c.createdByName ? ` • ${c.createdByName}` : ""}
                              </span>
                              <div className="flex justify-center">
                                <button
                                  onClick={() => deleteCostMut.mutate(c.id)}
                                  disabled={deleteCostMut.isPending || c.status === "approved"}
                                  title={
                                    c.status === "approved"
                                      ? "هزینهٔ تأییدشده قابل حذف نیست"
                                      : "حذف هزینه"
                                  }
                                  className="size-7 rounded-md grid place-items-center text-muted-foreground/60 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-30"
                                >
                                  <Icon name="trash" size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Footer with actions */}
          <DialogFooter className="px-6 py-3 border-t bg-muted/30 flex items-center gap-2 sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQcOpen(true)}
              className="gap-1.5"
              disabled={actionPending}
            >
              <Icon name="shield" size={14} />
              گزارش به کنترل کیفیت
            </Button>
            <Button
              size="sm"
              onClick={() => sendWarehouseMut.mutate()}
              disabled={
                actionPending ||
                (order.items ?? []).filter((i) => i.stage === "print").length === 0
              }
              className="gap-1.5"
            >
              {sendWarehouseMut.isPending ? (
                <Icon name="loading" size={14} className="animate-spin" />
              ) : (
                <Icon name="warehouse" size={14} />
              )}
              {(order.items ?? []).filter((i) => i.stage === "print").length > 1
                ? "تکمیل همه و ارسال به انبار"
                : "تکمیل و ارسال به انبار"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sub-dialog: report to QC */}
      <Dialog open={qcOpen} onOpenChange={setQcOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md p-0 gap-0">
          <div className="px-6 pt-5 pb-3 border-b">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 grid place-items-center shrink-0">
                <Icon name="shield" size={18} />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  گزارش به کنترل کیفیت
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  سفارش #{order.number}
                </p>
              </div>
            </div>
          </div>
          <div className="px-6 py-4">
            <Field
              label="توضیح گزارش"
              required
              hint={
                <span className="flex items-start gap-1">
                  <Icon name="info" size={11} className="mt-0.5 shrink-0" />
                  این گزارش به ماژول کنترل کیفیت ارسال می‌شود و سفارش در وضعیت فعلی
                  (چاپ) باقی می‌ماند.
                </span>
              }
            >
              <Textarea
                id="qc-description"
                value={qcDescription}
                onChange={(e) => setQcDescription(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </Field>
          </div>
          <DialogFooter className="px-6 py-3 border-t bg-muted/30 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQcOpen(false)}
              disabled={reportQcMut.isPending}
            >
              انصراف
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => reportQcMut.mutate()}
              disabled={reportQcMut.isPending || !qcDescription.trim()}
              className="gap-1.5"
            >
              {reportQcMut.isPending ? (
                <Icon name="loading" size={14} className="animate-spin" />
              ) : (
                <Icon name="check" size={14} />
              )}
              ارسال گزارش
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
