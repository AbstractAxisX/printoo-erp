"use client";

// ─── Phase 19: چاپ سند در صفحهٔ جدید و تمیز ─────────────────────────
//
// خواستهٔ صریح کارفرما:
//   «وقتی فاکتور و پیش فاکتور رو چاپ می‌کنم درست چاپ نمیشه؛ باید یک صفحهٔ
//    جدید بسازه و از اون صفحه پرینت بگیره و هیچ دکمه و هدر و هیچ چیزی از
//    سیستم چاپ نشه — مستقیم خودِ فاکتور و پیش‌فاکتور.»
//
// رویکرد قبلی (window.print + CSS hide) شکننده بود (پاپ‌آپ دیالوگ، اسکیل
// موبایل، قوانین Tailwind v4). رویکرد جدید:
//   ۱) عنصر سند (#printable-invoice) کلون می‌شود
//   ۲) پنجرهٔ جدید باز می‌شود (هم‌زمان در کلیک — popup blocker نمی‌گیرد)
//   ۳) «تمام» استایل‌شیت‌های صفحهٔ اصلی داخلش کپی می‌شود (Tailwind+globals)
//   ۴) CSS چاپ تمیز تزریق می‌شود (A4 لبه‌به‌لبه، بدون هیچ chrome سیستمی)
//   ۵) بعد از لود کامل، print() خودکار اجرا می‌شود
//
// کاربر می‌تواند قبل از چاپ از preview هم خروجی PDF بگیرد (print → save as
// PDF) — پنجرهٔ جدید فقط سند است.

export type PrintResult = { ok: boolean; error?: string };

/**
 * عنصر سند را در پنجرهٔ جدیدی با فقط خودِ سند چاپ می‌کند.
 * @param selector سلکتور عنصر سند (پیش‌فرض: #printable-invoice)
 * @param title عنوان پنجرهٔ چاپ
 */
export function printElementClean(selector = "#printable-invoice", title = "Printoo24 — سند چاپی"): PrintResult {
  if (typeof window === "undefined") return { ok: false, error: "no-window" };

  const source = document.querySelector(selector);
  if (!source) return { ok: false, error: "element-not-found" };

  // کلون عمیق — بدون شناسهٔ تکراری در DOM جدید + بدون transform پدران
  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");

  const printWindow = window.open("", "_blank", "width=900,height=1000");
  if (!printWindow) {
    return { ok: false, error: "popup-blocked" };
  }

  // استایل‌شیت‌های صفحهٔ اصلی را کامل کپی می‌کنیم (هم‌مبدأ → cssRules خوانا).
  // Tailwind v4 و globals هر دو با این روش می‌آیند؛ @media print قانون قبلی
  // «کل اپ حذف» فقط روی فرزندان مستقیم body پنجرهٔ جدید اثر می‌گذارد که
  // فقط سند است — بی‌ضرر.
  const styleText = collectStyles();

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${styleText}</style>
<style>
  /* چاپ تمیز — هیچ chrome سیستمی، فقط سند */
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  body { display: block !important; }
  @page { size: A4 portrait; margin: 0; }
  .print-doc {
    position: static !important;
    display: block !important;
    width: 210mm !important;
    max-width: none !important;
    min-height: auto !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
    background: #fff !important;
    margin: 0 auto !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    overflow: visible !important;
  }
  .print-doc tr { break-inside: avoid; }
  @media print {
    html, body { width: 210mm !important; }
  }
</style>
</head>
<body>${clone.outerHTML}
<script>
  window.onload = function () {
    // کمی تأخیر برای رندر فونت‌ها/تصاویر، سپس چاپ
    setTimeout(function () { window.focus(); window.print(); }, 250);
  };
<\/script>
</body>
</html>`);
  printWindow.document.close();
  return { ok: true };
}

/** همهٔ CSS قابل‌خواندن صفحهٔ فعلی را یک‌جا جمع می‌کند. */
function collectStyles(): string {
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      if (!rules || rules.length === 0) continue;
      const text = Array.from(rules)
        .map((r) => {
          try {
            return r.cssText;
          } catch {
            return "";
          }
        })
        .join("\n");
      if (text) parts.push(text);
    } catch {
      // شیط‌شیت cross-origin — href را به‌عنوان لینک نگه می‌داریم
      const href = (sheet as CSSStyleSheet).href;
      if (href) parts.push(`@import url("${href}");`);
    }
  }
  return parts.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
