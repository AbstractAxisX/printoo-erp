"use client";

// Printoo24 ERP — Shared FilterToggle + FilterGroup (Phase 3, fixes R21)
// ─────────────────────────────────────────────────────────────────────
// These two helpers were previously duplicated inline in:
//   - src/components/modules/admin/orders/orders-page.tsx (L501-545)
// (FilterToggle is also reused inside that page's StatusModal — L678-685.)
//
// This shared module is the single source of truth. Both FilterToggle and
// FilterGroup are presentational — they take state from props and emit clicks.
// Tone (activeColor) is widened to support per-status theming beyond the
// original primary/rose/emerald/amber palette while preserving the default.

import * as React from "react";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type FilterTone = "primary" | "rose" | "emerald" | "amber" | "violet" | "cyan" | "slate";

const TONE_ACTIVE: Record<FilterTone, string> = {
  primary: "bg-primary text-primary-foreground border-primary",
  rose: "bg-rose-500 text-white border-rose-500",
  emerald: "bg-emerald-500 text-white border-emerald-500",
  amber: "bg-amber-500 text-white border-amber-500",
  violet: "bg-violet-500 text-white border-violet-500",
  cyan: "bg-cyan-500 text-white border-cyan-500",
  slate: "bg-slate-600 text-white border-slate-600",
};

type FilterToggleProps = {
  active: boolean;
  onClick: () => void;
  label: string;
  activeColor?: FilterTone;
  /** Optional icon shown before the label (when provided, overrides the default check/plus). */
  icon?: IconName;
  disabled?: boolean;
  /** Optional accessible name; defaults to label. */
  "aria-label"?: string;
};

export function FilterToggle({
  active,
  onClick,
  label,
  activeColor = "primary",
  icon,
  disabled = false,
  "aria-label": ariaLabel,
}: FilterToggleProps) {
  const activeCls = TONE_ACTIVE[activeColor];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
        active
          ? cn(activeCls, "shadow-sm")
          : "bg-background text-muted-foreground border-input hover:border-foreground/30 hover:text-foreground",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      <Icon
        name={icon ?? (active ? "check" : "plus")}
        size={12}
        strokeWidth={2.5}
      />
      {label}
    </button>
  );
}

type FilterGroupProps = {
  label: string;
  icon: IconName;
  /** Minimum label column width in px (default 110). Lets long labels align. */
  labelMinWidth?: number;
  children: React.ReactNode;
};

export function FilterGroup({
  label,
  icon,
  labelMinWidth = 110,
  children,
}: FilterGroupProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        style={{ minWidth: labelMinWidth }}
      >
        <Icon name={icon} size={13} />
        {label}:
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}
