"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";

type ToggleButtonProps = {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
  id?: string;
  className?: string;
  size?: "sm" | "md";
  activeIcon?: "check" | "star" | "alert";
  inactiveIcon?: "cancel";
  activeColor?: "primary" | "emerald" | "amber";
};

/**
 * A button-style toggle with explicit check/cross icons (no broken-direction switches).
 * Click to toggle active/inactive state.
 */
export function ToggleButton({
  checked, onChange, label, description, id, className, size = "md",
  activeIcon = "check", inactiveIcon = "cancel", activeColor = "primary",
}: ToggleButtonProps) {
  const sizeCls = size === "sm" ? "size-7" : "size-9";
  const iconSize = size === "sm" ? 14 : 16;

  const activeColorCls = {
    primary: "bg-primary text-primary-foreground border-primary",
    emerald: "bg-emerald-500 text-white border-emerald-500",
    amber: "bg-amber-500 text-white border-amber-500",
  }[activeColor];

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        id={id}
        onClick={() => onChange(!checked)}
        className={cn(
          "shrink-0 rounded-lg border-2 grid place-items-center transition-all",
          sizeCls,
          checked
            ? cn(activeColorCls, "shadow-sm scale-100")
            : "bg-background text-muted-foreground border-input hover:border-foreground/30 hover:text-foreground"
        )}
      >
        <Icon name={checked ? activeIcon : inactiveIcon} size={iconSize} strokeWidth={2.5} />
      </button>
      {label && (
        <label htmlFor={id} className="cursor-pointer select-none">
          <span className={cn("text-sm font-medium", checked ? "text-foreground" : "text-muted-foreground")}>{label}</span>
          {description && <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>}
        </label>
      )}
    </div>
  );
}

/**
 * Compact icon-only toggle (for use inside table rows, etc.)
 */
export function ToggleIconButton({
  checked, onChange, title, size = "md",
  activeIcon = "check", inactiveIcon = "cancel", activeColor = "primary",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title?: string;
  size?: "sm" | "md";
  activeIcon?: "check" | "star" | "alert";
  inactiveIcon?: "cancel";
  activeColor?: "primary" | "emerald" | "amber";
}) {
  const sizeCls = size === "sm" ? "size-7" : "size-9";
  const iconSize = size === "sm" ? 13 : 15;
  const activeColorCls = {
    primary: "bg-primary text-primary-foreground border-primary",
    emerald: "bg-emerald-500 text-white border-emerald-500",
    amber: "bg-amber-500 text-white border-amber-500",
  }[activeColor];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      className={cn(
        "shrink-0 rounded-lg border-2 grid place-items-center transition-all",
        sizeCls,
        checked
          ? cn(activeColorCls, "shadow-sm")
          : "bg-background text-muted-foreground border-input hover:border-foreground/30 hover:text-foreground"
      )}
    >
      <Icon name={checked ? activeIcon : inactiveIcon} size={iconSize} strokeWidth={2.5} />
    </button>
  );
}
