"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { formatDate, daysRemaining, formatCurrency } from "@/lib/format";
import { PRIORITY, ITEM_STAGE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────
// Print-safe projection: NO prices, NO customer phone, NO overall endDate.
export type PrintOrder = {
  id: string;
  number: number;
  status: string;
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
  }[];
};

// Reuse the shape returned by GET /api/orders/[id]
type FullOrder = {
  id: string;
  number: number;
  status: string;
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
  }[];
};

// ─── Print-safe projection ────────────────────────────────────────────
// The print module must NOT see prices, customer phone, or overall endDate.
function toPrintOrder(o: FullOrder | null | undefined): PrintOrder | null {
  if (!o) return null;
  return {
    id: o.id,
    number: o.number,
    status: o.status,
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
    })),
  };
}

// ─── Cost / Supplier / ExpenseType types ──────────────────────────────
type Supplier = { id: string; name: string };
type ExpenseType = { id: string; name: string };
type MaterialCost = {
  id: string;
  amount: number;
  description: string | null;
  status: string;
  module: string;
  createdAt: string;
  supplierId: string | null;
  supplier?: { name: string } | null;
  expenseTypeId: string | null;
  expenseType?: { name: string } | null;
  fileUrl1: string | null;
  fileUrl2: string | null;
};

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
  // Sub-dialog open state for "report to QC"
  const [qcOpen, setQcOpen] = React.useState(false);
  // Cost form state
  const [costOpen, setCostOpen] = React.useState(false);
  const [costForm, setCostForm] = React.useState({
    supplierId: "",
    expenseTypeId: "",
    description: "",
    amount: "",
    fileUrl1: "",
    fileUrl2: "",
  });

  // Fetch the order via the existing GET /api/orders/[id] endpoint.
  // The print-safe projection strips out financial + phone fields.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api<{ order: FullOrder }>(`/api/orders/${orderId}`),
    enabled: !!orderId && open,
    refetchInterval: 30000,
  });

  const order = toPrintOrder(data?.order);

  // Fetch suppliers (for cost form select)
  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers", "print-modal"],
    queryFn: () => api<{ suppliers: Supplier[] }>("/api/suppliers"),
    enabled: !!orderId && open,
  });

  // Fetch expense types (for cost form select)
  const { data: expenseTypesData } = useQuery({
    queryKey: ["expense-types", "print-modal"],
    queryFn: () => api<{ expenseTypes: ExpenseType[] }>("/api/expense-types"),
    enabled: !!orderId && open,
  });

  // Fetch existing material costs for this order
  const { data: costsData, isLoading: costsLoading } = useQuery({
    queryKey: ["material-costs", "order", orderId],
    queryFn: () =>
      api<{ costs: MaterialCost[] }>(
        `/api/material-costs?orderId=${orderId}&module=print`
      ),
    enabled: !!orderId && open,
  });

  const suppliers = suppliersData?.suppliers ?? [];
  const expenseTypes = expenseTypesData?.expenseTypes ?? [];
  const costs = costsData?.costs ?? [];

  // Reset QC dialog state when closed
  React.useEffect(() => {
    if (!qcOpen) setQcDescription("");
  }, [qcOpen]);

  // Reset cost form when dialog opens
  React.useEffect(() => {
    if (costOpen) {
      setCostForm({
        supplierId: "",
        expenseTypeId: "",
        description: "",
        amount: "",
        fileUrl1: "",
        fileUrl2: "",
      });
    }
  }, [costOpen]);

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

  // ── Action: register cost ────────────────────────────────────────
  const createCostMut = useMutation({
    mutationFn: () => {
      const body = {
        orderId,
        supplierId: costForm.supplierId || undefined,
        expenseTypeId: costForm.expenseTypeId || undefined,
        description: costForm.description || undefined,
        amount: Number(costForm.amount) || 0,
        fileUrl1: costForm.fileUrl1 || undefined,
        fileUrl2: costForm.fileUrl2 || undefined,
        module: "print",
      };
      return api("/api/material-costs", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast.success("هزینه ثبت شد");
      invalidate(["material-costs", "dashboard"]);
      qc.invalidateQueries({
        queryKey: ["material-costs", "order", orderId],
      });
      setCostOpen(false);
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
                <span className="text-sm font-medium text-rose-600">
                  خطا در بارگذاری سفارش — سرور پاسخ نداد
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

  // Pull the first item's print dates for the "print range" card.
  const firstItem = order.items?.[0];
  const printStart = firstItem?.printStartDate ?? null;
  const printEnd = firstItem?.printEndDate ?? null;
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
    createCostMut.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[90vh] overflow-hidden p-0 gap-0">
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-l from-amber-500/5 to-transparent">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 grid place-items-center shrink-0">
                  <Icon name="print" size={22} />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-bold truncate">
                    سفارش #{order.number}
                  </DialogTitle>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Icon name="customers" size={12} />
                      {order.customer?.name ?? "—"}
                    </span>
                    <span>•</span>
                    <span className="tabular-nums">{formatDate(order.createdAt)}</span>
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

            {/* Print dates card */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground">شروع چاپ</div>
                <div className="text-sm font-bold mt-0.5 tabular-nums">
                  {formatDate(printStart)}
                </div>
              </div>
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground">پایان چاپ</div>
                <div className="text-sm font-bold mt-0.5 tabular-nums">
                  {formatDate(printEnd)}
                </div>
              </div>
              <div className="rounded-lg bg-background/60 p-2.5 border">
                <div className="text-[10px] text-muted-foreground">باقی‌مانده</div>
                <div
                  className={cn(
                    "text-sm font-bold mt-0.5 tabular-nums",
                    dr.status === "overdue" && "text-rose-600",
                    dr.status === "remaining" && "text-emerald-600",
                    dr.status === "today" && "text-amber-600",
                    dr.status === "none" && "text-muted-foreground"
                  )}
                >
                  {dr.status === "none" ? "—" : `${dr.days} روز`}
                </div>
              </div>
            </div>
          </div>

          {/* Body — scrollable */}
          <div
            className="overflow-y-auto scrollbar-thin px-6 py-4 space-y-4"
            style={{ maxHeight: "55vh" }}
          >
            {/* Items list */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Icon name="orders" size={13} /> آیتم‌های سفارش
              </div>
              <div className="space-y-2">
                {(order.items ?? []).map((it, i) => (
                  <div
                    key={it.id}
                    className="rounded-lg border p-3 hover:bg-accent/30 transition"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="size-6 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 grid place-items-center text-xs font-bold shrink-0">
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
                      </div>
                    </div>
                    {it.note && (
                      <div className="mt-2 pt-2 border-t text-xs text-muted-foreground flex items-start gap-1">
                        <Icon name="info" size={11} className="mt-0.5 shrink-0" />
                        <span>{it.note}</span>
                      </div>
                    )}
                  </div>
                ))}
                {(order.items ?? []).length === 0 && (
                  <div className="text-xs text-muted-foreground py-3 text-center">
                    آیتمی برای این سفارش ثبت نشده است.
                  </div>
                )}
              </div>
            </div>

            {/* Designer note (read-only) */}
            {order.designerNote && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Icon name="edit" size={13} /> یادداشت طراح
                </div>
                <div className="rounded-lg border bg-muted/20 p-3 text-xs whitespace-pre-wrap">
                  {order.designerNote}
                </div>
              </div>
            )}

            {/* Material section */}
            {hasUnconfirmedMaterial && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/10 p-3">
                <div className="flex items-start gap-2.5">
                  <div className="size-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 grid place-items-center shrink-0">
                    <Icon name="alertTriangle" size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">
                      تأیید تأمین متریال
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {itemsNeedingMaterial.length} آیتم نیازمند متریال هستند. پس از
                      تأمین، متریال را تأیید کنید تا چاپ ادامه یابد.
                    </p>
                    <ul className="mt-2 space-y-1">
                      {itemsNeedingMaterial.map((it) => (
                        <li
                          key={it.id}
                          className="text-xs flex items-center gap-1.5"
                        >
                          <Icon
                            name="circleAlert"
                            size={11}
                            className="text-amber-500 shrink-0"
                          />
                          <span className="truncate">
                            {it.product?.name ?? "—"}
                          </span>
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

            {/* Cost registration section */}
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                    <Icon name="money" size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">ثبت هزینه</div>
                    <div className="text-[11px] text-muted-foreground">
                      ثبت هزینه‌های مرتبط با چاپ این سفارش
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setCostOpen(true)}
                  disabled={actionPending}
                >
                  <Icon name="plus" size={14} /> ثبت هزینه
                </Button>
              </div>

              {/* List of existing costs */}
              {costsLoading ? (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                  <Icon name="loading" size={14} className="animate-spin" />
                  در حال بارگذاری هزینه‌ها...
                </div>
              ) : costs.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1.5 py-5 text-muted-foreground">
                  <Icon name="inbox" size={22} className="opacity-30" />
                  <span className="text-xs">هنوز هزینه‌ای ثبت نشده است</span>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                  {costs.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start gap-2 rounded-lg border bg-muted/20 p-2.5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold tabular-nums">
                            {formatCurrency(c.amount)}
                          </span>
                          {c.expenseType?.name && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
                              {c.expenseType.name}
                            </span>
                          )}
                          {c.supplier?.name && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Icon name="suppliers" size={10} />
                              {c.supplier.name}
                            </span>
                          )}
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded",
                              c.status === "approved"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : c.status === "rejected"
                                ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            )}
                          >
                            {c.status === "approved"
                              ? "تأیید شده"
                              : c.status === "rejected"
                              ? "رد شده"
                              : "در انتظار"}
                          </span>
                        </div>
                        {c.description && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {c.description}
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                          {formatDate(c.createdAt)}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteCostMut.mutate(c.id)}
                        disabled={deleteCostMut.isPending}
                        title="حذف هزینه"
                        className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition shrink-0"
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

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
              disabled={actionPending}
              className="gap-1.5"
            >
              {sendWarehouseMut.isPending ? (
                <Icon name="loading" size={14} className="animate-spin" />
              ) : (
                <Icon name="warehouse" size={14} />
              )}
              ارسال به انبار
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
            <Label
              htmlFor="qc-description"
              className="text-xs font-medium text-muted-foreground mb-2 block"
            >
              توضیح گزارش
            </Label>
            <Textarea
              id="qc-description"
              value={qcDescription}
              onChange={(e) => setQcDescription(e.target.value)}
              rows={5}
              placeholder="مشکل یا موردی که نیاز به بررسی کنترل کیفیت دارد را توضیح دهید..."
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1">
              <Icon name="info" size={11} className="mt-0.5 shrink-0" />
              این گزارش به ماژول کنترل کیفیت ارسال می‌شود و سفارش در وضعیت فعلی
              (چاپ) باقی می‌ماند.
            </p>
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

      {/* Sub-dialog: register cost */}
      <Dialog open={costOpen} onOpenChange={setCostOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md p-0 gap-0">
          <div className="px-6 pt-5 pb-3 border-b">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                <Icon name="money" size={18} />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  ثبت هزینه چاپ
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  سفارش #{order.number}
                </p>
              </div>
            </div>
          </div>
          <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin">
            {/* Supplier */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                تامین‌کننده
              </Label>
              <select
                value={costForm.supplierId}
                onChange={(e) =>
                  setCostForm((f) => ({ ...f, supplierId: e.target.value }))
                }
                className="w-full h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— انتخاب کنید —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Expense type */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                نوع هزینه
              </Label>
              <select
                value={costForm.expenseTypeId}
                onChange={(e) =>
                  setCostForm((f) => ({ ...f, expenseTypeId: e.target.value }))
                }
                className="w-full h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— انتخاب کنید —</option>
                {expenseTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Description */}
            <div>
              <Label
                htmlFor="cost-description"
                className="text-xs font-medium text-muted-foreground mb-1.5 block"
              >
                توضیح
              </Label>
              <Textarea
                id="cost-description"
                value={costForm.description}
                onChange={(e) =>
                  setCostForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={3}
                placeholder="توضیح هزینه (اختیاری)..."
                className="resize-none"
              />
            </div>
            {/* Amount */}
            <div>
              <Label
                htmlFor="cost-amount"
                className="text-xs font-medium text-muted-foreground mb-1.5 block"
              >
                مبلغ (IQD)
              </Label>
              <Input
                id="cost-amount"
                type="number"
                value={costForm.amount}
                onChange={(e) =>
                  setCostForm((f) => ({ ...f, amount: e.target.value }))
                }
                placeholder="0"
                className="tabular-nums"
              />
            </div>
            {/* File URLs (simple text inputs) */}
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label
                  htmlFor="cost-file1"
                  className="text-xs font-medium text-muted-foreground mb-1.5 block"
                >
                  فایل ضمیمه ۱ (نام / URL)
                </Label>
                <Input
                  id="cost-file1"
                  value={costForm.fileUrl1}
                  onChange={(e) =>
                    setCostForm((f) => ({ ...f, fileUrl1: e.target.value }))
                  }
                  placeholder="نام فایل یا URL..."
                />
              </div>
              <div>
                <Label
                  htmlFor="cost-file2"
                  className="text-xs font-medium text-muted-foreground mb-1.5 block"
                >
                  فایل ضمیمه ۲ (نام / URL)
                </Label>
                <Input
                  id="cost-file2"
                  value={costForm.fileUrl2}
                  onChange={(e) =>
                    setCostForm((f) => ({ ...f, fileUrl2: e.target.value }))
                  }
                  placeholder="نام فایل یا URL..."
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground flex items-start gap-1">
              <Icon name="info" size={11} className="mt-0.5 shrink-0" />
              این هزینه با ماژول «چاپ» ثبت می‌شود و در صورت تأیید، به گزارش مالی
              اضافه خواهد شد.
            </p>
          </div>
          <DialogFooter className="px-6 py-3 border-t bg-muted/30 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCostOpen(false)}
              disabled={createCostMut.isPending}
            >
              انصراف
            </Button>
            <Button
              size="sm"
              onClick={() => createCostMut.mutate()}
              disabled={
                createCostMut.isPending || !costForm.amount || Number(costForm.amount) <= 0
              }
              className="gap-1.5"
            >
              {createCostMut.isPending ? (
                <Icon name="loading" size={14} className="animate-spin" />
              ) : (
                <Icon name="check" size={14} />
              )}
              ثبت هزینه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
