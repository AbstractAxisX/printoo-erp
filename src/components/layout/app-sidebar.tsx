"use client";

import * as React from "react";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  SidebarRail, useSidebar,
} from "@/components/ui/sidebar";
import { Icon, type IconName } from "@/lib/icons";
import { NAV, findModule, type ModuleKey } from "@/lib/nav";
import { COMPANY } from "@/lib/constants";
import { useAppStore } from "@/stores/app-store";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const moduleKey = useAppStore((s) => s.module) as ModuleKey;
  const page = useAppStore((s) => s.page);
  const navigate = useAppStore((s) => s.navigate);
  const mod = findModule(moduleKey);

  return (
    <Sidebar collapsible="icon" className="border-l">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="size-9 rounded-xl bg-primary text-primary-foreground grid place-items-center shrink-0">
            <Icon name="print" size={20} />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="font-bold text-sm leading-tight truncate">{COMPANY.name}</div>
            <div className="text-[11px] text-muted-foreground truncate">{mod.faLabel}</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin">
        {/* Module switcher */}
        <div className="px-2 py-2 group-data-[collapsible=icon]:hidden">
          <div className="grid grid-cols-4 gap-1">
            {NAV.map((m) => {
              const active = m.key === moduleKey;
              return (
                <button
                  key={m.key}
                  onClick={() => navigate(m.key, m.groups[0]?.items[0]?.page ?? "dashboard")}
                  title={m.faLabel}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] transition",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon name={m.icon} size={18} />
                  <span className="truncate w-full text-center">{m.faLabel.split(" ")[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {mod.groups.map((group) => (
          <SidebarGroup key={group.id}>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
              <Icon name={group.icon} size={14} className="ml-1" />
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = page === item.page;
                if (item.id === item.page) {
                  // simple leaf
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={active}
                        onClick={() => navigate(moduleKey, item.page)}
                        tooltip={item.label}
                      >
                        <Icon name={item.icon} size={18} />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }
                // collapsible with single child (acts as group + leaf)
                return (
                  <Collapsible key={item.id} asChild defaultOpen={active} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton isActive={active} tooltip={item.label} onClick={() => navigate(moduleKey, item.page)}>
                          <Icon name={item.icon} size={18} />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="تنظیمات">
              <Icon name="settings" size={18} />
              <span>تنظیمات</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

// re-export for layout
export { useSidebar };
export type { IconName };
