"use client";

// Printoo24 ERP — Field (برچسب روی حاشیهٔ بالا-راست)
//
// الگوی «notch label»: نام فیلد روی خط حاشیهٔ بالای اینپوت می‌نشیند
// (سمت راست — RTL)، پس‌زمینه‌اش لبه را «می‌بُرد» تا خوانا بماند.
// الهام از نمونهٔ کاربر (فیلدهای ورود) — اما بدون انیمیشن جابه‌جایی
// لیبل داخل باکس؛ برچسب همیشه روی مرز بالا ثابت است:
//
//   ┌─────────────────────●──────────┐
//   │              نام مشتری         │   ← لیبل روی مرز، سمت راست
//   │  [مقدار اینپوت ... ]           │
//   └────────────────────────────────┘
//
// فواید نسبت به لیبل بالای اینپوت:
//  - همیشه مشخص است هر باکس برای چیست (بدون نیاز به placeholder)
//  - فشرده‌تر — فضای عمودی کمتری نسبت به Label+Input جدا مصرف می‌کند
//  - حالت فوکوس: لیبل و حلقهٔ فوکوس رنگ primary می‌گیرند
//
// استفاده:
//   <Field label="نام مشتری" required>
//     <Input value={...} onChange={...} />
//   </Field>
//
//   <Field label="توضیحات">
//     <Textarea rows={3} ... />
//   </Field>
//
// نکته: فرزند باید عرض کامل داشته باشد (w-full — پیش‌فرض Input/Textarea).
// اگر فیلد روی سطح رنگی غیر از پس‌زمینهٔ صفحه است (مثلاً روی Card با
// رنگ متفاوت) می‌توانید labelClassName="bg-card" بدهید.

import * as React from "react";
import { cn } from "@/lib/utils";

type FieldProps = {
  /** متن برچسب — روی حاشیهٔ بالا سمت راست می‌نشیند */
  label: string;
  /** ستارهٔ قرمز «الزامی» بعد از برچسب */
  required?: boolean;
  /** متن کمکی زیر فیلد */
  hint?: React.ReactNode;
  /** کلاس اضافی برای wrapper */
  className?: string;
  /** کلاس برچسب (مثلاً bg-card اگر روی کارت رنگی است) */
  labelClassName?: string;
  children: React.ReactNode;
};

export function Field({
  label,
  required,
  hint,
  className,
  labelClassName,
  children,
}: FieldProps) {
  return (
    <div className={cn("group/field", className)}>
      <div className="relative">
        {children}
        {/* برچسب روی مرز بالا — pointer-events:none تا کلیک به اینپوت برسد */}
        <span
          className={cn(
            "pointer-events-none absolute -top-2 right-3 z-10 bg-background px-1.5",
            "text-[11px] font-medium leading-4 text-muted-foreground",
            "transition-colors duration-200",
            "group-focus-within/field:text-primary",
            labelClassName
          )}
        >
          {label}
          {required && <span className="text-rose-500 font-bold"> *</span>}
        </span>
      </div>
      {hint && (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

// ─── نسخهٔ سرهم‌شده (Input + برچسب) برای فرم‌های ساده ────────────────
// در جایی که `<div className="space-y-1"><Label/><Input/></div>` دارید،
// جایگزین یک‌خطی:
//   <FieldInput label="تعداد" type="number" value={v} onChange={...} />
import { Input } from "@/components/ui/input";

type FieldInputProps = React.ComponentProps<typeof Input> & {
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  wrapperClassName?: string;
};

export function FieldInput({
  label,
  required,
  hint,
  wrapperClassName,
  className,
  ...inputProps
}: FieldInputProps) {
  return (
    <Field label={label} required={required} hint={hint} className={wrapperClassName}>
      <Input className={className} {...inputProps} />
    </Field>
  );
}
