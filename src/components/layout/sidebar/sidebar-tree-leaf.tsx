"use client";

import * as React from "react";
import { memo } from "react";
import { SidebarMenuSubButton } from "@/components/ui/sidebar";
import { Icon } from "@/lib/icons";
import type { NavItem, ModuleKey } from "@/lib/nav";

/**
 * برگهٔ سایدبار (TreeLeaf)
 * ─────────────────────────────────────────────────────────────
 * آیتم نهایی (بدون زیرمنو) — این المان تنها لینک مستقیم است.
 *
 * قرارداد رفتاری (AC4):
 *   کلیک روی برگه → onNavigate(moduleKey, page) → باز شدن تب + رندر صفحه.
 *   هیچ کشویی در این سطح وجود ندارد (والد در TreeGroup از نوع کشویی است).
 *
 * React.memo: چون props آن (item, isActive, moduleKey, onNavigate) همگی
 * پایدارند (item از NAV ثابت است، onNavigate از Zustand پایدار است،
 * isActive فقط برای برگهٔ فعال تغییر می‌کند)، memo به‌طور مؤثری از
 * ریرندر اضافی جلوگیری می‌کند.
 */
type TreeLeafProps = {
  item: NavItem;
  isActive: boolean;
  moduleKey: ModuleKey;
  onNavigate: (m: string, p: string) => void;
};

function TreeLeafImpl({ item, isActive, moduleKey, onNavigate }: TreeLeafProps) {
  return (
    <SidebarMenuSubButton asChild isActive={isActive}>
      <button
        onClick={() => onNavigate(moduleKey, item.page)}
        className="text-xs w-full flex items-center gap-1.5"
      >
        <Icon name={item.icon} size={13} className="shrink-0" />
        <span>{item.label}</span>
      </button>
    </SidebarMenuSubButton>
  );
}

export const TreeLeaf = memo(TreeLeafImpl);
