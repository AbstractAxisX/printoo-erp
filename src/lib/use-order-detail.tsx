"use client";

// Printoo24 ERP — useOrderDetail hook (Phase 2)
//
// Lazy-loads the OrderDetailModal via next/dynamic (ssr:false) so the
// modal's code is code-split out of the All Orders / Open Orders page
// bundles. The modal only loads when first opened.
//
// Public interface PRESERVED: { openOrder, modal, isLoading }.
// Consumers: admin/orders/orders-page.tsx, admin/open-orders.tsx (direct).

import * as React from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { OrderDetail } from "@/components/shared/order-detail-modal";

// Code-split the modal (and its tab components) out of the page bundle.
// Loads on first open, then cached by Next's dynamic loader.
const OrderDetailModal = dynamic(
  () =>
    import("@/components/shared/order-detail-modal").then(
      (m) => m.OrderDetailModal
    ),
  { ssr: false, loading: () => null }
);

/**
 * Hook to open OrderDetailModal by fetching full order details.
 * Usage:
 *   const { openOrder, modal } = useOrderDetail();
 *   <button onClick={() => openOrder(orderId)}>...</button>
 *   {modal}
 */
export function useOrderDetail() {
  const [orderId, setOrderId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api<{ order: OrderDetail }>(`/api/orders/${orderId}`),
    enabled: !!orderId && open,
  });

  const openOrder = React.useCallback((id: string) => {
    setOrderId(id);
    setOpen(true);
  }, []);

  const modal = (
    <OrderDetailModal
      order={data?.order ?? null}
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setOrderId(null);
      }}
    />
  );

  return { openOrder, modal, isLoading };
}
