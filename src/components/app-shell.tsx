"use client";

import * as React from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/sidebar/app-sidebar";
import { Header } from "@/components/layout/header";
import { TabBar } from "@/components/layout/tab-bar";
import { CommandPalette } from "@/components/layout/command-palette";
import { ModuleRouter } from "@/components/module-router";
import { useAutoTabs } from "@/lib/use-auto-tabs";
import { useCrossTabSync } from "@/lib/cross-tab";
import { useAppStore } from "@/stores/app-store";

export function AppShell() {
  useAutoTabs();
  useCrossTabSync();
  const headerCollapsed = useAppStore((s) => s.headerCollapsed);
  const toggleHeader = useAppStore((s) => s.toggleHeader);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {!headerCollapsed && <Header />}
        <TabBar />
        {/* دکمهٔ bookmark: جمع/نمایش هدر — فقط با CSS (بدون جاوااسکریپت اینلاین)
            فاز ۴: حذف style={{ opacity }} + onMouseEnter/Leave که رفتار ناهماهنگ
            داشت (inline style بر Tailwind غلبه می‌کرد). حالا با کلاس‌های Tailwind
            مدیریت می‌شود: ۲۰٪ پیش‌فرض (محو)، ۱۰۰٪ هنگام hover/focus-visible. */}
        <button
          onClick={toggleHeader}
          aria-label={headerCollapsed ? "نمایش هدر" : "جمع کردن هدر"}
          title={headerCollapsed ? "نمایش هدر" : "جمع کردن هدر"}
          className="fixed top-0 left-1/2 -translate-x-1/2 z-50 h-5 px-3 rounded-b-md bg-primary text-primary-foreground text-[10px] flex items-center gap-1 shadow-md hover:bg-primary/90 transition-opacity duration-200 opacity-20 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* پیکان فقط تزئینی است — معنا از aria-label دکمه می‌آید */}
          <span className="text-[10px]" aria-hidden="true">
            {headerCollapsed ? "▼" : "▲"}
          </span>
        </button>
        <main className="flex-1 p-4 sm:p-6 min-w-0">
          <ModuleRouter />
        </main>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  );
}
