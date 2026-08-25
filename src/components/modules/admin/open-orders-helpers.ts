// Printoo24 ERP — Open-Orders pure helpers (Phase 3)
//
// Stage deadline logic extracted from open-orders.tsx so the page shrinks
// and the rules become independently testable / reusable (Phase 5 calendar
// will want the same stage-deadline mapping).
//
// All functions here are pure — given (order, stage) they return deterministic
// deadlines / thresholds / category flags. No React, no side effects.

import { daysRemaining } from "@/lib/format";
import type { IconName } from "@/lib/icons";

// ─── Types ────────────────────────────────────────────────────
export type OpenOrder = {
  id: string;
  number: number;
  status: string;
  endDate: string | null;
  noEndDate: boolean;
  totalAmount: number;
  priority: string;
  createdAt: string;
  customer: { id: string; name: string; phone: string };
  items: {
    id: string;
    productId: string;
    product: { name: string };
    quantity: number;
    totalAmount: number;
    stage: string;
    designEndDate: string | null;
    printEndDate: string | null;
  }[];
};

export type Stage = "all" | "pending_design" | "in_printing" | "warehouse_logistics";

export type CardFilter = "total" | "overdue" | "near" | "urgent";

// ─── Stage config (used by the page tabs + the column header) ──
export const STAGES: {
  key: Stage;
  label: string;
  icon: IconName;
  color: string;
  activeCls: string;
}[] = [
  {
    key: "all",
    label: "همه سفارشات باز",
    icon: "layers",
    color: "slate",
    activeCls: "bg-slate-600 text-white border-slate-600 shadow-sm",
  },
  {
    key: "pending_design",
    label: "در حال طراحی",
    icon: "design",
    color: "violet",
    activeCls: "bg-violet-600 text-white border-violet-600 shadow-sm",
  },
  {
    key: "in_printing",
    label: "در حال چاپ",
    icon: "print",
    color: "amber",
    activeCls: "bg-amber-600 text-white border-amber-600 shadow-sm",
  },
  {
    key: "warehouse_logistics",
    label: "انبار و لجستیک",
    icon: "warehouse",
    color: "cyan",
    activeCls: "bg-cyan-600 text-white border-cyan-600 shadow-sm",
  },
];

// Near-deadline thresholds per stage (in days)
export const NEAR_THRESHOLD: Record<Stage, number> = {
  all: 5,
  pending_design: 2,
  in_printing: 5,
  warehouse_logistics: 3,
};

// ─── Deadline helpers ─────────────────────────────────────────
export function getOrderOwnStageDeadline(order: OpenOrder): string | null {
  if (order.status === "pending_design") {
    return order.items[0]?.designEndDate || order.endDate;
  }
  if (order.status === "in_printing") {
    return order.items[0]?.printEndDate || order.endDate;
  }
  return order.endDate;
}

export function getStageDeadline(order: OpenOrder, stage: Stage): string | null {
  if (stage === "all") return getOrderOwnStageDeadline(order);
  if (stage === "pending_design") {
    return order.items[0]?.designEndDate || order.endDate;
  }
  if (stage === "in_printing") {
    return order.items[0]?.printEndDate || order.endDate;
  }
  return order.endDate; // warehouse_logistics
}

export function getNearThreshold(order: OpenOrder, stage: Stage): number {
  if (stage === "all") {
    if (order.status === "pending_design") return NEAR_THRESHOLD.pending_design;
    if (order.status === "in_printing") return NEAR_THRESHOLD.in_printing;
    if (order.status === "warehouse_logistics")
      return NEAR_THRESHOLD.warehouse_logistics;
    return NEAR_THRESHOLD.all;
  }
  return NEAR_THRESHOLD[stage];
}

export type OrderCategory = {
  deadline: string | null;
  dr: ReturnType<typeof daysRemaining>;
  isOverdue: boolean;
  isNearDeadline: boolean;
  isToday: boolean;
  isUrgent: boolean;
};

export function categorize(order: OpenOrder, stage: Stage): OrderCategory {
  const deadline = getStageDeadline(order, stage);
  const dr = daysRemaining(deadline);
  const threshold = getNearThreshold(order, stage);
  const isOverdue = dr.status === "overdue";
  const isNearDeadline = dr.status === "remaining" && dr.days <= threshold;
  const isToday = dr.status === "today";
  const isUrgent = order.priority === "urgent";
  return { deadline, dr, isOverdue, isNearDeadline, isToday, isUrgent };
}
