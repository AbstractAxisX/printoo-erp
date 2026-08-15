"use client";

import * as React from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
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
        {/* Collapse/expand floating button (bookmark-style) */}
        <button
          onClick={toggleHeader}
          className="fixed top-0 left-1/2 -translate-x-1/2 z-50 h-5 px-3 rounded-b-md bg-primary text-primary-foreground text-[10px] flex items-center gap-1 shadow-md hover:bg-primary/90 transition opacity-0 hover:opacity-100 focus:opacity-100"
          title={headerCollapsed ? "نمایش هدر" : "جمع کردن هدر"}
          style={{ opacity: 0.15 }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.15")}
        >
          <span className="text-[10px]">{headerCollapsed ? "▼" : "▲"}</span>
        </button>
        <main className="flex-1 p-4 sm:p-6 min-w-0">
          <ModuleRouter />
        </main>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  );
}
