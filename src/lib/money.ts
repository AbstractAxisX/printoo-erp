import { t } from "@/lib/i18n";
// Printoo24 ERP — Phase 25: هستهٔ چند-ارزی (IQD / USD / IRT)
//
// مبنای اصلی سیستم = دینار عراق (IQD). هر ورودی مالی ارز خودش را دارد؛
// جمع‌های بین-ارزی همیشه «معادل دیناری» (IQD-equivalent) با نرخ لحظه‌ای
// گزارش می‌شوند و عدد اصلی هر موجودیت در ارز خودش می‌ماند.
//
// IRT = تومان ایرانی (ریال ÷ ۱۰). نمایش: دینار/دلار/تومان.

export type Currency = "IQD" | "USD" | "IRT";

export const CURRENCIES: Record<
  Currency,
  { code: Currency; fa: string; short: string; suffix: string; decimals: number; chip: string }
> = {
  IQD: {
    code: "IQD",
    fa: t("دینار عراقی"),
    short: t("دینار"),
    suffix: "IQD",
    decimals: 0,
    chip: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
  },
  USD: {
    code: "USD",
    fa: t("دلار آمریکا"),
    short: t("دلار"),
    suffix: "USD",
    decimals: 2,
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  IRT: {
    code: "IRT",
    fa: t("تومان ایرانی"),
    short: t("تومان"),
    suffix: t("تومان"),
    decimals: 0,
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  },
};

export const CURRENCY_LIST: Currency[] = ["IQD", "USD", "IRT"];

/** نرمال‌سازی ارز از DB/API — مقدار نامعتبر → IQD (دیفالت امن). */
export function parseCurrency(v: string | null | undefined): Currency {
  return v === "USD" || v === "IRT" ? v : "IQD";
}

/** رندکردن بر اساس ارز — دینار/تومان عدد صحیح، دلار ۲ رقم اعشار. */
export function roundMoney(amount: number, cur: Currency): number {
  const d = CURRENCIES[cur].decimals;
  const f = Math.pow(10, d);
  return Math.round((Number(amount) || 0) * f) / f;
}

/** قالب‌بندی مبلغ + واحد ارز — «1,250,000 IQD» / «1,200.50 USD» / «3,000,000 تومان». */
export function formatMoney(amount: number | null | undefined, cur: Currency | string | null | undefined): string {
  const c = parseCurrency(cur);
  const n = Number(amount ?? 0) || 0;
  const num = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: CURRENCIES[c].decimals,
  }).format(n);
  return `${num} ${CURRENCIES[c].suffix}`;
}

/** فقط عدد گروه‌بندی‌شدهٔ ارز (بدون واحد). */
export function formatMoneyNumber(amount: number | null | undefined, cur: Currency | string | null | undefined): string {
  const c = parseCurrency(cur);
  const n = Number(amount ?? 0) || 0;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: CURRENCIES[c].decimals,
  }).format(n);
}

// ─── نرخ‌ها ────────────────────────────────────────────────────────────

/** دو نرخ محوری سیستم — هرچه نبود از سیید امن استفاده می‌شود. */
export type FxRates = {
  USD_IQD: number;
  USD_IRT: number; // 1 USD = چند تومان
};

/**
 * سیید اضطراری (آفلاین مطلق) — فاز ۲۵.۱: نرخ بازار آزاد (TGJU) ۲۰۲۶/۰۹.
 * فقط وقتی هیچ منبعی جواب ندهد؛ نمایشش با برچسب «پیش‌فرض اضطراری».
 */
export const FX_SEED: FxRates = { USD_IQD: 1560, USD_IRT: 234600 };

/** تبدیل ارز با محور دلار — بدون خطا، round بر اساس ارز مقصد. */
export function convertMoney(
  amount: number | null | undefined,
  from: Currency | string | null | undefined,
  to: Currency | string | null | undefined,
  rates: FxRates
): number {
  const f = parseCurrency(from);
  const t = parseCurrency(to);
  const a = Number(amount ?? 0) || 0;
  if (f === t) return a;
  const r: FxRates = {
    USD_IQD: rates.USD_IQD > 0 ? rates.USD_IQD : FX_SEED.USD_IQD,
    USD_IRT: rates.USD_IRT > 0 ? rates.USD_IRT : FX_SEED.USD_IRT,
  };
  // همه‌چیز به دلار، دلار به مقصد
  const inUsd = f === "USD" ? a : a / (f === "IQD" ? r.USD_IQD : r.USD_IRT);
  const out = t === "USD" ? inUsd : inUsd * (t === "IQD" ? r.USD_IQD : r.USD_IRT);
  return roundMoney(out, t);
}

/** نرخ متقابل دینار→تومان — «۱ دینار = X تومان» (۱ رقم اعشار). */
export function irtPerIqd(rates: FxRates): number {
  if (!rates.USD_IQD || !rates.USD_IRT) return 0;
  return Math.round((rates.USD_IRT / rates.USD_IQD) * 10) / 10;
}

// ─── جمع‌های چند-ارزی ──────────────────────────────────────────────────

export type MoneyItem = { amount: number; currency?: string | null };

/** جمع تفکیکی به تفکیک ارز → { IQD: 120000, USD: 30, IRT: 500000 } */
export function sumByCurrency(items: MoneyItem[]): Record<Currency, number> {
  const out: Record<Currency, number> = { IQD: 0, USD: 0, IRT: 0 };
  for (const it of items) {
    out[parseCurrency(it.currency)] += Number(it.amount) || 0;
  }
  return out;
}

/** معادل دیناری جمع چند-ارزی با نرخ لحظه‌ای (مبنای مانیتورینگ). */
export function toIqdEquivalent(per: Record<Currency, number>, rates: FxRates): number {
  return roundMoney(
    (per.IQD || 0) + convertMoney(per.USD || 0, "USD", "IQD", rates) + convertMoney(per.IRT || 0, "IRT", "IQD", rates),
    "IQD"
  );
}

/** جمع مستقیم معادل دیناری آیتم‌های چند-ارزی. */
export function sumIqdEquivalent(items: MoneyItem[], rates: FxRates): number {
  return toIqdEquivalent(sumByCurrency(items), rates);
}

/** متن جمع چند-ارزی: فقط IQD → «1,200 IQD»؛ ترکیبی → «1,200 IQD + 30 USD + …» (منفی‌ها هم دیده می‌شوند) */
export function formatSumPerCurrency(per: Record<Currency, number>): string {
  const parts = CURRENCY_LIST.filter((c) => Math.abs(per[c]) > 0.0001).map(
    (c) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: CURRENCIES[c].decimals }).format(per[c])} ${CURRENCIES[c].suffix}`
  );
  return parts.length ? parts.join(" + ") : "0 IQD";
}

// ─── نوع پرداخت حقوق (فرم ساده و شناور — فاز ۲۵) ─────────────────────

export type PayType = "monthly" | "daily" | "hourly" | "casual";

export const PAY_TYPES: Record<PayType, { label: string; chip: string; hint: string }> = {
  monthly: {
    label: t("ماهانه"),
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
    hint: t("حقوق ثابت ماهانه (از قرارداد)"),
  },
  daily: {
    label: t("روزانه"),
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    hint: t("نرخ روزانه × تعداد روز کارشده"),
  },
  hourly: {
    label: t("ساعتی"),
    chip: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
    hint: t("نرخ ساعت × تعداد ساعت"),
  },
  casual: {
    label: t("موردی (عشقی)"),
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    hint: t("پرداخت آزاد و بی‌دوره — هر مبلغ، هر زمان"),
  },
};

export const PAY_TYPE_LIST: PayType[] = ["monthly", "daily", "hourly", "casual"];

export function parsePayType(v: string | null | undefined): PayType {
  return v === "daily" || v === "hourly" || v === "casual" ? v : "monthly";
}
