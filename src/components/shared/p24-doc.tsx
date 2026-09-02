"use client";

// Printoo24 ERP — P24Doc (Phase 11)
//
// سند چاپی A4 پیش‌فاکتور/فاکتور با هویت و تم printoo24.com — بازسازیِ
// طرح ارجاعی QuotationPage سایت (فقط دیزاین/مشخصات شرکت؛ فرم‌ها مربوط
// به سیستم ERP هستند):
//   • A4 تمام‌صفحه: عرض 210mm (793.7px @96dpi) + ارتفاع 297mm
//   • سربرگ تیره: لوگوی P24 آبی + نام برند + تلفن/آدرس + نوار پایین
//   • عنوان «Quotation»/«Invoice» با فونت Georgia + زیرعنوان فارسی
//   • جدول اقلام: ردیف/شرح/تعداد/قیمت واحد/مبلغ کل + جزئیات هر قلم
//   • باکس ملاحظات + جمع‌بندی + مهر P24 + نوار فوتر
//   • در اپ: سایه/بORDER + اسکیل خودکار موبایل (DocScaler)
//   • در چاپ: فقط خود سند (print-doc در globals.css) ۱:۱ و لبه‌به‌لبه
//
// سرریز چندصفحه‌ای: اگر اقلام زیاد باشند min-height رعایت می‌شود و
// سند بلندتر از A4 می‌شود (break-inside-avoid جدول‌ها).

import * as React from "react";
import { COMPANY, CURRENCY } from "@/lib/constants";
import { formatDate } from "@/lib/format";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);
}

// ─── Types ─────────────────────────────────────────────────────────
export type P24DocItem = {
  name: string;
  /** خطوط جزئیات زیر نام قلم (توضیح/یادداشت/زمان‌بندی) */
  details?: string[];
  quantity: number;
  unit?: string;
  unitPrice: number;
  discount?: number;
  total: number;
};

export type P24Schedule = {
  designFrom: string | null;
  designTo: string | null;
  printFrom: string | null;
  printTo: string | null;
  perItem: boolean;
  designDone: string | null;
  printDone: string | null;
};

export type P24DocProps = {
  /** عنوان انگلیسی بزرگ (Georgia serif) */
  title: "Quotation" | "Invoice";
  /** عنوان فارسی کوچک زیر عنوان انگلیسی */
  faTitle: string;
  number: number;
  issueDate: string;
  customerName: string;
  customerPhone?: string | null;
  orderNumber?: number | null;
  /** پیش‌فاکتور: اعتبار تا */
  validUntil?: string | null;
  /** فاکتور: سررسید پرداخت */
  dueDate?: string | null;
  items: P24DocItem[];
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paid: number;
  paidLabel: string;
  /** زمان‌بندی اجرا (خواستهٔ فاز ۱۰ — روی سند) */
  schedule?: P24Schedule | null;
  notes?: string | null;
  terms?: string | null;
  /** خط پایانی سند (متن کوچک بالای نوار فوتر) */
  closingNote?: string;
};

// 210mm در 96dpi — برای اسکیل موبایل
const A4_WIDTH_PX = 793.7;
const A4_HEIGHT_PX = 1122.5;

// ─── DocScaler — اسکیل خودکار سند برای موبایل ─────────────────────
function DocScaler({ children }: { children: React.ReactNode }) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      setScale(w && w < A4_WIDTH_PX ? Math.max(0.28, w / A4_WIDTH_PX) : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      className="doc-scaler w-full flex justify-center overflow-hidden"
      style={scale < 1 ? { height: A4_HEIGHT_PX * scale } : undefined}
    >
      <div
        className="flex-shrink-0"
        style={{
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: "top center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Meta row داخل باکس مشخصات ─────────────────────────────────────
function MetaRow({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "brand" | "muted";
}) {
  return (
    <div className="flex gap-4 justify-between items-center">
      <span className="text-slate-400 font-medium shrink-0 text-xs">{label}:</span>
      <span
        className={
          tone === "brand"
            ? "font-black text-blue-600 text-base tabular-nums"
            : tone === "muted"
            ? "text-xs text-slate-500 text-left"
            : "font-bold text-slate-700 text-right text-sm"
        }
      >
        {children}
      </span>
    </div>
  );
}

// ─── سند اصلی ──────────────────────────────────────────────────────
export function P24Doc(props: P24DocProps) {
  const {
    title,
    faTitle,
    number,
    issueDate,
    customerName,
    customerPhone,
    orderNumber,
    validUntil,
    dueDate,
    items,
    subtotal,
    discount,
    taxRate,
    taxAmount,
    total,
    paid,
    paidLabel,
    schedule,
    notes,
    terms,
    closingNote,
  } = props;

  const remaining = Math.max(0, total - paid);
  const hasSchedule = !!(
    schedule &&
    (schedule.designFrom ||
      schedule.designTo ||
      schedule.printFrom ||
      schedule.printTo)
  );

  return (
    <DocScaler>
      {/* @page size از خط لولهٔ CSS بیلد حذف می‌شود (Lightning CSS) — مثل
          سایت، از داخل کامپوننت تزریق می‌شود تا کاغذ A4 لبه‌به‌لبه چاپ شود */}
      <style
        media="print"
        dangerouslySetInnerHTML={{ __html: "@page { size: A4 portrait; margin: 0; }" }}
      />
      <div
        id="printable-invoice"
        className="print-doc w-[210mm] max-w-none min-h-[297mm] bg-white shadow-2xl shadow-slate-300/30 border border-slate-200 flex flex-col overflow-hidden"
        dir="rtl"
      >
        {/* ── HEADER — سربرگ تیره با هویت شرکت ── */}
        <div className="bg-[#262626] shrink-0">
          <div className="flex items-center justify-between px-8 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-md shadow-black/20">
                <span className="text-white font-black text-base tracking-tight leading-none">P24</span>
              </div>
              <div>
                <p className="text-white font-black text-xl tracking-tight leading-none">{COMPANY.name}</p>
                <p className="text-white/50 text-xs mt-0.5 font-medium">{COMPANY.tagline}</p>
              </div>
            </div>
            <div className="text-left space-y-1.5">
              <div className="flex items-center justify-end gap-2 text-white/80 text-sm font-semibold" dir="ltr">
                {/* آیکون تلفن — inline SVG (سند چاپی مستقل از آیکون‌های اپ) */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <span dir="ltr">{COMPANY.phone}</span>
              </div>
              <div className="flex items-center justify-end gap-2 text-white/80 text-sm font-semibold">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>{COMPANY.address}</span>
              </div>
            </div>
          </div>
          <div className="bg-black/10 px-8 py-2 flex items-center justify-center">
            <p className="text-white/70 text-xs font-medium tracking-wide">{COMPANY.faName} — {COMPANY.name}</p>
          </div>
        </div>

        {/* ── عنوان + مشخصات سند ── */}
        <div className="px-8 py-6 flex items-start justify-between border-b border-slate-100 shrink-0">
          <div>
            <h1
              className="text-blue-600 font-light tracking-widest text-4xl leading-none"
              style={{ fontFamily: "Georgia, serif" }}
            >
              {title}
            </h1>
            <p className="text-slate-400 text-xs mt-1.5 font-medium tracking-wide">{faTitle}</p>
            <p className="text-slate-300 text-xs mt-0.5" dir="ltr">Page 1 of 1</p>
          </div>
          <div className="bg-slate-50 rounded-2xl border border-slate-100 px-5 py-4 space-y-2.5 min-w-[230px] text-sm">
            <MetaRow label="خریدار">{customerName}</MetaRow>
            <div className="h-px bg-slate-200" />
            <MetaRow label={`شماره ${faTitle}`} tone="brand">#{number}</MetaRow>
            <MetaRow label="تاریخ صدور"><span className="tabular-nums" dir="ltr">{formatDate(issueDate)}</span></MetaRow>
            {validUntil && <MetaRow label="اعتبار تا"><span className="tabular-nums" dir="ltr">{formatDate(validUntil)}</span></MetaRow>}
            {dueDate && <MetaRow label="سررسید پرداخت"><span className="tabular-nums" dir="ltr">{formatDate(dueDate)}</span></MetaRow>}
            {orderNumber != null && <MetaRow label="سفارش مرتبط" tone="muted">#{orderNumber}</MetaRow>}
            {customerPhone && <MetaRow label="تلفن" tone="muted"><span dir="ltr">{customerPhone}</span></MetaRow>}
          </div>
        </div>

        {/* ── جدول اقلام ── */}
        <div className="px-8 pt-6 flex-grow">
          <table className="w-full text-sm text-right border-collapse">
            <thead>
              <tr>
                <th className="pb-3 pr-3 text-slate-400 font-semibold text-xs tracking-widest w-10 border-b-2 border-[#262626]">ردیف</th>
                <th className="pb-3 px-3 text-slate-400 font-semibold text-xs tracking-widest text-right border-b-2 border-[#262626]">شرح کالا / خدمات</th>
                <th className="pb-3 px-3 text-slate-400 font-semibold text-xs tracking-widest text-center w-20 border-b-2 border-[#262626]">تعداد</th>
                <th className="pb-3 px-3 text-slate-400 font-semibold text-xs tracking-widest text-center w-28 border-b-2 border-[#262626]">قیمت واحد</th>
                <th className="pb-3 pl-3 text-slate-400 font-semibold text-xs tracking-widest text-left w-36 border-b-2 border-[#262626]">مبلغ کل</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-4 pr-3 text-slate-300 font-medium">{i + 1}</td>
                  <td className="py-4 px-3 text-slate-700 text-right">
                    <span className="font-bold block mb-1">{it.name}</span>
                    {(it.details ?? []).filter(Boolean).map((d, di) => (
                      <span key={di} className="text-xs font-medium text-slate-500 flex gap-1 mt-0.5">
                        <span className="text-slate-700">•</span>
                        <span>{d}</span>
                      </span>
                    ))}
                  </td>
                  <td className="py-4 px-3 text-center text-slate-700 font-medium tabular-nums">
                    {fmt(it.quantity)}
                    {it.unit ? <span className="text-slate-400 text-[10px] font-normal block">{it.unit}</span> : null}
                  </td>
                  <td className="py-4 px-3 text-center font-medium text-slate-700 tabular-nums" dir="ltr">
                    {fmt(it.unitPrice)}
                    {!!it.discount && <span className="text-amber-600 text-[10px] font-normal block">− {fmt(it.discount)}</span>}
                  </td>
                  <td className="py-4 pl-3 dir-ltr text-left font-bold text-slate-800 tabular-nums" dir="ltr">
                    {fmt(it.total)}
                    <span className="text-slate-400 text-[10px] font-normal ml-1">{CURRENCY}</span>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400 text-xs">بدون قلم</td>
                </tr>
              )}
              <tr>
                <td colSpan={5} className="py-4" />
              </tr>
            </tbody>
          </table>

          {/* ── زمان‌بندی اجرا (خواستهٔ ۳ فاز ۱۰) ── */}
          {hasSchedule && schedule && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 mb-2">
              <p className="text-slate-600 text-xs font-bold mb-2">
                {schedule.perItem ? "زمان‌بندی اجرای این آیتم" : "زمان‌بندی اجرای سفارش (کل گروه)"}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">طراحی: </span>
                  <span className="text-slate-700 font-medium tabular-nums">
                    {schedule.designFrom ? <span className="tabular-nums" dir="ltr">{formatDate(schedule.designFrom)}</span> : "—"}
                    {" تا "}
                    {schedule.designTo ? <span className="tabular-nums" dir="ltr">{formatDate(schedule.designTo)}</span> : "بدون پایان"}
                  </span>
                  {!schedule.perItem && schedule.designDone && (
                    <span className="text-emerald-700" dir="rtl"> (تکمیل: <span className="tabular-nums" dir="ltr">{formatDate(schedule.designDone)}</span>)</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-400 font-medium">چاپ: </span>
                  <span className="text-slate-700 font-medium tabular-nums">
                    {schedule.printFrom ? <span className="tabular-nums" dir="ltr">{formatDate(schedule.printFrom)}</span> : "—"}
                    {" تا "}
                    {schedule.printTo ? <span className="tabular-nums" dir="ltr">{formatDate(schedule.printTo)}</span> : "بدون پایان"}
                  </span>
                  {!schedule.perItem && schedule.printDone && (
                    <span className="text-emerald-700" dir="rtl"> (تکمیل: <span className="tabular-nums" dir="ltr">{formatDate(schedule.printDone)}</span>)</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── ملاحظات ── */}
        <div className="px-8 pb-6 shrink-0">
          <div className="border-r-4 border-blue-600 bg-slate-50 rounded-xl px-4 py-3 print:bg-transparent">
            <p className="text-slate-500 text-xs leading-relaxed">
              <span className="font-bold text-slate-700">ملاحظات: </span>
              {notes?.trim() ||
                "قیمت‌ها به دینار عراق (IQD) است. جهت شروع تولید، تایید این سند الزامی است."}
              {terms?.trim() ? (
                <>
                  <br />
                  <span className="font-bold text-slate-700">شرایط: </span>
                  {terms}
                </>
              ) : null}
            </p>
          </div>
        </div>

        {/* ── جمع‌بندی + مهر ── */}
        <div className="mt-auto print:break-inside-avoid shrink-0">
          <div className="px-8 pt-5 pb-6 border-t-2 border-slate-100">
            <div className="flex justify-between items-end gap-8">
              {/* مهر فروشنده */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="w-20 h-20 rounded-full border-2 border-dashed border-[#262626] flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-[#262626] font-black text-xs leading-tight">P24</p>
                    <p className="text-[#262626]/60 text-[9px] leading-tight mt-0.5 font-semibold">STAMP</p>
                  </div>
                </div>
                <p className="text-slate-400 text-xs font-medium">مهر و امضای فروشنده</p>
              </div>

              {/* جمع‌بندی مالی */}
              <div className="flex-1 max-w-xs space-y-1.5">
                <div className="flex justify-between items-center px-4 py-2 text-sm">
                  <span className="text-slate-500 font-medium">جمع کل اقلام</span>
                  <span className="text-slate-700 font-semibold tabular-nums" dir="ltr">{fmt(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between items-center px-4 py-2 text-sm">
                    <span className="text-slate-500 font-medium">تخفیف</span>
                    <span className="text-amber-600 font-semibold tabular-nums" dir="ltr">− {fmt(discount)}</span>
                  </div>
                )}
                {taxRate > 0 && (
                  <div className="flex justify-between items-center px-4 py-2 text-sm">
                    <span className="text-slate-500 font-medium">مالیات ({taxRate}٪)</span>
                    <span className="text-slate-700 font-semibold tabular-nums" dir="ltr">{fmt(taxAmount)}</span>
                  </div>
                )}
                <div className="bg-[#262626]/5 rounded-xl px-4 py-3 flex justify-between items-center border border-[#262626]/10">
                  <span className="font-black text-slate-800 text-sm">مبلغ قابل پرداخت</span>
                  <span className="font-black text-blue-600 text-lg tabular-nums" dir="ltr">
                    {fmt(total)}
                    <span className="text-xs font-medium text-slate-400 ml-1">{CURRENCY}</span>
                  </span>
                </div>
                <div className="flex justify-between items-center px-4 py-2 text-sm">
                  <span className="text-slate-500 font-medium">{paidLabel}</span>
                  <span className="text-emerald-600 font-semibold tabular-nums" dir="ltr">{fmt(paid)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2 text-sm border-t border-slate-100">
                  <span className="text-slate-600 font-bold">باقیمانده</span>
                  <span className={`font-bold tabular-nums ${remaining > 0 ? "text-rose-600" : "text-emerald-600"}`} dir="ltr">
                    {fmt(remaining)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {closingNote && (
            <p className="text-center text-[10px] text-slate-400 pb-3">{closingNote}</p>
          )}

          {/* ── نوار فوتر ── */}
          <div className="bg-[#262626] px-8 py-4 flex items-center justify-center gap-3">
            <span className="text-white font-black tracking-[0.2em] text-sm uppercase mx-2" dir="ltr">
              {COMPANY.website}
            </span>
          </div>
        </div>
      </div>
    </DocScaler>
  );
}
