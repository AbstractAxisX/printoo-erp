import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

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

  // مساعده‌های کسرنشدهٔ هر کارمند (برای hint فرم)
  const userIds = period.entries.map((e) => e.userId);
  const pendingAdvances = await db.payrollAdvance.findMany({
    where: { userId: { in: userIds }, deductedPeriodId: null },
    select: { userId: true, amount: true },
  });
  const pendingByUser = new Map<string, number>();
  for (const a of pendingAdvances) {
    pendingByUser.set(a.userId, (pendingByUser.get(a.userId) ?? 0) + a.amount);
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
    baseSalary: e.baseSalary,
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
    pendingAdvanceSum: pendingByUser.get(e.userId) ?? 0,
  }));

  const totals = entries.reduce(
    (acc, e) => {
      const ot = e.overtimeHours * e.overtimeRate;
      acc.count += 1;
      acc.base += e.baseSalary;
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
