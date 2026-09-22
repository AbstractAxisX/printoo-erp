// Printoo24 ERP — Phase 25: سرویس نرخ ارز لحظه‌ای (سرور)
//
// منبع خودکار: open.er-api.com (بدون کلید، روزانه، IQD + IRR هر دو را دارد؛
// تومان = ریال ÷ ۱۰). نرخ‌ها در جدول FxRate کش می‌شوند (هر fetch یک ردیف
// تاریخچه). ویرایش دستی مالی/مستر یک ردیف source=manual می‌سازد که تا
// fetch بعدی معتبر می‌ماند — چون فچ خودکار فقط وقتی «کهنه» بود انجام
// می‌شود، نرخ دستیِ تازه عملاً تا یک ساعت حاکم است.
//
// هرگز خطا نمی‌دهد: API قطع → کش قدیمی → سیید اضطراری (source=fallback).

import { db } from "@/lib/db";
import { FX_SEED, type FxRates } from "@/lib/money";

const FETCH_URL = "https://open.er-api.com/v6/latest/USD";
const REFRESH_MS = 60 * 60 * 1000; // ۱ ساعت — تلاش فچ مجدد
const FETCH_TIMEOUT_MS = 8000;

export type FxRateSource = "auto" | "manual" | "fallback";

export type LiveRates = FxRates & {
  sources: { USD_IQD: FxRateSource; USD_IRT: FxRateSource };
  fetchedAt: { USD_IQD: Date | null; USD_IRT: Date | null };
  /** سن نرخ‌ها به ساعت (قدیمی‌ترین جفت) */
  ageHours: number;
  stale: boolean;
};

type PairRow = { rate: number; source: string; fetchedAt: Date };

async function latestPairs(): Promise<Record<string, PairRow>> {
  const rows = await db.fxRate.findMany({
    orderBy: { fetchedAt: "desc" },
    take: 40,
  });
  const out: Record<string, PairRow> = {};
  for (const r of rows) {
    if (!out[r.pair]) out[r.pair] = { rate: r.rate, source: r.source, fetchedAt: r.fetchedAt };
  }
  return out;
}

/** فچ از API عمومی — فقط جفت‌های USD_IQD و USD_IRT را می‌سازد. */
async function fetchRemote(): Promise<{ USD_IQD: number; USD_IRT: number } | null> {
  try {
    const res = await fetch(FETCH_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== "success" || !data.rates) return null;
    const iqd = Number(data.rates.IQD);
    const irr = Number(data.rates.IRR);
    if (!Number.isFinite(iqd) || iqd <= 0) return null;
    if (!Number.isFinite(irr) || irr <= 0) return null;
    const irt = irr / 10;
    if (irt < 100 || irt > 10_000_000) return null; // گارد سلامت
    if (iqd < 100 || iqd > 100_000) return null;
    return { USD_IQD: iqd, USD_IRT: irt };
  } catch {
    return null;
  }
}

async function insertPairs(rates: { USD_IQD: number; USD_IRT: number }, source: FxRateSource) {
  await db.fxRate.createMany({
    data: [
      { pair: "USD_IQD", rate: rates.USD_IQD, source },
      { pair: "USD_IRT", rate: rates.USD_IRT, source },
    ],
  });
}

/**
 * نرخ زندهٔ سیستم — لِیزی: اگر نرخ‌ها کهنه باشند (بیش از ۱ ساعت) فچ
 * خودکار تلاش می‌شود؛ شکست → همان کش قدیمی استفاده می‌شود (stale=true).
 * هیچ سطر نبود → فچ؛ باز هم شکست → سیید اضطراری.
 */
export async function getLiveRates(): Promise<LiveRates> {
  let pairs = await latestPairs();
  const iqdRow = pairs["USD_IQD"];
  const irtRow = pairs["USD_IRT"];
  const ageOf = (r: PairRow | undefined) => (r ? Date.now() - new Date(r.fetchedAt).getTime() : Infinity);
  const older = Math.max(ageOf(iqdRow), ageOf(irtRow));

  if (!iqdRow || !irtRow || older > REFRESH_MS) {
    const fresh = await fetchRemote();
    if (fresh) {
      await insertPairs(fresh, "auto");
      pairs = await latestPairs();
    } else if (!iqdRow || !irtRow) {
      // هیچ نرخ معتبری در سیستم نیست و API هم جواب نداد → سیید اضطراری
      await insertPairs(FX_SEED, "fallback");
      pairs = await latestPairs();
    }
  }

  const fiqd = pairs["USD_IQD"];
  const firt = pairs["USD_IRT"];
  const USD_IQD = fiqd?.rate ?? FX_SEED.USD_IQD;
  const USD_IRT = firt?.rate ?? FX_SEED.USD_IRT;
  const tIqd = fiqd ? new Date(fiqd.fetchedAt).getTime() : 0;
  const tIrt = firt ? new Date(firt.fetchedAt).getTime() : 0;
  const ageHours = (Date.now() - Math.min(tIqd, tIrt)) / 3_600_000;

  return {
    USD_IQD,
    USD_IRT,
    sources: {
      USD_IQD: (fiqd?.source as FxRateSource) ?? "fallback",
      USD_IRT: (firt?.source as FxRateSource) ?? "fallback",
    },
    fetchedAt: {
      USD_IQD: fiqd ? new Date(fiqd.fetchedAt) : null,
      USD_IRT: firt ? new Date(firt.fetchedAt) : null,
    },
    ageHours: Number.isFinite(ageHours) ? ageHours : 0,
    stale: ageHours > 24,
  };
}

/** تنظیم دستی نرخ (مالی/مستر) — فقط جفت‌های داده‌شده ردیف manual می‌گیرند. */
export async function setManualRates(input: { USD_IQD?: number; USD_IRT?: number }) {
  const data: { pair: string; rate: number; source: "manual" }[] = [];
  if (Number.isFinite(input.USD_IQD) && (input.USD_IQD ?? 0) > 0) {
    data.push({ pair: "USD_IQD", rate: Number(input.USD_IQD), source: "manual" });
  }
  if (Number.isFinite(input.USD_IRT) && (input.USD_IRT ?? 0) > 0) {
    data.push({ pair: "USD_IRT", rate: Number(input.USD_IRT), source: "manual" });
  }
  if (data.length === 0) {
    throw new Error("حداقل یک نرخ معتبر لازم است");
  }
  await db.fxRate.createMany({ data });
  return getLiveRates();
}
