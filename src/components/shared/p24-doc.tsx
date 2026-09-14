"use client";

// Printoo24 ERP — P24Doc v2 (Phase 20)
//
// سند چاپی A4 انگلیسی برای فاکتور / پیش‌فاکتور / صورت‌حساب جمعی.
// بازطراحی کامل به سبک «اداری، تمیز، انگلیسی» با الهام از نمونهٔ کارفرما:
//   • نوار سربرگ تیره (#1C1917) + لوگو و اطلاعات شرکت + عنوان بزرگ
//   • بلوک BILL TO + ستون مشخصات سند
//   • جدول مینیمال: هدر تیره، بدون خط عمودی، جداکننده‌های افقی روشن
//   • جمع‌بندی مالی راست‌چین: SUBTOTAL / DISCOUNT / TAX / TOTAL /
//     PAID / BALANCE DUE
//   • ناحیه امضا + نوار فوتر تیره با وب‌سایت
//   • LTR، ارقام لاتین، تاریخ dd/MM/yyyy
//   • DocScaler برای موبایل + @page A4 لبه‌به‌لبه در چاپ

import * as React from "react";
import { COMPANY, CURRENCY } from "@/lib/constants";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);
}

/** تاریخ لاتین dd/MM/yyyy — مطابق نمونهٔ فاکتور */
function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

// ─── Types ─────────────────────────────────────────────────────────
export type P24DocItem = {
  name: string;
  /** خطوط جزئیات زیر نام قلم (توضیح/یادداشت) */
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
  /** عنوان انگلیسی بزرگ */
  title: "Quotation" | "Invoice" | "Statement";
  /** زیرعنوان کوچک طلایی زیر عنوان */
  subtitle?: string;
  /** برچسب شماره سند — پیش‌فرض از روی title */
  numberLabel?: string;
  number: number;
  issueDate: string;
  customerName: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
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
  /** برچسب مبلغ پرداخت‌شده (انگلیسی) — Paid / Deposit Received */
  paidLabel: string;
  /** زمان‌بندی اجرا (فقط پیش‌فاکتور) */
  schedule?: P24Schedule | null;
  notes?: string | null;
  terms?: string | null;
  /** خط پایانی سند (بالای نوار فوتر) */
  closingNote?: string;
};

/** ردیف سفارش در صورت‌حساب جمعی */
export type P24StatementRow = {
  number: number;
  date: string | null;
  /** خلاصهٔ اقلام (نام محصولات) */
  description: string;
  amount: number;
};

export type P24StatementProps = {
  title?: string;
  subtitle?: string;
  issueDate: string;
  customerName: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  rows: P24StatementRow[];
  /** جمع مبالغ سفارش‌ها */
  subtotal: number;
  /** جمع پرداخت‌ها */
  paid: number;
  notes?: string | null;
  closingNote?: string;
};

// ─── ثابت‌های طرح ──────────────────────────────────────────────────
const INK = "#1C1917"; // سرمه‌ای گرم — سربرگ/فوتر
const GOLD = "#D6A94E"; // طلایی — خطوط تاکیدی
const FONT =
  "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, 'Vazirmatn', sans-serif";

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

// ─── آیکون‌های خطی ریز (مستقل از آیکون‌های اپ) ──────────────────────
function IcoPhone({ className }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
function IcoPin({ className }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// ─── سربرگ تیره ────────────────────────────────────────────────────
function DocHeader({
  title,
  subtitle,
  numberLabel,
  number,
  issueDate,
}: {
  title: string;
  subtitle?: string;
  numberLabel: string;
  number: number | null;
  issueDate: string;
}) {
  return (
    <div className="shrink-0" style={{ background: INK }}>
      <div className="flex items-start justify-between gap-8 px-10 pt-8 pb-6">
        {/* هویت شرکت */}
        <div className="flex items-start gap-3.5 min-w-0">
          <div
            className="w-12 h-12 rounded-xl grid place-items-center shrink-0"
            style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${GOLD}66` }}
          >
            <span className="font-black text-[15px] tracking-tight leading-none" style={{ color: GOLD }}>
              P24
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-white font-extrabold text-[19px] tracking-[0.08em] leading-none">
              PRINTOO24
            </p>
            <p className="text-white/40 text-[9px] mt-1.5 font-semibold tracking-[0.24em] uppercase">
              Printing &amp; Design Services
            </p>
            <div className="mt-3 space-y-1 text-white/55 text-[10.5px] font-medium">
              <div className="flex items-center gap-1.5">
                <IcoPhone className="shrink-0" />
                <span className="tabular-nums">{COMPANY.phone}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <IcoPin className="shrink-0" />
                <span>{COMPANY.address}</span>
              </div>
            </div>
          </div>
        </div>

        {/* عنوان سند */}
        <div className="text-right shrink-0">
          <h1 className="text-white font-extralight leading-none" style={{ fontSize: 40, letterSpacing: "0.26em" }}>
            {title.toUpperCase()}
          </h1>
          {subtitle ? (
            <p className="mt-2.5 text-[9.5px] font-bold tracking-[0.3em] uppercase" style={{ color: GOLD }}>
              {subtitle}
            </p>
          ) : null}
          <div className="mt-3.5 flex items-center justify-end gap-2.5 text-[10.5px] text-white/70 font-medium">
            {number != null && (
              <>
                <span className="tabular-nums tracking-[0.12em]">NO. {fmt(number)}</span>
                <span className="text-white/25">|</span>
              </>
            )}
            <span className="tabular-nums">{fmtDate(issueDate)}</span>
          </div>
        </div>
      </div>
      {/* خط طلایی پایین سربرگ */}
      <div className="h-[3px]" style={{ background: GOLD, opacity: 0.85 }} />
    </div>
  );
}

// ─── BILL TO + مشخصات سند ──────────────────────────────────────────
function MetaRow({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-[7px] border-b border-stone-100 last:border-0">
      <span className="text-stone-400 font-semibold text-[10px] tracking-[0.14em] uppercase shrink-0">
        {label}
      </span>
      <span
        className={
          strong
            ? "font-bold text-[13px] text-stone-900 tabular-nums text-right"
            : "font-semibold text-[11.5px] text-stone-600 tabular-nums text-right"
        }
      >
        {children}
      </span>
    </div>
  );
}

function BillToBlock({
  customerName,
  customerPhone,
  customerAddress,
  meta,
}: {
  customerName: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  meta: React.ReactNode;
}) {
  return (
    <div className="px-10 py-6 flex items-start justify-between gap-10 border-b border-stone-200/80 shrink-0">
      {/* BILL TO */}
      <div className="min-w-0">
        <p className="text-[9.5px] font-bold tracking-[0.26em] uppercase text-stone-400 mb-2">
          Bill To
        </p>
        <p className="text-[17px] font-bold text-stone-800 leading-snug">{customerName}</p>
        {customerPhone ? (
          <p className="text-[11px] text-stone-500 mt-1.5 tabular-nums font-medium">
            Tel: {customerPhone}
          </p>
        ) : null}
        {customerAddress ? (
          <p className="text-[11px] text-stone-500 mt-0.5 font-medium">{customerAddress}</p>
        ) : null}
      </div>
      {/* ستون مشخصات */}
      <div className="w-[248px] shrink-0">{meta}</div>
    </div>
  );
}

// ─── جمع‌بندی مالی ──────────────────────────────────────────────────
function SummaryBlock({
  subtotal,
  discount,
  taxRate,
  taxAmount,
  total,
  paid,
  paidLabel,
}: {
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paid: number;
  paidLabel: string;
}) {
  const balance = Math.max(0, total - paid);
  return (
    <div className="w-[300px] shrink-0">
      <div className="flex justify-between items-center py-[7px] text-[12px]">
        <span className="text-stone-400 font-semibold tracking-[0.1em] uppercase text-[10px]">Subtotal</span>
        <span className="text-stone-700 font-semibold tabular-nums">{fmt(subtotal)}</span>
      </div>
      {discount > 0 && (
        <div className="flex justify-between items-center py-[7px] text-[12px]">
          <span className="text-stone-400 font-semibold tracking-[0.1em] uppercase text-[10px]">Discount</span>
          <span className="text-amber-600 font-semibold tabular-nums">− {fmt(discount)}</span>
        </div>
      )}
      {taxRate > 0 && (
        <div className="flex justify-between items-center py-[7px] text-[12px]">
          <span className="text-stone-400 font-semibold tracking-[0.1em] uppercase text-[10px]">Tax ({taxRate}%)</span>
          <span className="text-stone-700 font-semibold tabular-nums">{fmt(taxAmount)}</span>
        </div>
      )}
      {/* TOTAL — کاشی تیره */}
      <div
        className="mt-1.5 rounded-lg px-4 py-3 flex justify-between items-center text-white"
        style={{ background: INK }}
      >
        <span className="font-bold tracking-[0.18em] uppercase text-[11px]">Total</span>
        <span className="font-bold text-[16px] tabular-nums leading-none">
          {fmt(total)}
          <span className="text-[9px] font-medium text-white/50 ml-1.5 tracking-wide">{CURRENCY}</span>
        </span>
      </div>
      <div className="flex justify-between items-center py-[7px] text-[12px]">
        <span className="text-stone-500 font-semibold text-[10.5px] tracking-[0.1em] uppercase">{paidLabel}</span>
        <span className="text-emerald-600 font-semibold tabular-nums">{fmt(paid)}</span>
      </div>
      {/* BALANCE DUE */}
      <div
        className="mt-1 rounded-lg px-4 py-2.5 flex justify-between items-center border-2"
        style={{
          borderColor: balance > 0 ? "#E11D48" : "#059669",
        }}
      >
        <span
          className="font-bold tracking-[0.16em] uppercase text-[10.5px]"
          style={{ color: balance > 0 ? "#E11D48" : "#059669" }}
        >
          Balance Due
        </span>
        <span
          className="font-bold text-[15px] tabular-nums leading-none"
          style={{ color: balance > 0 ? "#E11D48" : "#059669" }}
        >
          {fmt(balance)}
          <span className="text-[9px] font-medium opacity-60 ml-1.5 tracking-wide">{CURRENCY}</span>
        </span>
      </div>
    </div>
  );
}

// ─── فوتر تیره ─────────────────────────────────────────────────────
function DocFooter({ closingNote }: { closingNote?: string }) {
  return (
    <div className="mt-auto shrink-0">
      {closingNote ? (
        <p className="text-center text-[9.5px] text-stone-400 font-medium pb-3.5 px-10">
          {closingNote}
        </p>
      ) : null}
      <div className="h-[3px]" style={{ background: GOLD, opacity: 0.85 }} />
      <div
        className="px-10 py-4 flex items-center justify-between gap-4"
        style={{ background: INK }}
      >
        <span className="text-white/45 text-[10px] font-medium tracking-wide">{COMPANY.email}</span>
        <span className="text-white font-bold tracking-[0.3em] uppercase text-[12.5px]">
          {COMPANY.website}
        </span>
        <span className="text-white/45 text-[10px] font-medium tabular-nums tracking-wide">
          {COMPANY.phone}
        </span>
      </div>
    </div>
  );
}

// ─── قاب سند (مشترک) ───────────────────────────────────────────────
function DocShell({ children }: { children: React.ReactNode }) {
  return (
    <DocScaler>
      {/* @page size از خط لولهٔ CSS بیلد حذف می‌شود (Lightning CSS) —
          از داخل کامپوننت تزریق می‌شود تا کاغذ A4 لبه‌به‌لبه چاپ شود */}
      <style
        media="print"
        dangerouslySetInnerHTML={{ __html: "@page { size: A4 portrait; margin: 0; }" }}
      />
      <div
        id="printable-invoice"
        className="print-doc w-[210mm] max-w-none min-h-[297mm] bg-white shadow-2xl shadow-slate-300/30 border border-slate-200 flex flex-col overflow-hidden"
        dir="ltr"
        style={{ fontFamily: FONT }}
      >
        {children}
      </div>
    </DocScaler>
  );
}

// ═══════════════════════════════════════════════════════════════════
// سند فاکتور / پیش‌فاکتور
// ═══════════════════════════════════════════════════════════════════
export function P24Doc(props: P24DocProps) {
  const {
    title,
    subtitle,
    numberLabel,
    number,
    issueDate,
    customerName,
    customerPhone,
    customerAddress,
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

  const label =
    numberLabel ?? (title === "Quotation" ? "Quotation No." : "Invoice No.");

  const hasSchedule = !!(
    schedule &&
    (schedule.designFrom ||
      schedule.designTo ||
      schedule.printFrom ||
      schedule.printTo)
  );

  return (
    <DocShell>
      <DocHeader
        title={title}
        subtitle={subtitle}
        numberLabel={label}
        number={number}
        issueDate={issueDate}
      />

      <BillToBlock
        customerName={customerName}
        customerPhone={customerPhone}
        customerAddress={customerAddress}
        meta={
          <>
            <MetaRow label={label} strong>{fmt(number)}</MetaRow>
            <MetaRow label="Issue Date">{fmtDate(issueDate)}</MetaRow>
            {validUntil && <MetaRow label="Valid Until">{fmtDate(validUntil)}</MetaRow>}
            {dueDate && <MetaRow label="Due Date">{fmtDate(dueDate)}</MetaRow>}
            {orderNumber != null && <MetaRow label="Order Ref.">#{fmt(orderNumber)}</MetaRow>}
          </>
        }
      />

      {/* ── جدول اقلام ── */}
      <div className="px-10 pt-7 flex-grow">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: INK }}>
              <th className="py-2.5 text-center text-white/90 font-bold text-[9px] tracking-[0.22em] uppercase w-10">No</th>
              <th className="py-2.5 text-left text-white/90 font-bold text-[9px] tracking-[0.22em] uppercase">Product / Description</th>
              <th className="py-2.5 text-center text-white/90 font-bold text-[9px] tracking-[0.22em] uppercase w-16">Qty</th>
              <th className="py-2.5 text-right text-white/90 font-bold text-[9px] tracking-[0.22em] uppercase w-28">Unit Price</th>
              <th className="py-2.5 text-right text-white/90 font-bold text-[9px] tracking-[0.22em] uppercase w-32">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-stone-100" style={{ breakInside: "avoid" }}>
                <td className="py-4 text-center text-stone-300 font-semibold text-[12px]">{i + 1}</td>
                <td className="py-4">
                  <span className="font-bold text-stone-800 text-[13px] block">{it.name}</span>
                  {(it.details ?? []).filter(Boolean).map((d, di) => (
                    <span key={di} className="text-[10.5px] font-medium text-stone-500 flex gap-1.5 mt-0.5">
                      <span className="text-stone-300">•</span>
                      <span>{d}</span>
                    </span>
                  ))}
                </td>
                <td className="py-4 text-center text-stone-700 font-semibold tabular-nums text-[12.5px]">
                  {fmt(it.quantity)}
                  {it.unit ? (
                    <span className="text-stone-400 text-[9px] font-normal block mt-0.5">{it.unit}</span>
                  ) : null}
                </td>
                <td className="py-4 text-right text-stone-700 font-semibold tabular-nums text-[12.5px]">
                  {fmt(it.unitPrice)}
                  {!!it.discount && (
                    <span className="text-amber-600 text-[9.5px] font-normal block mt-0.5">
                      − {fmt(it.discount)} disc.
                    </span>
                  )}
                </td>
                <td className="py-4 text-right font-bold text-stone-800 tabular-nums text-[13px]">
                  {fmt(it.total)}
                  <span className="text-stone-400 text-[9px] font-medium ml-1">{CURRENCY}</span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-stone-300 text-[11px] tracking-widest uppercase font-semibold">
                  No Items
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* ── زمان‌بندی اجرا (پیش‌فاکتور) ── */}
        {hasSchedule && schedule && (
          <div className="rounded-lg border border-stone-200 bg-stone-50/70 px-4 py-3 mt-5" style={{ breakInside: "avoid" }}>
            <p className="text-[9px] font-bold tracking-[0.24em] uppercase text-stone-400 mb-2.5">
              Production Schedule
            </p>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <span className="text-stone-400 font-semibold">Design: </span>
                <span className="text-stone-700 font-semibold tabular-nums">
                  {fmtDate(schedule.designFrom)} → {fmtDate(schedule.designTo) || "Open"}
                </span>
                {!schedule.perItem && schedule.designDone && (
                  <span className="text-emerald-600 font-semibold"> (Done {fmtDate(schedule.designDone)})</span>
                )}
              </div>
              <div>
                <span className="text-stone-400 font-semibold">Print: </span>
                <span className="text-stone-700 font-semibold tabular-nums">
                  {fmtDate(schedule.printFrom)} → {fmtDate(schedule.printTo) || "Open"}
                </span>
                {!schedule.perItem && schedule.printDone && (
                  <span className="text-emerald-600 font-semibold"> (Done {fmtDate(schedule.printDone)})</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── ملاحظات + جمع‌بندی + امضا ── */}
      <div className="px-10 pt-6 pb-8 shrink-0" style={{ breakInside: "avoid" }}>
        <div className="flex items-start justify-between gap-8">
          {/* ستون چپ: ملاحظات + امضا */}
          <div className="flex-1 min-w-0 space-y-5 pt-1">
            <div className="rounded-lg bg-stone-50 border border-stone-200/80 px-4 py-3 max-w-sm">
              <p className="text-[10.5px] text-stone-600 leading-relaxed">
                <span className="font-bold text-stone-800 tracking-wide uppercase text-[9.5px]">Notes: </span>
                {notes?.trim() ||
                  `All prices are in Iraqi Dinar (${CURRENCY}). Production begins upon approval of this document.`}
              </p>
              {terms?.trim() ? (
                <p className="text-[10.5px] text-stone-600 leading-relaxed mt-1.5">
                  <span className="font-bold text-stone-800 tracking-wide uppercase text-[9.5px]">Terms: </span>
                  {terms}
                </p>
              ) : null}
            </div>
            <div className="w-44 h-[74px] border-2 border-dashed border-stone-300 rounded-lg grid place-items-center">
              <span className="text-[8.5px] font-bold tracking-[0.24em] uppercase text-stone-400 text-center leading-relaxed px-2">
                Authorized
                <br />
                Signature &amp; Stamp
              </span>
            </div>
          </div>

          {/* ستون راست: جمع‌بندی */}
          <SummaryBlock
            subtotal={subtotal}
            discount={discount}
            taxRate={taxRate}
            taxAmount={taxAmount}
            total={total}
            paid={paid}
            paidLabel={paidLabel}
          />
        </div>
      </div>

      <DocFooter closingNote={closingNote} />
    </DocShell>
  );
}

// ═══════════════════════════════════════════════════════════════════
// صورت‌حساب جمعی سفارش‌های در جریان مشتری (فاز ۲۰ — خواستهٔ ۶)
// ═══════════════════════════════════════════════════════════════════
export function P24StatementDoc(props: P24StatementProps) {
  const {
    title = "Invoice",
    subtitle = "Active Orders Statement",
    issueDate,
    customerName,
    customerPhone,
    customerAddress,
    rows,
    subtotal,
    paid,
    notes,
    closingNote,
  } = props;

  const balance = Math.max(0, subtotal - paid);

  return (
    <DocShell>
      <DocHeader
        title={title}
        subtitle={subtitle}
        numberLabel="Orders"
        number={rows.length}
        issueDate={issueDate}
      />

      <BillToBlock
        customerName={customerName}
        customerPhone={customerPhone}
        customerAddress={customerAddress}
        meta={
          <>
            <MetaRow label="Issue Date" strong>{fmtDate(issueDate)}</MetaRow>
            <MetaRow label="Active Orders">{fmt(rows.length)}</MetaRow>
            <MetaRow label="Total Billed">{fmt(subtotal)} {CURRENCY}</MetaRow>
            <MetaRow label="Total Paid">{fmt(paid)} {CURRENCY}</MetaRow>
          </>
        }
      />

      {/* ── جدول سفارش‌ها ── */}
      <div className="px-10 pt-7 flex-grow">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: INK }}>
              <th className="py-2.5 text-center text-white/90 font-bold text-[9px] tracking-[0.22em] uppercase w-10">No</th>
              <th className="py-2.5 text-left text-white/90 font-bold text-[9px] tracking-[0.22em] uppercase w-20">Order</th>
              <th className="py-2.5 text-left text-white/90 font-bold text-[9px] tracking-[0.22em] uppercase">Description</th>
              <th className="py-2.5 text-right text-white/90 font-bold text-[9px] tracking-[0.22em] uppercase w-24">Date</th>
              <th className="py-2.5 text-right text-white/90 font-bold text-[9px] tracking-[0.22em] uppercase w-32">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-stone-100" style={{ breakInside: "avoid" }}>
                <td className="py-3.5 text-center text-stone-300 font-semibold text-[12px]">{i + 1}</td>
                <td className="py-3.5 text-center">
                  <span className="font-bold text-stone-800 text-[12.5px] tabular-nums">#{fmt(r.number)}</span>
                </td>
                <td className="py-3.5">
                  <span className="font-medium text-stone-700 text-[12px] block leading-snug">{r.description}</span>
                </td>
                <td className="py-3.5 text-right text-stone-500 font-semibold tabular-nums text-[11.5px]">
                  {fmtDate(r.date)}
                </td>
                <td className="py-3.5 text-right font-bold text-stone-800 tabular-nums text-[13px]">
                  {fmt(r.amount)}
                  <span className="text-stone-400 text-[9px] font-medium ml-1">{CURRENCY}</span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-stone-300 text-[11px] tracking-widest uppercase font-semibold">
                  No Active Orders
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── ملاحظات + جمع‌بندی + امضا ── */}
      <div className="px-10 pt-6 pb-8 shrink-0" style={{ breakInside: "avoid" }}>
        <div className="flex items-start justify-between gap-8">
          <div className="flex-1 min-w-0 space-y-5 pt-1">
            <div className="rounded-lg bg-stone-50 border border-stone-200/80 px-4 py-3 max-w-sm">
              <p className="text-[10.5px] text-stone-600 leading-relaxed">
                <span className="font-bold text-stone-800 tracking-wide uppercase text-[9.5px]">Notes: </span>
                {notes?.trim() ||
                  `This invoice aggregates all active orders of the customer. Prices are in Iraqi Dinar (${CURRENCY}).`}
              </p>
            </div>
            <div className="w-44 h-[74px] border-2 border-dashed border-stone-300 rounded-lg grid place-items-center">
              <span className="text-[8.5px] font-bold tracking-[0.24em] uppercase text-stone-400 text-center leading-relaxed px-2">
                Authorized
                <br />
                Signature &amp; Stamp
              </span>
            </div>
          </div>

          <div className="w-[300px] shrink-0">
            <div className="flex justify-between items-center py-[7px] text-[12px]">
              <span className="text-stone-400 font-semibold tracking-[0.1em] uppercase text-[10px]">Subtotal</span>
              <span className="text-stone-700 font-semibold tabular-nums">{fmt(subtotal)}</span>
            </div>
            <div
              className="mt-1.5 rounded-lg px-4 py-3 flex justify-between items-center text-white"
              style={{ background: INK }}
            >
              <span className="font-bold tracking-[0.18em] uppercase text-[11px]">Total</span>
              <span className="font-bold text-[16px] tabular-nums leading-none">
                {fmt(subtotal)}
                <span className="text-[9px] font-medium text-white/50 ml-1.5 tracking-wide">{CURRENCY}</span>
              </span>
            </div>
            <div className="flex justify-between items-center py-[7px] text-[12px]">
              <span className="text-stone-500 font-semibold text-[10.5px] tracking-[0.1em] uppercase">Total Paid</span>
              <span className="text-emerald-600 font-semibold tabular-nums">{fmt(paid)}</span>
            </div>
            <div
              className="mt-1 rounded-lg px-4 py-2.5 flex justify-between items-center border-2"
              style={{ borderColor: balance > 0 ? "#E11D48" : "#059669" }}
            >
              <span
                className="font-bold tracking-[0.16em] uppercase text-[10.5px]"
                style={{ color: balance > 0 ? "#E11D48" : "#059669" }}
              >
                Balance Due
              </span>
              <span
                className="font-bold text-[15px] tabular-nums leading-none"
                style={{ color: balance > 0 ? "#E11D48" : "#059669" }}
              >
                {fmt(balance)}
                <span className="text-[9px] font-medium opacity-60 ml-1.5 tracking-wide">{CURRENCY}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <DocFooter closingNote={closingNote} />
    </DocShell>
  );
}
