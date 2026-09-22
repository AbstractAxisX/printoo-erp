import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff } from "@/lib/access";
import { jsonError } from "@/lib/api-error";
import { sumByCurrency, toIqdEquivalent, type Currency, type FxRates } from "@/lib/money";
import { getLiveRates } from "@/lib/fx";

// ─── Phase 15: خلاصهٔ مالی — GET /api/finance/summary?from=&to= ────
// اعداد اوورویو داشبورد مالی:
//   pendingCount/pendingSum  → هزینه‌های در انتظار تأیید
//   costSum                  → مجموع هزینه‌های تأییدشده (روی سفارش + آزاد)
//   revenueSum               → مجموع درآمدها (لاگ‌های درآمد در بازه)
//   netProfit                → درآمد − هزینه
//   unsettledSum/count       → بستانکار (Σ total−paid سفارش‌های فعال)
//   freeByCategory           → هزینهٔ آزاد به تفکیک دسته (حقوق، اجاره…)
//   costsByModule            → هزینه به تفکیک ماژول ثبت‌کننده
// همهٔ اعدادِ بازه‌ای فقط در همان بازه محاسبه می‌شوند (فیلتر سراسری
// داشبورد)؛ تسویه‌نشده همیشه «الان» است (وضعیت لحظه‌ای).
//
// ─── Phase 25: چند-ارزی ────────────────────────────────────────────
// همهٔ مجموع‌ها «تفکیکی به ارز» + «معادل دیناری» برگردانده می‌شوند:
//   sums: { costs|revenue|pending|unsettled: { per: {IQD,USD,IRT}, iqdEq },
//           netProfitIqd }
// فیلدهای مسطح قبلی (costSum و…) = معادل دیناری (سازگار با UI قدیمی).
// freeByCategory/costsByModule هر گروه sums خودش را دارد.

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!isFinanceStaff(user)) {
    return NextResponse.json({ error: "دسترسی محدود به واحد مالی" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const range: Record<string, Date> = {};
    if (from) range.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      range.lte = end;
    }
    const hasRange = from || to;

    const costRange = hasRange ? { createdAt: range } : {};
    const revenueRange = hasRange ? { createdAt: range } : {};

    const [pendingRows, costRows, revenueRows, unsettledOrders, freeByCategory, costsByModule, pendingCount] =
      await Promise.all([
        db.materialCost.findMany({
          where: { status: "pending", ...costRange },
          select: { amount: true, currency: true },
        }),
        db.materialCost.findMany({
          where: { status: "approved", ...costRange },
          select: { amount: true, currency: true },
        }),
        db.revenueLog.findMany({
          where: revenueRange,
          select: { amount: true, currency: true },
        }),
        // SQLite فیلد-به-فیلد مقایسه نمی‌کند → فیلتر بستانکار در JS
        db.order.findMany({
          where: { status: { not: "cancelled" } },
          select: { totalAmount: true, paidAmount: true, currency: true },
        }),
        db.materialCost.groupBy({
          by: ["expenseTypeId", "currency"],
          where: { status: "approved", orderId: null, ...costRange },
          _sum: { amount: true },
          _count: true,
        }),
        db.materialCost.groupBy({
          by: ["module", "currency"],
          where: { status: "approved", ...costRange },
          _sum: { amount: true },
          _count: true,
        }),
        db.materialCost.count({ where: { status: "pending", ...costRange } }),
      ]);

    // نام دسته‌ها برای گروه‌بندی هزینهٔ آزاد
    const categoryIds = freeByCategory
      .map((g) => g.expenseTypeId)
      .filter((x): x is string => !!x);
    const categories = categoryIds.length
      ? await db.expenseType.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true, isDefault: true } })
      : [];
    const catName = new Map(categories.map((c) => [c.id, c]));

    // ── فاز ۲۵: نرخ لحظه‌ای + جمع‌های تفکیکی ──
    let rates: FxRates;
    try {
      rates = await getLiveRates();
    } catch {
      rates = { USD_IQD: 1310, USD_IRT: 150000 };
    }
    const perOf = (rows: { amount: number; currency: string }[]) =>
      sumByCurrency(rows.map((r) => ({ amount: Math.abs(r.amount), currency: r.currency })));

    const pendingPer = perOf(pendingRows);
    const costPer = perOf(costRows);
    const revenuePer = perOf(revenueRows);
    const pendingIqd = toIqdEquivalent(pendingPer, rates);
    const costIqd = toIqdEquivalent(costPer, rates);
    const revenueIqd = toIqdEquivalent(revenuePer, rates);

    // بستانکار: سفارش‌های فعال با total − paid > 0 — به تفکیک ارز
    const unsettledPer: Record<Currency, number> = { IQD: 0, USD: 0, IRT: 0 };
    let unsettledCount = 0;
    for (const o of unsettledOrders) {
      const d = o.totalAmount - o.paidAmount;
      if (d > 0.001) {
        unsettledCount++;
        unsettledPer[(o.currency === "USD" || o.currency === "IRT" ? o.currency : "IQD") as Currency] += d;
      }
    }
    const unsettledIqd = toIqdEquivalent(unsettledPer, rates);

    // گروه‌بندی دسته/ماژول با ادغام ارزی + معادل دیناری هر گروه
    const mergeGroups = <T extends { per: Record<Currency, number>; count: number }>(m: Map<string, T>, key: string, per: Record<Currency, number>, count: number) => {
      const g = m.get(key) ?? ({ per: { IQD: 0, USD: 0, IRT: 0 }, count: 0 } as T);
      (Object.keys(per) as Currency[]).forEach((c) => (g.per[c] += per[c]));
      g.count += count;
      m.set(key, g);
      return g;
    };
    const catMap = new Map<string, { per: Record<Currency, number>; count: number }>();
    for (const g of freeByCategory) {
      const key = g.expenseTypeId ?? "__none__";
      const cur = (g.currency === "USD" || g.currency === "IRT" ? g.currency : "IQD") as Currency;
      mergeGroups(catMap, key, { IQD: 0, USD: 0, IRT: 0, [cur]: g._sum.amount ?? 0 } as unknown as Record<Currency, number>, g._count);
    }
    const modMap = new Map<string, { per: Record<Currency, number>; count: number }>();
    for (const g of costsByModule) {
      const cur = (g.currency === "USD" || g.currency === "IRT" ? g.currency : "IQD") as Currency;
      mergeGroups(modMap, g.module, { IQD: 0, USD: 0, IRT: 0, [cur]: g._sum.amount ?? 0 } as unknown as Record<Currency, number>, g._count);
    }

    return NextResponse.json({
      pendingCount,
      pendingSum: pendingIqd,
      costSum: costIqd,
      revenueSum: revenueIqd,
      netProfit: revenueIqd - costIqd,
      unsettledSum: unsettledIqd,
      unsettledCount,
      // ── فاز ۲۵: جمع تفکیکی + معادل دیناری + نرخ لحظه‌ای ──
      sums: {
        pending: { per: pendingPer, iqdEq: pendingIqd },
        costs: { per: costPer, iqdEq: costIqd },
        revenue: { per: revenuePer, iqdEq: revenueIqd },
        unsettled: { per: unsettledPer, iqdEq: unsettledIqd },
        netProfitIqd: revenueIqd - costIqd,
        rates: { USD_IQD: rates.USD_IQD, USD_IRT: rates.USD_IRT },
      },
      freeByCategory: [...catMap.entries()]
        .map(([id, g]) => ({
          id: id === "__none__" ? null : id,
          name: id !== "__none__" && catName.get(id)?.name ? catName.get(id)!.name : id === "__none__" ? "بدون دسته" : "سایر",
          sum: toIqdEquivalent(g.per, rates), // معادل دیناری (سازگار)
          sums: { per: g.per, iqdEq: toIqdEquivalent(g.per, rates) },
          count: g.count,
        }))
        .sort((a, b) => b.sum - a.sum),
      costsByModule: [...modMap.entries()]
        .map(([module, g]) => ({
          module,
          sum: toIqdEquivalent(g.per, rates), // معادل دیناری (سازگار)
          sums: { per: g.per, iqdEq: toIqdEquivalent(g.per, rates) },
          count: g.count,
        }))
        .sort((a, b) => b.sum - a.sum),
    });
  } catch (e) {
    return jsonError(e, "خطا در محاسبهٔ خلاصهٔ مالی");
  }
}
