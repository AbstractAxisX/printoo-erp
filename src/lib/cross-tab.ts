"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const CHANNEL = "printoo24-invalidate";

/**
 * Cross-tab query invalidation.
 * When a mutation invalidates queries in one tab, broadcast to other tabs
 * so they refetch and stay real-time.
 */
export function useCrossTabSync() {
  const qc = useQueryClient();

  useEffect(() => {
    // Listen for invalidation broadcasts from other tabs
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== CHANNEL) return;
      const keys = e.data.keys as readonly unknown[];
      if (!keys || keys.length === 0) {
        qc.invalidateQueries();
      } else {
        for (const k of keys) {
          qc.invalidateQueries({ queryKey: [k] });
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [qc]);
}

/**
 * Broadcast invalidation to other tabs.
 * Call this in onSuccess of mutations.
 */
export function broadcastInvalidate(keys: string | string[]) {
  const arr = Array.isArray(keys) ? keys : [keys];
  try {
    window.postMessage({ type: CHANNEL, keys: arr }, "*");
    // Also use BroadcastChannel for true cross-tab (postMessage is same-tab only)
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(CHANNEL);
      bc.postMessage({ keys: arr });
      bc.close();
    }
  } catch {
    /* noop */
  }
}

/**
 * Set up BroadcastChannel listener (for true cross-tab sync).
 * Must be called once at app root.
 */
export function setupCrossTabListener() {
  if (typeof BroadcastChannel === "undefined") return;
  const bc = new BroadcastChannel(CHANNEL);
  bc.onmessage = (e) => {
    if (e.data?.type !== CHANNEL) {
      // Forward to postMessage so useCrossTabSync picks it up
      window.postMessage({ type: CHANNEL, keys: e.data?.keys ?? [] }, "*");
    }
  };
  return () => bc.close();
}
