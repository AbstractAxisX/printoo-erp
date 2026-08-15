"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { broadcastInvalidate } from "@/lib/cross-tab";

/**
 * Smart invalidation helper.
 * Invalidates queries by prefix AND broadcasts to other tabs.
 *
 * Usage:
 *   const invalidate = useInvalidate();
 *   // after creating an order:
 *   invalidate(["orders", "dashboard", "notifications"]);
 */
export function useInvalidate() {
  const qc = useQueryClient();
  return useCallback(
    (keys: string[]) => {
      for (const k of keys) {
        qc.invalidateQueries({ queryKey: [k] });
      }
      broadcastInvalidate(keys);
    },
    [qc]
  );
}

/**
 * Invalidate ALL queries (nuclear option).
 */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries();
    broadcastInvalidate([]);
  }, [qc]);
}
