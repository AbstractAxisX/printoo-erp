"use client";

import * as React from "react";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarGroup,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Icon, type IconName } from "@/lib/icons";
import { NAV, findModule, type ModuleKey, type NavGroup } from "@/lib/nav";
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
    <Sidebar collapsible="icon" side="right" className="border-l">
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
        {/* Tree navigation */}
        <SidebarGroup className="px-1">
          <SidebarMenu>
            {NAV.map((m) => {
              const isActiveModule = m.key === moduleKey;
              const isCurrent = m.key === moduleKey;
              return (
                <TreeModule
                  key={m.key}
                  moduleKey={m.key as ModuleKey}
                  label={m.faLabel}
                  icon={m.icon}
                  groups={m.groups}
                  active={isActiveModule}
                  currentModule={moduleKey}
                  currentPage={page}
                  onNavigate={navigate}
                  defaultOpen={isCurrent}
                />
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
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

// ─── Tree Module (top-level collapsible) ────────────────────
function TreeModule({
  moduleKey, label, icon, groups, active, currentModule, currentPage, onNavigate, defaultOpen,
}: {
  moduleKey: ModuleKey;
  label: string;
  icon: IconName;
  groups: NavGroup[];
  active: boolean;
  currentModule: string;
  currentPage: string;
  onNavigate: (m: string, p: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  React.useEffect(() => { if (active && !open) setOpen(true); }, [active]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            isActive={active}
            tooltip={label}
            onClick={() => {
              onNavigate(moduleKey, groups[0]?.items[0]?.page ?? "dashboard");
              if (!open) setOpen(true);
            }}
          >
            <Icon name={icon} size={18} />
            <span>{label}</span>
            <Icon
              name={open ? "chevronDown" : "chevronLeft"}
              size={14}
              className="ml-auto text-muted-foreground group-data-[collapsible=icon]:hidden transition-transform"
              onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>

        {groups.length > 0 && (
          <CollapsibleContent>
            <SidebarMenuSub className="group-data-[collapsible=icon]:hidden">
              {groups.map((g) => (
                <TreeGroup
                  key={g.id}
                  group={g}
                  currentModule={currentModule}
                  currentPage={currentPage}
                  moduleKey={moduleKey}
                  onNavigate={onNavigate}
                />
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        )}
      </SidebarMenuItem>
    </Collapsible>
  );
}

// ─── Tree Group (second-level collapsible with leaf items) ──
function TreeGroup({
  group, currentModule, currentPage, moduleKey, onNavigate,
}: {
  group: NavGroup;
  currentModule: string;
  currentPage: string;
  moduleKey: ModuleKey;
  onNavigate: (m: string, p: string) => void;
}) {
  const isCurrentModule = currentModule === moduleKey;
  const hasActive = group.items.some((i) => i.page === currentPage);
  const [open, setOpen] = React.useState(isCurrentModule && hasActive);
  React.useEffect(() => { if (isCurrentModule && hasActive) setOpen(true); }, [isCurrentModule, hasActive]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <SidebarMenuSubItem>
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition",
              hasActive && isCurrentModule
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <Icon name={group.icon} size={14} className="shrink-0" />
            <span className="flex-1 text-right">{group.label}</span>
            <Icon
              name={open ? "chevronDown" : "chevronLeft"}
              size={12}
              className="text-muted-foreground transition-transform"
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-0.5 space-y-0.5 pr-2 border-r border-sidebar-border mr-2">
            {group.items.map((item) => {
              const isActive = isCurrentModule && item.page === currentPage;
              return (
                <SidebarMenuSubButton
                  key={item.id}
                  isActive={isActive}
                  onClick={() => onNavigate(moduleKey, item.page)}
                  className="text-xs"
                >
                  <Icon name={item.icon} size={13} className="shrink-0" />
                  <span>{item.label}</span>
                </SidebarMenuSubButton>
              );
            })}
          </div>
        </CollapsibleContent>
      </SidebarMenuSubItem>
    </Collapsible>
  );
}
