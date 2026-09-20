"use client";

import * as React from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/sidebar/app-sidebar";
import { Header } from "@/components/layout/header";
import { TabBar } from "@/components/layout/tab-bar";
import { CommandPalette } from "@/components/layout/command-palette";
import { ModuleRouter } from "@/components/module-router";
import { GuideTooltips } from "@/components/shared/guide-tooltips";
import { useAutoTabs } from "@/lib/use-auto-tabs";
import { useCrossTabSync } from "@/lib/cross-tab";
import { useHeartbeat } from "@/lib/use-heartbeat";
import { useAppStore } from "@/stores/app-store";

export function AppShell() {
  useAutoTabs();
  useCrossTabSync();
  useHeartbeat(); // Phase 12: نبض حضور — هر 45ث وقتی tab مرئی است
  const headerCollapsed = useAppStore((s) => s.headerCollapsed);
  const toggleHeader = useAppStore((s) => s.toggleHeader);
  const isDemo = useAppStore((s) => !!s.user?.isDemo);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {!headerCollapsed && <Header />}
        <TabBar />
        {/* دکمهٔ bookmark: جمع/نمایش هدر — فقط با CSS (بدون جاوااسکریپت اینلاین)
            فاز 4: حذف style={{ opacity }} + onMouseEnter/Leave که رفتار ناهماهنگ
            داشت (inline style بر Tailwind غلبه می‌کرد). حالا با کلاس‌های Tailwind
            مدیریت می‌شود: 30٪ پیش‌فرض (محو)، 100٪ هنگام hover/focus-visible.
            فاز 6: گرادیانت emerald + شکل bookmark ظریف‌تر (rounded-b-xl). */}
        <button
          onClick={toggleHeader}
          aria-label={headerCollapsed ? "نمایش هدر" : "جمع کردن هدر"}
          title={headerCollapsed ? "نمایش هدر" : "جمع کردن هدر"}
          className="fixed top-0 left-1/2 -translate-x-1/2 z-50 h-6 px-4 rounded-b-xl bg-gradient-to-r from-primary to-emerald-700 text-primary-foreground text-[10px] font-medium flex items-center gap-1 shadow-md shadow-primary/20 transition-all duration-200 opacity-30 hover:opacity-100 hover:shadow-lg hover:shadow-primary/30 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* پیکان فقط تزئینی است — معنا از aria-label دکمه می‌آید */}
          <span className="text-[10px]" aria-hidden="true">
            {headerCollapsed ? "▼" : "▲"}
          </span>
        </button>
        <main className="flex-1 p-4 sm:p-6 min-w-0">
          {/* Phase 23: بنر حالت دمو — همیشه جلوی چشم تا مبهم نباشد */}
          {isDemo && (
            <div className="mb-4 rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-gradient-to-l from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 px-4 py-3 flex items-center gap-3 shadow-sm">
              <span className="size-9 rounded-xl bg-amber-400/20 text-amber-600 dark:text-amber-400 grid place-items-center shrink-0 text-lg" aria-hidden="true">
                👁
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-amber-800 dark:text-amber-300">
                  حالت دمو — فقط مشاهده
                </div>
                <div className="text-xs text-amber-700/80 dark:text-amber-400/70">
                  همهٔ ماژول‌ها را می‌بینید اما امکان ثبت، ویرایش یا حذف داده وجود ندارد.
                </div>
              </div>
            </div>
          )}
          <ModuleRouter />
        </main>
      </SidebarInset>
      <CommandPalette />
      <GuideTooltips />
    </SidebarProvider>
  );
}
