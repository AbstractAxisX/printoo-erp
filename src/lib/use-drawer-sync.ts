"use client";

import { useCallback, useState } from "react";

/**
 * هوک همگام‌ساز کشوی سایدبار
 * ─────────────────────────────────────────────────────────────
 * قرارداد رفتاری (Behavioural Contract):
 *
 *   ۱) وقتی `active` از false → true می‌شود، کشو خودکار باز می‌شود
 *      تا کاربر ببیند در کدام ماژول است (AC5: باز شدن خودکار کشو فعال).
 *
 *   ۲) اگر کاربر دستی کشو را ببندد، تا انتهای «دوره فعال بودن»
 *      همان ماژول بسته می‌ماند — یعنی تنظیم state هنگام تغییر prop
 *      آن را لغو نمی‌کند (AC6: عدم لغو بستن دستی کاربر).
 *
 *   ۳) وقتی `active` از true → false شود، گارد ریست می‌شود
 *      تا اگر بعداً دوباره فعال شد، دوباره خودکار باز شود.
 *
 *   ۴) `setOpen` پایدار (useCallback) برمی‌گردد تا مصرف‌کننده
 *      بتواند آن را به یک کامپوننت React.memoـ‌شده پاس دهد
 *      بدون اینکه ریرندر اضافی رخ دهد (بهینه‌سازی پرفورمنس).
 *
 * استفادهٔ پیشنهادی:
 *   const { open, setOpen } = useDrawerSync({ active: isCurrentModule });
 *   <Collapsible open={open} onOpenChange={setOpen}>...</Collapsible>
 *
 * نکته: این هوک «لایه Logic» است و هیچ UI رندر نمی‌کند.
 *       وابستگی یک‌جهته: UI → Logic (هیچ‌وقت برعکس).
 *
 * پیاده‌سازی: الگوی رسمی React «تنظیم state هنگام تغییر prop»
 * (بدون useEffect، بدون دسترسی به ref در حین render).
 * ref: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
 */
export function useDrawerSync({ active }: { active: boolean }) {
  // وضعیت محلی باز/بسته بودن کشو (مقدار اولیه = active)
  const [open, setOpenState] = useState<boolean>(active);

  // گارد: آیا کاربر در همین دوره فعال دستی بست؟
  // (به‌جای ref از state استفاده می‌کنیم تا قانون react-hooks/refs رعایت شود)
  const [userClosed, setUserClosed] = useState<boolean>(false);

  // مقدار قبلی active برای تشخیص تغییر در حین رندر
  const [prevActive, setPrevActive] = useState<boolean>(active);

  // تنظیم state هنگام تغییر prop (الگوی رسمی React، بدون effect، بدون ref)
  if (active !== prevActive) {
    // مقدار قبلی را به‌روز کن (مهم: همیشه اول)
    setPrevActive(active);
    if (!active) {
      // دوره فعال تمام شد → گارد را برای بار بعد ریست کن
      setUserClosed(false);
    } else if (active && !userClosed) {
      // فعال شد و کاربر دستی نبسته → خودکار باز کن
      setOpenState(true);
    }
    // نکته: اگر active && userClosed باشد، یعنی کاربر خودش بسته
    // و ما نباید باز کنیم (AC6 رعایت می‌شود).
  }

  // setter پایدار برای onOpenChange ریشه‌ای و مصرف در React.memo
  // (همیشه boolean دریافت می‌کند — مطابق قرارداد Radix Collapsible)
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    // ثبت نیت کاربر در گارد (true اگر بست، false اگر باز کرد)
    setUserClosed(!next);
  }, []);

  return { open, setOpen } as const;
}
