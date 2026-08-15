"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { OrderDetailModal, type OrderDetail } from "@/components/shared/order-detail-modal";

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
      onOpenChange={(v) => { setOpen(v); if (!v) setOrderId(null); }}
    />
  );

  return { openOrder, modal, isLoading };
}
