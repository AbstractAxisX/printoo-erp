"use client";

// Printoo24 ERP — Phase 24 (خواستهٔ ۵): «نمای ۳۶۰ درجه مشتری» مشترک
// ─────────────────────────────────────────────────────────────────
// یک دراور واحد که هم CRM و هم «مدیریت مشتریان» ماژول ادمین داخلی
// استفاده می‌کنند — دقیقاً همان امکانات:
//   • سربرگ پروفایل (آواتار/تماس/موقعیت/آدرس/یادداشت) + آمار سریع
//   • کاشی‌های مالی (جمع سفارش‌ها / پرداخت‌شده / مانده / تعداد سفارش)
//   • تب سفارش‌ها: تفکیک «پرداخت‌نشده (بدهکار)» با فاکتور جمعی چاپی +
//     خط جداکننده + «تسویه‌شده / بدون بدهی»
//   • تب فاکتورها + تب پرداخت‌ها (از GET /api/customers/[id])
//   • تب معاملات + ثبت معامله جدید (CRM)
//   • تب فعالیت‌ها + تایم‌لاین + ثبت فعالیت (CRM)
//   • منطقهٔ خطر — حذف کامل با تایپ نام
// منبع داده: GET /api/customers/[id] + /api/deals + /api/activities

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { EmptyState, StatusBadge } from "@/components/shared";
import { P24StatementDoc } from "@/components/shared/p24-doc";
import { DocPrintButtons } from "@/components/shared/doc-print-buttons";
import { COMPANY, CURRENCY } from "@/lib/constants";
import { DetailDrawer } from "@/components/ui/detail-drawer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatNumber, relativeTime } from "@/lib/format";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ACTIVITY_META, STAGE_LABELS, STAGE_COLORS,
  type Activity, type Deal,
} from "@/components/modules/crm/crm-types";
import { ActivityFormDialog } from "@/components/modules/crm/activity-form-dialog";
import { DealFormDialog } from "@/components/modules/crm/deal-form-dialog";

// ─── تایپ‌ها (آینهٔ پاسخ زندهٔ GET /api/customers/[id]) ───────────────────

export type Customer360 = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  city: string | null;
  province: string | null;
  isFavorite: boolean;
  balanceDue?: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { orders: number; deals: number; activities: number };
  unsettled: number;
};

export type Customer360Order = {
  id: string;
  number: number;
  status: string;
  priority: string;
  totalAmount: number;
  paidAmount: number;
  endDate: string | null;
  createdAt: string;
  items?: { id: string; product?: { name: string } | null }[];
};

export type Customer360Invoice = {
  id: string;
  number: number;
  status: string;
  totalAmount: number;
  paidAmount: number;
  createdAt: string;
};

export type Customer360Payment = {
  id: string;
  amount: number;
  method: string | null;
  date: string;
  createdAt: string;
};

export type Customer360Response = {
  customer: Customer360;
  orders: Customer360Order[];
  invoices: Customer360Invoice[];
  payments: Customer360Payment[];
  totals: {
    ordersCount: number;
    unsettled: number;
    totalBilled: number;
    totalPaid: number;
  };
};

// ─── سفارشِ «بدهکار»: هر سفارشی (جز لغو‌شده) که کامل پرداخت نشده ───────
// (قرارداد فاز ۲۲ — خواستهٔ ۹: فاکتور جمعی باید روی همین‌ها باشد)
const isUnpaidOrder = (o: Customer360Order) =>
  o.status !== "cancelled" &&
  (o.totalAmount || 0) - (o.paidAmount ?? 0) > 0.001;

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "نقدی",
  transfer: "کارت به کارت",
  cheque: "چک",
};

const INVOICE_STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "پیش‌نویس", cls: "bg-muted text-muted-foreground" },
  issued: { label: "صادرشده", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  paid: { label: "پرداخت‌شده", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  cancelled: { label: "باطل‌شده", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
};

// ─── دراور اصلی ─────────────────────────────────────────────────────────

export function Customer360Drawer({
  customerId,
  onClose,
  onEdit,
  invalidateKeys = [],
}: {
  customerId: string | null;
  onClose: () => void;
  /** دکمهٔ ویرایش سربرگ (صفحهٔ ادمین فرم ویرایش را پر می‌کند) */
  onEdit?: (c: Customer360) => void;
  /** کلیدهای اضافی که بعد از حذف/تغییر باید invalidate شوند (مثل "customers") */
  invalidateKeys?: string[];
}) {
  const invalidate = useInvalidate();
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [dealOpen, setDealOpen] = React.useState(false);
  const [statementOpen, setStatementOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [confirmName, setConfirmName] = React.useState("");
  const open = !!customerId;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["customer-detail", customerId],
    queryFn: async () => {
      if (!customerId) return null;
      const [fileRes, dealsRes, actsRes] = await Promise.all([
        api<Customer360Response>(`/api/customers/${customerId}`),
        api<{ deals: Deal[] }>(`/api/deals?customerId=${customerId}`),
        api<{ activities: Activity[] }>(`/api/activities?customerId=${customerId}&limit=50`),
      ]);
      const file = fileRes ?? null;
      if (!file?.customer) return null;
      return {
        ...file,
        deals: dealsRes?.deals ?? [],
        activities: actsRes?.activities ?? [],
      } as Customer360Response & { deals: Deal[]; activities: Activity[] };
    },
    enabled: !!customerId,
    refetchInterval: open ? 30000 : false,
  });

  // ریست دیالوگ‌های داخلی هنگام بستن دراور
  React.useEffect(() => {
    if (!open) {
      setActivityOpen(false);
      setDealOpen(false);
      setStatementOpen(false);
      setDeleteOpen(false);
      setConfirmName("");
    }
  }, [open]);

  const detail = data;
  const notFound = !isLoading && !isError && !detail;

  const unpaidOrders = React.useMemo(
    () => (detail?.orders ?? []).filter(isUnpaidOrder),
    [detail]
  );
  const settledOrders = React.useMemo(
    () => (detail?.orders ?? []).filter((o) => !isUnpaidOrder(o)),
    [detail]
  );
  const activeTotals = React.useMemo(() => {
    const subtotal = unpaidOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const paid = unpaidOrders.reduce((s, o) => s + (o.paidAmount || 0), 0);
    return { subtotal, paid, balance: Math.max(0, subtotal - paid) };
  }, [unpaidOrders]);

  const deleteMut = useMutation({
    mutationFn: () => {
      if (!customerId) throw new Error("مشتری انتخاب نشده است");
      return api(`/api/customers/${customerId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      invalidate(["customers", "customers-list", "customers-wizard", "customer-detail", "crm-dashboard", "deals", "dashboard", ...invalidateKeys]);
      toast.success("مشتری حذف شد");
      setDeleteOpen(false);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <DetailDrawer
        open={open}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
        title="نمای ۳۶۰ درجه مشتری"
        description="اطلاعات کامل، سفارش‌ها، فاکتورها، پرداخت‌ها، معاملات و فعالیت‌ها"
        icon="customers"
      >
        {isLoading ? (
          <div className="py-20 flex flex-col items-center gap-2">
            <Icon name="loading" size={28} className="animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">در حال بارگذاری...</span>
          </div>
        ) : isError ? (
          <div className="py-20 flex flex-col items-center gap-2">
            <Icon name="alertTriangle" size={28} className="text-rose-500" />
            <span className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "خطا در بارگذاری مشتری"}
            </span>
            <Button variant="outline" size="sm" onClick={onClose} className="mt-2">بستن</Button>
          </div>
        ) : notFound ? (
          <div className="py-20 flex flex-col items-center gap-2">
            <Icon name="alertTriangle" size={28} className="text-amber-500" />
            <span className="text-sm text-muted-foreground">
              مشتری یافت نشد. ممکن است حذف شده باشد.
            </span>
            <Button variant="outline" size="sm" onClick={onClose} className="mt-2">بستن</Button>
          </div>
        ) : detail ? (
          <div className="flex flex-col">
            {/* ── سربرگ پروفایل ── */}
            <div className="px-5 py-4 border-b bg-muted/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="size-14 rounded-2xl bg-primary text-primary-foreground grid place-items-center text-xl font-bold shrink-0">
                    {detail.customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold truncate">{detail.customer.name}</h3>
                      {detail.customer.isFavorite && (
                        <Icon name="star" size={16} className="text-amber-500 shrink-0" />
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap" dir="ltr">
                      <Icon name="customers" size={12} />
                      {detail.customer.phone}
                      {(detail.customer.city || detail.customer.province) && (
                        <span className="flex items-center gap-1">
                          •
                          <Icon name="mapPin" size={12} />
                          {detail.customer.city && <span>{detail.customer.city}</span>}
                          {detail.customer.city && detail.customer.province && <span>/</span>}
                          {detail.customer.province && <span>{detail.customer.province}</span>}
                        </span>
                      )}
                    </div>
                    {detail.customer.address && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{detail.customer.address}</p>
                    )}
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      مشتری از {formatDate(detail.customer.createdAt)}
                    </div>
                  </div>
                </div>
                {onEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onClick={() => onEdit(detail.customer)}
                  >
                    <Icon name="edit" size={14} /> ویرایش
                  </Button>
                )}
              </div>

              {/* آمار سریع */}
              <div className="grid grid-cols-4 gap-2 mt-4">
                <div className="rounded-lg bg-card border p-2 text-center">
                  <div className="text-[10px] text-muted-foreground">سفارش‌ها</div>
                  <div className="text-base font-bold tabular-nums">{formatNumber(detail.orders.length)}</div>
                </div>
                <div className="rounded-lg bg-card border p-2 text-center">
                  <div className="text-[10px] text-muted-foreground">معاملات</div>
                  <div className="text-base font-bold tabular-nums">{formatNumber(detail.deals.length)}</div>
                </div>
                <div className="rounded-lg bg-card border p-2 text-center">
                  <div className="text-[10px] text-muted-foreground">مجموع خرید</div>
                  <div className="text-xs font-bold tabular-nums" dir="ltr">
                    {formatCurrency(detail.totals.totalBilled)}
                  </div>
                </div>
                <div className="rounded-lg bg-card border p-2 text-center">
                  <div className="text-[10px] text-muted-foreground">مانده حساب</div>
                  <div
                    className={cn(
                      "text-xs font-bold tabular-nums",
                      (detail.customer.unsettled ?? 0) > 0 ? "text-rose-600" : "text-emerald-600"
                    )}
                    dir="ltr"
                  >
                    {formatCurrency(detail.customer.unsettled ?? 0)}
                  </div>
                </div>
              </div>

              {detail.customer.note && (
                <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2.5 text-xs">
                  <div className="flex items-start gap-1.5">
                    <Icon name="info" size={12} className="text-amber-600 mt-0.5 shrink-0" />
                    <span>{detail.customer.note}</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── تب‌ها ── */}
            <Tabs defaultValue="orders" className="flex-1">
              <div className="px-5 pt-3">
                <TabsList className="w-full">
                  <TabsTrigger value="orders" className="flex-1 gap-1 text-xs">
                    <Icon name="orders" size={14} />
                    سفارش‌ها ({formatNumber(detail.orders.length)})
                  </TabsTrigger>
                  <TabsTrigger value="invoices" className="flex-1 gap-1 text-xs">
                    <Icon name="invoice" size={14} />
                    فاکتورها ({formatNumber(detail.invoices.length)})
                  </TabsTrigger>
                  <TabsTrigger value="payments" className="flex-1 gap-1 text-xs">
                    <Icon name="creditCard" size={14} />
                    پرداخت‌ها
                  </TabsTrigger>
                </TabsList>
                <TabsList className="w-full mt-1.5">
                  <TabsTrigger value="deals" className="flex-1 gap-1 text-xs">
                    <Icon name="orders" size={14} />
                    معاملات ({formatNumber(detail.deals.length)})
                  </TabsTrigger>
                  <TabsTrigger value="activities" className="flex-1 gap-1 text-xs">
                    <Icon name="task" size={14} />
                    فعالیت‌ها
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ── تب سفارش‌ها: پرداخت‌نشده + فاکتور جمعی ── */}
              <TabsContent value="orders" className="px-5 py-3 m-0">
                <div className="flex items-center justify-between gap-2 mb-2" data-guide="c360:unpaid-section">
                  <span className="text-xs font-bold text-muted-foreground">
                    سفارش‌های پرداخت‌نشده ({formatNumber(unpaidOrders.length)})
                  </span>
                  {unpaidOrders.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() => setStatementOpen(true)}
                      className="gap-1.5 h-8"
                      data-guide="c360:statement-btn"
                    >
                      <Icon name="print" size={13} /> چاپ فاکتور سفارشات پرداخت‌نشده
                    </Button>
                  )}
                </div>

                {unpaidOrders.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="rounded-lg bg-card border p-2 text-center">
                      <div className="text-[10px] text-muted-foreground">جمع مبلغ بدهی سفارش‌ها</div>
                      <div className="text-xs font-bold tabular-nums" dir="ltr">
                        {formatCurrency(activeTotals.subtotal)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-card border p-2 text-center">
                      <div className="text-[10px] text-muted-foreground">پرداخت‌شده</div>
                      <div className="text-xs font-bold text-emerald-600 tabular-nums" dir="ltr">
                        {formatCurrency(activeTotals.paid)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-card border p-2 text-center">
                      <div className="text-[10px] text-muted-foreground">مانده بدهی</div>
                      <div className="text-xs font-bold text-rose-600 tabular-nums" dir="ltr">
                        {formatCurrency(activeTotals.balance)}
                      </div>
                    </div>
                  </div>
                )}

                {detail.orders.length === 0 ? (
                  <EmptyState icon="orders" title="سفارشی ندارد" />
                ) : (
                  <>
                    <div className="space-y-2">
                      {unpaidOrders.map((o) => (
                        <OrderRow key={o.id} o={o} />
                      ))}
                      {unpaidOrders.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          بدهی بازاری نیست — همه تسویه شده ✓
                        </p>
                      )}
                    </div>

                    {/* خط جداکننده: بالای خط بدهکار، پایین خط بدون بدهی */}
                    {settledOrders.length > 0 && (
                      <>
                        <div className="border-t my-3.5" />
                        <span className="text-xs font-bold text-muted-foreground block mb-2">
                          تسویه‌شده / بدون بدهی ({formatNumber(settledOrders.length)})
                        </span>
                        <div className="space-y-2 opacity-75">
                          {settledOrders.map((o) => (
                            <OrderRow key={o.id} o={o} />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </TabsContent>

              {/* ── تب فاکتورها ── */}
              <TabsContent value="invoices" className="px-5 py-3 m-0">
                <InvoicesTable invoices={detail.invoices} />
              </TabsContent>

              {/* ── تب پرداخت‌ها ── */}
              <TabsContent value="payments" className="px-5 py-3 m-0">
                <PaymentsTable payments={detail.payments} />
              </TabsContent>

              {/* ── تب معاملات (CRM) ── */}
              <TabsContent value="deals" className="px-5 py-3 m-0">
                <div className="flex items-center justify-end mb-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDealOpen(true)}
                    className="gap-1.5"
                  >
                    <Icon name="plus" size={14} /> معامله جدید
                  </Button>
                </div>
                {detail.deals.length === 0 ? (
                  <EmptyState icon="orders" title="معامله‌ای ندارد" />
                ) : (
                  <div className="space-y-2">
                    {detail.deals.map((d) => {
                      const colors = STAGE_COLORS[d.stage];
                      return (
                        <div
                          key={d.id}
                          className="rounded-lg border p-2.5 hover:bg-accent/40 transition"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{d.title}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <span
                                  className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1",
                                    colors.bg,
                                    colors.text
                                  )}
                                >
                                  <span className={cn("size-1 rounded-full", colors.dot)} />
                                  {STAGE_LABELS[d.stage]}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatDate(d.expectedCloseDate)}
                                </span>
                              </div>
                            </div>
                            <div className="text-sm font-semibold tabular-nums shrink-0" dir="ltr">
                              {formatCurrency(d.value)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* ── تب فعالیت‌ها (CRM) ── */}
              <TabsContent value="activities" className="px-5 py-3 m-0">
                <div className="flex items-center justify-end mb-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActivityOpen(true)}
                    className="gap-1.5"
                  >
                    <Icon name="plus" size={14} /> ثبت فعالیت
                  </Button>
                </div>
                {detail.activities.length === 0 ? (
                  <EmptyState icon="task" title="فعالیتی ثبت نشده" />
                ) : (
                  <div className="relative">
                    <div className="absolute right-[19px] top-2 bottom-2 w-px bg-border" />
                    <div className="space-y-3">
                      {detail.activities.map((a) => {
                        const meta = ACTIVITY_META[a.type];
                        return (
                          <div key={a.id} className="flex items-start gap-3 relative">
                            <div
                              className={cn(
                                "size-9 rounded-full grid place-items-center shrink-0 z-10 border-2 border-background",
                                meta.bg
                              )}
                            >
                              <Icon name={meta.icon} size={14} className={meta.color} />
                            </div>
                            <div className="flex-1 min-w-0 pt-1">
                              <div className="text-sm font-medium">{a.title}</div>
                              {a.description && (
                                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {a.description}
                                </div>
                              )}
                              <div className="text-[10px] text-muted-foreground mt-1">
                                {meta.label} • {relativeTime(a.date)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* ── منطقهٔ خطر — حذف مشتری دور از دسترس ── */}
            <div className="border-t mt-2 px-5 py-4">
              <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 p-3">
                <div className="text-xs font-bold text-rose-700 dark:text-rose-300">منطقهٔ خطر</div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  حذف کامل مشتری فقط وقتی ممکن است که هیچ سفارش/فاکتور/سابقه‌ای نداشته باشد.
                  برای امنیت داده‌ها این عمل از لیست جدا شده و نیازمند تایید دوباره است.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 text-rose-600 border-rose-300 dark:border-rose-800 hover:bg-rose-100/60 dark:hover:bg-rose-950/40 gap-1.5"
                  onClick={() => {
                    setConfirmName("");
                    setDeleteOpen(true);
                  }}
                >
                  <Icon name="trash" size={13} /> حذف کامل این مشتری
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </DetailDrawer>

      {/* ── فاکتور جمعی سفارش‌های پرداخت‌نشده ── */}
      {detail && (
        <Dialog open={statementOpen} onOpenChange={setStatementOpen}>
          <DialogContent
            aria-describedby={undefined}
            className="sm:max-w-4xl max-h-[94vh] overflow-y-auto p-0 gap-0"
          >
            <DialogTitle className="sr-only">فاکتور سفارشات پرداخت‌نشده</DialogTitle>
            <div className="no-print flex items-center gap-2 px-4 py-3 border-b flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">فاکتور سفارشات پرداخت‌نشده</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {detail.customer.name} — {formatNumber(unpaidOrders.length)} سفارش پرداخت‌نشده
                </p>
              </div>
              <DocPrintButtons
                fileName={`Invoice - ${detail.customer.name} - Unpaid Orders`}
              />
            </div>
            <div className="doc-frame bg-muted/30 p-4" dir="ltr">
              <P24StatementDoc
                subtitle="Unpaid Orders Statement"
                issueDate={new Date().toISOString()}
                customerName={detail.customer.name}
                customerPhone={detail.customer.phone ?? null}
                rows={unpaidOrders.map((o) => ({
                  number: o.number,
                  date: o.createdAt,
                  description:
                    (o.items ?? [])
                      .map((i) => i.product?.name)
                      .filter(Boolean)
                      .join(", ") || "—",
                  amount: o.totalAmount,
                }))}
                subtotal={activeTotals.subtotal}
                paid={activeTotals.paid}
                notes={`This invoice consolidates all orders of the customer that are NOT fully paid yet. Prices are in Iraqi Dinar (${CURRENCY}).`}
                closingNote={`Consolidated invoice for unpaid orders · ${COMPANY.name}`}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* تایید حذف با تایپ نام مشتری */}
      {detail && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>حذف کامل «{detail.customer.name}»؟</AlertDialogTitle>
              <AlertDialogDescription>
                این عمل قابل بازگشت نیست و کل اطلاعات مشتری پاک می‌شود. برای تایید،
                نام دقیق مشتری را وارد کنید.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={detail.customer.name}
              dir="auto"
            />
            <AlertDialogFooter>
              <AlertDialogCancel>انصراف</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={confirmName.trim() !== detail.customer.name.trim() || deleteMut.isPending}
                onClick={() => deleteMut.mutate()}
                className="gap-1.5"
              >
                {deleteMut.isPending ? (
                  <Icon name="loading" size={14} className="animate-spin" />
                ) : (
                  <Icon name="trash" size={14} />
                )}
                حذف قطعی
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {detail && (
        <>
          <ActivityFormDialog
            open={activityOpen}
            onOpenChange={setActivityOpen}
            customers={[{ id: detail.customer.id, name: detail.customer.name }]}
            deals={detail.deals.map((d) => ({
              id: d.id,
              title: d.title,
              customerId: d.customerId,
            }))}
            defaultCustomerId={detail.customer.id}
            onSaved={() => invalidate(["customer-detail", "activities", "deals"])}
          />
          <DealFormDialog
            open={dealOpen}
            onOpenChange={setDealOpen}
            customers={[
              { id: detail.customer.id, name: detail.customer.name, phone: detail.customer.phone },
            ]}
            onSaved={() => invalidate(["customer-detail", "deals", "crm-dashboard"])}
          />
        </>
      )}
    </>
  );
}

// ─── ردیف سفارش (تب سفارش‌ها) ───────────────────────────────────────────

function OrderRow({ o }: { o: Customer360Order }) {
  const paid = o.paidAmount ?? 0;
  const due = Math.max(0, o.totalAmount - paid);
  return (
    <div className="flex items-center gap-3 rounded-lg border p-2.5 hover:bg-accent/40 transition">
      <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center font-bold text-xs shrink-0">
        #{o.number}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">سفارش #{o.number}</span>
          <StatusBadge status={o.status} className="text-[10px] px-2 py-0.5" />
        </div>
        <div className="text-xs text-muted-foreground">{relativeTime(o.createdAt)}</div>
      </div>
      <div className="text-left shrink-0">
        <div className="text-sm font-semibold tabular-nums" dir="ltr">
          {formatCurrency(o.totalAmount)}
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
          پرداخت {formatCurrency(paid)} · مانده {formatCurrency(due)}
        </div>
      </div>
    </div>
  );
}

// ─── جدول فاکتورها ──────────────────────────────────────────────────────

function InvoicesTable({ invoices }: { invoices: Customer360Invoice[] }) {
  if (invoices.length === 0) {
    return (
      <EmptyState
        icon="invoice"
        title="فاکتوری صادر نشده"
        description="برای این مشتری فاکتور نهایی ثبت نشده است."
        className="py-10"
      />
    );
  }
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="h-9 text-xs font-semibold text-muted-foreground">شماره</TableHead>
            <TableHead className="h-9 text-xs font-semibold text-muted-foreground">وضعیت</TableHead>
            <TableHead className="h-9 text-xs font-semibold text-muted-foreground text-end">جمع</TableHead>
            <TableHead className="h-9 text-xs font-semibold text-muted-foreground text-end">پرداخت‌شده</TableHead>
            <TableHead className="h-9 text-xs font-semibold text-muted-foreground text-end">مانده</TableHead>
            <TableHead className="h-9 text-xs font-semibold text-muted-foreground">تاریخ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((inv) => {
            const meta = INVOICE_STATUS_META[inv.status] ?? {
              label: inv.status,
              cls: "bg-muted text-muted-foreground",
            };
            const due = Math.max(0, inv.totalAmount - inv.paidAmount);
            return (
              <TableRow key={inv.id} className="hover:bg-muted/20">
                <TableCell className="py-2">
                  <span className="font-mono text-xs font-semibold" dir="ltr">#{inv.number}</span>
                </TableCell>
                <TableCell className="py-2">
                  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", meta.cls)}>
                    {meta.label}
                  </span>
                </TableCell>
                <TableCell className="py-2 text-end">
                  <span className="text-xs font-semibold tabular-nums" dir="ltr">{formatCurrency(inv.totalAmount)}</span>
                </TableCell>
                <TableCell className="py-2 text-end">
                  <span className="text-xs tabular-nums text-muted-foreground" dir="ltr">{formatCurrency(inv.paidAmount)}</span>
                </TableCell>
                <TableCell className="py-2 text-end">
                  {due > 0 ? (
                    <span className="text-xs font-semibold tabular-nums text-rose-600 dark:text-rose-400" dir="ltr">
                      {formatCurrency(due)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400">تسویه‌شده</span>
                  )}
                </TableCell>
                <TableCell className="py-2">
                  <span className="text-xs tabular-nums text-muted-foreground">{formatDate(inv.createdAt)}</span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── جدول پرداخت‌ها ─────────────────────────────────────────────────────

function PaymentsTable({ payments }: { payments: Customer360Payment[] }) {
  if (payments.length === 0) {
    return (
      <EmptyState
        icon="creditCard"
        title="پرداختی ثبت نشده"
        description="برای این مشتری پرداختی در سیستم ثبت نشده است."
        className="py-10"
      />
    );
  }
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="h-9 text-xs font-semibold text-muted-foreground text-end">مبلغ</TableHead>
            <TableHead className="h-9 text-xs font-semibold text-muted-foreground">روش</TableHead>
            <TableHead className="h-9 text-xs font-semibold text-muted-foreground">تاریخ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => (
            <TableRow key={p.id} className="hover:bg-muted/20">
              <TableCell className="py-2 text-end">
                <span className="text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400" dir="ltr">
                  {formatCurrency(p.amount)}
                </span>
              </TableCell>
              <TableCell className="py-2">
                <span className="text-xs">
                  {p.method ? PAYMENT_METHOD_LABEL[p.method] ?? p.method : "—"}
                </span>
              </TableCell>
              <TableCell className="py-2">
                <span className="text-xs tabular-nums text-muted-foreground">{formatDate(p.date)}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// برای استفادهٔ احتمالی آینده (کاشی‌های مالی در صفحات دیگر)
export const _TILE_COLORS: Record<string, string> = {
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
  teal: "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400",
};

export function CustomerMetricTile({ icon, color, label, value }: { icon: IconName; color: string; label: string; value: string }) {
  return (
    <Card className="p-3 flex items-center gap-2.5">
      <div className={cn("size-9 rounded-lg grid place-items-center shrink-0", _TILE_COLORS[color] ?? "bg-muted text-muted-foreground")}>
        <Icon name={icon} size={17} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold tabular-nums truncate" dir="ltr">{value}</div>
        <div className="text-[10px] text-muted-foreground truncate">{label}</div>
      </div>
    </Card>
  );
}
