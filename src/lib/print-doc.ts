"use client";

// ─── Phase 19/21: چاپ و دانلود سند ────────────────────────────────
//
// رویکرد چاپ (فاز 19): پنجرهٔ جدید تمیز — فقط خودِ سند، بدون chrome سیستمی:
//   1) عنصر سند (#printable-invoice) کلون می‌شود
//   2) پنجرهٔ جدید باز می‌شود (هم‌زمان در کلیک — popup blocker نمی‌گیرد)
//   3) «تمام» استایل‌شیت‌های صفحهٔ اصلی داخلش کپی می‌شود (Tailwind+globals)
//   4) CSS چاپ تمیز تزریق می‌شود (A4 لبه‌به‌لبه، بدون هیچ chrome سیستمی)
//   5) بعد از لود کامل، print() خودکار اجرا می‌شود
//
// ─── فاز 21 — رفع باگ «PDF سفید» ───────────────────────────────────
// globals.css برای چاپ داخل خودِ اپ قانون
//   body > *:not([data-slot="dialog-content"]) { display:none !important }
// دارد (فاز 11). این استایل همراه بقیه به پنجرهٔ چاپ کپی می‌شد و چون سندِ
// کلون‌شده dialog-content نیست، در مدیای print مخفی می‌شد → صفحهٔ سفید در
// پیش‌نمایش چاپ و فایل خروجی. رفع: لایهٔ Override پایین با خاصیت بالاتر
// (html body > .print-doc) بعد از استایل‌های کپی‌شده تزریق می‌شود.
//
// ─── فاز 21 — دانلود PDF یک‌کلیکی ─────────────────────────────────
// downloadElementAsPdf: سند با html2canvas-pro (فورک با پشتیبانی oklch
// تیلویند 4 — html2canvas معمولی روی رنگ‌های oklch خطا می‌دهد) رندر و با
// jsPDF به صفحات A4 بریده می‌شود؛ برش فقط در نقاط امن (بین ردیف‌های جدول)
// انجام می‌شود تا هیچ سطری از وسط نصف نشود. خروجی با نام فایل دانلود می‌شود.

export type PrintResult = { ok: boolean; error?: string };

/**
 * نام فایل امن می‌سازد — کاراکترهای ممنوع ویندوز/مک/لینوکس حذف می‌شوند.
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

// لایهٔ Override چاپ — پایانی‌ترین استایل پنجرهٔ چاپ (بعد از استایل‌های
// کپی‌شده) تا قواعد @media print میراث‌ای (مخفی‌کردن کل اپ در globals.css)
// روی سندِ مستقل اثر نگذارند. خاصیت selector های زیر بالاتر از
// body > *:not([data-slot="dialog-content"]) است و در cascade هم آخر است.
const PRINT_OVERRIDE_CSS = `
  @media print {
    html, body {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    html body > .print-doc,
    html body > .print-doc *:not(.no-print) {
      visibility: visible !important;
    }
    html body > .print-doc {
      display: block !important;
      opacity: 1 !important;
    }
  }
`;

/**
 * عنصر سند را در پنجرهٔ جدیدی با فقط خودِ سند چاپ می‌کند.
 * @param selector سلکتور عنصر سند (پیش‌فرض: #printable-invoice)
 * @param title عنوان پنجرهٔ چاپ = نام پیش‌فرض فایل PDF ذخیره‌شده
 */
export function printElementClean(
  selector = "#printable-invoice",
  title = "Printoo24 — Invoice"
): PrintResult {
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
  const styleText = collectStyles();

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(sanitizeFileName(title))}</title>
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
  .doc-scaler { height: auto !important; overflow: visible !important; }
  .doc-scaler > div { transform: none !important; width: auto !important; }
  @media print {
    html, body { width: 210mm !important; }
  }
</style>
<style>${PRINT_OVERRIDE_CSS}</style>
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

/**
 * سند را با یک کلیک به فایل PDF (A4، چندصفحه‌ای با برش امن بین ردیف‌ها)
 * تبدیل و دانلود می‌کند — بدون دیالوگ چاپ مرورگر.
 *
 * @param selector سلکتور عنصر سند (پیش‌فرض: #printable-invoice)
 * @param fileName نام کامل فایل دانلودی (شامل .pdf)
 */
export async function downloadElementAsPdf(
  selector = "#printable-invoice",
  fileName = "Printoo24 — Invoice.pdf"
): Promise<PrintResult> {
  if (typeof window === "undefined") return { ok: false, error: "no-window" };

  const source = document.querySelector(selector);
  if (!source) return { ok: false, error: "element-not-found" };

  // کتابخانه‌های سنگین فقط هنگام نیاز لود می‌شوند
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  // فونت‌های وب حتماً قبل از رندر آماده باشند
  try {
    await document.fonts.ready;
  } catch {
    /* مرورگرهای قدیمی — رد */
  }

  // کلون در نگهدارندهٔ آفسکرین با عرض A4 — مستقل از transform/اسکیل پدران
  // (DocScaler موبایل) و از اسکرول/برش دیالوگ. کلون در همان document است
  // تا همهٔ کلاس‌های Tailwind رویش resolve شوند.
  const holder = document.createElement("div");
  holder.setAttribute("aria-hidden", "true");
  holder.style.cssText =
    "position:fixed;left:-10000px;top:0;width:210mm;background:#ffffff;z-index:-1;pointer-events:none;";
  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.style.transform = "none";
  holder.appendChild(clone);
  document.body.appendChild(holder);

  try {
    const canvas = await html2canvas(clone, {
      scale: 2.5,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });
    if (!canvas.width || !canvas.height) {
      return { ok: false, error: "empty-canvas" };
    }

    // نقاط برش امن = لبهٔ پایین ردیف‌های جدول (که سطری نصف نشود)
    const cloneRect = clone.getBoundingClientRect();
    const cssToCanvas = canvas.width / Math.max(1, cloneRect.width);
    const safeCuts: number[] = [];
    clone.querySelectorAll<HTMLElement>("tr").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height > 0) {
        safeCuts.push((r.bottom - cloneRect.top) * cssToCanvas);
      }
    });

    const pdf = new jsPDF({
      unit: "mm",
      format: "a4",
      orientation: "portrait",
      compress: true,
    });
    const PAGE_W = 210;
    const PAGE_H = 297;
    const pxPerMm = canvas.width / PAGE_W;
    const pageHpx = PAGE_H * pxPerMm;
    const docHpx = canvas.height;

    let y = 0;
    let page = 0;
    while (y < docHpx - 1) {
      let end = Math.min(y + pageHpx, docHpx);
      // اگر ادامه دارد، نزدیک‌ترین نقطهٔ امن به انتهای صفحه (حداقل 75٪ پر)
      if (end < docHpx - 1 && safeCuts.length > 0) {
        const minEnd = y + pageHpx * 0.75;
        let best = -1;
        for (const c of safeCuts) {
          if (c > y + 4 && c <= end && c >= minEnd && c > best) best = c;
        }
        if (best > 0) end = best;
      }
      const sliceH = Math.round(end - y);
      if (sliceH <= 0) break;
      if (page > 0) pdf.addPage();

      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext("2d");
      if (!ctx) break;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(
        canvas,
        0,
        y,
        canvas.width,
        sliceH,
        0,
        0,
        canvas.width,
        sliceH
      );
      pdf.addImage(
        slice.toDataURL("image/png"),
        "PNG",
        0,
        0,
        PAGE_W,
        sliceH / pxPerMm,
        undefined,
        "FAST"
      );
      y += sliceH;
      page++;
    }

    pdf.save(sanitizeFileName(fileName) || "invoice.pdf");
    return { ok: true };
  } catch (err) {
    console.error("downloadElementAsPdf failed:", err);
    return { ok: false, error: "render-failed" };
  } finally {
    holder.remove();
  }
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
