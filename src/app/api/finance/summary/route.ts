import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

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

    const [pendingAgg, costAgg, revenueAgg, unsettledAgg, unsettledOrders, freeByCategory, costsByModule, pendingCount] =
      await Promise.all([
        db.materialCost.aggregate({
          where: { status: "pending", ...costRange },
          _sum: { amount: true },
        }),
        db.materialCost.aggregate({
          where: { status: "approved", ...costRange },
          _sum: { amount: true },
        }),
        db.revenueLog.aggregate({
          where: revenueRange,
          _sum: { amount: true },
        }),
        db.order.aggregate({
          where: { status: { not: "cancelled" } },
          _sum: { totalAmount: true, paidAmount: true },
        }),
        // SQLite فیلد-به-فیلد مقایسه نمی‌کند → فیلتر بستانکار در JS
        db.order.findMany({
          where: { status: { not: "cancelled" } },
          select: { totalAmount: true, paidAmount: true },
        }),
        db.materialCost.groupBy({
          by: ["expenseTypeId"],
          where: { status: "approved", orderId: null, ...costRange },
          _sum: { amount: true },
          _count: true,
        }),
        db.materialCost.groupBy({
          by: ["module"],
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

    const totalAll = unsettledAgg._sum.totalAmount ?? 0;
    const paidAll = unsettledAgg._sum.paidAmount ?? 0;
    const unsettledCount = unsettledOrders.filter((o) => o.totalAmount - o.paidAmount > 0.001).length;

    return NextResponse.json({
      pendingCount,
      pendingSum: pendingAgg._sum.amount ?? 0,
      costSum: costAgg._sum.amount ?? 0,
      revenueSum: revenueAgg._sum.amount ?? 0,
      netProfit: (revenueAgg._sum.amount ?? 0) - (costAgg._sum.amount ?? 0),
      unsettledSum: Math.max(0, totalAll - paidAll),
      unsettledCount,
      freeByCategory: freeByCategory
        .map((g) => ({
          id: g.expenseTypeId,
          name: g.expenseTypeId ? catName.get(g.expenseTypeId)?.name ?? "سایر" : "بدون دسته",
          sum: g._sum.amount ?? 0,
          count: g._count,
        }))
        .sort((a, b) => b.sum - a.sum),
      costsByModule: costsByModule
        .map((g) => ({ module: g.module, sum: g._sum.amount ?? 0, count: g._count }))
        .sort((a, b) => b.sum - a.sum),
    });
  } catch (e) {
    return jsonError(e, "خطا در محاسبهٔ خلاصهٔ مالی");
  }
}
