"use client";

// ─── Phase 15: انبار و لجستیک — پنل سادهٔ عملیات تحویل ───────────────
// دو کارِ روزمرهٔ لجستیک:
//   ۱) «ثبت درآمد» — پولی که مشتری در محل تحویل می‌دهد؛ به پرداخت‌شدهٔ
//      سفارش اضافه می‌شود و مالی با تفاضل هوشمند و نام این کارمند می‌بیند.
//   ۲) «ثبت هزینه» — هزینه‌های تحویل/بسته‌بندی (عین فرم چاپ، اینلاین).

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, EmptyState, StatusBadge } from "@/components/shared";
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
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CostEntryForm } from "@/components/shared/cost-entry-form";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";

// ─── Types ─────────────────────────────────────────────────────────────

type Order = {
  id: string;
  number: number;
  status: string;
  totalAmount: number;
  paidAmount: number;
  customer: { id: string; name: string; phone: string };
  items: { id: string; stage: string; product: { name: string } }[];
};

type RevenueLog = {
  id: string;
  amount: number;
  totalAfter: number;
  method: string | null;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
};

// ─── Page ──────────────────────────────────────────────────────────────

export function LogisticsOrders() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");

  // مودال سفارش لجستیک
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [tab, setTab] = React.useState("collect");

  // فرم دریافت نقدی
  const [collectAmount, setCollectAmount] = React.useState("");
  const [collectNote, setCollectNote] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["orders", "logistics"],
    queryFn: () => api<{ orders: Order[] }>("/api/orders?excludeArchived=false"),
    refetchInterval: 60_000,
  });

  // سفارش‌های در دست لجستیک: مرحلهٔ انبار + تازه تکمیل‌شده‌ها (برای تحویل)
  const rows = React.useMemo(() => {
    const all = (data?.orders ?? []).filter(
      (o) =>
        o.status === "warehouse_logistics" ||
        (o.status === "completed" &&
          o.items.some((i) => i.stage === "warehouse" || i.stage === "completed"))
    );
    const query = q.trim().toLowerCase();
    return query
      ? all.filter((o) => `${o.number} ${o.customer?.name ?? ""}`.toLowerCase().includes(query))
      : all;
  }, [data, q]);

  const selected = rows.find((o) => o.id === openId) ?? null;

  // لاگ درآمدهای سفارشِ باز (برای نمایش در مودال)
  const { data: logsData } = useQuery({
    queryKey: ["payments", openId],
    queryFn: () => api<{ logs: RevenueLog[] }>(`/api/orders/${openId}/payments`),
    enabled: !!openId && modalOpen,
  });

  // ── دریافت نقدی در محل (amount → به کل پرداخت‌شده اضافه می‌شود) ──
  const collectMut = useMutation({
    mutationFn: (o: Order) => {
      const amount = Number(collectAmount);
      return api<{ diff: number; totalAfter: number }>(`/api/orders/${o.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          method: "cash",
          note: collectNote.trim() || "دریافت نقدی در محل تحویل",
        }),
      });
    },
    onSuccess: (res) => {
      toast.success(
        `دریافت ثبت شد — کل پرداخت‌شده: ${formatCurrency(res.totalAfter)} (مالی می‌بیند)`
      );
      setCollectAmount("");
      setCollectNote("");
      invalidate(["orders", "revenues", "finance", "dashboard"]);
      qc.invalidateQueries({ queryKey: ["payments", openId] });
      qc.invalidateQueries({ queryKey: ["orders", "logistics"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openOrder = (id: string) => {
    setOpenId(id);
    setModalOpen(true);
    setTab("collect");
    setCollectAmount("");
    setCollectNote("");
  };

  const columns = React.useMemo<ColumnDef<Order>[]>(
    () => [
      {
        accessorKey: "number",
        header: "سفارش",
        cell: ({ row }) => <div className="font-mono text-xs font-bold">#{row.original.number}</div>,
      },
      {
        id: "customer",
        header: "مشتری",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="text-sm font-medium truncate max-w-[150px]">
              {row.original.customer?.name}
            </div>
            <div className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
              {row.original.customer?.phone}
            </div>
          </div>
        ),
      },
      {
        id: "items",
        header: "آیتم‌ها",
        cell: ({ row }) => (
          <div className="flex items-center gap-1 flex-wrap max-w-[200px]">
            {row.original.items.slice(0, 2).map((it) => (
              <span key={it.id} className="text-[10px] bg-muted rounded px-1.5 py-0.5 truncate max-w-[90px]">
                {it.product?.name}
              </span>
            ))}
            {row.original.items.length > 2 && (
              <span className="text-[10px] text-muted-foreground">
                +{(row.original.items.length - 2).toLocaleString("fa-IR")}
              </span>
            )}
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
        header: "جمع",
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums" dir="ltr">
            {formatCurrency(row.original.totalAmount)}
          </span>
        ),
      },
      {
        id: "remaining",
        header: "پرداخت‌نشده",
        meta: { align: "end" },
        cell: ({ row }) => {
          const rem = row.original.totalAmount - row.original.paidAmount;
          return (
            <span
              className={cn(
                "font-bold tabular-nums",
                rem > 0.001 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600"
              )}
              dir="ltr"
            >
              {rem > 0.001 ? formatCurrency(rem) : "تسویه ✓"}
            </span>
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
            className="gap-1.5 h-7"
            onClick={(e) => {
              e.stopPropagation();
              openOrder(row.original.id);
            }}
          >
            <Icon name="truck" size={12} />
            تحویل و دریافت
          </Button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const amountNum = Number(collectAmount);
  const amountValid =
    collectAmount !== "" && Number.isFinite(amountNum) && amountNum > 0 && !!selected;
  const remainingAfter = selected
    ? selected.totalAmount - (selected.paidAmount + (amountValid ? amountNum : 0))
    : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="سفارشات انبار و لجستیک"
        icon="truck"
        description="تحویل سفارش + دریافت نقدی در محل + هزینه‌های تحویل"
      />

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
          {rows.length.toLocaleString("fa-IR")} سفارش در دست لجستیک
        </span>
      </Card>

      {/* جدول */}
      <Card className="p-4">
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          pageSize={10}
          onRowClick={(o) => openOrder(o.id)}
          emptyState={
            <EmptyState
              icon="truck"
              title="سفارشی در دست لجستیک نیست"
              description="سفارش‌ها بعد از تکمیل چاپ، به انبار و لجستیک می‌رسند"
            />
          }
        />
      </Card>

      {/* مودال تحویل + دریافت + هزینه */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="min-w-5xl overflow-hidden p-0 gap-0 rounded-xl"
        >
          {selected ? (
            <>
              <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-l from-sky-500/8 via-sky-500/3 to-transparent">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-12 rounded-xl bg-gradient-to-br from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-400 grid place-items-center shrink-0 border border-sky-500/10">
                      <Icon name="truck" size={22} />
                    </div>
                    <div className="min-w-0">
                      <DialogTitle className="text-lg font-bold truncate">
                        تحویل سفارش #{selected.number}
                      </DialogTitle>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Icon name="customers" size={12} />
                          {selected.customer?.name}
                        </span>
                        <span className="tabular-nums" dir="ltr">
                          {selected.customer?.phone}
                        </span>
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>
                {/* ۳ تایل */}
                <div className="grid grid-cols-3 gap-2.5 mt-4">
                  <div className="rounded-xl bg-background/70 backdrop-blur-sm p-3 border shadow-sm">
                    <div className="text-[10px] text-muted-foreground">جمع سفارش</div>
                    <div className="text-sm font-bold mt-1.5 tabular-nums" dir="ltr">
                      {formatCurrency(selected.totalAmount)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-background/70 backdrop-blur-sm p-3 border shadow-sm">
                    <div className="text-[10px] text-muted-foreground">پرداخت‌شده</div>
                    <div
                      className="text-sm font-bold mt-1.5 tabular-nums text-emerald-600 dark:text-emerald-400"
                      dir="ltr"
                    >
                      {formatCurrency(selected.paidAmount)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-background/70 backdrop-blur-sm p-3 border shadow-sm">
                    <div className="text-[10px] text-muted-foreground">پرداخت‌نشده</div>
                    <div
                      className={cn(
                        "text-sm font-bold mt-1.5 tabular-nums",
                        selected.totalAmount - selected.paidAmount > 0.001
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-emerald-600"
                      )}
                      dir="ltr"
                    >
                      {selected.totalAmount - selected.paidAmount > 0.001
                        ? formatCurrency(selected.totalAmount - selected.paidAmount)
                        : "تسویه ✓"}
                    </div>
                  </div>
                </div>
              </div>

              <Tabs value={tab} onValueChange={setTab} dir="rtl" className="flex-1 flex flex-col min-h-0">
                <div className="px-6 pt-3 pb-0 border-b bg-muted/20">
                  <TabsList className="bg-transparent p-0 h-auto gap-1">
                    <TabsTrigger
                      value="collect"
                      className="px-4 py-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-sky-500 data-[state=active]:shadow-none rounded-t-lg text-sm gap-1.5"
                    >
                      <Icon name="creditCard" size={15} />
                      دریافت نقدی
                    </TabsTrigger>
                    <TabsTrigger
                      value="cost"
                      className="px-4 py-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-sky-500 data-[state=active]:shadow-none rounded-t-lg text-sm gap-1.5"
                    >
                      <Icon name="money" size={15} />
                      ثبت هزینه تحویل
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* تب دریافت نقدی */}
                <TabsContent value="collect" className="mt-0 flex-1 min-h-0 data-[state=inactive]:hidden">
                  <div className="overflow-y-auto scrollbar-thin px-6 py-4 space-y-4" style={{ maxHeight: "56vh" }}>
                    <div className="rounded-xl border bg-emerald-500/[0.03] p-4 space-y-3">
                      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Icon name="info" size={13} />
                        پولی که مشتری در محل تحویل می‌دهد — مستقیم به «پرداخت‌شدهٔ» سفارش اضافه
                        می‌شود و مالی آن را با نام شما می‌بیند
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="مبلغ دریافتی (IQD)" required>
                          <Input
                            type="number"
                            min={0}
                            dir="ltr"
                            className="text-center h-11 text-lg font-bold tabular-nums"
                            value={collectAmount}
                            onChange={(e) => setCollectAmount(e.target.value)}
                            placeholder="0"
                          />
                        </Field>
                        <Field label="یادداشت">
                          <Input
                            value={collectNote}
                            onChange={(e) => setCollectNote(e.target.value)}
                            placeholder="اختیاری…"
                          />
                        </Field>
                      </div>
                      {amountValid && (
                        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/10 p-3 text-xs flex items-center gap-2">
                          <Icon name="checkCircle" size={14} className="text-emerald-600" />
                          <span>
                            بعد از ثبت: کل پرداخت‌شده ={" "}
                            <b dir="ltr" className="tabular-nums">
                              {formatCurrency(selected.paidAmount + amountNum)}
                            </b>{" "}
                            •{" "}
                            {remainingAfter > 0.001
                              ? `مانده: ${formatCurrency(remainingAfter)}`
                              : "سفارش کامل تسویه می‌شود ✓"}
                          </span>
                        </div>
                      )}
                      <Button
                        className="gap-2"
                        disabled={!amountValid || collectMut.isPending}
                        onClick={() => collectMut.mutate(selected)}
                      >
                        {collectMut.isPending ? (
                          <Icon name="loading" size={16} className="animate-spin" />
                        ) : (
                          <Icon name="check" size={16} />
                        )}
                        ثبت دریافت نقدی
                      </Button>
                    </div>

                    {/* تاریخچهٔ دریافت‌های این سفارش */}
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Icon name="trending" size={13} /> دریافت‌های ثبت‌شدهٔ این سفارش
                      </div>
                      {(logsData?.logs ?? []).length === 0 ? (
                        <div className="text-xs text-muted-foreground py-3 text-center border rounded-lg border-dashed">
                          هنوز دریافت‌ای ثبت نشده
                        </div>
                      ) : (
                        <div className="rounded-xl border overflow-hidden divide-y">
                          {(logsData?.logs ?? []).map((l) => (
                            <div
                              key={l.id}
                              className="px-3.5 py-2.5 flex items-center justify-between gap-2 flex-wrap text-xs"
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-muted-foreground">{l.createdByName ?? "—"}</span>
                                <span className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
                                  {formatDateTime(l.createdAt)}
                                </span>
                                {l.note && (
                                  <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                    — {l.note}
                                  </span>
                                )}
                              </div>
                              <span
                                className={cn(
                                  "font-bold tabular-nums",
                                  l.amount >= 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-rose-600"
                                )}
                                dir="ltr"
                              >
                                {l.amount >= 0 ? "+" : "−"}
                                {formatCurrency(Math.abs(l.amount))}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* تب هزینه */}
                <TabsContent value="cost" className="mt-0 flex-1 min-h-0 data-[state=inactive]:hidden">
                  <div className="overflow-y-auto scrollbar-thin px-6 py-4" style={{ maxHeight: "56vh" }}>
                    <CostEntryForm
                      mode="order"
                      orderId={selected.id}
                      fixedModule="warehouse"
                      onSubmitted={() => {
                        invalidate(["material-costs", "finance"]);
                        qc.invalidateQueries({ queryKey: ["payments", openId] });
                      }}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Icon name="loading" size={24} className="animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">در حال بارگذاری…</span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
