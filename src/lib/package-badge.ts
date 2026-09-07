"use client";

// ─── Phase 16: بج بسته — QR + PDF (۱۰۰×۵۰ میلی‌متر) ──────────────
// طراحی بج به‌صورت HTML با استایل‌های inline (فقط رنگ RGB — سازگار با
// html2canvas؛ Tailwind/oklch هرگز به‌کار نمی‌رود) → اسکرین‌شات →
// صفحهٔ PDF دقیقاً ۱۰۰×۵۰mm (برچسب استیکری کوچک مستطیلی).
// متن فارسی توسط مرورگر رندر می‌شود (کیفیت کامل RTL).
//
// چیدمان (RTL):
//   [لوگو + نام مجموعه] [آدرس/محتویات + کد بسته + وضعیت] [QR]

import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export type BadgePackage = {
  code: string;
  seq: number;
  address: string;
  contentsNote?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
  codAmount?: number;
  status: string;
};

// لوگوی سادهٔ پرینتو (SVG inline — بدون وابستگی شبکه)
const SVG_LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
  '<rect x="4" y="4" width="56" height="56" rx="14" fill="#111827"/>' +
  '<rect x="16" y="14" width="32" height="22" rx="4" fill="none" stroke="#ffffff" stroke-width="4"/>' +
  '<path d="M16 36 L28 24 L36 32 L44 26 L52 34 L52 50 L16 50 Z" fill="#10b981"/>' +
  '<circle cx="44" cy="21" r="4" fill="#f59e0b"/>' +
  "</svg>";

const LOGO_DATA_URL =
  "data:image/svg+xml;base64," +
  (typeof window === "undefined" ? "" : btoa(SVG_LOGO));

const STATUS_FA: Record<string, string> = {
  packing: "در حال بسته‌بندی",
  ready: "آمادهٔ ارسال",
  sent: "ارسال شد",
  delivered: "تحویل شد",
  cancelled: "لغو شده",
};

/** QR data-url — به صفحهٔ عمومی بسته می‌رسد. */
export async function makePackageQr(code: string): Promise<string> {
  const url = `${window.location.origin}/?pkg=${code}`;
  return QRCode.toDataURL(url, {
    margin: 0,
    width: 512,
    errorCorrectionLevel: "M",
    color: { dark: "#111827", light: "#ffffff" },
  });
}

/** ساخت المان بج (۳۷۸×۱۸۹px ≈ ۱۰۰×۵۰mm @96dpi) — استایل inline خالص. */
export async function buildBadgeElement(pkg: BadgePackage): Promise<HTMLDivElement> {
  const qr = await makePackageQr(pkg.code);
  const line2 =
    pkg.contentsNote?.trim() ||
    pkg.receiverName?.trim() ||
    pkg.receiverPhone?.trim() ||
    "";

  const el = document.createElement("div");
  el.setAttribute("dir", "rtl");
  el.style.cssText = [
    "width: 378px",
    "height: 189px",
    "background: #ffffff",
    "border: 2px solid #111827",
    "border-radius: 8px",
    "box-sizing: border-box",
    "display: flex",
    "align-items: stretch",
    "padding: 8px",
    "gap: 8px",
    "font-family: Vazirmatn, Tahoma, 'Segoe UI', sans-serif",
    "color: #111827",
    "overflow: hidden",
  ].join(";");

  // ── ستون راست: لوگو + نام مجموعه ──
  const brand = document.createElement("div");
  brand.style.cssText = [
    "display: flex",
    "flex-direction: column",
    "align-items: center",
    "justify-content: center",
    "gap: 4px",
    "width: 74px",
    "flex-shrink: 0",
    "border-left: 1px solid #d1d5db",
    "padding-left: 8px",
  ].join(";");
  const logo = document.createElement("img");
  logo.src = LOGO_DATA_URL;
  logo.style.cssText = "width: 42px; height: 42px;";
  const brandName = document.createElement("div");
  brandName.textContent = "پرینتو ۲۴";
  brandName.style.cssText = "font-size: 12px; font-weight: 700; white-space: nowrap;";
  const brandEn = document.createElement("div");
  brandEn.textContent = "Printoo24";
  brandEn.style.cssText =
    "font-size: 8px; font-weight: 600; color: #6b7280; direction: ltr; letter-spacing: 0.5px;";
  brand.append(logo, brandName, brandEn);

  // ── ستون وسط: کد + آدرس/محتویات + وضعیت ──
  const mid = document.createElement("div");
  mid.style.cssText = [
    "flex: 1",
    "display: flex",
    "flex-direction: column",
    "justify-content: center",
    "gap: 5px",
    "min-width: 0",
  ].join(";");

  const codeRow = document.createElement("div");
  codeRow.style.cssText = "display: flex; align-items: center; gap: 6px;";
  const codeChip = document.createElement("div");
  codeChip.textContent = pkg.code;
  codeChip.style.cssText = [
    "direction: ltr",
    "font-family: 'Courier New', monospace",
    "font-size: 15px",
    "font-weight: 800",
    "letter-spacing: 1px",
    "background: #111827",
    "color: #ffffff",
    "padding: 2px 8px",
    "border-radius: 5px",
  ].join(";");
  const seqChip = document.createElement("div");
  seqChip.textContent = `بستهٔ #${pkg.seq}`;
  seqChip.style.cssText =
    "font-size: 10px; font-weight: 700; color: #111827; border: 1px solid #9ca3af; padding: 1px 6px; border-radius: 4px;";
  codeRow.append(codeChip, seqChip);

  const addr = document.createElement("div");
  addr.textContent = pkg.address || "—";
  addr.style.cssText =
    "font-size: 11px; font-weight: 600; line-height: 1.45; max-height: 48px; overflow: hidden;";

  const contents = document.createElement("div");
  if (line2) {
    contents.textContent = line2;
    contents.style.cssText =
      "font-size: 9px; color: #4b5563; line-height: 1.4; max-height: 26px; overflow: hidden;";
  }

  const metaRow = document.createElement("div");
  metaRow.style.cssText = "display: flex; align-items: center; gap: 6px; flex-wrap: wrap;";
  const statusChip = document.createElement("div");
  statusChip.textContent = STATUS_FA[pkg.status] ?? pkg.status;
  statusChip.style.cssText =
    "font-size: 9px; font-weight: 700; color: #065f46; background: #d1fae5; padding: 1px 7px; border-radius: 4px;";
  metaRow.append(statusChip);
  if (pkg.receiverPhone) {
    const phone = document.createElement("div");
    phone.textContent = pkg.receiverPhone;
    phone.style.cssText =
      "font-size: 9px; font-weight: 600; direction: ltr; color: #374151;";
    metaRow.append(phone);
  }
  if (pkg.codAmount && pkg.codAmount > 0) {
    const cod = document.createElement("div");
    cod.textContent = `COD: ${pkg.codAmount.toLocaleString("fa-IR")}`;
    cod.style.cssText =
      "font-size: 9px; font-weight: 800; color: #92400e; background: #fef3c7; padding: 1px 7px; border-radius: 4px;";
    metaRow.append(cod);
  }

  mid.append(codeRow, addr);
  if (line2) mid.append(contents);
  mid.append(metaRow);

  // ── ستون چپ: QR ──
  const qrWrap = document.createElement("div");
  qrWrap.style.cssText = [
    "display: flex",
    "flex-direction: column",
    "align-items: center",
    "justify-content: center",
    "gap: 3px",
    "flex-shrink: 0",
  ].join(";");
  const qrImg = document.createElement("img");
  qrImg.src = qr;
  qrImg.style.cssText = "width: 158px; height: 158px; border: 1px solid #e5e7eb; border-radius: 4px;";
  const scanHint = document.createElement("div");
  scanHint.textContent = "برای پیگیری اسکن کنید";
  scanHint.style.cssText = "font-size: 7.5px; color: #6b7280; white-space: nowrap;";
  qrWrap.append(qrImg, scanHint);

  el.append(brand, mid, qrWrap);
  return el;
}

/** اسکرین‌شات باکیفیت بج → canvas (scale 4 ≈ ۳۸۴dpi). */
async function badgeCanvas(el: HTMLElement): Promise<HTMLCanvasElement> {
  // رندر خارج از دید (fixed تا layout نگیرد)
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "0";
  document.body.appendChild(el);
  try {
    return await html2canvas(el, {
      scale: 4,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
    });
  } finally {
    el.remove();
  }
}

/** دانلود PDF بج — صفحه دقیقاً ۱۰۰×۵۰ میلی‌متر. */
export async function downloadBadgePdf(pkg: BadgePackage): Promise<void> {
  const el = await buildBadgeElement(pkg);
  const canvas = await badgeCanvas(el);
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [100, 50],
    compress: true,
  });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 100, 50, undefined, "FAST");
  pdf.save(`badge-${pkg.code}.pdf`);
}

/** دانلود PNG بج (برای اشتراک سریع). */
export async function downloadBadgePng(pkg: BadgePackage): Promise<void> {
  const el = await buildBadgeElement(pkg);
  const canvas = await badgeCanvas(el);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `badge-${pkg.code}.png`;
  a.click();
}

/** URL صفحهٔ عمومی بسته (برای دکمهٔ «کپی لینک»). */
export function packagePublicUrl(code: string): string {
  return `${window.location.origin}/?pkg=${code}`;
}
