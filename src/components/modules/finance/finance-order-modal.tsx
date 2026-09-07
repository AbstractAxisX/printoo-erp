"use client";

// ─── Phase 15: مودال مالی سفارش ──────────────────────────────────────
// نمای مالی از یک سفارش — دو بخش:
//   ۱) «معرفی سفارش»: کد، مشتری، وضعیت، و «الان کجاست و دست کیست»
//      (مرحلهٔ فعال هر آیتم + مجری مؤثر آن)
//   ۲) «تاریخچهٔ مالی»: پیش‌فاکتورها + فاکتور (با ادیت پرداختیِ سینک‌شونده)،
//      دفتر درآمد (تفاضل هوشمند)، هزینه‌های سفارش (به تفکیک ماژول/کارمند)
//      + ثبت پرداخت جدید.

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
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { StatusBadge } from "@/components/shared";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { PRIORITY, ITEM_STAGE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────

type UserLite = { id: string; name: string } | null;

type FinanceOrder = {
  id: string;
  number: number;
  status: string;
  priority: string;
  splitMode: string;
  createdAt: string;
  endDate: string | null;
  totalAmount: number;
  paidAmount: number;
  note: string | null;
  customer: { id: string; name: string; phone: string };
  items: {
    id: string;
    quantity: number;
    stage: string;
    totalAmount: number;
    product: { name: string; unit: string };
    designAssigneeUser: UserLite;
    printAssigneeUser: UserLite;
  }[];
  preInvoices: {
    id: string;
    number: number;
    status: string;
    totalAmount: number;
    paidAmount: number;
    itemId: string | null;
    issueDate: string;
  }[];
  invoice: {
    id: string;
    number: number;
    status: string;
    totalAmount: number;
    paidAmount: number;
    dueDate: string | null;
  } | null;
  materialCosts: {
    id: string;
    title: string | null;
    amount: number;
    description?: string | null;
    status: string;
    module: string;
    includeInInvoice: boolean;
    createdAt: string;
    createdByName: string | null;
    expenseType?: { name: string } | null;
    supplier?: { name: string } | null;
  }[];
  revenueLogs: {
    id: string;
    amount: number;
    totalAfter: number;
    module: string;
    method: string | null;
    note: string | null;
    createdByName: string | null;
    createdAt: string;
  }[];
  assignedDesigner: UserLite;
  assignedPrinter: UserLite;
  createdByUser: UserLite;
};

const MODULE_LABELS: Record<string, string> = {
  print: "چاپ",
  material: "متریال",
  warehouse: "انبار",
  logistics: "لجستیک",
  finance: "مالی",
};

const RM_MODULE: Record<string, { label: string; color: string; icon: IconName }> = {
  finance: { label: "مالی", color: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300", icon: "wallet" },
  admin: { label: "ادمین", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300", icon: "dashboard" },
  logistics: { label: "لجستیک", color: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300", icon: "truck" },
  other: { label: "سایر", color: "bg-muted text-muted-foreground", icon: "info" },
};

const STAGE_COLOR: Record<string, string> = {
  design: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  print: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  warehouse: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  archive: "bg-muted text-muted-foreground",
};

// ─── Component ─────────────────────────────────────────────────────────

export function FinanceOrderModal({
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
  const [tab, setTab] = React.useState("intro");
  const [editPi, setEditPi] = React.useState<string | null>(null);
  const [piPaid, setPiPaid] = React.useState("");
  const [editInv, setEditInv] = React.useState(false);
  const [invPaid, setInvPaid] = React.useState("");
  const [payOpen, setPayOpen] = React.useState(false);
  const [payTotal, setPayTotal] = React.useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["order", orderId, "finance"],
    queryFn: () => api<{ order: FinanceOrder }>(`/api/orders/${orderId}`),
    enabled: !!orderId && open,
  });
  const order = data?.order ?? null;

  React.useEffect(() => {
    if (open) {
      setTab("intro");
      setEditPi(null);
      setEditInv(false);
      setPayOpen(false);
    }
  }, [open, orderId]);

  // ── ادیت پرداختی پیش‌فاکتور (delta → دفتر درآمد هوشمند) ──
  const piPutMut = useMutation({
    mutationFn: ({ id, paid }: { id: string; paid: number }) =>
      api(`/api/pre-invoices/${id}`, {
        method: "PUT",
        body: JSON.stringify({ paidAmount: paid }),
      }),
    onSuccess: () => {
      toast.success("پیش‌پرداخت ویرایش شد — تغییرات در فاکتور/دفتر درآمد ثبت شد");
      setEditPi(null);
      invalidate(["orders", "revenues", "finance", "dashboard"]);
      qc.invalidateQueries({ queryKey: ["order", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── ادیت پرداختی فاکتور (mirror → همه سندها سینک) ──
  const invPutMut = useMutation({
    mutationFn: (paid: number) =>
      api(`/api/invoices/${order?.invoice?.id}`, {
        method: "PUT",
        body: JSON.stringify({ paidAmount: paid }),
      }),
    onSuccess: () => {
      toast.success("پرداختی فاکتور ویرایش شد — پیش‌فاکتورها سینک شدند");
      setEditInv(false);
      invalidate(["orders", "revenues", "finance", "dashboard"]);
      qc.invalidateQueries({ queryKey: ["order", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── صدور فاکتور نهایی (اقلام واقعی سفارش + هزینه‌های فاکتوری) ──
  const issueInvMut = useMutation({
    mutationFn: () => {
      const items = [
        ...(order?.items ?? []).map((it) => ({
          name: it.product?.name ?? "آیتم",
          quantity: it.quantity,
          unit: it.product?.unit ?? "عدد",
          unitPrice: it.quantity > 0 ? it.totalAmount / it.quantity : 0,
          discount: 0,
        })),
        ...(order?.materialCosts ?? [])
          .filter((c) => c.includeInInvoice && c.status !== "rejected")
          .map((c) => ({
            name: c.title ?? "هزینهٔ اضافی",
            quantity: 1,
            unit: "عدد",
            unitPrice: c.amount,
            discount: 0,
          })),
      ];
      return api("/api/invoices", {
        method: "POST",
        body: JSON.stringify({
          orderId: order?.id,
          items,
          paidAmount: order?.paidAmount ?? 0,
          dueDays: 30,
        }),
      });
    },
    onSuccess: () => {
      toast.success("فاکتور نهایی صادر شد");
      invalidate(["orders", "finance"]);
      qc.invalidateQueries({ queryKey: ["order", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── ثبت پرداخت جدید (کل پرداخت‌شده → تفاضل هوشمند) ──
  const payMut = useMutation({
    mutationFn: (total: number) =>
      api<{ diff: number; totalAfter: number }>(`/api/orders/${orderId}/payments`, {
        method: "POST",
        body: JSON.stringify({ total, method: "cash", note: "ثبت از پنل مالی سفارش" }),
      }),
    onSuccess: (res) => {
      toast.success(
        `ثبت شد — ${
          res.diff >= 0
            ? `درآمد جدید: ${formatCurrency(res.diff)}`
            : `اصلاح: ${formatCurrency(Math.abs(res.diff))}`
        }`
      );
      setPayOpen(false);
      invalidate(["orders", "revenues", "finance", "dashboard"]);
      qc.invalidateQueries({ queryKey: ["order", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!order) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined} className="max-w-2xl p-0 gap-0">
          <DialogTitle className="sr-only">سفارش — نمای مالی</DialogTitle>
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            {isLoading ? (
              <>
                <Icon name="loading" size={28} className="animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">در حال بارگذاری…</span>
              </>
            ) : isError ? (
              <span className="text-sm text-rose-600">
                {(error as Error)?.message || "خطا در بارگذاری سفارش"}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">سفارش یافت نشد</span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const remaining = order.totalAmount - order.paidAmount;
  const priorityInfo = PRIORITY[order.priority as keyof typeof PRIORITY] ?? PRIORITY.normal;

  // «الان کجاست و دست کیست» — مجری مؤثر هر مرحلهٔ فعال
  const activeStages = React.useMemo(() => {
    const byStage = new Map<string, { label: string; who: string[]; count: number }>();
    for (const it of order.items) {
      if (it.stage === "completed" || it.stage === "archive") continue;
      const stageLabel = ITEM_STAGE[it.stage as keyof typeof ITEM_STAGE]?.label ?? it.stage;
      const who =
        it.stage === "design"
          ? it.designAssigneeUser?.name ?? order.assignedDesigner?.name ?? "استخر عمومی"
          : it.printAssigneeUser?.name ?? order.assignedPrinter?.name ?? "استخر عمومی";
      const key = it.stage;
      const g = byStage.get(key) ?? { label: stageLabel, who: [], count: 0 };
      g.count++;
      if (!g.who.includes(who)) g.who.push(who);
      byStage.set(key, g);
    }
    return [...byStage.values()];
  }, [order]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-5xl w-[calc(100%-2rem)] max-h-[92vh] overflow-hidden p-0 gap-0 rounded-xl"
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-l from-violet-500/8 via-violet-500/3 to-transparent">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-13 rounded-2xl bg-gradient-to-br from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-400 grid place-items-center shrink-0 border border-violet-500/10 p-3">
                <Icon name="wallet" size={24} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold truncate flex items-center gap-2">
                  سفارش #{order.number}
                  {order.splitMode === "separated" && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted">تفکیک‌شده</span>
                  )}
                </DialogTitle>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Icon name="customers" size={12} />
                    {order.customer?.name}
                  </span>
                  <span className="tabular-nums" dir="ltr">
                    {order.customer?.phone}
                  </span>
                  <span>•</span>
                  <span className="tabular-nums">{formatDate(order.createdAt)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={order.status} />
              <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", priorityInfo.badge)}>
                {priorityInfo.label}
              </span>
            </div>
          </div>

          {/* ۴ تایل مالی */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
            <div className="rounded-xl bg-background/70 backdrop-blur-sm p-3 border shadow-sm">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <span className="size-5 rounded-md bg-violet-500/10 text-violet-600 grid place-items-center">
                  <Icon name="invoice" size={10} />
                </span>
                جمع سفارش
              </div>
              <div className="text-sm font-bold mt-1.5 tabular-nums" dir="ltr">
                {formatCurrency(order.totalAmount)}
              </div>
            </div>
            <div className="rounded-xl bg-background/70 backdrop-blur-sm p-3 border shadow-sm">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <span className="size-5 rounded-md bg-emerald-500/10 text-emerald-600 grid place-items-center">
                  <Icon name="trending" size={10} />
                </span>
                پرداخت‌شده
              </div>
              <div className="text-sm font-bold mt-1.5 tabular-nums text-emerald-600 dark:text-emerald-400" dir="ltr">
                {formatCurrency(order.paidAmount)}
              </div>
            </div>
            <div className="rounded-xl bg-background/70 backdrop-blur-sm p-3 border shadow-sm">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <span className="size-5 rounded-md bg-rose-500/10 text-rose-600 grid place-items-center">
                  <Icon name="wallet" size={10} />
                </span>
                مانده (بستانکار)
              </div>
              <div
                className={cn(
                  "text-sm font-bold mt-1.5 tabular-nums",
                  remaining > 0.001 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600"
                )}
                dir="ltr"
              >
                {remaining > 0.001 ? formatCurrency(remaining) : "تسویه ✓"}
              </div>
            </div>
            <div className="rounded-xl bg-background/70 backdrop-blur-sm p-3 border shadow-sm">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <span className="size-5 rounded-md bg-amber-500/10 text-amber-600 grid place-items-center">
                  <Icon name="money" size={10} />
                </span>
                هزینه‌های سفارش
              </div>
              <div className="text-sm font-bold mt-1.5 tabular-nums" dir="ltr">
                {formatCurrency((order.materialCosts ?? []).reduce((s, c) => s + c.amount, 0))}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-3 pb-0 border-b bg-muted/20">
            <TabsList className="bg-transparent p-0 h-auto gap-1">
              <TabsTrigger
                value="intro"
                className="px-4 py-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-violet-500 data-[state=active]:shadow-none rounded-t-lg text-sm gap-1.5"
              >
                <Icon name="orders" size={15} />
                معرفی سفارش
              </TabsTrigger>
              <TabsTrigger
                value="money"
                className="px-4 py-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-violet-500 data-[state=active]:shadow-none rounded-t-lg text-sm gap-1.5"
              >
                <Icon name="coins" size={15} />
                تاریخچهٔ مالی
                {(order.revenueLogs ?? []).length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                    {(order.revenueLogs ?? []).length.toLocaleString("fa-IR")}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ── Tab 1: معرفی سفارش ── */}
          <TabsContent value="intro" className="mt-0 flex-1 min-h-0 data-[state=inactive]:hidden">
            <div className="overflow-y-auto scrollbar-thin px-6 py-4 space-y-4" style={{ maxHeight: "52vh" }}>
              {/* الان کجاست و دست کیست */}
              {activeStages.length > 0 ? (
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="text-xs font-medium text-muted-foreground mb-2.5 flex items-center gap-1.5">
                    <Icon name="play" size={13} /> سفارش الان کجاست و دست کیست؟
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeStages.map((s) => (
                      <div
                        key={s.label}
                        className="rounded-lg border bg-card px-3 py-2 flex items-center gap-2"
                      >
                        <span className={cn("text-[11px] px-2 py-0.5 rounded font-medium", STAGE_COLOR[s.label] ?? "bg-muted")}>
                          {s.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {s.count.toLocaleString("fa-IR")} آیتم
                        </span>
                        <span className="flex items-center gap-1 text-xs">
                          <Icon name="user" size={11} className="text-muted-foreground" />
                          {s.who.join("، ")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border bg-emerald-500/[0.05] p-4 flex items-center gap-2">
                  <Icon name="checkCircle" size={16} className="text-emerald-600" />
                  <span className="text-sm">همهٔ آیتم‌های این سفارش تکمیل/آرشیو شده‌اند</span>
                </div>
              )}

              {/* آیتم‌ها */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2.5 flex items-center gap-1.5">
                  <Icon name="orders" size={13} /> آیتم‌های سفارش
                  <span className="text-[10px] font-normal text-muted-foreground/70">
                    ({(order.items ?? []).length.toLocaleString("fa-IR")})
                  </span>
                </div>
                <div className="rounded-xl border overflow-hidden">
                  <div className="grid grid-cols-[1fr_70px_90px_110px_100px] gap-2 px-3 py-2 bg-muted/50 text-[10px] font-medium text-muted-foreground">
                    <span>محصول</span>
                    <span className="text-center">تعداد</span>
                    <span className="text-center">مرحله</span>
                    <span className="text-center">مجری</span>
                    <span className="text-center">مبلغ</span>
                  </div>
                  <div className="divide-y">
                    {order.items.map((it, i) => {
                      const who =
                        it.stage === "design"
                          ? it.designAssigneeUser?.name ?? order.assignedDesigner?.name ?? "استخر عمومی"
                          : it.printAssigneeUser?.name ?? order.assignedPrinter?.name ?? "استخر عمومی";
                      return (
                        <div
                          key={it.id}
                          className="grid grid-cols-[1fr_70px_90px_110px_100px] gap-2 px-3 py-2.5 items-center text-sm hover:bg-accent/20 transition"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[10px] text-muted-foreground w-4 shrink-0">
                              {(i + 1).toLocaleString("fa-IR")}
                            </span>
                            <span className="text-sm truncate">{it.product?.name ?? "—"}</span>
                          </div>
                          <span className="text-center text-xs tabular-nums">
                            {it.quantity.toLocaleString("fa-IR")}
                          </span>
                          <span className="text-center">
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded", STAGE_COLOR[it.stage] ?? "bg-muted")}>
                              {ITEM_STAGE[it.stage as keyof typeof ITEM_STAGE]?.label ?? it.stage}
                            </span>
                          </span>
                          <span className="text-center text-xs text-muted-foreground truncate">
                            {it.stage === "completed" || it.stage === "archive" ? "—" : who}
                          </span>
                          <span className="text-center text-xs font-semibold tabular-nums" dir="ltr">
                            {formatCurrency(it.totalAmount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {order.note && (
                <div className="rounded-xl border p-3.5">
                  <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <Icon name="info" size={13} /> یادداشت سفارش
                  </div>
                  <p className="text-xs whitespace-pre-wrap leading-relaxed">{order.note}</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Tab 2: تاریخچهٔ مالی ── */}
          <TabsContent value="money" className="mt-0 flex-1 min-h-0 data-[state=inactive]:hidden">
            <div className="overflow-y-auto scrollbar-thin px-6 py-4 space-y-5" style={{ maxHeight: "52vh" }}>
              {/* پیش‌فاکتورها */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Icon name="file" size={13} /> پیش‌فاکتورها
                    <span className="text-[10px] font-normal text-muted-foreground/70">
                      ({(order.preInvoices ?? []).length.toLocaleString("fa-IR")})
                    </span>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5 h-7"
                    onClick={() => {
                      setPayTotal(String(order.paidAmount ?? 0));
                      setPayOpen(true);
                    }}
                  >
                    <Icon name="creditCard" size={12} />
                    ثبت پرداخت
                  </Button>
                </div>
                <div className="space-y-2">
                  {order.preInvoices.map((pi) => (
                    <div key={pi.id} className="rounded-xl border p-3.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs font-bold">پیش‌فاکتور #{pi.number}</span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {formatDate(pi.issueDate)}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {pi.status === "draft"
                              ? "پیش‌نویس"
                              : pi.status === "sent"
                              ? "ارسال‌شده"
                              : pi.status === "approved"
                              ? "تأییدشده"
                              : pi.status === "rejected"
                              ? "ردشده"
                              : "تبدیل‌شده"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            جمع:{" "}
                            <b className="tabular-nums text-foreground" dir="ltr">
                              {formatCurrency(pi.totalAmount)}
                            </b>
                          </span>
                          {editPi === pi.id ? (
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                min={0}
                                dir="ltr"
                                className="w-32 h-8 text-center tabular-nums"
                                value={piPaid}
                                onChange={(e) => setPiPaid(e.target.value)}
                              />
                              <Button
                                size="sm"
                                className="h-8 gap-1"
                                disabled={
                                  piPutMut.isPending ||
                                  piPaid === "" ||
                                  !Number.isFinite(Number(piPaid)) ||
                                  Number(piPaid) < 0
                                }
                                onClick={() =>
                                  piPutMut.mutate({ id: pi.id, paid: Number(piPaid) })
                                }
                              >
                                {piPutMut.isPending ? (
                                  <Icon name="loading" size={12} className="animate-spin" />
                                ) : (
                                  <Icon name="check" size={12} />
                                )}
                                ذخیره
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditPi(null)}>
                                انصراف
                              </Button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditPi(pi.id);
                                setPiPaid(String(pi.paidAmount));
                              }}
                              className={cn(
                                "text-xs px-2.5 py-1 rounded-lg transition inline-flex items-center gap-1",
                                pi.paidAmount > 0
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-200/60"
                                  : "bg-muted text-muted-foreground hover:bg-muted/70"
                              )}
                              title="ویرایش پرداخت‌شده — سیستم تفاضل را حساب می‌کند"
                            >
                              <Icon name="trending" size={11} />
                              پرداخت‌شده:{" "}
                              <span dir="ltr" className="tabular-nums font-bold">
                                {formatCurrency(pi.paidAmount)}
                              </span>
                              <Icon name="edit" size={10} className="opacity-60" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(order.preInvoices ?? []).length === 0 && (
                    <div className="text-xs text-muted-foreground py-3 text-center border rounded-lg border-dashed">
                      پیش‌فاکتوری برای این سفارش وجود ندارد
                    </div>
                  )}
                </div>
              </div>

              {/* فاکتور نهایی */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2.5 flex items-center gap-1.5">
                  <Icon name="invoice" size={13} /> فاکتور نهایی
                </div>
                {order.invoice ? (
                  <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-500/[0.03] p-3.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-bold">فاکتور #{order.invoice.number}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {order.invoice.status === "issued"
                            ? "صادرشده"
                            : order.invoice.status === "paid"
                            ? "پرداخت‌شده"
                            : order.invoice.status === "cancelled"
                            ? "باطل‌شده"
                            : "پیش‌نویس"}
                        </span>
                        {order.invoice.dueDate && (
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            سررسید: {formatDate(order.invoice.dueDate)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          جمع:{" "}
                          <b className="tabular-nums text-foreground" dir="ltr">
                            {formatCurrency(order.invoice.totalAmount)}
                          </b>
                        </span>
                        {editInv ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min={0}
                              dir="ltr"
                              className="w-32 h-8 text-center tabular-nums"
                              value={invPaid}
                              onChange={(e) => setInvPaid(e.target.value)}
                            />
                            <Button
                              size="sm"
                              className="h-8 gap-1"
                              disabled={
                                invPutMut.isPending ||
                                invPaid === "" ||
                                !Number.isFinite(Number(invPaid)) ||
                                Number(invPaid) < 0
                              }
                              onClick={() => invPutMut.mutate(Number(invPaid))}
                            >
                              {invPutMut.isPending ? (
                                <Icon name="loading" size={12} className="animate-spin" />
                              ) : (
                                <Icon name="check" size={12} />
                              )}
                              ذخیره
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditInv(false)}>
                              انصراف
                            </Button>
                          </div>
                        ) : (
                          order.invoice.status !== "cancelled" && (
                            <button
                              onClick={() => {
                                setEditInv(true);
                                setInvPaid(String(order.invoice!.paidAmount));
                              }}
                              className="text-xs px-2.5 py-1 rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 hover:bg-violet-200/60 transition inline-flex items-center gap-1"
                              title="ویرایش پرداخت‌شده — پیش‌فاکتورها هم سینک می‌شوند"
                            >
                              <Icon name="trending" size={11} />
                              پرداخت‌شده:{" "}
                              <span dir="ltr" className="tabular-nums font-bold">
                                {formatCurrency(order.invoice.paidAmount)}
                              </span>
                              <Icon name="edit" size={10} className="opacity-60" />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-4 flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      فاکتور نهایی صادر نشده — از اقلام سفارش + هزینه‌های فاکتوری صادر می‌شود
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-7"
                      onClick={() => issueInvMut.mutate()}
                      disabled={issueInvMut.isPending}
                    >
                      {issueInvMut.isPending ? (
                        <Icon name="loading" size={12} className="animate-spin" />
                      ) : (
                        <Icon name="invoice" size={12} />
                      )}
                      صدور فاکتور نهایی
                    </Button>
                  </div>
                )}
              </div>

              {/* دفتر درآمد سفارش */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2.5 flex items-center gap-1.5">
                  <Icon name="trending" size={13} /> دفتر درآمد این سفارش
                  <span className="text-[10px] font-normal text-muted-foreground/70">
                    (تفاضل هوشمند — کی، کدام ماژول، چه ساعتی)
                  </span>
                </div>
                {(order.revenueLogs ?? []).length === 0 ? (
                  <div className="text-xs text-muted-foreground py-3 text-center border rounded-lg border-dashed">
                    هنوز درآمدی برای این سفارش ثبت نشده
                  </div>
                ) : (
                  <div className="rounded-xl border overflow-hidden">
                    <div className="divide-y">
                      {order.revenueLogs.map((l) => {
                        const m = RM_MODULE[l.module] ?? RM_MODULE.other;
                        return (
                          <div
                            key={l.id}
                            className="px-3.5 py-2.5 flex items-center justify-between gap-2 flex-wrap hover:bg-accent/20 transition"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <span
                                className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-0.5",
                                  m.color
                                )}
                              >
                                <Icon name={m.icon} size={9} />
                                {m.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {l.createdByName ?? "—"}
                              </span>
                              <span className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
                                {formatDateTime(l.createdAt)}
                              </span>
                              {l.note && (
                                <span className="text-[10px] text-muted-foreground truncate max-w-[220px]">
                                  — {l.note}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                کل:{" "}
                                <span dir="ltr">
                                  {formatCurrency(l.totalAfter)}
                                </span>
                              </span>
                              <span
                                className={cn(
                                  "text-xs font-bold tabular-nums",
                                  l.amount >= 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-rose-600 dark:text-rose-400"
                                )}
                                dir="ltr"
                              >
                                {l.amount >= 0 ? "+" : "−"}
                                {formatCurrency(Math.abs(l.amount))}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* هزینه‌های سفارش */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2.5 flex items-center gap-1.5">
                  <Icon name="money" size={13} /> هزینه‌های این سفارش
                  <span className="text-[10px] font-normal text-muted-foreground/70">
                    (به تفکیک ماژول ثبت‌کننده و کارمند)
                  </span>
                </div>
                {(order.materialCosts ?? []).length === 0 ? (
                  <div className="text-xs text-muted-foreground py-3 text-center border rounded-lg border-dashed">
                    هزینه‌ای روی این سفارش ثبت نشده
                  </div>
                ) : (
                  <div className="rounded-xl border overflow-hidden">
                    <div className="divide-y">
                      {order.materialCosts.map((c) => (
                        <div
                          key={c.id}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-2 flex-wrap hover:bg-accent/20 transition"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="text-sm font-medium truncate max-w-[200px]">
                              {c.title || c.description || "هزینه"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {MODULE_LABELS[c.module] ?? c.module} • {c.createdByName ?? "—"}
                            </span>
                            {c.includeInInvoice && (
                              <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                                در فاکتور
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
                              {formatDateTime(c.createdAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={cn(
                                "text-[10px] px-2 py-0.5 rounded-full",
                                c.status === "approved"
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  : c.status === "rejected"
                                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                              )}
                            >
                              {c.status === "approved" ? "تأیید" : c.status === "rejected" ? "رد" : "در انتظار"}
                            </span>
                            <span className="text-xs font-bold tabular-nums" dir="ltr">
                              {formatCurrency(c.amount)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <DialogFooter className="px-6 py-3 border-t bg-muted/30 flex items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {formatDate(order.createdAt)} ثبت شده
            {order.createdByUser?.name ? ` توسط ${order.createdByUser.name}` : ""}
          </span>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setPayTotal(String(order.paidAmount ?? 0));
              setPayOpen(true);
            }}
          >
            <Icon name="creditCard" size={14} />
            ثبت پرداخت جدید
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* مودال ثبت پرداخت */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md p-0 gap-0">
          <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-l from-emerald-500/8 to-transparent">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 grid place-items-center shrink-0">
                <Icon name="creditCard" size={20} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold">
                  ثبت پرداخت — سفارش #{order.number}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {order.customer?.name} • مانده:{" "}
                  <span dir="ltr" className="tabular-nums font-medium text-rose-600 dark:text-rose-400">
                    {formatCurrency(Math.max(0, remaining))}
                  </span>
                </p>
              </div>
            </div>
          </div>
          <div className="px-6 py-4">
            <Field label="کل پرداخت‌شده تا الان (IQD)" required>
              <Input
                type="number"
                min={0}
                dir="ltr"
                className="text-center h-11 text-lg font-bold tabular-nums"
                value={payTotal}
                onChange={(e) => setPayTotal(e.target.value)}
              />
            </Field>
            {payTotal !== "" && Number.isFinite(Number(payTotal)) && (
              <div className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/10 p-3 text-xs">
                <b>درآمد جدید</b> که سیستم ثبت می‌کند:{" "}
                <span dir="ltr" className="tabular-nums font-bold">
                  {formatCurrency(Math.max(0, Number(payTotal) - order.paidAmount))}
                </span>
                <div className="text-[10px] text-muted-foreground mt-1">
                  ادیت عدد قبلی؟ سیستم خودش فقط تفاضل را به‌عنوان درآمد جدید لاگ می‌کند
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="px-6 py-3 border-t bg-muted/30 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPayOpen(false)} disabled={payMut.isPending}>
              انصراف
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => payMut.mutate(Number(payTotal))}
              disabled={payMut.isPending || payTotal === "" || !Number.isFinite(Number(payTotal)) || Number(payTotal) < 0}
            >
              {payMut.isPending ? (
                <Icon name="loading" size={14} className="animate-spin" />
              ) : (
                <Icon name="check" size={14} />
              )}
              ثبت پرداخت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
