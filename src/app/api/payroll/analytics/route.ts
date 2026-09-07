import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// ─── Phase 16: GET /api/payroll/analytics?from=&to= ─────────────
// تحلیل و مانیتورینگ حقوق (فقط مالی):
//   kpis        → جمع پرداختی بازه / تعداد ماه / میانگین ماه / تعداد کارمندان
//   monthly     → [{ key, paidSum, entriesCount }] روند ماهانه
//   byModule    → [{ module, sum, count }] (کارمند چند-ماژولی در هر ماژولش)
//   byEmployee  → per-employee: جمع بازه / ماه‌ها / میانگین / آخرین پرداخت
//   advances    → ماندهٔ کسرنشده + مساعده‌های پرداختیِ بازه
//   lastDelta   → مقایسهٔ دو ماه آخر (٪ تغییر)

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
    const where = Object.keys(range).length > 0 ? { paidAt: range } : {};

    const entries = await db.payrollEntry.findMany({
      where: { status: "paid", ...where },
      include: { user: { select: { name: true, modules: { select: { module: true } } } } },
      orderBy: { paidAt: "asc" },
    });

    // ماهانه
    const monthlyMap = new Map<string, { paidSum: number; entriesCount: number }>();
    for (const e of entries) {
      const key = e.periodId; // بعداً به period.key تبدیل می‌شود
      const cur = monthlyMap.get(key) ?? { paidSum: 0, entriesCount: 0 };
      cur.paidSum += e.netPay;
      cur.entriesCount += 1;
      monthlyMap.set(key, cur);
    }
    const periodKeys = await db.payrollPeriod.findMany({
      where: { id: { in: [...monthlyMap.keys()] } },
      select: { id: true, key: true },
    });
    const keyOf = new Map(periodKeys.map((p) => [p.id, p.key]));
    const monthly = [...monthlyMap.entries()]
      .map(([pid, v]) => ({ key: keyOf.get(pid) ?? pid, ...v }))
      .sort((a, b) => a.key.localeCompare(b.key));

    // تفکیک ماژول (از snapshot؛ کارمند چند-ماژولی در هر ماژولش شمرده می‌شود)
    const byModuleMap = new Map<string, { sum: number; count: number }>();
    for (const e of entries) {
      const mods = (e.modulesSnapshot || "")
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean);
      const list = mods.length > 0 ? mods : ["none"];
      for (const m of list) {
        const cur = byModuleMap.get(m) ?? { sum: 0, count: 0 };
        cur.sum += e.netPay;
        cur.count += 1;
        byModuleMap.set(m, cur);
      }
    }
    const byModule = [...byModuleMap.entries()]
      .map(([module, v]) => ({ module, ...v }))
      .sort((a, b) => b.sum - a.sum);

    // per-employee
    const byEmpMap = new Map<
      string,
      { name: string; sum: number; months: Set<string>; lastPaidAt: Date | null; modules: string[] }
    >();
    for (const e of entries) {
      const cur =
        byEmpMap.get(e.userId) ??
        {
          name: e.user.name,
          sum: 0,
          months: new Set<string>(),
          lastPaidAt: null,
          modules: e.user.modules.map((m) => m.module),
        };
      cur.sum += e.netPay;
      cur.months.add(keyOf.get(e.periodId) ?? e.periodId);
      if (!cur.lastPaidAt || (e.paidAt && e.paidAt > cur.lastPaidAt)) cur.lastPaidAt = e.paidAt;
      byEmpMap.set(e.userId, cur);
    }
    const byEmployee = [...byEmpMap.entries()]
      .map(([id, v]) => ({
        userId: id,
        name: v.name,
        modules: v.modules,
        sum: v.sum,
        monthsCount: v.months.size,
        avg: v.months.size > 0 ? Math.round(v.sum / v.months.size) : 0,
        lastPaidAt: v.lastPaidAt,
      }))
      .sort((a, b) => b.sum - a.sum);

    // KPI
    const totalPaid = entries.reduce((s, e) => s + e.netPay, 0);
    const monthsCount = monthly.length;
    const avgPerMonth = monthsCount > 0 ? Math.round(totalPaid / monthsCount) : 0;

    // مساعده‌ها
    const pendingAgg = await db.payrollAdvance.aggregate({
      where: { deductedPeriodId: null },
      _sum: { amount: true },
      _count: true,
    });
    const advRange: Record<string, Date> = {};
    if (from) advRange.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      advRange.lte = end;
    }
    const paidAdvAgg = await db.payrollAdvance.aggregate({
      where: Object.keys(advRange).length > 0 ? { createdAt: advRange } : {},
      _sum: { amount: true },
      _count: true,
    });

    // مقایسهٔ دو ماه آخر
    let lastDelta: { currentKey: string | null; prevKey: string | null; current: number; prev: number; pct: number } | null = null;
    if (monthly.length >= 2) {
      const cur = monthly[monthly.length - 1];
      const prev = monthly[monthly.length - 2];
      const pct = prev.paidSum > 0 ? Math.round(((cur.paidSum - prev.paidSum) / prev.paidSum) * 100) : 100;
      lastDelta = {
        currentKey: cur.key,
        prevKey: prev.key,
        current: cur.paidSum,
        prev: prev.paidSum,
        pct,
      };
    }

    return NextResponse.json({
      kpis: {
        totalPaid,
        monthsCount,
        avgPerMonth,
        employeesCount: byEmployee.length,
        entriesCount: entries.length,
      },
      monthly,
      byModule,
      byEmployee,
      advances: {
        pendingSum: pendingAgg._sum.amount ?? 0,
        pendingCount: pendingAgg._count,
        paidInRangeSum: paidAdvAgg._sum.amount ?? 0,
        paidInRangeCount: paidAdvAgg._count,
      },
      lastDelta,
    });
  } catch (e) {
    return jsonError(e, "خطا در تحلیل حقوق");
  }
}
