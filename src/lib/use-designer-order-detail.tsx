"use client";

import * as React from "react";
import { DesignerOrderDetailModal } from "@/components/modules/designer/designer-order-detail";

/**
 * Hook to open the DesignerOrderDetailModal by order ID.
 *
 * Usage:
 *   const { openOrder, modal } = useDesignerOrderDetail();
 *   <button onClick={() => openOrder(orderId)}>...</button>
 *   {modal}
 *
 * The modal fetches full order details internally and strips out
 * financial/phone fields before rendering (designer-safe view).
 */
export function useDesignerOrderDetail() {
  const [orderId, setOrderId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const openOrder = React.useCallback((id: string) => {
    setOrderId(id);
    setOpen(true);
  }, []);

  const modal = (
    <DesignerOrderDetailModal
      orderId={orderId}
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setOrderId(null);
      }}
    />
  );

  return { openOrder, modal };
}
