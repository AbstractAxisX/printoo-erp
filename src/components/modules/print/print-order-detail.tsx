"use client";

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
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
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
// The print module must NOT see prices, customer phone, or overall endDate.
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

// ─── Cost / Supplier / ExpenseType types ──────────────────────────────
type Supplier = { id: string; name: string };
type ExpenseType = { id: string; name: string };
type CostAttachment = {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
};
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
  attachments?: CostAttachment[];
};

// ─── Upload helpers ───────────────────────────────────────────────────
type UploadedFile = { url: string; fileName: string; mimeType: string; size: number };

/** آپلود فایل‌ها به /api/uploads — multipart خام (بدون Content-Type JSON). */
async function uploadFiles(files: File[]): Promise<UploadedFile[]> {
  const out: UploadedFile[] = [];
  for (const f of files) {
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    if (!res.ok) {
      let msg = `آپلود «${f.name}» ناموفق بود`;
      try {
        const data = await res.json();
        if (data.error) msg = data.error;
      } catch {}
      throw new Error(msg);
    }
    const data = (await res.json()) as { files: UploadedFile[] };
    out.push(...data.files);
  }
  return out;
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIconFor(name: string): IconName {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "file2";
  if (["xls", "xlsx", "csv"].includes(ext)) return "grid";
  if (["doc", "docx", "txt"].includes(ext)) return "file";
  return "file";
}

/** نمایش مبلغ زنده با جداکنندهٔ هزارگان لاتین (ورودی number ساده می‌ماند) */
function prettyAmount(v: string): string {
  const n = Number(v);
  if (!v || !Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("en-US");
}

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
    attachments: [] as UploadedFile[],
  });
  const [costModule, setCostModule] = React.useState<"material" | "print">("material");
  const [uploading, setUploading] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Fetch the order via the existing GET /api/orders/[id] endpoint.
  // The print-safe projection strips out financial + phone fields.
  const { data, isLoading, isError, error, refetch } = useQuery({
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
        `/api/material-costs?orderId=${orderId}&module=print,material`
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
        attachments: [],
      });
      setUploading(false);
      setDragOver(false);
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

  // ── Action: register cost (بازطراحی فاز ۱۴) ─────────────────────
  const amountNum = Number(costForm.amount);
  const amountValid = costForm.amount !== "" && Number.isFinite(amountNum) && amountNum > 0;

  const createCostMut = useMutation({
    mutationFn: () => {
      const body = {
        orderId,
        supplierId: costForm.supplierId || undefined,
        expenseTypeId: costForm.expenseTypeId || undefined,
        description: costForm.description || undefined,
        amount: amountNum,
        attachments: costForm.attachments,
        module: costModule,
      };
      return api("/api/material-costs", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast.success(
        costModule === "material"
          ? "هزینه متریال ثبت شد — در انتظار تأیید مالی"
          : "هزینه چاپ ثبت شد — در انتظار تأیید مالی"
      );
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

  // ── File upload handler ──────────────────────────────────────────
  async function handleFiles(files: FileList | File[] | null) {
    if (!files || costForm.attachments.length >= 6) return;
    const arr = Array.from(files).slice(0, 6 - costForm.attachments.length);
    if (arr.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await uploadFiles(arr);
      setCostForm((f) => ({ ...f, attachments: [...f.attachments, ...uploaded] }));
      toast.success(`${arr.length} فایل آپلود شد`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

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
    createCostMut.isPending ||
    completeItemMut.isPending;

  // هزینه‌ها: تجمیع
  const totalCosts = costs.reduce((s, c) => s + (c.amount || 0), 0);
  const pendingCosts = costs.filter((c) => c.status === "pending").length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined} className="max-w-4xl w-[calc(100%-2rem)] max-h-[92vh] overflow-hidden p-0 gap-0 rounded-xl">
          {/* Header — عریض‌تر، متریک‌های ۴تایی */}
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

          {/* Body — scrollable، دو-ستونه در دسکتاپ */}
          <div
            className="overflow-y-auto scrollbar-thin px-6 py-4"
            style={{ maxHeight: "58vh" }}
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

              {/* ستون کناری: یادداشت طراح + هزینه‌ها */}
              <div className="space-y-4">
                {/* Designer note (read-only) */}
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

                {/* Cost registration section — بازطراحی‌شده */}
                <div className="rounded-xl border p-3.5">
                  <div className="flex items-center justify-between gap-2 mb-3">
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
                    <Button
                      size="sm"
                      className="gap-1.5 shrink-0"
                      onClick={() => {
                        // پیش‌فرض هوشمند: اگر متریال تأمین‌نشده داریم → متریال
                        setCostModule(hasUnconfirmedMaterial ? "material" : "print");
                        setCostOpen(true);
                      }}
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
                    <div className="flex flex-col items-center justify-center gap-1.5 py-5 text-muted-foreground rounded-lg border border-dashed">
                      <Icon name="inbox" size={22} className="opacity-30" />
                      <span className="text-xs">هنوز هزینه‌ای ثبت نشده است</span>
                      <span className="text-[10px] text-muted-foreground/70">
                        ثبت هزینهٔ متریال و چاپ الزامی است
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin">
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
                            className="rounded-lg border bg-muted/20 p-2.5 group hover:border-foreground/15 transition"
                          >
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={cn(
                                      "text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-0.5",
                                      mod.color
                                    )}
                                  >
                                    <Icon name={mod.icon} size={9} />
                                    {mod.label}
                                  </span>
                                  <span className="text-sm font-semibold tabular-nums" dir="ltr">
                                    {formatCurrency(c.amount)}
                                  </span>
                                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded", st.cls)}>
                                    {st.label}
                                  </span>
                                  {filesCount > 0 && (
                                    <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                                      <Icon name="file" size={9} />
                                      {filesCount.toLocaleString("fa-IR")}
                                    </span>
                                  )}
                                </div>
                                {c.expenseType?.name && (
                                  <div className="text-[11px] text-muted-foreground mt-0.5">
                                    نوع: {c.expenseType.name}
                                    {c.supplier?.name ? ` • تامین‌کننده: ${c.supplier.name}` : ""}
                                  </div>
                                )}
                                {c.description && (
                                  <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                    {c.description}
                                  </div>
                                )}
                                <div className="text-[10px] text-muted-foreground/70 mt-0.5 tabular-nums">
                                  {formatDate(c.createdAt)}
                                </div>
                              </div>
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
                  )}
                </div>
              </div>
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

      {/* Sub-dialog: register cost — بازطراحی کامل فاز ۱۴ */}
      <Dialog open={costOpen} onOpenChange={setCostOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-lg w-[calc(100%-2rem)] max-h-[92vh] overflow-hidden p-0 gap-0 rounded-xl">
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-l from-primary/8 to-transparent">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                <Icon name="money" size={20} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold">
                  ثبت هزینه جدید
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  سفارش #{order.number} • {order.customer?.name ?? "—"}
                </p>
              </div>
            </div>

            {/* Step 1: نوع هزینه — متریال یا چاپ (الزامی) */}
            <div className="mt-4">
              <div className="text-xs font-medium mb-2">این هزینه برای کدام بخش است؟</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCostModule("material")}
                  className={cn(
                    "rounded-xl border p-3 text-right transition focus-visible:ring-2 outline-none",
                    costModule === "material"
                      ? "border-cyan-400 dark:border-cyan-700 bg-cyan-500/[0.06] shadow-sm"
                      : "border-border hover:bg-accent/40"
                  )}
                  aria-pressed={costModule === "material"}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-8 rounded-lg grid place-items-center",
                        costModule === "material"
                          ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon name="boxes" size={16} />
                    </span>
                    <div>
                      <div className="text-sm font-semibold">هزینه متریال</div>
                      <div className="text-[10px] text-muted-foreground">
                        خرید/تأمین متریال سفارش
                      </div>
                    </div>
                    {costModule === "material" && (
                      <Icon name="check" size={14} className="text-cyan-600 dark:text-cyan-400 mr-auto" />
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setCostModule("print")}
                  className={cn(
                    "rounded-xl border p-3 text-right transition focus-visible:ring-2 outline-none",
                    costModule === "print"
                      ? "border-amber-400 dark:border-amber-700 bg-amber-500/[0.06] shadow-sm"
                      : "border-border hover:bg-accent/40"
                  )}
                  aria-pressed={costModule === "print"}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-8 rounded-lg grid place-items-center",
                        costModule === "print"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon name="print" size={16} />
                    </span>
                    <div>
                      <div className="text-sm font-semibold">هزینه چاپ</div>
                      <div className="text-[10px] text-muted-foreground">
                        هزینه‌های چاپ این سفارش
                      </div>
                    </div>
                    {costModule === "print" && (
                      <Icon name="check" size={14} className="text-amber-600 dark:text-amber-400 mr-auto" />
                    )}
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto scrollbar-thin px-6 py-4 space-y-4">
            {/* Amount — بزرگ و با فرمت زنده */}
            <Field label="مبلغ (IQD)" required>
              <div className="relative">
                <Input
                  id="cost-amount"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={costForm.amount}
                  onChange={(e) =>
                    setCostForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  placeholder="مثلاً 250000"
                  className="tabular-nums h-12 text-lg font-bold pl-16"
                  dir="ltr"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">
                  IQD
                </span>
              </div>
              {amountValid && (
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                  <Icon name="check" size={10} />
                  <span dir="ltr" className="tabular-nums">
                    {prettyAmount(costForm.amount)}
                  </span>{" "}
                  دینار
                </div>
              )}
              {costForm.amount !== "" && !amountValid && (
                <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">
                  مبلغ باید عددی بزرگ‌تر از صفر باشد
                </div>
              )}
            </Field>

            {/* Supplier + Expense type — کنار هم */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="تامین‌کننده">
                <select
                  value={costForm.supplierId}
                  onChange={(e) =>
                    setCostForm((f) => ({ ...f, supplierId: e.target.value }))
                  }
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— انتخاب کنید —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="نوع هزینه">
                <select
                  value={costForm.expenseTypeId}
                  onChange={(e) =>
                    setCostForm((f) => ({ ...f, expenseTypeId: e.target.value }))
                  }
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— انتخاب کنید —</option>
                  {expenseTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Description */}
            <Field label="توضیح">
              <Textarea
                id="cost-description"
                value={costForm.description}
                onChange={(e) =>
                  setCostForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={3}
                placeholder="مثلاً: خرید ۵۰۰ برگ کوتون ۱۲۰ گرم (اختیاری)"
                className="resize-none"
              />
            </Field>

            {/* File upload — drag & drop + click */}
            <Field
              label="اسناد و فایل‌ها (فاکتور/رسید)"
              hint="فاکتور خرید را آپلود کنید تا مالی هنگام تأیید ببیند — PDF، تصویر، آفیس؛ حداکثر ۱۰ مگابایت"
            >
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition select-none",
                    dragOver
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-accent/30"
                )}
                role="button"
                aria-label="آپلود فایل — کلیک یا کشیدن"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.svg,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar"
                  className="sr-only"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 py-1.5 text-sm text-muted-foreground">
                    <Icon name="loading" size={16} className="animate-spin text-primary" />
                    در حال آپلود...
                  </div>
                ) : (
                  <div className="py-1">
                    <div className="mx-auto size-10 rounded-xl bg-primary/10 text-primary grid place-items-center mb-2">
                      <Icon name="upload" size={18} />
                    </div>
                    <div className="text-sm font-medium">
                      فایل را بکشید و رها کنید
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      یا برای انتخاب کلیک کنید
                      {costForm.attachments.length > 0 &&
                        ` — ${costForm.attachments.length.toLocaleString("fa-IR")} فایل آماده`}
                    </div>
                  </div>
                )}
              </div>

              {/* Uploaded files list */}
              {costForm.attachments.length > 0 && (
                <div className="space-y-1.5 mt-2.5">
                  {costForm.attachments.map((a, i) => (
                    <div
                      key={a.url}
                      className="flex items-center gap-2 rounded-lg border bg-muted/20 px-2.5 py-2"
                    >
                      <span className="size-7 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 grid place-items-center shrink-0">
                        <Icon name={fileIconFor(a.fileName)} size={13} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate" dir="ltr">
                          {a.fileName}
                        </div>
                        {a.size > 0 && (
                          <div className="text-[10px] text-muted-foreground" dir="ltr">
                            {formatSize(a.size)}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCostForm((f) => ({
                            ...f,
                            attachments: f.attachments.filter((_, j) => j !== i),
                          }));
                        }}
                        className="size-6 rounded-md grid place-items-center text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition shrink-0"
                        title="حذف از لیست"
                      >
                        <Icon name="cancel" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Field>

            {/* Finance note */}
            <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3 flex items-start gap-2.5">
              <div className="size-7 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                <Icon name="info" size={13} />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                این هزینه به‌عنوان{" "}
                <span className="font-medium text-foreground">
                  {costModule === "material" ? "هزینه متریال" : "هزینه چاپ"}
                </span>{" "}
                ثبت می‌شود و پس از ثبت، برای تأیید به ماژول{" "}
                <span className="font-medium text-foreground">مالی</span> ارسال می‌شود.
                پیوست فاکتور سرعت تأیید را بیشتر می‌کند.
              </p>
            </div>
          </div>

          <DialogFooter className="px-6 py-3 border-t bg-muted/30 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCostOpen(false)}
              disabled={createCostMut.isPending || uploading}
            >
              انصراف
            </Button>
            <Button
              size="sm"
              onClick={() => createCostMut.mutate()}
              disabled={
                createCostMut.isPending ||
                uploading ||
                !amountValid
              }
              className="gap-1.5 min-w-32"
            >
              {createCostMut.isPending ? (
                <Icon name="loading" size={14} className="animate-spin" />
              ) : (
                <Icon name="check" size={14} />
              )}
              {createCostMut.isPending ? "در حال ثبت..." : "ثبت هزینه"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
