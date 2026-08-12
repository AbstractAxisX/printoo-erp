"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/lib/icons";

export function PageHeader({
  title,
  description,
  icon,
  actions,
}: {
  title: string;
  description?: string;
  icon?: IconName;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="size-10 rounded-xl bg-primary/10 text-primary grid place-items-center">
            <Icon name={icon} size={22} />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  className,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      <div className="size-16 rounded-2xl bg-muted grid place-items-center mb-4">
        <Icon name={icon} size={30} className="text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-base">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending_design: { label: "در حال طراحی", cls: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" },
    in_printing: { label: "در حال چاپ", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
    warehouse_logistics: { label: "انبار و لجستیک", cls: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300" },
    completed: { label: "پایان یافته", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
    archived: { label: "آرشیو", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
    cancelled: { label: "لغو شده", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
    todo: { label: "در صف", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
    in_progress: { label: "در حال انجام", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
    done: { label: "انجام شده", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
    awaiting: { label: "در انتظار تایید", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
    validated: { label: "تایید شده", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  };
  const s = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", s.cls, className)}>
      {s.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "urgent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
        <Icon name="alertTriangle" size={12} /> فوری
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      معمولی
    </span>
  );
}

export function LoadingState({ label = "در حال بارگذاری..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Icon name="loading" size={28} className="animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
