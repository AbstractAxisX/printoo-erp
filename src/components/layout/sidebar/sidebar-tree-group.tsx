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
 * گروه سایدبار (TreeGroup) — نسخهٔ زیباسازی‌شدهٔ فاز ۶
 * ─────────────────────────────────────────────────────────────
 * کشوی سطح میانی — والد چند برگه است.
 *
 * قرارداد رفتاری (حفظ‌شده از فاز ۳):
 *   کلیک روی سرِ گروه → فقط toggle کشو (هیچ ناوبری نمی‌کند).
 *   کلیک روی برگه‌های زیرین → onNavigate (در TreeLeaf).
 *
 * همگام‌سازی با ماژول فعال (AC5 + AC6 از فاز ۳):
 *   وقتی ماژول فعال می‌شود، کشو خودکار باز می‌شود. اگر کاربر
 *   دستی ببندد، تا انتهای دورهٔ فعال بسته می‌ماند (useDrawerSync).
 *
 * طراحی بصری (فاز ۶):
 *   - سبک section-header: متن کوچک‌تر (text-[11px])، نیمه‌پر
 *     (font-semibold)، muted color.
 *   - چرون کوچک‌تر (size-12) با چرخش نرم روی باز شدن.
 *   - خط راهنمای عمودی ظریف‌تر (border-sidebar-border/60) برای
 *     نشانه‌گذاری سلسله‌مراتب.
 *   - hover فقط رنگ را تغییر می‌دهد (بدون پس‌زمینه) تا سبک
 *     section-header حفظ شود.
 *   - وقتی گروه حاوی برگهٔ فعال است، رنگ آن پررنگ‌تر می‌شود.
 *
 * React.memo: props پایدارند (گروه از NAV ثابت، currentModule/currentPage
 * فقط هنگام ناوبری تغییر می‌کند، onNavigate از Zustand پایدار است).
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
        {/* سرِ گروه — سبک section-header */}
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "group/sub flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors duration-200",
              hasActive && isCurrentModule
                ? "text-sidebar-foreground"
                : "text-muted-foreground/70 hover:text-sidebar-foreground"
            )}
          >
            <Icon
              name={group.icon}
              size={13}
              className={cn(
                "shrink-0 transition-colors",
                hasActive && isCurrentModule
                  ? "text-primary"
                  : "text-muted-foreground/60 group-hover/sub:text-sidebar-foreground"
              )}
            />
            <span className="flex-1 text-right">{group.label}</span>
            {/* چرخش چرون از data-state ریشه‌ای (بدون جاوااسکریپت) */}
            <Icon
              name="chevronLeft"
              size={12}
              className="text-muted-foreground/50 transition-transform duration-200 group-data-[state=open]/collapsible-sub:rotate-90"
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {/* خط راهنمای عمودی ظریف برای نشانه‌گذاری سلسله‌مراتب زیرمنوها */}
          <div className="mt-1 space-y-0.5 pr-3 border-r border-sidebar-border/60 mr-1.5">
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
