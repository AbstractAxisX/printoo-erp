"use client";

// ─── Phase 15: تسویه‌نشده (بستانکار) ─────────────────────────────────
// سفارش‌هایی که هنوز بدهی دارند: جمع فاکتور − پرداخت‌شده = مانده.
// «ثبت پرداخت» سریع: عدد «کل پرداخت‌شده تا الان» را وارد می‌کنی؛
// سیستم خودش تفاضل هوشمند را به‌عنوان درآمد جدید لاگ می‌کند.

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, EmptyState } from "@/components/shared";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared";
import { formatCurrency, formatDate } from "@/lib/format";
import { CurrencyChip, useFxRates } from "@/components/shared/fx-widgets";
import { BulkSettleDialog } from "@/components/shared/bulk-settle-dialog";
import { formatMoney, sumByCurrency, formatSumPerCurrency, toIqdEquivalent, type Currency } from "@/lib/money";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { t } from "@/lib/i18n";

// ─── Types ─────────────────────────────────────────────────────────────

type Order = {
  id: string;
  number: number;
  status: string;
  priority: string;
  endDate: string | null;
  totalAmount: number;
  paidAmount: number;
  currency?: string; // فاز ۲۵
  createdAt: string;
  customer: { id: string; name: string; phone: string };
  items: { id: string; product: { name: string } }[];
};

// ─── Page ──────────────────────────────────────────────────────────────

export function FinanceUnsettled() {
  const invalidate = useInvalidate();
  const [q, setQ] = React.useState("");
  const [includeDone, setIncludeDone] = React.useState(false);

  // مودال ثبت پرداخت
  const [payOrder, setPayOrder] = React.useState<Order | null>(null);
  const [payTotal, setPayTotal] = React.useState("");

  // ── فاز ۲۶: مودال تسویه گروهی ──
  const [bulkOpen, setBulkOpen] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["orders", "unsettled"],
    queryFn: () => api<{ orders: Order[] }>("/api/orders?excludeArchived=false"),
    refetchInterval: 60_000,
  });

  // بستانکار: total − paid > 0 (سفارش‌های غیر-باطل)
  const rows = React.useMemo(() => {
    const all = (data?.orders ?? []).filter(
      (o) => o.status !== "cancelled" && o.totalAmount - o.paidAmount > 0.001
    );
    const query = q.trim().toLowerCase();
    const filtered = query
      ? all.filter((o) =>
          `${o.number} ${o.customer?.name ?? ""} ${o.customer?.phone ?? ""}`
            .toLowerCase()
            .includes(query)
        )
      : all;
    const settled = (data?.orders ?? []).filter(
      (o) => o.status !== "cancelled" && o.totalAmount - o.paidAmount <= 0.001 && o.paidAmount > 0
    );
    return includeDone ? [...filtered, ...settled] : filtered;
  }, [data, q, includeDone]);

  // ── فاز ۲۵: بستانکار به تفکیک ارز + معادل دیناری ──
  const { rates } = useFxRates();
  const unsettledRows = rows.filter((o) => o.totalAmount - o.paidAmount > 0.001);
  const remainingPer = sumByCurrency(
    unsettledRows.map((o) => ({ amount: o.totalAmount - o.paidAmount, currency: o.currency }))
  );
  const remainingMixed = (["IQD", "USD", "IRT"] as Currency[]).filter((c) => remainingPer[c] > 0.0001).length > 1;
  const remainingIqdEq = toIqdEquivalent(remainingPer, rates);
  const totalRemaining = unsettledRows.reduce((s, o) => s + (o.totalAmount - o.paidAmount), 0);

  // ── ثبت پرداخت: عدد «کل پرداخت‌شده» → سیستم diff را حساب می‌کند ──
  const recordPaymentMut = useMutation({
    mutationFn: (o: Order) => {
      const total = Number(payTotal);
      return api<{ diff?: number; totalAfter?: number }>(`/api/orders/${o.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          total: Number.isFinite(total) ? total : 0,
          method: "cash",
          note: t("ثبت سریع از صفحهٔ تسویه‌نشده"),
        }),
      });
    },
    onSuccess: (res) => {
      const diff = res.diff ?? 0;
      toast.success(
        diff >= 0
          ? t("دریافتی جدید {p0} ثبت شد — کل: {p1}", { p0: formatCurrency(diff), p1: formatCurrency(res.totalAfter ?? 0) })
          : t("اصلاح کاهشی {p0} ثبت شد — کل: {p1}", { p0: formatCurrency(Math.abs(diff)), p1: formatCurrency(res.totalAfter ?? 0) })
      );
      setPayOrder(null);
      setPayTotal("");
      invalidate(["orders", "revenues", "finance", "dashboard"]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openPay = (o: Order) => {
    setPayOrder(o);
    setPayTotal(String(o.paidAmount || ""));
  };

  const columns = React.useMemo<ColumnDef<Order>[]>(
    () => [
      {
        accessorKey: "number",
        header: t("سفارش"),
        cell: ({ row }) => (
          <div className="font-mono text-xs font-bold">#{row.original.number}</div>
        ),
      },
      {
        id: "customer",
        header: t("مشتری"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="text-sm font-medium truncate max-w-[140px]">
              {row.original.customer?.name}
            </div>
            <div className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
              {row.original.customer?.phone}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: t("وضعیت"),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "totalAmount",
        header: t("جمع سفارش"),
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums inline-flex items-center gap-1.5" dir="ltr">
            {formatMoney(row.original.totalAmount, row.original.currency)}
            {row.original.currency && row.original.currency !== "IQD" && (
              <CurrencyChip currency={row.original.currency} />
            )}
          </span>
        ),
      },
      {
        accessorKey: "paidAmount",
        header: t("پرداخت‌شده"),
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400" dir="ltr">
            {formatMoney(row.original.paidAmount, row.original.currency)}
          </span>
        ),
      },
      {
        id: "remaining",
        header: t("مانده (بستانکار)"),
        meta: { align: "end" },
        cell: ({ row }) => {
          const rem = row.original.totalAmount - row.original.paidAmount;
          const pct =
            row.original.totalAmount > 0
              ? Math.min(100, (row.original.paidAmount / row.original.totalAmount) * 100)
              : 0;
          const settled = rem <= 0.001;
          return (
            <div className="min-w-[120px]">
              <span
                className={cn(
                  "font-bold tabular-nums block",
                  settled
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                )}
                dir="ltr"
              >
                {settled ? t("تسویه ✓") : formatMoney(rem, row.original.currency)}
              </span>
              {!settled && (
                <div className="h-1 rounded-full bg-muted mt-1 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-l from-rose-500 to-amber-400"
                    style={{ width: `${100 - pct}%` }}
                  />
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        meta: { align: "center", hideable: false },
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-7"
            onClick={(e) => {
              e.stopPropagation();
              openPay(row.original);
            }}
          >
            <Icon name="creditCard" size={12} />
            {t("ثبت پرداخت")}
          </Button>
        ),
      },
    ],
     
    []
  );

  const current = payOrder
    ? {
        remaining: payOrder.totalAmount - payOrder.paidAmount,
        newTotal: Number(payTotal),
      }
    : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("تسویه‌نشده")}
        icon="wallet"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setBulkOpen(true)}
            >
              <Icon name="creditCard" size={14} />
              {t("تسویه گروهی")}
            </Button>
            <Button
              variant={includeDone ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setIncludeDone((v) => !v)}
            >
              <Icon name="checkCircle" size={14} />
              {includeDone ? t("نمایش همه") : t("تسویه‌شده‌ها را هم نشان بده")}
            </Button>
          </div>
        }
      />

      {/* جمع بستانکار */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-3.5 ring-1 ring-rose-500/20 bg-rose-50/40 dark:bg-rose-950/10">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Icon name="wallet" size={13} className="text-rose-600" />
            {t("مجموع بستانکار (همین الان)")}
          </div>
          <div className="text-xl font-bold tabular-nums mt-1.5" dir="ltr">
            {remainingMixed ? formatSumPerCurrency(remainingPer) : formatCurrency(totalRemaining)}
          </div>
          {remainingMixed && (
            <div className="text-[10px] text-muted-foreground mt-0.5" dir="ltr">
              {t("≈ {p0} IQD (نرخ لحظه‌ای)", { p0: formatCurrency(remainingIqdEq) })}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {t("{p0} سفارش با مانده", { p0: unsettledRows.length.toLocaleString("en-US") })}
          </div>
        </Card>
      </div>

      {/* فیلتر */}
      <Card className="p-4 flex items-center gap-2 flex-wrap">
        <div className="relative w-64">
          <Icon
            name="search"
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("جستجو: شماره سفارش، مشتری…")}
            className="pr-9"
          />
        </div>
        <span className="mr-auto text-xs text-muted-foreground tabular-nums">
          {t("{p0} سفارش", { p0: rows.length.toLocaleString("en-US") })}
        </span>
      </Card>

      {/* جدول */}
      <Card className="p-4">
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          pageSize={12}
          emptyState={
            <EmptyState
              icon="checkCircle"
              title={t("همه تسویه است!")}
              description={t("سفارشی با ماندهٔ پرداختی وجود ندارد")}
            />
          }
        />
      </Card>

      {/* فاز ۲۶: دیالوگ تسویه گروهی — یک موج پرداخت روی همهٔ سفارش‌های باز مشتری */}
      <BulkSettleDialog open={bulkOpen} onOpenChange={setBulkOpen} />

      {/* مودال ثبت پرداخت — عدد کل + محاسبهٔ زندهٔ دریافتی جدید */}
      <Dialog open={!!payOrder} onOpenChange={(v) => !v && setPayOrder(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-md p-0 gap-0">
          {payOrder && (
            <>
              <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-l from-emerald-500/8 to-transparent">
                <div className="flex items-center gap-3">
                  <div className="size-11 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 grid place-items-center shrink-0">
                    <Icon name="creditCard" size={20} />
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="text-base font-bold">
                      {t("ثبت پرداخت — سفارش #{p0}", { p0: payOrder.number })}
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("{p0} • جمع:{p1}", { p0: payOrder.customer?.name, p1: " " })}
                      <span dir="ltr" className="tabular-nums font-medium">
                        {formatCurrency(payOrder.totalAmount)}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/40 p-2.5">
                    <div className="text-[10px] text-muted-foreground">{t("جمع سفارش")}</div>
                    <div className="text-sm font-bold tabular-nums mt-1" dir="ltr">
                      {formatCurrency(payOrder.totalAmount)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-emerald-500/10 p-2.5">
                    <div className="text-[10px] text-muted-foreground">{t("پرداخت‌شده")}</div>
                    <div className="text-sm font-bold tabular-nums mt-1 text-emerald-600 dark:text-emerald-400" dir="ltr">
                      {formatCurrency(payOrder.paidAmount)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-rose-500/10 p-2.5">
                    <div className="text-[10px] text-muted-foreground">{t("مانده")}</div>
                    <div className="text-sm font-bold tabular-nums mt-1 text-rose-600 dark:text-rose-400" dir="ltr">
                      {formatCurrency(Math.max(0, payOrder.totalAmount - payOrder.paidAmount))}
                    </div>
                  </div>
                </div>

                <Field label={t("کل پرداخت‌شده تا الان (IQD)")} required>
                  <Input
                    type="number"
                    min={0}
                    dir="ltr"
                    className="text-center h-11 text-lg font-bold tabular-nums"
                    value={payTotal}
                    onChange={(e) => setPayTotal(e.target.value)}
                    placeholder={String(payOrder.paidAmount)}
                  />
                </Field>

                {current && payTotal !== "" && Number.isFinite(current.newTotal) && (
                  <div
                    className={cn(
                      "rounded-lg border p-3 text-xs flex items-start gap-2",
                      current.newTotal - payOrder.paidAmount >= 0
                        ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/10"
                        : "border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/10"
                    )}
                  >
                    <Icon
                      name={current.newTotal - payOrder.paidAmount >= 0 ? "trending" : "arrowDown"}
                      size={14}
                      className={
                        current.newTotal - payOrder.paidAmount >= 0
                          ? "text-emerald-600 mt-0.5"
                          : "text-amber-600 mt-0.5"
                      }
                    />
                    <div>
                      {current.newTotal - payOrder.paidAmount >= 0 ? (
                        <>
                          <b>{t("دریافتی جدید")}</b> که سیستم ثبت می‌کند:{" "}
                          <span dir="ltr" className="tabular-nums font-bold">
                            {formatCurrency(current.newTotal - payOrder.paidAmount)}
                          </span>
                        </>
                      ) : (
                        <>
                          <b>{t("اصلاح کاهشی")}</b> که سیستم ثبت می‌کند:{" "}
                          <span dir="ltr" className="tabular-nums font-bold">
                            {formatCurrency(Math.abs(current.newTotal - payOrder.paidAmount))}
                          </span>
                        </>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {t("سیستم خودش تفاضل را می‌فهمد — چه کسی، از کدام ماژول، چه ساعتی ثبت کرد")}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="px-6 py-3 border-t bg-muted/30 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPayOrder(null)}
                  disabled={recordPaymentMut.isPending}
                >
                  {t("انصراف")}
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => recordPaymentMut.mutate(payOrder)}
                  disabled={
                    recordPaymentMut.isPending ||
                    payTotal === "" ||
                    !Number.isFinite(Number(payTotal)) ||
                    Number(payTotal) < 0
                  }
                >
                  {recordPaymentMut.isPending ? (
                    <Icon name="loading" size={14} className="animate-spin" />
                  ) : (
                    <Icon name="check" size={14} />
                  )}
                  {t("ثبت پرداخت")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
