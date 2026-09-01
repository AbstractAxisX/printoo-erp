"use client";

// Printoo24 ERP — All Orders page
//
// Thin container — the heavy lifting lives in atomic siblings:
//   useOrdersFilters  → filter state + predicate
//   useOrdersQuery    → server data (orders/customers/products)
//   OrdersFilterBar   → the search + filter card
//   getOrderColumns   → column factory
//   DataTable         → the SAME table the Open-Orders page uses
//   Order*Modal       → note/status/delete dialogs
//
// Hotfix round-3: VirtualizedDataTable replaced with the plain DataTable
// (open-orders pattern) — no horizontal scroll, real pagination, and the
// flushSync-inside-lifecycle warning from the virtualizer is gone with it.
// 11–100s of orders don't need windowing; simplicity wins.

import * as React from "react";
import { PageHeader, EmptyState } from "@/components/shared";
import { DataTable } from "@/components/ui/data-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useOrderDetail } from "@/lib/use-order-detail";
import { useAppStore } from "@/stores/app-store";
import { PreInvoiceModal } from "@/components/shared/pre-invoice-modal";
import { InvoiceModal } from "@/components/shared/invoice-modal";
import {
  useOrdersFilters,
  OrdersFilterBar,
} from "./orders-filters";
import { useOrdersQuery } from "./use-orders-query";
import { getOrderColumns } from "./orders-columns";
import {
  OrderNoteModal,
  OrderStatusModal,
  OrderDeleteDialog,
} from "./order-modals";
import { orderMatchesFilters, type Order } from "./types";
import { ITEM_STAGE } from "@/lib/constants";

export function OrdersPage() {
  const navigate = useAppStore((s) => s.navigate);
  const { openOrder, modal } = useOrderDetail();
  const filters = useOrdersFilters();

  const { orders, customers, products, isLoading, isError, refetch } =
    useOrdersQuery({
      customerId: filters.filters.customerFilter,
      productId: filters.filters.productFilter,
    });

  // Apply client-side dims (status/priority/stage/date). Server already
  // narrowed by customer/product.
  const visibleOrders = React.useMemo(
    () => orders.filter((o) => orderMatchesFilters(o, filters.filters)),
    [orders, filters.filters]
  );

  // Modal targets (null = closed) — declared before columns so the
  // React Compiler can preserve memoization (manual useMemo was removed:
  // it captured the setters below its declaration and got skipped).
  const [noteOrder, setNoteOrder] = React.useState<Order | null>(null);
  const [statusOrder, setStatusOrder] = React.useState<Order | null>(null);
  const [deleteOrder, setDeleteOrder] = React.useState<Order | null>(null);
  // Phase 11 — مودال‌های مستقل پیش‌فاکتور/فاکتور (آیکون‌های ردیف جدول)
  const [piOrder, setPiOrder] = React.useState<Order | null>(null);
  const [invOrder, setInvOrder] = React.useState<Order | null>(null);

  // Columns: action callbacks are stable (setState setters + useCallback'd
  // openOrder/navigate), so identity churns only when they do.
  const columns = getOrderColumns({
    onOpenDetail: (o) => openOrder(o.id),
    onOpenNote: (o) => setNoteOrder(o),
    onOpenStatus: (o) => setStatusOrder(o),
    onOpenDelete: (o) => setDeleteOrder(o),
    onEdit: (o) => navigate("admin", "orders-new", o.id),
    // Phase 11 — دکمه‌های ردیف: مودال مستقل پیش‌فاکتور/فاکتور (مدیریت
    // کامل همان‌جا — ویرایش/چاپ/چرخهٔ وضعیت — بدون رفتن به جزئیات)
    onOpenPreInvoice: (o) => setPiOrder(o),
    onOpenInvoice: (o) => setInvOrder(o),
  });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        <PageHeader
          title="همه سفارشات"
          description="مدیریت کامل سفارش‌های چاپ با فیلترهای پیشرفته"
          icon="orders"
          actions={
            <Button
              onClick={() => navigate("admin", "orders-new")}
              className="gap-2"
            >
              <Icon name="plus" size={16} /> سفارش جدید
            </Button>
          }
        />

        <OrdersFilterBar
          state={filters}
          customers={customers}
          products={products}
          resultCount={visibleOrders.length}
        />

        {isError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-center justify-between">
            <span>خطا در بارگذاری سفارشات.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              تلاش دوباره
            </Button>
          </div>
        ) : (
          <Card className="p-4">
            <DataTable
              columns={columns}
              data={visibleOrders}
              isLoading={isLoading}
              pageSize={10}
              showColumnToggle
              // Phase 9 — ردیف‌های بازشوندهٔ سفارش گروهی (dropdown آیتم‌ها)
              getRowCanExpand={(o) => (o.items?.length ?? 0) > 1}
              expandOnRowClick={false}
              renderExpandedRow={(o) => <GroupedItemsRow order={o} />}
              // مرحله/تاریخ ساخت به‌طور پیش‌فرض مخفی — جدول در عرض صفحه جا
              // می‌شود (بدون اسکرول افقی). از منوی «ستون‌ها» قابل بازگشتن‌اند.
              defaultHidden={["stage", "createdAt"]}
              onRowClick={(o) => openOrder(o.id)}
              emptyState={
                <EmptyState
                  icon="orders"
                  title="سفارشی یافت نشد"
                  description="با فیلترهای فعلی سفارشی وجود ندارد."
                  action={
                    <Button
                      onClick={() => navigate("admin", "orders-new")}
                      className="gap-2"
                    >
                      <Icon name="plus" size={16} /> ایجاد سفارش
                    </Button>
                  }
                />
              }
            />
          </Card>
        )}

        <OrderNoteModal order={noteOrder} onClose={() => setNoteOrder(null)} />
        <OrderStatusModal order={statusOrder} onClose={() => setStatusOrder(null)} />
        <OrderDeleteDialog order={deleteOrder} onClose={() => setDeleteOrder(null)} />

        {/* Phase 11 — مودال‌های مستقل: آیکون پیش‌فاکتور/فاکتور ردیف */}
        <PreInvoiceModal
          orderId={piOrder?.id ?? null}
          customerName={piOrder?.customer?.name}
          open={!!piOrder}
          onOpenChange={(v) => { if (!v) setPiOrder(null); }}
        />
        <InvoiceModal
          orderId={invOrder?.id ?? null}
          open={!!invOrder}
          onOpenChange={(v) => { if (!v) setInvOrder(null); }}
        />

        {modal}
      </div>
    </TooltipProvider>
  );
}

// ─── Phase 9: ردیف بازشوندهٔ آیتم‌های سفارش گروهی ────────────────────
// سفارش گروهی در جدول به‌صورت دراپ‌داون باز می‌شود: کلیک روی شورون،
// آیتم‌های داخلی (محصول، مرحله، تعداد/قیمت، متریال، تاریخ‌ها) را نشان
// می‌دهد. آیتم‌ها «با هم» جلو می‌روند — گیت طراحی در ستون وضعیت.
function GroupedItemsRow({ order }: { order: Order }) {
  const items = order.items ?? [];
  return (
    <div className="p-3 bg-muted/10">
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-3 py-2 bg-muted/40 text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <Icon name="layers" size={12} />
          آیتم‌های سفارش گروهی #{order.number}
          <span className="text-muted-foreground/60">
            ({items.length.toLocaleString("fa-IR")} آیتم — با هم پیش می‌روند)
          </span>
        </div>
        <div className="divide-y">
          {items.map((it, i) => {
            const stage = ITEM_STAGE[it.stage as keyof typeof ITEM_STAGE];
            const designLate =
              it.designEndDate && it.stage === "design" && new Date(it.designEndDate) < new Date();
            return (
              <div
                key={it.id}
                className="px-3 py-2.5 flex items-center gap-3 flex-wrap hover:bg-accent/20 transition"
              >
                <span className="size-6 rounded-md bg-muted text-muted-foreground grid place-items-center text-[11px] font-bold shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {it.product?.name ?? "—"}
                    {it.description && (
                      <span className="text-xs text-muted-foreground font-normal mr-2">
                        {it.description}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="tabular-nums" dir="ltr">
                      {it.quantity.toLocaleString("en-US")} ×{" "}
                      {(it.pricePerUnit ?? 0).toLocaleString("en-US")}
                    </span>
                    {it.note && (
                      <span className="flex items-center gap-0.5">
                        <Icon name="info" size={10} /> {it.note}
                      </span>
                    )}
                    {it.needsMaterial && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                        متریال
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {designLate && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      طراحی معوق
                    </span>
                  )}
                  <span className="text-[11px] px-2 py-0.5 rounded bg-muted">
                    {stage?.label ?? it.stage}
                  </span>
                  <span className="text-xs font-semibold tabular-nums" dir="ltr">
                    {(it.totalAmount ?? 0).toLocaleString("en-US")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
