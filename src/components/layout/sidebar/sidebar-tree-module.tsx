"use client";

import * as React from "react";
import { memo } from "react";
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon, type IconName } from "@/lib/icons";
import type { NavGroup, ModuleKey } from "@/lib/nav";
import { useDrawerSync } from "@/lib/use-drawer-sync";
import { TreeGroup } from "./sidebar-tree-group";

/**
 * ماژول سایدبار (TreeModule)
 * ─────────────────────────────────────────────────────────────
 * کشوی سطح بالا — والد چند گروه است. این المان محل رفع باگ اصلی است.
 *
 * ⚠️ باگ قبلی (تا قبل از فاز ۳b):
 *   والد دارای onClick بود که onNavigate(moduleKey, "dashboard")
 *   را فراخوانی می‌کرد → کلیک روی نام ماژول، داشبورد را لود می‌کرد
 *   به‌جای باز شدن زیرمنوها. همچنین چرون یک onClick جداگانه داشت که
 *   با toggle خودکار Radix تداخل می‌کرد → رفتار غیرقابل پیش‌بینی.
 *
 * راه‌حل (AC1, AC2, AC3):
 *   - حذف کامل onClick از دکمهٔ والد.
 *   - استفادهٔ خالص از CollapsibleTrigger ریشه‌ای (auto-toggle).
 *   - چرخش چرون از data-state ریشه‌ای با CSS (group-data-[state=open]).
 *   - مدیریت وضعیت با هوک useDrawerSync (باز شدن خودکار وقتی فعال).
 *
 * قرارداد نهایی:
 *   کلیک روی سرِ ماژول (آیکون/برچسب/چرون/فضای خالی) → فقط toggle کشو.
 *   هیچ ناوبری در این سطح انجام نمی‌شود.
 *   ناوبری فقط در سطح برگه (TreeLeaf) رخ می‌دهد.
 *
 * React.memo: props شامل moduleKey/label/icon/groups (همگی ثابت از NAV)،
 * active (boolean — فقط برای ۲ ماژول در هر ناوبری تغییر می‌کند)،
 * currentModule/currentPage (برای ارسال به TreeGroup)، onNavigate (پایدار).
 * memo از ریرندر ۵ ماژول غیرفعال جلوگیری می‌کند.
 */
type TreeModuleProps = {
  moduleKey: ModuleKey;
  label: string;
  icon: IconName;
  groups: NavGroup[];
  active: boolean;
  currentModule: string;
  currentPage: string;
  onNavigate: (m: string, p: string) => void;
};

function TreeModuleImpl({
  moduleKey,
  label,
  icon,
  groups,
  active,
  currentModule,
  currentPage,
  onNavigate,
}: TreeModuleProps) {
  // قرارداد همگام‌ساز: فعال → خودکار باز، بستن دستی حفظ می‌شود
  const { open, setOpen } = useDrawerSync({ active });

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      asChild
      className="group/collapsible"
    >
      <SidebarMenuItem>
        {/* والد: فقط trigger ریشه‌ای — هیچ onClick ناوبری ندارد */}
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={active} tooltip={label}>
            <Icon name={icon} size={18} />
            <span>{label}</span>
            {/* چرخش چرون از data-state ریشه‌ای (بدون جاوااسکریپت) */}
            <Icon
              name="chevronLeft"
              size={14}
              className="ml-auto text-muted-foreground transition-transform duration-200 group-data-[collapsible=icon]:hidden group-data-[state=open]/collapsible:rotate-90"
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

export const TreeModule = memo(TreeModuleImpl);
