"use client";

// Printoo24 ERP — DetailDrawer (فاز ۲۰) — الگوی مشترک «نمای جزئیات»
// ─────────────────────────────────────────────────────────────────
// همهٔ نماهای جزئیات (به‌جز مودال جزئیات سفارش) از این دراور استفاده
// می‌کنند — مرجع: دراور ۳۶۰ درجهٔ CRM («خوشگل‌تر و تمیزتر و مینیمال‌تر»):
//   • دسکتاپ (≥768px): Sheet side="left" — تمام‌ارتفاع، لغزان از چپِ
//     صفحه (لنگر فیزیکی left-0 — در RTL هم سمت چپ می‌ماند)، عرض
//     widthClass (پیش‌فرض sm:max-w-xl).
//   • موبایل (<768px): Sheet side="bottom" — بات‌شیت با گوشه‌های گردِ
//     بالا (rounded-t-3xl)، دستگیرهٔ کشیدن وسط، سقف 92dvh و padding
//     ناحیهٔ امن پایین گوشی.
// سربرگ: کاشی آیکون اختیاری + عنوان بولد + توضیح ریز + دکمهٔ بستن.
// دکمهٔ بستنِ داخلی SheetContent در گوشهٔ بالا-راست می‌نشیند و سربرگ
// با pr-12 جایش را باز می‌کند. بدنه: flex-1 با اسکرول داخلی — فرزندان
// padding خودشان را می‌آورند (الگوی px-5 py-4 برای سکشن‌ها).

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";

export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  icon,
  iconClassName,
  widthClass,
  children,
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** عنوان سربرگ (font-bold) */
  title: string;
  /** توضیح یک‌خطی زیر عنوان (text-xs text-muted-foreground) */
  description?: string;
  /** آیکون کاشی سربرگ */
  icon?: IconName;
  /** کلاس رنگ کاشی آیکون (پیش‌فرض: bg-primary/10 text-primary) */
  iconClassName?: string;
  /** عرض درور در دسکتاپ — فقط حالت چپ (پیش‌فرض sm:max-w-xl) */
  widthClass?: string;
  children: React.ReactNode;
  /** کلاس اضافهٔ SheetContent (مثلاً برای سقف ارتفاع دلخواه) */
  contentClassName?: string;
}) {
  const isMobile = useIsMobile();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "left"}
        // وقتی description نیست، لینک اتوماتیک aria-describedby حذف می‌شود
        // تا هشدار Radix («Missing Description…») در کنسول نیاید.
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "gap-0",
          isMobile
            ? "rounded-t-3xl max-h-[92dvh] overflow-hidden pb-[env(safe-area-inset-bottom)]"
            : widthClass ?? "sm:max-w-xl",
          contentClassName
        )}
      >
        {/* دستگیرهٔ کشیدن — فقط بات‌شیت موبایل */}
        {isMobile && (
          <div
            className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border"
            aria-hidden="true"
          />
        )}

        {/* سربرگ: کاشی آیکون + عنوان + توضیح (+ بستن داخلی SheetContent) */}
        <div className="flex shrink-0 items-center gap-3 border-b px-5 py-4 pr-12">
          {icon && (
            <div
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary",
                iconClassName
              )}
            >
              <Icon name={icon} size={17} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-base font-bold">
              {title}
            </SheetTitle>
            {description ? (
              <SheetDescription className="text-xs">
                {description}
              </SheetDescription>
            ) : null}
          </div>
        </div>

        {/* بدنهٔ اسکرول‌شونده — فرزندان padding خودشان را دارند */}
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
