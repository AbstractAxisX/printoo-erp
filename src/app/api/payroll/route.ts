import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff } from "@/lib/access";
import { jsonError } from "@/lib/api-error";
import { sumByCurrency, toIqdEquivalent, parsePayType, type Currency } from "@/lib/money";
import { getLiveRates } from "@/lib/fx";

// ─── Phase 16: GET/POST /api/payroll ───────────────────────────
// GET  ?periodId= → دورهٔ خواسته‌شده (پیش‌فرض: دورهٔ جاری + ensure خودکار)
//      { current{ entries[], totals }, periods[], advances[] }
// POST {} → ایجاد/تضمین دورهٔ ماه جاری + ورودی همهٔ کارمندان فعال
// (idempotent) — فقط مالی/مستر.

export function periodKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthBounds(y: number, m0: number): { start: string; end: string } {
  const p = (x: number) => String(x).padStart(2, "0");
  const last = new Date(y, m0 + 1, 0).getDate();
  return { start: `${y}-${p(m0 + 1)}-01`, end: `${y}-${p(m0 + 1)}-${p(last)}` };
}

/** دورهٔ ماهِ تاریخ داده‌شده را تضمین می‌کند (نبود → می‌سازد + ورودی کارمندان). */
export async function ensurePeriod(d: Date) {
  const key = periodKeyOf(d);
  const { start, end } = monthBounds(d.getFullYear(), d.getMonth());

  let period = await db.payrollPeriod.findUnique({ where: { key } });
  if (!period) {
    period = await db.payrollPeriod.create({ data: { key, startDate: start, endDate: end } });
  }

  // ورودی برای همهٔ کارمندان فعالِ غیر-master که هنوز ندارند
  const employees = await db.user.findMany({
    where: { status: "active", role: { not: "master" } },
    select: {
      id: true, name: true, baseSalary: true,
      modules: { select: { module: true } },
      payrollEntries: { where: { periodId: period.id }, select: { id: true } },
    },
    orderBy: { name: "asc" },
  });

  const missing = employees.filter((e) => e.payrollEntries.length === 0);
  if (missing.length > 0) {
    await db.payrollEntry.createMany({
      data: missing.map((e) => ({
        periodId: period.id,
        userId: e.id,
        baseSalary: e.baseSalary ?? 0,
        modulesSnapshot: e.modules.map((m) => m.module).join(","),
      })),
    });
  }
  return period;
}

async function loadPeriodDetail(periodId: string) {
  const period = await db.payrollPeriod.findUnique({
    where: { id: periodId },
    include: {
      paidByUser: { select: { name: true } },
      entries: {
        orderBy: [{ status: "desc" }, { user: { name: "asc" } }],
        include: {
          user: {
            select: {
              id: true, name: true, email: true, role: true, status: true, baseSalary: true,
              modules: { select: { module: true } },
            },
          },
          cost: { select: { id: true, amount: true, createdAt: true } },
        },
      },
    },
  });
  if (!period) return null;

  // مساعده‌های کسرنشدهٔ هر کارمند (برای hint فرم) — فاز ۲۵: به تفکیک ارز
  const userIds = period.entries.map((e) => e.userId);
  const pendingAdvances = await db.payrollAdvance.findMany({
    where: { userId: { in: userIds }, deductedPeriodId: null },
    select: { userId: true, amount: true, currency: true },
  });
  const pendingByUser = new Map<string, Record<Currency, number>>();
  for (const a of pendingAdvances) {
    const cur = (a.currency === "USD" || a.currency === "IRT" ? a.currency : "IQD") as Currency;
    const m = pendingByUser.get(a.userId) ?? { IQD: 0, USD: 0, IRT: 0 };
    m[cur] += a.amount;
    pendingByUser.set(a.userId, m);
  }

  const entries = period.entries.map((e) => ({
    id: e.id,
    userId: e.userId,
    name: e.user.name,
    email: e.user.email,
    role: e.user.role,
    userStatus: e.user.status,
    modules: e.user.modules.map((m) => m.module),
    userBaseSalary: e.user.baseSalary ?? 0,
    status: e.status,
    payType: e.payType, // فاز ۲۵: نوع پرداخت
    currency: e.currency, // فاز ۲۵: ارز
    baseSalary: e.baseSalary,
    daysWorked: e.daysWorked, // فاز ۲۵: روز کارشده
    overtimeHours: e.overtimeHours,
    overtimeRate: e.overtimeRate,
    bonus: e.bonus,
    deduction: e.deduction,
    insurance: e.insurance,
    tax: e.tax,
    advanceDeducted: e.advanceDeducted,
    netPay: e.netPay,
    note: e.note,
    paidAt: e.paidAt,
    costId: e.costId,
    pendingAdvanceSum: pendingByUser.get(e.userId)?.IQD ?? 0, // سازگار (دینار)
    pendingAdvanceSums: pendingByUser.get(e.userId) ?? { IQD: 0, USD: 0, IRT: 0 }, // فاز ۲۵
  }));

  // ── فاز ۲۵: جمع تفکیکی به ارز + معادل دیناری (نرخ لحظه‌ای) ──
  let rates = { USD_IQD: 1310, USD_IRT: 150000 };
  try {
    const live = await getLiveRates();
    rates = { USD_IQD: live.USD_IQD, USD_IRT: live.USD_IRT };
  } catch {}
  const netPer = sumByCurrency(entries.map((e) => ({ amount: e.netPay, currency: e.currency })));
  const paidPer = sumByCurrency(entries.filter((e) => e.status === "paid").map((e) => ({ amount: e.netPay, currency: e.currency })));

  const totals = entries.reduce(
    (acc, e) => {
      const pt = parsePayType(e.payType);
      const ot = pt === "hourly" ? 0 : e.overtimeHours * e.overtimeRate;
      const gross = pt === "daily" ? e.baseSalary * e.daysWorked : pt === "hourly" ? e.overtimeHours * e.overtimeRate : e.baseSalary;
      acc.count += 1;
      acc.base += pt === "hourly" ? 0 : gross;
      acc.overtime += ot;
      acc.bonus += e.bonus;
      acc.deduction += e.deduction;
      acc.insurance += e.insurance;
      acc.tax += e.tax;
      acc.advance += e.advanceDeducted;
      acc.net += e.netPay;
      if (e.status === "paid") {
        acc.paidCount += 1;
        acc.paidSum += e.netPay;
      }
      return acc;
    },
    { count: 0, base: 0, overtime: 0, bonus: 0, deduction: 0, insurance: 0, tax: 0, advance: 0, net: 0, paidCount: 0, paidSum: 0 }
  );
  // فاز ۲۵: جمع «هم‌ارز» (فقط وقتی همه یک ارز باشند معنادار است)
  const netIqdEq = toIqdEquivalent(netPer, rates);
  const paidIqdEq = toIqdEquivalent(paidPer, rates);

  return {
    id: period.id,
    key: period.key,
    status: period.status,
    startDate: period.startDate,
    endDate: period.endDate,
    note: period.note,
    paidAt: period.paidAt,
    paidByName: period.paidByUser?.name ?? null,
    totalNet: period.totalNet,
    entriesCount: period.entriesCount,
    entries,
    totals,
    // ─── فاز ۲۵: جمع تفکیکی ارزی + معادل دیناری + نرخ لحظه‌ای ───
    currencyTotals: {
      net: { per: netPer, iqdEq: netIqdEq },
      paid: { per: paidPer, iqdEq: paidIqdEq },
      rates,
    },
  };
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!isFinanceStaff(user)) {
    return NextResponse.json({ error: "دسترسی محدود به واحد مالی" }, { status: 403 });
  }
  try {
    const periodId = new URL(req.url).searchParams.get("periodId");

    let targetId = periodId ?? "";
    if (!targetId) {
      const cur = await ensurePeriod(new Date());
      targetId = cur.id;
    }
    const current = await loadPeriodDetail(targetId);
    if (!current) return jsonError(new Error("period not found"), "دورهٔ حقوق یافت نشد", 404);

    const periods = await db.payrollPeriod.findMany({
      orderBy: { key: "desc" },
      include: { paidByUser: { select: { name: true } } },
    });

    const advances = await db.payrollAdvance.findMany({
      orderBy: [{ deductedAt: "asc" }, { createdAt: "desc" }],
      include: {
        user: { select: { id: true, name: true, modules: { select: { module: true } } } },
        deductedPeriod: { select: { key: true } },
      },
    });

    return NextResponse.json({
      current,
      periods: periods.map((p) => ({
        id: p.id,
        key: p.key,
        status: p.status,
        startDate: p.startDate,
        endDate: p.endDate,
        totalNet: p.totalNet,
        entriesCount: p.entriesCount,
        paidAt: p.paidAt,
        paidByName: p.paidByUser?.name ?? null,
        note: p.note,
      })),
      advances: advances.map((a) => ({
        id: a.id,
        userId: a.userId,
        name: a.user.name,
        modules: a.user.modules.map((m) => m.module),
        amount: a.amount,
        currency: a.currency, // فاز ۲۵
        note: a.note,
        costId: a.costId,
        createdAt: a.createdAt,
        createdByName: a.createdByName,
        deductedPeriodKey: a.deductedPeriod?.key ?? null,
        deductedAt: a.deductedAt,
      })),
    });
  } catch (e) {
    console.error("payroll GET", e);
    return jsonError(500, "خطای سرور در دریافت حقوق و دستمزد");
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!isFinanceStaff(user)) {
    return NextResponse.json({ error: "ایجاد دورهٔ حقوق فقط توسط واحد مالی" }, { status: 403 });
  }
  try {
    const period = await ensurePeriod(new Date());
    const detail = await loadPeriodDetail(period.id);
    return NextResponse.json({ period: detail }, { status: 201 });
  } catch (e) {
    console.error("payroll POST", e);
    return jsonError(500, "خطای سرور در ایجاد دورهٔ حقوق");
  }
}
