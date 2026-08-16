"use client";

import * as React from "react";
import { PrintOrderDetailModal } from "@/components/modules/print/print-order-detail";

/**
 * Hook to open the PrintOrderDetailModal by order ID.
 *
 * Usage:
 *   const { openOrder, modal } = usePrintOrderDetail();
 *   <button onClick={() => openOrder(orderId)}>...</button>
 *   {modal}
 *
 * The modal fetches full order details internally and strips out
 * financial/phone fields before rendering (print-safe view).
 */
export function usePrintOrderDetail() {
  const [orderId, setOrderId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const openOrder = React.useCallback((id: string) => {
    setOrderId(id);
    setOpen(true);
  }, []);

  const modal = (
    <PrintOrderDetailModal
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
