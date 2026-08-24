"use client";

import * as React from "react";
import { memo } from "react";
import { Icon } from "@/lib/icons";
import type { NavItem, ModuleKey } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * برگهٔ سایدبار (TreeLeaf) — نسخهٔ زیباسازی‌شدهٔ فاز ۶
 * ─────────────────────────────────────────────────────────────
 * آیتم نهایی (بدون زیرمنو) — لینک مستقیم به صفحه.
 *
 * قرارداد رفتاری (حفظ‌شده از فاز ۳، AC4):
 *   کلیک روی برگه → onNavigate(moduleKey, page) → باز شدن تب + رندر صفحه.
 *   هیچ کشویی در این سطح وجود ندارد.
 *
 * طراحی بصری (فاز ۶ — زیباسازی):
 *   - حالت فعال: پس‌زمینهٔ emerald ملایم (bg-primary/15) + متن primary
 *     + سایهٔ ظریف (shadow-sm shadow-primary/10) برای عمق.
 *   - نقطهٔ نشانه در انتهای ردیف فعال (size-1.5 rounded-full bg-primary).
 *   - حالت معمول: متن کم‌رنگ، hover با پس‌زمینهٔ accent.
 *   - آیکون در حالت فعال: text-primary، در غیر این‌صورت muted.
 *   - انیمیشن نرم ۲۰۰ms برای همهٔ تغییرات (transition-all duration-200).
 *   - aria-current="page" برای دسترسی‌پذیری صفحه‌خوان.
 *
 * React.memo: props پایدارند (item از NAV ثابت، onNavigate از Zustand
 * پایدار، isActive فقط برای برگهٔ فعال تغییر می‌کند).
 */
type TreeLeafProps = {
  item: NavItem;
  isActive: boolean;
  moduleKey: ModuleKey;
  onNavigate: (m: string, p: string) => void;
};

function TreeLeafImpl({ item, isActive, moduleKey, onNavigate }: TreeLeafProps) {
  return (
    <button
      onClick={() => onNavigate(moduleKey, item.page)}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group/leaf relative w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-all duration-200 ease-out",
        isActive
          ? "bg-primary/15 text-primary font-medium shadow-sm shadow-primary/10"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      )}
    >
      <Icon
        name={item.icon}
        size={15}
        className={cn(
          "shrink-0 transition-colors",
          isActive
            ? "text-primary"
            : "text-muted-foreground group-hover/leaf:text-sidebar-foreground"
        )}
      />
      <span className="flex-1 text-right truncate">{item.label}</span>
      {/* نشانهٔ فعال — نقطهٔ emerald در انتهای ردیف */}
      {isActive && (
        <span
          className="size-1.5 rounded-full bg-primary shrink-0"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

export const TreeLeaf = memo(TreeLeafImpl);
