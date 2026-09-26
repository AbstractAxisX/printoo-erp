"use client";

// Printoo24 ERP — Phase 23 → Phase 24: «تولتیپ‌های راهنما» (نسخهٔ ۲)
// ─────────────────────────────────────────────────────────────────
// سیستم آموزشی سراسری با event-delegation: فقط «یک» لیسنر روی document
// و «یک» تولتیپ رندرشده — بدون wrap کردن هزاران کامپوننت.
//
// Phase 24 (خواستهٔ 7): توضیح‌ها بافت‌آگاه شدند — دکمه بر اساس صفحهٔ
// جاری (module/page از app-store) توضیح مخصوص خودش را می‌گیرد و
// فال‌بک‌ها از تحلیل فعل، جملهٔ کامل می‌سازند. هیچ «دکمه است، کلیک کن»
// و متن تکراری باقی نمانده — هدف: سیستمی که آموزش نخواهد.
//
// هدف‌ها (به ترتیب اولویت):
//   1. [data-guide="key"]        → محتوای رجیستری (guide-content.ts)
//   2. [data-guide-text="..."]    → متن مستقیم
//   3. th (سرستون جدول)          → دیکشنری سرستون / متن عمومی
//   4. button (بدون data-guide)  → دیکشنری متن دکمه / متن عمومی
//   5. input/textarea/select      → از placeholder/name توضیح می‌سازد
//
// خاموش/روشن: per-profile از app-store (user.guideTooltips — دیفالت روشن).
// تولتیپ حین نمایش، title بومی همان عنصر را موقتاً مخفی می‌کند (بدون دوبار نمایش).
// غلتن/کلیک/خروج موس → بستن فوری.

import * as React from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "@/stores/app-store";
import {
  getGuideEntry,
  getButtonCtxEntry,
  GUIDE_BY_BUTTON_TEXT,
  GUIDE_BY_FIELD_HINT,
  GUIDE_BY_HEADER_TEXT,
  type GuideEntry,
} from "@/lib/guide-content";
import { t as tr, tFa } from "@/lib/i18n";

const SHOW_DELAY_MS = 550;
const VIEWPORT_MARGIN = 12;
const TOOLTIP_MAX_WIDTH = 340;

/** پیدا کردن بهترین ورودی راهنما برای یک عنصر DOM.
 *
 * Phase 24 (خواستهٔ 7): بافت‌آگاه — دکمه‌ها بر اساس «صفحهٔ فعلی» توضیح
 * مخصوص خودشان را می‌گیرند (BUTTON_CTX) و فال‌بک‌ها هم از فعل + بافت
 * جملهٔ معنادار می‌سازند — نه «دکمه است، کلیک کن». */
function resolveGuide(el: HTMLElement, ctx: { module: string; page: string }): GuideEntry | null {
  // 1) کلید صریح / متن مستقیم
  const key = el.getAttribute("data-guide");
  if (key) {
    const entry = getGuideEntry(key);
    if (entry) return entry;
    const direct = el.getAttribute("data-guide-text");
    if (direct) {
      const label = visibleTextOf(el) || el.getAttribute("aria-label") || "";
      return { title: label || tr("راهنما"), text: direct };
    }
  }

  // 2) سرستون جدول
  const tag = el.tagName.toLowerCase();
  if (tag === "th") {
    const text = visibleTextOf(el).replace(/[▲▼↕]/g, "").trim();
    if (!text) return null;
    // Phase 27: در حالت انگلیسی متن سرستون ترجمه‌شده است؛ معادل فارسی
    // آن را هم برای کلیدهای رجیستری (فارسی) امتحان می‌کنیم.
    const textFa = tFa(text);
    return (
      GUIDE_BY_HEADER_TEXT[text] ??
      GUIDE_BY_HEADER_TEXT[textFa] ?? {
        title: text,
        text: tr("سرستون «{p0}» — روی ردیف‌ها کلیک کنید تا جزئیات همان مورد باز شود؛ کلیک روی خود سرستون، جدول را بر اساس آن مرتب می‌کند.", { p0: text }),
      }
    );
  }

  // 3) دکمه‌ها — اول توضیح مخصوص همین صفحه (BUTTON_CTX)
  const isButton =
    tag === "button" ||
    el.getAttribute("role") === "button" ||
    (tag === "a" && el.getAttribute("href") === undefined && el.classList.contains("cursor-pointer"));
  if (isButton) {
    const text = visibleTextOf(el).trim() || el.getAttribute("aria-label")?.trim() || "";
    if (!text) return null;
    // Phase 27: در حالت انگلیسی متن دکمه ترجمه‌شده است؛ کلیدهای BUTTON_CTX
    // فارسی‌اند → معادل فارسی متن را هم امتحان می‌کنیم (tFa = reverse dict).
    const textFa = tFa(text);
    const words = text.split(/\s+/);
    const wordsFa = textFa.split(/\s+/);
    // بافت‌آگاه: «module:page|متن» → توضیح مخصوص همین دکمه در همین صفحه
    const ctxHit =
      getButtonCtxEntry(ctx.module, ctx.page, text) ??
      getButtonCtxEntry(ctx.module, ctx.page, textFa) ??
      getButtonCtxEntry(ctx.module, ctx.page, words[0]) ??
      getButtonCtxEntry(ctx.module, ctx.page, wordsFa[0]);
    if (ctxHit) return ctxHit;
    // فال‌بک 1: دیکشنری متن دکمه (کامل اما عمومی)
    const hit =
      GUIDE_BY_BUTTON_TEXT[text] ??
      GUIDE_BY_BUTTON_TEXT[textFa] ??
      GUIDE_BY_BUTTON_TEXT[words[0]] ??
      GUIDE_BY_BUTTON_TEXT[wordsFa[0]];
    if (hit) return hit;
    // فال‌بک 2: جملهٔ معنادار از فعل — نه «دکمه است، کلیک کن»
    return smartButtonFallback(text, textFa);
  }

  // 4) فیلدهای فرم
  if (tag === "input" || tag === "textarea" || tag === "select") {
    const type = el.getAttribute("type");
    if (type === "hidden" || type === "checkbox" || type === "radio" || type === "file") return null;
    const name = el.getAttribute("name") ?? el.getAttribute("id") ?? "";
    const placeholder = el.getAttribute("placeholder") ?? "";
    const hintKey = Object.keys(GUIDE_BY_FIELD_HINT).find(
      (k) => name.toLowerCase().includes(k) || placeholder.includes(GUIDE_BY_FIELD_HINT[k].title)
    );
    if (hintKey) return GUIDE_BY_FIELD_HINT[hintKey];
    const label = placeholder || name;
    if (label) {
      return {
        title: label,
        text: tr("ورودی «{p0}» در همین فرم — مقدار درست را طبق توضیح فیلد وارد کنید؛ فیلدهای ستاره‌دار که خالی بمانند، ثبت را بلاک می‌کنند.", { p0: label }),
      };
    }
    return null;
  }

  return null;
}

/** فال‌بک هوشمند دکمه — فعل را تحلیل و جملهٔ کامل می‌سازد.
 * Phase 27: الگوی فعل روی متن فارسی (متن اصلی) اعمال می‌شود. */
function smartButtonFallback(text: string, textFa: string): GuideEntry {
  const t = text.length > 28 ? text.slice(0, 28) + "…" : text;
  const src = textFa || text;
  if (/^(افزودن|اضافه)/.test(src))
    return { title: t, text: tr("«{p0}» — یک مورد جدید در همین صفحه می‌سازد؛ فرم ورودش باز می‌شود و بعد از ثبت، در همین فهرست ظاهر می‌شود.", { p0: text }) };
  if (/^(حذف|پاک)/.test(src))
    return { title: t, text: tr("«{p0}» — این مورد را برای همیشه برمی‌دارد؛ هرجا وابستگی باشد سیستم جلویش را می‌گیرد و از شما تایید دوباره می‌خواهد.", { p0: text }) };
  if (/^(ثبت|ذخیره|ایجاد|ساخت)/.test(src))
    return { title: t, text: tr("«{p0}» — دادهٔ همین فرم را در سیستم ثبت می‌کند؛ بعد از آن برای همکارانِ حوزهٔ مربوط قابل مشاهده و اقدام است.", { p0: text }) };
  if (/^(تایید|تأیید|قبول)/.test(src))
    return { title: t, text: tr("«{p0}» — این مورد را تأیید می‌کند و به مرحلهٔ بعد جریان کار می‌برد؛ در موارد مالی یعنی وارد‌شدن در محاسبات رسمی.", { p0: text }) };
  if (/^(چاپ|پرینت)/.test(src))
    return { title: t, text: tr("«{p0}» — نسخهٔ تمیز و رسمی همین سند را برای پرینتر/PDF آماده می‌کند؛ فقط خود سند، بدون منوهای سایت.", { p0: text }) };
  if (/^(دانلود|دریافت)/.test(src))
    return { title: t, text: tr("«{p0}» — فایل مرتبط با همین مورد را دانلود می‌کند.", { p0: text }) };
  if (/^(باز|مشاهده|جزئیات|نمایش)/.test(src))
    return { title: t, text: tr("«{p0}» — جزئیات کامل همین مورد را باز می‌کند؛ فقط برای دیدن، بدون تغییری در داده.", { p0: text }) };
  if (/^(کپی|تکرار)/.test(src))
    return { title: t, text: tr("«{p0}» — از همین مورد یک نسخهٔ تازه می‌سازد تا ورود داده‌های مشابه سریع‌تر انجام شود.", { p0: text }) };
  if (/^(بستن|انصراف|لغو)/.test(src))
    return { title: t, text: tr("«{p0}» — پنجره را می‌بندد؛ تغییرات ذخیره‌نشده اعمال نمی‌شوند.", { p0: text }) };
  return {
    title: t,
    text: tr("«{p0}» — اقدام همین صفحه؛ با اجرا، نتیجهٔ آن در همین فهرست/فرم به‌روز می‌شود و رویدادش در تاریخچه ثبت می‌گردد.", { p0: text }),
  };
}

/** متن قابل‌دیدن عنصر (بالا-آمده متن‌های آیکونی). */
function visibleTextOf(el: HTMLElement): string {
  // aria-label اولویت دارد (دکمه‌های آیکونی)
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  const clone = el.cloneNode(true) as HTMLElement;
  // حذف svgها (آیکون‌ها) تا متن خالص بماند
  clone.querySelectorAll("svg").forEach((s) => s.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

type TipState = {
  entry: GuideEntry;
  rect: { top: number; left: number; width: number; height: number };
} | null;

export function GuideTooltips() {
  const enabled = useAppStore((s) => s.user?.guideTooltips ?? true);
  // Phase 24 (خواستهٔ 7): بافت فعلی — module/page جاری برای توضیح‌های بافت‌آگاه
  const ctxModule = useAppStore((s) => s.module);
  const ctxPage = useAppStore((s) => s.page);
  const ctxRef = React.useRef({ module: ctxModule, page: ctxPage });
  React.useEffect(() => {
    ctxRef.current = { module: ctxModule, page: ctxPage };
  }, [ctxModule, ctxPage]);
  const [mounted, setMounted] = React.useState(false);
  const [tip, setTip] = React.useState<TipState>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRef = React.useRef<HTMLElement | null>(null);
  const titleBackupRef = React.useRef<string | null>(null);

  React.useEffect(() => setMounted(true), []);

  // پاک‌سازی تایمر + بازیابی title بومی
  const cleanup = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (targetRef.current && titleBackupRef.current !== null) {
      try {
        targetRef.current.setAttribute("title", titleBackupRef.current);
      } catch {}
    }
    targetRef.current = null;
    titleBackupRef.current = null;
    setTip(null);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;

    if (!enabled) {
      cleanup();
      return;
    }

    const onOver = (e: MouseEvent) => {
      const raw = e.target as HTMLElement | null;
      if (!raw || typeof raw.closest !== "function") return;
      const el = raw.closest<HTMLElement>(
        "[data-guide],[data-guide-text],th,button,[role='button'],input,textarea,select"
      );
      if (!el || !el.isConnected) return;
      // تولتیپ خودی؟ — نادیده
      if (el.closest("[data-guide-tooltip-root]")) return;
      // در حال نمایش روی همین عنصر؟ ادامه
      if (targetRef.current === el) return;

      // عنصر جدید → ریست
      cleanup();
      targetRef.current = el;

      const entry = resolveGuide(el, ctxRef.current);
      if (!entry) return;

      timerRef.current = setTimeout(() => {
        if (targetRef.current !== el || !el.isConnected) return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        // مخفی‌کردن title بومی هنگام نمایش تولتیپ آموزشی (بدون دوباره‌نمایی)
        const nativeTitle = el.getAttribute("title");
        if (nativeTitle) {
          titleBackupRef.current = nativeTitle;
          el.removeAttribute("title");
        }
        setTip({ entry, rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height } });
      }, SHOW_DELAY_MS);
    };

    const onOut = (e: MouseEvent) => {
      const raw = e.target as HTMLElement | null;
      if (!raw) return;
      // اگر از عنصر هدف خارج شدیم → بستن (با کمی تلورانس برای تولتیپ خودش)
      const to = e.relatedTarget as HTMLElement | null;
      if (targetRef.current && !targetRef.current.contains(to)) cleanup();
    };

    const onScrollOrDown = () => cleanup();

    document.addEventListener("mouseover", onOver, { passive: true });
    document.addEventListener("mouseout", onOut, { passive: true });
    window.addEventListener("scroll", onScrollOrDown, { passive: true, capture: true });
    document.addEventListener("mousedown", onScrollOrDown, { passive: true });
    window.addEventListener("blur", onScrollOrDown);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      window.removeEventListener("scroll", onScrollOrDown, { capture: true });
      document.removeEventListener("mousedown", onScrollOrDown);
      window.removeEventListener("blur", onScrollOrDown);
      cleanup();
    };
  }, [enabled, mounted, cleanup]);

  if (!mounted || !tip || !enabled) return null;

  return createPortal(
    <GuideTipCard entry={tip.entry} anchor={tip.rect} />,
    document.body
  );
}

// ─── کارت تولتیپ — موقعیت‌یابی با flip هوشمند ─────────────────────

function GuideTipCard({
  entry,
  anchor,
}: {
  entry: GuideEntry;
  anchor: { top: number; left: number; width: number; height: number };
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number; side: "top" | "bottom" }>({
    top: anchor.top,
    left: anchor.left,
    side: "top",
  });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { innerWidth, innerHeight } = window;
    const box = el.getBoundingClientRect();
    const w = Math.min(box.width, TOOLTIP_MAX_WIDTH);
    const h = box.height;

    // مرکز‌چین افقی نسبت به عنصر، clamp داخل viewport
    let left = anchor.left + anchor.width / 2 - w / 2;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, innerWidth - w - VIEWPORT_MARGIN));

    // ترجیح: بالای عنصر؛ اگر جا نبود → زیر
    let side: "top" | "bottom" = "top";
    let top = anchor.top - h - 10;
    if (top < VIEWPORT_MARGIN) {
      side = "bottom";
      top = anchor.top + anchor.height + 10;
    }
    if (top + h > innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, innerHeight - h - VIEWPORT_MARGIN);
    }
    setPos({ top, left, side });
  }, [anchor]);

  return (
    <div
      ref={ref}
      data-guide-tooltip-root=""
      dir="rtl"
      role="tooltip"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        maxWidth: TOOLTIP_MAX_WIDTH,
        zIndex: 9999,
      }}
      className="pointer-events-none animate-in fade-in-0 zoom-in-95 duration-150"
    >
      <div className="rounded-xl border border-primary/25 dark:border-primary/35 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl shadow-primary/10 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 size-5 shrink-0 rounded-lg bg-primary/10 text-primary grid place-items-center text-[11px]" aria-hidden="true">
            ✦
          </span>
          <div className="min-w-0">
            <div className="text-xs font-bold text-foreground leading-5">{entry.title}</div>
            <div className="text-[11px] text-muted-foreground leading-5 mt-0.5">{entry.text}</div>
          </div>
        </div>
      </div>
      {/* فلش اشاره به عنصر */}
      <div
        className="absolute left-1/2 -translate-x-1/2 size-2.5 rotate-45 border border-primary/25 dark:border-primary/35 bg-white dark:bg-slate-900"
        style={
          pos.side === "top"
            ? { bottom: -5, borderTop: "none", borderLeft: "none" }
            : { top: -5, borderBottom: "none", borderRight: "none" }
        }
        aria-hidden="true"
      />
    </div>
  );
}
