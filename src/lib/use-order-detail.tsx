"use client";

// Printoo24 ERP — useOrderDetail hook (Phase 2 → speed pass)
//
// Lazy-loads the OrderDetailModal via next/dynamic (ssr:false) so the
// modal's code is code-split out of the All Orders / Open Orders page
// bundles. The modal only loads when first opened.
//
// SPEED FIXES (the "modal is slow" complaint):
// - preloadModal(): warms the code-split chunk right after a page mounts
//   (idle callback), so the FIRST open doesn't pay the chunk-download cost.
// - prefetchOrder(id): warms the /api/orders/[id] query on row HOVER —
//   by the time the user clicks, data is already in the React Query cache.
// - staleTime 60s: reopening the same order within a minute is INSTANT
//   (cached, no refetch flash), and mutations still invalidate ["order"].
//
// Public interface PRESERVED: { openOrder, modal, isLoading } (additive only).

import * as React from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { OrderDetail } from "@/components/shared/order-detail-modal";

// Code-split the modal (and its tab components) out of the page bundle.
// The raw loader is kept so preloadModal() can warm the same chunk.
const modalLoader = () =>
  import("@/components/shared/order-detail-modal").then(
    (m) => m.OrderDetailModal
  );

const OrderDetailModal = dynamic(modalLoader, {
  ssr: false,
  loading: () => null,
});

// Warm the chunk exactly once per browser session (module-level flag —
// every page importing this hook shares it).
let chunkWarmed = false;
export function preloadModal() {
  if (chunkWarmed) return;
  chunkWarmed = true;
  if (typeof window === "undefined") return;
  // Defer to idle so it never competes with the page's own hydration.
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void) => number;
  };
  const warm = () => void modalLoader();
  if (w.requestIdleCallback) w.requestIdleCallback(warm);
  else setTimeout(warm, 1200);
}

async function fetchOrder(id: string): Promise<{ order: OrderDetail }> {
  return api<{ order: OrderDetail }>(`/api/orders/${id}`);
}

/**
 * Hook to open OrderDetailModal by fetching full order details.
 * Usage:
 *   const { openOrder, modal, prefetchOrder } = useOrderDetail();
 *   <button onClick={() => openOrder(orderId)}>...</button>
 *   <Row onMouseEnter={() => prefetchOrder(orderId)} /> // optional warm-up
 *   {modal}
 */
export function useOrderDetail() {
  const [orderId, setOrderId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  // Warm the code-split chunk as soon as a page using the modal mounts.
  React.useEffect(() => {
    preloadModal();
  }, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => fetchOrder(orderId!),
    enabled: !!orderId && open,
    staleTime: 60_000, // instant reopen within a minute
    gcTime: 5 * 60_000,
  });

  const openOrder = React.useCallback((id: string) => {
    setOrderId(id);
    setOpen(true);
  }, []);

  // Hover warm-up: fills the cache so openOrder renders instantly on click.
  const prefetchOrder = React.useCallback(
    (id: string) => {
      void queryClient.prefetchQuery({
        queryKey: ["order", id],
        queryFn: () => fetchOrder(id),
        staleTime: 60_000,
      });
    },
    [queryClient]
  );

  const modal = (
    <OrderDetailModal
      order={data?.order ?? null}
      open={open}
      isError={isError}
      onRetry={() => refetch()}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setOrderId(null);
      }}
    />
  );

  return { openOrder, prefetchOrder, modal, isLoading };
}
