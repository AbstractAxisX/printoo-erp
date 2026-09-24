// Printoo24 ERP — Phase 25.1: سرویس نرخ ارز لحظه‌ای (سرور) — منبع بازار
//
// زنجیرهٔ منابع (به‌ترتیب اولویت):
//   1) manual — نرخ دستی مالی/مستر؛ «چسبنده»: تا وقتی خودشان پاکش نکنند
//      حاکم است و فچ خودکار همان جفت را سایه نمی‌زند (POST {clear} → حذف).
//   2) market — TGJU (call1.tgju.org) بازار آزاد ایران: دلار ریالی +
//      دینارِ ریالی → هر دو جفت از همین یک منبع:
//        USD_IRT = price_dollar_rl ÷ 10
//        USD_IQD = price_dollar_rl ÷ price_iqd   (نرخ متقاطع بازار — منطبق بر
//                  بازار کرکوک/سلیمانیه؛ نرخ رسمی بانک مرکزی ~۱۶٪ پایین‌تر است)
//   3) official — open.er-api.com (نرخ رسمی/بین‌بانکی؛ فقط وقتی بازار در دسترس
//      نیست و نرخ بازار تازه‌ای (۷۲ساعت) در کش نداریم)
//   4) fallback — سیید اضطراری آفلاین.
//
// تاریخچه: هر فچِ «مغایر» یک ردیف جدید (dedupe: مقدار یکسان = بدون ردیف).
// fetchedAt ردیف = زمان واقعی نقل‌قول بازار (ts) — روی اسناد «as of» درج می‌شود.

import { db } from "@/lib/db";
import { FX_SEED, type FxRates } from "@/lib/money";

const TGJU_URL = "https://call1.tgju.org/ajax.json";
const ERAPI_URL = "https://open.er-api.com/v6/latest/USD";
const REFRESH_MS = 15 * 60 * 1000; // ۱۵ دقیقه — TGJU دقیقه‌ای به‌روز می‌شود
const FETCH_TIMEOUT_MS = 9000;
/** نرخ بازارِ روی‌صرفه را نگه می‌داریم (بازار تعطیل/قطعی) — بیشتر از این = stale */
const MARKET_KEEP_MS = 72 * 60 * 60 * 1000;

export type FxRateSource = "market" | "official" | "manual" | "fallback" | "auto"; // auto = ردیف‌های قدیمی فاز ۲۵

export type LiveRates = FxRates & {
  sources: { USD_IQD: FxRateSource; USD_IRT: FxRateSource };
  fetchedAt: { USD_IQD: Date | null; USD_IRT: Date | null };
  /** سن نرخ‌ها به ساعت (قدیمی‌ترین جفت) */
  ageHours: number;
  stale: boolean;
};

type PairRow = { rate: number; source: string; fetchedAt: Date };

// باندهای سلامت مطلق (واسع — سال‌ها جا دارد ولی زباله را رد می‌کند)
const BAND = {
  USD_IQD: [900, 3000] as const,
  USD_IRT: [60_000, 600_000] as const,
};
const inBand = (pair: "USD_IQD" | "USD_IRT", v: number) =>
  Number.isFinite(v) && v >= BAND[pair][0] && v <= BAND[pair][1];

/** «1,234,567» → 1234567 */
function parseNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  const n = Number(v.replace(/,/g, "").trim());
  return n;
}

async function latestPairs(): Promise<Record<string, PairRow>> {
  const rows = await db.fxRate.findMany({
    orderBy: { fetchedAt: "desc" },
    take: 80,
  });
  const out: Record<string, PairRow> = {};
  for (const r of rows) {
    if (!out[r.pair]) out[r.pair] = { rate: r.rate, source: r.source, fetchedAt: r.fetchedAt };
  }
  return out;
}

/** فچ بازار — TGJU: دلار و دینارِ ریالی → دو جفت. fetchedAt ردیف = زمان فچ سرور (مبنای واحد). */
async function fetchMarket(): Promise<{ USD_IQD: number; USD_IRT: number } | null> {
  try {
    const res = await fetch(TGJU_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Printoo24ERP/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      current?: Record<string, { p?: string; ts?: string }>;
    };
    const cur = data.current ?? {};
    const dollarRl = parseNum(cur.price_dollar_rl?.p); // ریال به‌ازای دلار
    const iqdRl = parseNum(cur.price_iqd?.p); // ریال به‌ازای دینار
    if (!Number.isFinite(dollarRl) || dollarRl < 100_000 || dollarRl > 20_000_000) return null;
    if (!Number.isFinite(iqdRl) || iqdRl < 100 || iqdRl > 20_000) return null;
    const usdIrt = dollarRl / 10; // تومان
    const usdIqd = dollarRl / iqdRl; // دینار (نرخ متقاطع بازار)
    if (!inBand("USD_IQD", usdIqd) || !inBand("USD_IRT", usdIrt)) return null;
    return { USD_IQD: usdIqd, USD_IRT: usdIrt };
  } catch {
    return null;
  }
}

/** فچ رسمی — open.er-api (فقط fallback؛ نرخ رسمی، نه بازار). */
async function fetchOfficial(): Promise<{ USD_IQD: number; USD_IRT: number } | null> {
  try {
    const res = await fetch(ERAPI_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== "success" || !data.rates) return null;
    const iqd = Number(data.rates.IQD);
    const irr = Number(data.rates.IRR);
    if (!inBand("USD_IQD", iqd)) return null;
    const irt = irr / 10;
    if (!inBand("USD_IRT", irt)) return null;
    return { USD_IQD: iqd, USD_IRT: irt };
  } catch {
    return null;
  }
}

/** درج با dedupe — مقدار مشابه (±۰.۵٪) و منبع یکسان = بدون ردیف جدید. */
async function insertPair(
  pair: "USD_IQD" | "USD_IRT",
  rate: number,
  source: FxRateSource,
  prev?: PairRow
) {
  const sameSource = prev?.source === source;
  const close =
    prev && Math.abs(prev.rate - rate) / Math.max(prev.rate, rate) < 0.005;
  if (sameSource && close) return; // بازار بسته/بی‌تغییر → ردیف تکراری نزن
  await db.fxRate.create({ data: { pair, rate, source, fetchedAt: new Date() } });
}

/**
 * نرخ زندهٔ سیستم — لِیزی:
 *  جفتِ دستی (manual) → چسبنده، فچ نمی‌شود.
 *  جفتِ خودکارِ کهنه (>۱۵دقیقه) → بازار (TGJU)؛ نبود بازارِ تازه (۷۲س) → رسمی.
 *  هیچ سطری نبود و هر دو فچ شکست → سیید اضطراری.
 */
export async function getLiveRates(): Promise<LiveRates> {
  let pairs = await latestPairs();
  const iqdRow = pairs["USD_IQD"];
  const irtRow = pairs["USD_IRT"];
  const ageOf = (r: PairRow | undefined) =>
    r ? Date.now() - new Date(r.fetchedAt).getTime() : Infinity;
  const older = Math.max(ageOf(iqdRow), ageOf(irtRow));

  // جفت‌هایی که فچ خودکار لازم دارند (دستی نیستند و کهنه‌اند)
  const needIqd = iqdRow?.source !== "manual" && (!iqdRow || ageOf(iqdRow) > REFRESH_MS);
  const needIrt = irtRow?.source !== "manual" && (!irtRow || ageOf(irtRow) > REFRESH_MS);

  if (needIqd || needIrt) {
    const market = await fetchMarket();
    if (market) {
      if (needIqd) await insertPair("USD_IQD", market.USD_IQD, "market", iqdRow);
      if (needIrt) await insertPair("USD_IRT", market.USD_IRT, "market", irtRow);
      pairs = await latestPairs();
    } else if (!iqdRow || !irtRow) {
      // هیچ نرخ معتبری برای حداقل یک جفت نیست → رسمی؛ آن هم نبود → سیید
      const official = await fetchOfficial();
      const fill: { pair: "USD_IQD" | "USD_IRT"; rate: number; source: FxRateSource }[] = [];
      if (!iqdRow) {
        fill.push({ pair: "USD_IQD", rate: official ? official.USD_IQD : FX_SEED.USD_IQD, source: official ? "official" : "fallback" });
      }
      if (!irtRow) {
        fill.push({ pair: "USD_IRT", rate: official ? official.USD_IRT : FX_SEED.USD_IRT, source: official ? "official" : "fallback" });
      }
      for (const f of fill) {
        await insertPair(f.pair, f.rate, f.source, pairs[f.pair]);
      }
      pairs = await latestPairs();
    } else if (older > MARKET_KEEP_MS) {
      // نرخ بازارِ تازه نداریم و کش هم >۷۲س قدیمی است → رسمی (بهتر از هیچ)
      const official = await fetchOfficial();
      if (official) {
        await insertPair("USD_IQD", official.USD_IQD, "official", iqdRow);
        await insertPair("USD_IRT", official.USD_IRT, "official", irtRow);
        pairs = await latestPairs();
      }
    }
    // بازار قطعی + کش تازه (≤۷۲س) → همان کش استفاده می‌شود (stale از ۲۴س)
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

/** تنظیم دستی نرخ (مالی/مستر) — چسبنده تا پاک‌شدن با clearManualRates. */
export async function setManualRates(input: { USD_IQD?: number; USD_IRT?: number }) {
  const at = new Date();
  if (Number.isFinite(input.USD_IQD) && (input.USD_IQD ?? 0) > 0) {
    await db.fxRate.create({ data: { pair: "USD_IQD", rate: Number(input.USD_IQD), source: "manual", fetchedAt: at } });
  }
  if (Number.isFinite(input.USD_IRT) && (input.USD_IRT ?? 0) > 0) {
    await db.fxRate.create({ data: { pair: "USD_IRT", rate: Number(input.USD_IRT), source: "manual", fetchedAt: at } });
  }
  return getLiveRates();
}

/** حذف نرخ دستی و بازگشت به خودکار (مالی/مستر) — فچ تازه بلافاصله. */
export async function clearManualRates(scope: "USD_IQD" | "USD_IRT" | "all") {
  const pairs = scope === "all" ? ["USD_IQD", "USD_IRT"] : [scope];
  await db.fxRate.deleteMany({ where: { pair: { in: pairs }, source: "manual" } });
  return getLiveRates();
}
