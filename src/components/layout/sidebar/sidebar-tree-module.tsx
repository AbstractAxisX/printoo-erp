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
import { cn } from "@/lib/utils";

/**
 * ماژول سایدبار (TreeModule) — نسخهٔ زیباسازی‌شدهٔ فاز ۶
 * ─────────────────────────────────────────────────────────────
 * کشوی سطح بالا — والد چند گروه است.
 *
 * قرارداد رفتاری (حفظ‌شده از فاز ۳، AC1/AC2/AC3):
 *   کلیک روی سرِ ماژول (آیکون/برچسب/چرون/فضای خالی) → فقط toggle کشو.
 *   هیچ ناوبری در این سطح انجام نمی‌شود (حذف onClick navigate از فاز ۳).
 *   ناوبری فقط در سطح برگه (TreeLeaf) رخ می‌دهد.
 *
 * همگام‌سازی با ماژول فعال (AC5 + AC6 از فاز ۳):
 *   وقتی ماژول فعال می‌شود، کشو خودکار باز می‌شود. اگر کاربر
 *   دستی ببندد، تا انتهای دورهٔ فعال بسته می‌ماند (useDrawerSync).
 *
 * طراحی بصری (فاز ۶ — زیباسازی):
 *   - ردیف بزرگ‌تر (h-11) با gap و padding سخاوتمندانه.
 *   - حالت فعال: پس‌زمینهٔ emerald ملایم (bg-primary/10) + متن primary
 *     + font-semibold برای تأکید.
 *   - hover (غیرفعال): پس‌زمینهٔ accent نیمه‌شفاف.
 *   - چرون با چرخش نرم ۲۰۰ms روی باز شدن (data-state-driven، بدون JS).
 *   - انیمیشن transition-all برای همهٔ تغییرات.
 *
 * React.memo: props شامل moduleKey/label/icon/groups (ثابت از NAV)،
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
        {/* والد: فقط trigger ریشه‌ای — هیچ onClick ناوبری ندارد (AC1/AC2) */}
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            isActive={active}
            tooltip={label}
            size="lg"
            className={cn(
              "h-11 gap-3 px-3 rounded-xl font-medium transition-all duration-200 ease-out",
              "hover:bg-sidebar-accent/50",
              // بازنویسی حالت فعال پیش‌فرض با emerald (به‌جای sidebar-accent)
              "data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold data-[active=true]:hover:bg-primary/15",
            )}
          >
            <Icon name={icon} size={18} className="shrink-0 transition-colors" />
            <span className="text-sm truncate group-data-[collapsible=icon]:hidden">
              {label}
            </span>
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
