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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";

// ─── Types ─────────────────────────────────────────────────────────────

type Order = {
  id: string;
  number: number;
  status: string;
  priority: string;
  endDate: string | null;
  totalAmount: number;
  paidAmount: number;
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

  const totalRemaining = rows
    .filter((o) => o.totalAmount - o.paidAmount > 0.001)
    .reduce((s, o) => s + (o.totalAmount - o.paidAmount), 0);

  // ── ثبت پرداخت: عدد «کل پرداخت‌شده» → سیستم diff را حساب می‌کند ──
  const recordPaymentMut = useMutation({
    mutationFn: (o: Order) => {
      const total = Number(payTotal);
      return api<{ diff?: number; totalAfter?: number }>(`/api/orders/${o.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          total: Number.isFinite(total) ? total : 0,
          method: "cash",
          note: "ثبت سریع از صفحهٔ تسویه‌نشده",
        }),
      });
    },
    onSuccess: (res) => {
      const diff = res.diff ?? 0;
      toast.success(
        diff >= 0
          ? `درآمد جدید ${formatCurrency(diff)} ثبت شد — کل: ${formatCurrency(res.totalAfter ?? 0)}`
          : `اصلاح کاهشی ${formatCurrency(Math.abs(diff))} ثبت شد — کل: ${formatCurrency(res.totalAfter ?? 0)}`
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
        header: "سفارش",
        cell: ({ row }) => (
          <div className="font-mono text-xs font-bold">#{row.original.number}</div>
        ),
      },
      {
        id: "customer",
        header: "مشتری",
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
        header: "وضعیت",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "totalAmount",
        header: "جمع سفارش",
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums" dir="ltr">
            {formatCurrency(row.original.totalAmount)}
          </span>
        ),
      },
      {
        accessorKey: "paidAmount",
        header: "پرداخت‌شده",
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400" dir="ltr">
            {formatCurrency(row.original.paidAmount)}
          </span>
        ),
      },
      {
        id: "remaining",
        header: "مانده (بستانکار)",
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
                {settled ? "تسویه ✓" : formatCurrency(rem)}
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
            ثبت پرداخت
          </Button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        title="تسویه‌نشده"
        icon="wallet"
        actions={
          <Button
            variant={includeDone ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setIncludeDone((v) => !v)}
          >
            <Icon name="checkCircle" size={14} />
            {includeDone ? "نمایش همه" : "تسویه‌شده‌ها را هم نشان بده"}
          </Button>
        }
      />

      {/* جمع بستانکار */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-3.5 ring-1 ring-rose-500/20 bg-rose-50/40 dark:bg-rose-950/10">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Icon name="wallet" size={13} className="text-rose-600" />
            مجموع بستانکار (همین الان)
          </div>
          <div className="text-xl font-bold tabular-nums mt-1.5" dir="ltr">
            {formatCurrency(totalRemaining)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {rows.filter((o) => o.totalAmount - o.paidAmount > 0.001).length.toLocaleString("fa-IR")}{" "}
            سفارش با مانده
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
            placeholder="جستجو: شماره سفارش، مشتری…"
            className="pr-9"
          />
        </div>
        <span className="mr-auto text-xs text-muted-foreground tabular-nums">
          {rows.length.toLocaleString("fa-IR")} سفارش
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
              title="همه تسویه است!"
              description="سفارشی با ماندهٔ پرداختی وجود ندارد"
            />
          }
        />
      </Card>

      {/* مودال ثبت پرداخت — عدد کل + محاسبهٔ زندهٔ درآمد جدید */}
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
                      ثبت پرداخت — سفارش #{payOrder.number}
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {payOrder.customer?.name} • جمع:{" "}
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
                    <div className="text-[10px] text-muted-foreground">جمع سفارش</div>
                    <div className="text-sm font-bold tabular-nums mt-1" dir="ltr">
                      {formatCurrency(payOrder.totalAmount)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-emerald-500/10 p-2.5">
                    <div className="text-[10px] text-muted-foreground">پرداخت‌شده</div>
                    <div className="text-sm font-bold tabular-nums mt-1 text-emerald-600 dark:text-emerald-400" dir="ltr">
                      {formatCurrency(payOrder.paidAmount)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-rose-500/10 p-2.5">
                    <div className="text-[10px] text-muted-foreground">مانده</div>
                    <div className="text-sm font-bold tabular-nums mt-1 text-rose-600 dark:text-rose-400" dir="ltr">
                      {formatCurrency(Math.max(0, payOrder.totalAmount - payOrder.paidAmount))}
                    </div>
                  </div>
                </div>

                <Field label="کل پرداخت‌شده تا الان (IQD)" required>
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
                          <b>درآمد جدید</b> که سیستم ثبت می‌کند:{" "}
                          <span dir="ltr" className="tabular-nums font-bold">
                            {formatCurrency(current.newTotal - payOrder.paidAmount)}
                          </span>
                        </>
                      ) : (
                        <>
                          <b>اصلاح کاهشی</b> که سیستم ثبت می‌کند:{" "}
                          <span dir="ltr" className="tabular-nums font-bold">
                            {formatCurrency(Math.abs(current.newTotal - payOrder.paidAmount))}
                          </span>
                        </>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">
                        سیستم خودش تفاضل را می‌فهمد — چه کسی، از کدام ماژول، چه ساعتی ثبت کرد
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
                  انصراف
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
                  ثبت پرداخت
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
