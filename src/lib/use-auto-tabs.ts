"use client";

import { useEffect } from "react";
import { useAppStore, type Tab } from "@/stores/app-store";
import { findModule, HIDDEN_PAGES } from "@/lib/nav";

/**
 * Auto-opens a tab whenever the active page changes.
 * Attach this at the AppShell level.
 */
export function useAutoTabs() {
  const moduleKey = useAppStore((s) => s.module);
  const page = useAppStore((s) => s.page);
  const openTab = useAppStore((s) => s.openTab);
  const tabs = useAppStore((s) => s.tabs);

  useEffect(() => {
    const mod = findModule(moduleKey);
    let label = page;
    let icon = "dashboard";
    // Phase 13: صفحات مخفی (مانیتورینگ کاربر / پروفایل) — از HIDDEN_PAGES
    const hidden = HIDDEN_PAGES[`${moduleKey}:${page}`];
    if (hidden) {
      label = hidden.label;
      icon = hidden.icon;
    } else {
      for (const g of mod.groups) {
        const item = g.items.find((i) => i.page === page);
        if (item) {
          label = item.label;
          icon = item.icon;
          break;
        }
      }
    }
    const tab: Tab = { id: `${moduleKey}:${page}`, module: moduleKey, page, label, icon };
    const exists = tabs.find((t) => t.id === tab.id);
    if (!exists) {
      openTab(tab);
    }
  }, [moduleKey, page, openTab, tabs]);
}
