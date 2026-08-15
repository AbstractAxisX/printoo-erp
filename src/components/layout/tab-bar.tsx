"use client";

import * as React from "react";
import { useAppStore } from "@/stores/app-store";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { findModule } from "@/lib/nav";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

export function TabBar() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const switchTab = useAppStore((s) => s.switchTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const tabbarCollapsed = useAppStore((s) => s.tabbarCollapsed);
  const toggleTabbar = useAppStore((s) => s.toggleTabbar);
  const headerCollapsed = useAppStore((s) => s.headerCollapsed);

  if (headerCollapsed) return null;
  if (tabs.length === 0 && !tabbarCollapsed) return null;

  if (tabbarCollapsed) {
    return (
      <div className="flex items-center gap-1 px-3 h-7 border-b bg-muted/30">
        <button onClick={toggleTabbar} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" title="نمایش نوار تب‌ها">
          <Icon name="chevronDown" size={12} /> {tabs.length} تب باز
        </button>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex items-stretch h-9 border-b bg-muted/20">
        {/* Scrollable tab list */}
        <div className="flex items-stretch gap-0.5 px-1.5 flex-1 min-w-0 overflow-x-auto scrollbar-thin scrollbar-thin::-webkit-scrollbar">
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            const mod = findModule(tab.module);
            return (
              <Tooltip key={tab.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => switchTab(tab.id)}
                    className={cn(
                      "group relative flex items-center gap-1.5 px-3 py-1.5 text-xs transition-all rounded-t-md border border-transparent shrink-0 max-w-[180px]",
                      active
                        ? "bg-background text-foreground border-border border-b-background shadow-sm"
                        : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                    )}
                  >
                    <Icon name={tab.icon as "dashboard"} size={13} className={active ? "text-primary" : "text-muted-foreground shrink-0"} />
                    <span className="truncate max-w-[100px]">{tab.label}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); closeTab(tab.id); } }}
                      className="ml-1 p-0.5 rounded hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/60 opacity-0 group-hover:opacity-100 transition shrink-0"
                      title="بستن تب"
                    >
                      <Icon name="cancel" size={11} />
                    </span>
                    {active && <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <Icon name={tab.icon as "dashboard"} size={12} />
                    <span className="font-medium">{tab.label}</span>
                    <span className="text-muted-foreground">— {mod.faLabel}</span>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="flex items-center gap-0.5 px-1.5 border-r shrink-0">
          <button
            onClick={toggleTabbar}
            className="size-6 rounded grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent transition"
            title="جمع کردن نوار تب‌ها"
          >
            <Icon name="chevronUp" size={13} />
          </button>
        </div>
      </div>
    </TooltipProvider>
  );
}
