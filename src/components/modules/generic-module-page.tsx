"use client";

import * as React from "react";
import { PageHeader, EmptyState } from "@/components/shared";
import { findModule } from "@/lib/nav";
import { Icon, type IconName } from "@/lib/icons";
import { useAppStore } from "@/stores/app-store";

export function GenericModulePage({ moduleKey, page }: { moduleKey: string; page: string }) {
  const navigate = useAppStore((s) => s.navigate);
  const mod = findModule(moduleKey);
  let title = page;
  let icon: IconName = "dashboard";
  for (const g of mod.groups) {
    const item = g.items.find((i) => i.page === page);
    if (item) { title = item.label; icon = item.icon; break; }
  }

  return (
    <div>
      <PageHeader title={`${mod.faLabel} — ${title}`} description="این ماژول در حال توسعه است." icon={icon} />
      <div className="rounded-2xl border bg-card p-8">
        <EmptyState
          icon={icon}
          title={`به ماژول ${mod.faLabel} خوش آمدید`}
          description="این ماژول به‌زودی با جزئیات کامل فعال خواهد شد. فعلاً می‌توانید به ماژول ادمین بازگردید و سفارش‌ها را مدیریت کنید."
          action={
            <button
              onClick={() => navigate("admin", "dashboard")}
              className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm hover:bg-primary/90"
            >
              <Icon name="dashboard" size={16} /> رفتن به داشبورد ادمین
            </button>
          }
        />
      </div>
    </div>
  );
}
