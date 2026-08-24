"use client";

import * as React from "react";
import { memo } from "react";
import { SidebarMenuSubItem } from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/lib/icons";
import type { NavGroup, ModuleKey } from "@/lib/nav";
import { useDrawerSync } from "@/lib/use-drawer-sync";
import { TreeLeaf } from "./sidebar-tree-leaf";
import { cn } from "@/lib/utils";

/**
 * گروه سایدبار (TreeGroup)
 * ─────────────────────────────────────────────────────────────
 * کشوی سطح میانی — والد چند برگه است.
 *
 * قرارداد رفتاری:
 *   کلیک روی سرِ گروه → فقط toggle کشو (هیچ ناوبری نمی‌کند).
 *   کلیک روی برگه‌های زیرین → onNavigate (در TreeLeaf).
 *
 * همگام‌سازی با ماژول فعال (AC5 + AC6):
 *   وقتی ماژولِ این گروه فعال می‌شود، کشو خودکار باز می‌شود
 *   تا کاربر ببیند کجاست. اگر کاربر دستی ببندد، تا انتهای دورهٔ
 *   فعال بسته می‌ماند. این رفتار را هوک useDrawerSync تأمین می‌کند.
 *
 * چرخش چرون: از data-state ریشه‌ای (Radix) با CSS — بدون جاوااسکریپت،
 * بدون دوقطعی. گروه نام‌گذاری‌شده (group/collapsible-sub) برای
 * تمرکزگردانی CSS روی این نمونهٔ خاص.
 *
 * React.memo: props شامل group (ثابت از NAV)، currentModule/currentPage
 * (تغییر فقط هنگام ناوبری به ماژول دیگر)، moduleKey (ثابت)،
 * onNavigate (پایدار از Zustand). memo از ریرندر غیرضروری جلوگیری می‌کند.
 */
type TreeGroupProps = {
  group: NavGroup;
  currentModule: string;
  currentPage: string;
  moduleKey: ModuleKey;
  onNavigate: (m: string, p: string) => void;
};

function TreeGroupImpl({
  group,
  currentModule,
  currentPage,
  moduleKey,
  onNavigate,
}: TreeGroupProps) {
  const isCurrentModule = currentModule === moduleKey;
  const hasActive = group.items.some((i) => i.page === currentPage);

  // قرارداد همگام‌ساز: فعال → خودکار باز، بستن دستی حفظ می‌شود
  const { open, setOpen } = useDrawerSync({ active: isCurrentModule });

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      asChild
      className="group/collapsible-sub"
    >
      <SidebarMenuSubItem>
        {/* سرِ گروه: فقط trigger ریشه‌ای — هیچ onClick ناوبری ندارد */}
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
            {/* چرخش چرون از data-state ریشه‌ای (بدون جاوااسکریپت) */}
            <Icon
              name="chevronLeft"
              size={12}
              className="text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible-sub:rotate-90"
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {/* خط عمودی راست برای نشانه‌گذاری بصری سلسله‌مراتبی زیرمنوها */}
          <div className="mt-0.5 space-y-0.5 pr-2 border-r border-sidebar-border mr-2">
            {group.items.map((item) => (
              <TreeLeaf
                key={item.id}
                item={item}
                isActive={isCurrentModule && item.page === currentPage}
                moduleKey={moduleKey}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </CollapsibleContent>
      </SidebarMenuSubItem>
    </Collapsible>
  );
}

export const TreeGroup = memo(TreeGroupImpl);
