"use client";

// Printoo24 ERP — Phase 17-D: «پروندهٔ مشتری» (ماژول ادمین داخلی)
// فاز ۲۰: دیالوگ → دراور DetailDrawer (دسکتاپ چپ / موبایل بات‌شیت).
//
// پروندهٔ کامل یک مشتری: سربرگ پروفایل (آواتار/تماس/موقعیت/آدرس/یادداشت)
// + ۴ کاشی مالی (جمع سفارش‌ها، پرداخت‌شده، مانده، تعداد سفارش)
// + سه تب تاریخچه: سفارش‌ها / فاکتورها / پرداخت‌ها — همه از
// GET /api/customers/[id] (تاریخچهٔ additive اضافه‌شده در همین فاز).

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon, type IconName } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, StatusBadge } from "@/components/shared";
import { DetailDrawer } from "@/components/ui/detail-drawer";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─── تایپ‌ها (آینهٔ پاسخ زندهٔ GET /api/customers/[id]) ───────────────────

export type CustomerDetail = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  city: string | null;
  province: string | null;
  isFavorite: boolean;
  balanceDue: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { orders: number; deals: number; activities: number };
  unsettled: number;
};

export type CustomerHistoryOrder = {
  id: string;
  number: number;
  status: string;
  priority: string;
  totalAmount: number;
  paidAmount: number;
  endDate: string | null;
  createdAt: string;
};

export type CustomerHistoryInvoice = {
  id: string;
  number: number;
  status: string;
  totalAmount: number;
  paidAmount: number;
  createdAt: string;
};

export type CustomerHistoryPayment = {
  id: string;
  amount: number;
  method: string | null;
  date: string;
  createdAt: string;
};

export type CustomerDetailResponse = {
  customer: CustomerDetail;
  orders: CustomerHistoryOrder[];
  invoices: CustomerHistoryInvoice[];
  payments: CustomerHistoryPayment[];
  totals: {
    ordersCount: number;
    unsettled: number;
    totalBilled: number;
    totalPaid: number;
  };
};

// ─── متادیتای نمایش ─────────────────────────────────────────────────────

/** شمارش فارسی برای اعداد کوچک (تعداد ردیف/سفارش) */
const fa = (n: number) => n.toLocaleString("fa-IR");

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

// ─── دیالوگ ─────────────────────────────────────────────────────────────

export function CustomersDetailDialog({
  customerId,
  open,
  onOpenChange,
  onEdit,
}: {
  customerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** دکمهٔ ویرایش سربرگ — مشتریِ کامل را به فرم ویرایش صفحه برمی‌گرداند */
  onEdit: (customer: CustomerDetail) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["customers", customerId, "detail"],
    queryFn: () => api<CustomerDetailResponse>(`/api/customers/${customerId}`),
    enabled: open && !!customerId,
  });

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="پروندهٔ مشتری"
      description="سوابق سفارش‌ها، فاکتورها و پرداخت‌ها"
      icon="customers"
      widthClass="sm:max-w-2xl"
    >
      {isLoading || !data ? (
        <div className="py-24 grid place-items-center gap-3">
          <Icon name="loading" size={28} className="animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">در حال بارگذاری پرونده…</span>
        </div>
      ) : (
        <CustomerFile
          data={data}
          onEdit={onEdit}
          onClose={() => onOpenChange(false)}
        />
      )}
    </DetailDrawer>
  );
}

// ─── محتوای پرونده ──────────────────────────────────────────────────────

function CustomerFile({
  data,
  onEdit,
  onClose,
}: {
  data: CustomerDetailResponse;
  onEdit: (c: CustomerDetail) => void;
  onClose: () => void;
}) {
  const c = data.customer;
  const t = data.totals;
  const invalidate = useInvalidate();

  // فاز ۲۰ (خواستهٔ ۸): حذف فقط از اینجا — با تایپ نام مشتری
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [confirmName, setConfirmName] = React.useState("");
  const deleteMut = useMutation({
    mutationFn: () => api(`/api/customers/${c.id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["customers", "customers-list", "customers-wizard", "dashboard"]);
      toast.success("مشتری حذف شد");
      setDeleteOpen(false);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      {/* سربرگ پروفایل */}
      <div className="px-5 py-4 border-b bg-muted/20">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="size-12 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 grid place-items-center text-lg font-bold shrink-0">
              {c.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-lg font-bold leading-tight">{c.name}</h3>
                {c.isFavorite && <Icon name="star" size={16} className="text-amber-500 shrink-0" />}
              </div>
              <div className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span dir="ltr" className="tabular-nums">{c.phone}</span>
                {(c.city || c.province) && (
                  <span className="flex items-center gap-1">
                    <Icon name="mapPin" size={12} />
                    {c.city && <span className="font-medium">{c.city}</span>}
                    {c.city && c.province && <span>/</span>}
                    {c.province && <span>{c.province}</span>}
                  </span>
                )}
              </div>
              {c.address && (
                <p className="text-xs mt-1.5 leading-relaxed">{c.address}</p>
              )}
              {c.note && (
                <p className="text-xs text-muted-foreground mt-1.5 border-r-2 border-amber-300 pr-2 leading-relaxed">
                  {c.note}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground/80 mt-2">
                ثبت: {formatDate(c.createdAt)}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => onEdit(c)}>
            <Icon name="edit" size={14} /> ویرایش
          </Button>
        </div>
      </div>

      {/* کاشی‌های مالی */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-5 py-4">
        <MetricTile icon="orders" color="violet" label="جمع سفارش‌ها" value={formatCurrency(t.totalBilled)} />
        <MetricTile icon="wallet" color="emerald" label="پرداخت‌شده" value={formatCurrency(t.totalPaid)} />
        <MetricTile
          icon="coins"
          color={t.unsettled > 0 ? "rose" : "emerald"}
          label="مانده (طلب)"
          value={formatCurrency(t.unsettled)}
        />
        <MetricTile icon="checkList" color="teal" label="تعداد سفارش" value={fa(t.ordersCount)} />
      </div>

      {/* تاریخچه — سه تب */}
      <div className="px-5 pb-5">
        <Tabs defaultValue="orders">
          <TabsList className="w-full sm:w-fit">
            <TabsTrigger value="orders" className="gap-1.5 text-xs">
              <Icon name="orders" size={13} /> سفارش‌ها
              <span className="text-[10px] tabular-nums text-muted-foreground">{fa(data.orders.length)}</span>
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-1.5 text-xs">
              <Icon name="invoice" size={13} /> فاکتورها
              <span className="text-[10px] tabular-nums text-muted-foreground">{fa(data.invoices.length)}</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-1.5 text-xs">
              <Icon name="creditCard" size={13} /> پرداخت‌ها
              <span className="text-[10px] tabular-nums text-muted-foreground">{fa(data.payments.length)}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            <OrdersTable orders={data.orders} />
          </TabsContent>
          <TabsContent value="invoices">
            <InvoicesTable invoices={data.invoices} />
          </TabsContent>
          <TabsContent value="payments">
            <PaymentsTable payments={data.payments} />
          </TabsContent>
        </Tabs>
      </div>

      {/* ── منطقهٔ خطر — حذف مشتری دور از دسترس (خواستهٔ ۸ فاز ۲۰) ── */}
      <div className="border-t px-5 py-4">
        <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 p-3">
          <div className="text-xs font-bold text-rose-700 dark:text-rose-300">منطقهٔ خطر</div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            حذف کامل مشتری فقط وقتی ممکن است که هیچ سفارش/فاکتور/سابقه‌ای نداشته باشد.
            این عمل عمداً از لیست جدا شده و نیازمند تایید با تایپ نام مشتری است.
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

      {/* تایید حذف — تایپ نام دقیق مشتری */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف کامل «{c.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>
              این عمل قابل بازگشت نیست و کل اطلاعات مشتری پاک می‌شود. برای تایید،
              نام دقیق مشتری را وارد کنید.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={c.name}
            dir="auto"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={confirmName.trim() !== c.name.trim() || deleteMut.isPending}
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
    </>
  );
}

// ─── کاشی متریک ─────────────────────────────────────────────────────────

const TILE_COLORS: Record<string, string> = {
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
  teal: "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400",
};

function MetricTile({ icon, color, label, value }: { icon: IconName; color: string; label: string; value: string }) {
  return (
    <Card className="p-3 flex items-center gap-2.5">
      <div className={cn("size-9 rounded-lg grid place-items-center shrink-0", TILE_COLORS[color] ?? "bg-muted text-muted-foreground")}>
        <Icon name={icon} size={17} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold tabular-nums truncate" dir="ltr">{value}</div>
        <div className="text-[10px] text-muted-foreground truncate">{label}</div>
      </div>
    </Card>
  );
}

// ─── جدول سفارش‌ها ──────────────────────────────────────────────────────

function OrdersTable({ orders }: { orders: CustomerHistoryOrder[] }) {
  if (orders.length === 0) {
    return (
      <EmptyState
        icon="orders"
        title="سفارشی ثبت نشده"
        description="هنوز سفارشی برای این مشتری ثبت نشده است."
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
            <TableHead className="h-9 text-xs font-semibold text-muted-foreground">موعد</TableHead>
            <TableHead className="h-9 text-xs font-semibold text-muted-foreground">تاریخ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => {
            const due = Math.max(0, o.totalAmount - o.paidAmount);
            const overdue =
              o.endDate &&
              new Date(o.endDate) < new Date() &&
              !["completed", "archived", "cancelled"].includes(o.status);
            return (
              <TableRow key={o.id} className="hover:bg-muted/20">
                <TableCell className="py-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold" dir="ltr">
                    #{o.number}
                    {o.priority === "urgent" && (
                      <Icon name="alertTriangle" size={12} className="text-rose-500" />
                    )}
                  </span>
                </TableCell>
                <TableCell className="py-2">
                  <StatusBadge status={o.status} />
                </TableCell>
                <TableCell className="py-2 text-end">
                  <span className="text-xs font-semibold tabular-nums" dir="ltr">{formatCurrency(o.totalAmount)}</span>
                </TableCell>
                <TableCell className="py-2 text-end">
                  <span className="text-xs tabular-nums text-muted-foreground" dir="ltr">{formatCurrency(o.paidAmount)}</span>
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
                  <span className={cn("text-xs tabular-nums", overdue && "text-rose-600 dark:text-rose-400 font-medium")}>
                    {formatDate(o.endDate)}
                  </span>
                </TableCell>
                <TableCell className="py-2">
                  <span className="text-xs tabular-nums text-muted-foreground">{formatDate(o.createdAt)}</span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── جدول فاکتورها ──────────────────────────────────────────────────────

function InvoicesTable({ invoices }: { invoices: CustomerHistoryInvoice[] }) {
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

function PaymentsTable({ payments }: { payments: CustomerHistoryPayment[] }) {
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
