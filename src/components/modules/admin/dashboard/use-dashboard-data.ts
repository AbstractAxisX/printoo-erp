"use client";

/**
 * Phase 6 — Dashboard data consolidation (R6, R11, R25).
 *
 * BEFORE: 12 independent `useQuery` calls fired `/api/dashboard` on mount
 *   - 8 KpiCards each with `["dashboard-kpi", config.key, range...]` (staleTime: 0)
 *   - 3 sections (NearDeadline/LatestTasks/Recent) each with their own single-string key
 *   - 1 QuickStatsRow with `["dashboard-quick"]`
 * Each returned the FULL dashboard payload but only read its own slice → 12× the work.
 *
 * AFTER: 2 shared queries
 *   - `useDashboardKpis(range)` → `["dashboard", "kpi", rangeKey]` — all 8 cards with the
 *     same range share ONE fetch (TanStack dedupes by queryKey). Per-card range overrides
 *     still work (that card gets its own query, others stay shared).
 *   - `useDashboardSections()` → `["dashboard", "sections"]` — all 3 list sections +
 *     QuickStatsRow share ONE fetch (sections data is range-independent; uses a fixed
 *     all-time range internally so KPI/sections queries don't collide).
 *
 * Both keys live under the `["dashboard"]` prefix → an `invalidate(["dashboard"])` from
 * any mutation (e.g. order-status change) now refreshes the dashboard instantly. Before,
 * the single-string keys `["dashboard-kpi"]`/`["dashboard-tasks"]`/etc. were NOT
 * prefix-matched, so mutations never invalidated them (R11).
 *
 * R25: `DASHBOARD_PAGES` replaces 8 hardcoded `navigate("admin", "...")` string literals
 * across admin-dashboard.tsx + dashboard-sections.tsx with one typed constant — a typo
 * now fails at compile time instead of silently orphaning a click handler.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { rangeToParams, type TimeRange } from "@/lib/time-ranges";

// ─── Shared types (single source of truth for the dashboard payload) ─────────

export type KpiData = { value: number; prev: number; change: number; total: number };
export type SeriesPoint = { date: string; value: number };

/** Full /api/dashboard response shape. Each consumer reads only its slice. */
export type DashboardData = {
  range: { from: string; to: string };
  kpis: Record<string, KpiData>;
  series: Record<string, SeriesPoint[]>;
  quickStats: {
    overdueOrders: number;
    nearDeadline: number;
    noEndDate: number;
    pendingTasks: number;
  };
  recentOrders: DashboardOrder[];
  nearDeadlineOrders: DashboardOrder[];
  latestTasks: DashboardTask[];
  byStatus?: Record<string, number>[];
};

export type DashboardOrder = {
  id: string;
  number: number;
  status: string;
  endDate: string | null;
  totalAmount: number;
  priority: string;
  noEndDate?: boolean;
  createdAt: string;
  customer?: { name: string } | null;
  items?: { id: string; product: { name: string } }[];
};

export type DashboardTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  module: string;
  createdAt: string;
  assignedUser?: { name: string } | null;
};

// ─── R25: typed dashboard navigation targets ─────────────────────────────────
// Previously: 8 hardcoded `navigate("admin", "orders")` / `"open-orders"` / `"tasks"` /
// `"orders-new"` string literals across admin-dashboard.tsx + dashboard-sections.tsx.
// A typo (e.g. "ordrs") would silently break a click handler with no compile error.
// Now: `navigate("admin", DASHBOARD_PAGES.allOrders)` — typo = type error.
export const DASHBOARD_PAGES = {
  newOrder: "orders-new",
  allOrders: "orders",
  openOrders: "open-orders",
  tasks: "tasks",
} as const;

// ─── Range helpers ────────────────────────────────────────────────────────────

/** Stable string key for a range so identical ranges dedupe via TanStack. */
function rangeKey(r: TimeRange): string {
  return `${r.preset}:${r.from.toISOString()}:${r.to.toISOString()}`;
}

/**
 * Fixed "all time" range used by sections (recentOrders, nearDeadlineOrders, latestTasks)
 * and quickStats. These slices are NOT range-dependent server-side (they use `take: N`
 * + their own internal date logic), so a single all-time fetch satisfies all four.
 * A real range (e.g. "this-month") would compute the same lists — we use all-time to
 * guarantee sections never go empty just because the KPI range is narrow.
 */
function allTimeRange(): TimeRange {
  const now = new Date();
  return {
    from: new Date(2000, 0, 1),
    to: now,
    preset: "all-time",
    label: "همه زمان‌ها",
  };
}

// ─── Shared queries ───────────────────────────────────────────────────────────

/**
 * KPI data fetch — shared by all KpiCards with the same range (R6: 8→1).
 * `staleTime: 60s` (was 0) prevents refetch-on-focus storms; `refetchInterval: 15s`
 * keeps freshness but on the shared query, so 1 poll per 15s instead of 8.
 */
export function useDashboardKpis(range: TimeRange) {
  return useQuery({
    queryKey: ["dashboard", "kpi", rangeKey(range)],
    queryFn: () => api<DashboardData>(`/api/dashboard?${rangeToParams(range)}`),
    staleTime: 60_000,
    refetchInterval: 15_000,
  });
}

/**
 * Sections fetch — shared by NearDeadlineOrders, LatestTasks, RecentOrders, and
 * QuickStatsRow (R6: 4→1). Uses a fixed all-time range (sections data is
 * range-independent). `staleTime: 60s`; `refetchInterval: 30s`.
 */
export function useDashboardSections() {
  return useQuery({
    queryKey: ["dashboard", "sections"],
    queryFn: () => api<DashboardData>(`/api/dashboard?${rangeToParams(allTimeRange())}`),
    staleTime: 60_000,
    refetchInterval: 30_000,
  });
}
