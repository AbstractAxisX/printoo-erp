"use client";

import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Icon } from "@/lib/icons";
import { NAV, findModule, type ModuleKey } from "@/lib/nav";
import { COMPANY } from "@/lib/constants";
import { useAppStore } from "@/stores/app-store";
import { TreeModule } from "./sidebar-tree-module";
import { SidebarUserFooter } from "./sidebar-user-footer";

/**
 * پوستهٔ سایدبار (AppSidebar) — نسخهٔ زیباسازی‌شدهٔ فاز ۶
 * ─────────────────────────────────────────────────────────────
 * اسکلت اصلی سایدبار ERP: هدر (لوگو + نام ماژول فعّال) + محتوای
 * ناوبری (TreeModule برای هر ماژول) + پاص (SidebarUserFooter).
 *
 * این کامپوننت فقط «presentation + event capture» است — هیچ
 * منطق رفتاری در آن نیست. تمام منطق کشوها در useDrawerSync و
 * TreeModule/TreeGroup کپسوله شده است (اصل اتمیک: هر کامپوننت
 * یک دغدغه).
 *
 * طراحی بصری (فاز ۶):
 *   - هدر با لوگوی گرادیانت emerald + سایهٔ ظریف.
 *   - مرز پایین هدر برای جداسازی بصری از محتوا.
 *   - پاص با کامپوننت SidebarUserFooter زیباسازی‌شده.
 *
 * وابستگی یک‌جهته: ui → logic → state
 *   - این کامپوننت از Zustand (state) مقدار module/page/navigate را
 *     می‌خواند و به TreeModule پاس می‌دهد.
 *   - TreeModule از useDrawerSync (logic) برای مدیریت وضعیت کشو استفاده
 *     می‌کند.
 *   - هیچ وارونگی وجود ندارد.
 */
export function AppSidebar() {
  const moduleKey = useAppStore((s) => s.module) as ModuleKey;
  const page = useAppStore((s) => s.page);
  const navigate = useAppStore((s) => s.navigate);
  const mod = findModule(moduleKey);

  return (
    <Sidebar collapsible="icon" side="right" className="border-l">
      <SidebarHeader className="border-b border-sidebar-border/60 px-3 py-3">
        <div className="flex items-center gap-2.5">
          {/* لوگو با گرادیانت emerald + سایهٔ ظریف */}
          <div className="size-9 rounded-xl bg-gradient-to-br from-primary to-emerald-700 text-primary-foreground grid place-items-center shrink-0 shadow-sm shadow-primary/20">
            <Icon name="print" size={20} />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="font-bold text-sm leading-tight truncate">
              {COMPANY.name}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {mod.faLabel}
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin">
        {/* درخت ناوبری: هر ماژول یک TreeModule (کشوی سطح بالا) */}
        <SidebarGroup className="px-1">
          <SidebarMenu>
            {NAV.map((m) => {
              const isActiveModule = m.key === moduleKey;
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
                />
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarUserFooter />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
