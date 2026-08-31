// Printoo24 ERP — Orders module shared types (Phase 3)
//
// Single source of truth for the Order shape used across columns, filters,
// modals, the All-Orders page, and the Open-Orders page. Keeping it here
// (not inline in a page) lets each atomic piece import the same contract.

import type { OrderStatus } from "@/lib/constants";

// Lightweight Order row (what /api/orders returns today). Fields are exactly
// those consumed by the table / filters / modals — no extra weight, so the
// virtualizer payload stays small for thousands of rows.
export type OrderItem = {
  id: string;
  productId: string;
  product: { name: string };
  quantity: number;
  pricePerUnit: number;
  totalAmount: number;
  note: string | null;
  description: string | null;
  stage: string;
  needsMaterial?: boolean;
  designStartDate?: string | null;
  designEndDate?: string | null;
  printStartDate?: string | null;
  printEndDate?: string | null;
};

export type Order = {
  id: string;
  number: number;
  status: OrderStatus;
  endDate: string | null;
  noEndDate: boolean;
  totalAmount: number;
  paidAmount?: number;
  priority: string;
  splitMode: string;
  note: string | null;
  designerNote?: string | null;
  createdAt: string;
  updatedAt?: string;
  createdBy: string | null;
  customer: { id: string; name: string; phone: string };
  items: OrderItem[];
};

// Aggregated filter state used by the filter bar + the client-side filtering
// step in the page. Encapsulating it lets useOrdersFilters() own both the
// state and the pure predicate, keeping the page a thin container.
export type OrdersFilterState = {
  customerFilter: string | null;
  productFilter: string | null;
  statusFilters: Set<string>;
  priorityFilters: Set<string>;
  stageFilters: Set<string>;
  dateFrom: Date | null;
  dateTo: Date | null;
};

// Empty filter set helper (used by "clear all" + initial state).
export const emptyFilters: OrdersFilterState = {
  customerFilter: null,
  productFilter: null,
  statusFilters: new Set(),
  priorityFilters: new Set(),
  stageFilters: new Set(),
  dateFrom: null,
  dateTo: null,
};

// Count active constraints (for the badge + "clear (N)" label).
export function activeFilterCount(f: OrdersFilterState): number {
  return (
    (f.customerFilter ? 1 : 0) +
    (f.productFilter ? 1 : 0) +
    f.statusFilters.size +
    f.priorityFilters.size +
    f.stageFilters.size +
    (f.dateFrom ? 1 : 0) +
    (f.dateTo ? 1 : 0)
  );
}

// Pure predicate: does an order pass the current filter state?
// (Server already filters by customerId/productId; this handles the
// status/priority/stage/date dims client-side — they're cheap on <= ~10k rows
// and keep the UX instant.)
export function orderMatchesFilters(o: Order, f: OrdersFilterState): boolean {
  if (f.statusFilters.size > 0 && !f.statusFilters.has(o.status)) return false;
  if (f.priorityFilters.size > 0 && !f.priorityFilters.has(o.priority)) return false;
  if (
    f.stageFilters.size > 0 &&
    !(o.items ?? []).some((it) => f.stageFilters.has(it.stage))
  )
    return false;
  if (f.dateFrom && o.createdAt && new Date(o.createdAt) < f.dateFrom) return false;
  if (f.dateTo && o.createdAt && new Date(o.createdAt) > f.dateTo) return false;
  return true;
}
