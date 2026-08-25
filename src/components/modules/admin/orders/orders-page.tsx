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

  // Columns: action callbacks are stable (setState setters + useCallback'd
  // openOrder/navigate), so identity churns only when they do.
  const columns = getOrderColumns({
    onOpenDetail: (o) => openOrder(o.id),
    onOpenNote: (o) => setNoteOrder(o),
    onOpenStatus: (o) => setStatusOrder(o),
    onOpenDelete: (o) => setDeleteOrder(o),
    onEdit: (o) => navigate("admin", "orders-new", o.id),
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

        {modal}
      </div>
    </TooltipProvider>
  );
}
