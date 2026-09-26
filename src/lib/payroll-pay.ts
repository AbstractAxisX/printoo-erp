import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { computeNetPay, allocateAdvanceDeduction, ensureSalaryExpenseType, payTypeLabel } from "@/lib/payroll";
import { parseCurrency, parsePayType, formatMoney, FX_SEED, type FxRates } from "@/lib/money";
import { getLiveRates } from "@/lib/fx";
import { t } from "@/lib/i18n";

// ─── Phase 16: پرداختِ یک ورودی حقوق — منطق مشترک (رگانی/جاری) ──
// داخل transaction:
//   1) کسر FIFO مساعده‌های کسرنشده (تا سقف advanceDeducted)
//   2) ساخت MaterialCost با دستهٔ «حقوق» (هزینهٔ سیستم — خواستهٔ کاربر)
//   3) قفل ورودی (status=paid + paidAt + costId + snapshot ماژول‌ها)
//   4) نوتیف به کارمند
//   5) اگر همهٔ ورودی‌های دوره پرداخت شدند → دوره paid + اسنپ‌شات جمع

type Tx = Prisma.TransactionClient;
type CtxUser = { id: string; name: string };

export async function payPayrollEntry(
  tx: Tx,
  entryId: string,
  actor: CtxUser
): Promise<{ ok: true; netPay: number } | { ok: false; reason: string }> {
  const entry = await tx.payrollEntry.findUnique({
    where: { id: entryId },
    include: {
      period: { select: { id: true, key: true, status: true } },
      user: { select: { id: true, name: true, modules: { select: { module: true } } } },
    },
  });
  if (!entry) return { ok: false, reason: t("ورودی حقوق یافت نشد") };
  if (entry.status === "paid") return { ok: false, reason: t("قبلاً پرداخت شده") };

  const nums = {
    payType: entry.payType,
    baseSalary: entry.baseSalary,
    daysWorked: entry.daysWorked,
    overtimeHours: entry.overtimeHours,
    overtimeRate: entry.overtimeRate,
    bonus: entry.bonus,
    deduction: entry.deduction,
    insurance: entry.insurance,
    tax: entry.tax,
    advanceDeducted: entry.advanceDeducted,
  };
  const cur = parseCurrency(entry.currency);
  const pt = parsePayType(entry.payType);
  const net = computeNetPay(nums);
  if (net <= 0) return { ok: false, reason: t("خالص حقوق باید مثبت باشد") };

  // 1) کسر مساعدهٔ «هم‌ارز» (FIFO تا سقف بودجهٔ کسرِ همین ورودی — فاز ۲۵)
  const { advances: deducted } = await allocateAdvanceDeduction(
    entry.userId,
    entry.advanceDeducted,
    entry.periodId,
    tx,
    cur
  );
  for (const adv of deducted) {
    await tx.payrollAdvance.update({
      where: { id: adv.id },
      data: { deductedPeriodId: entry.periodId, deductedAt: new Date() },
    });
  }

  // 2) سند هزینه — «حقوق و دستمزد در سیستم به‌عنوان هزینه ثبت شود»
  // فاز ۲۵: ارز + نوع پرداخت در سند و بریک‌داون می‌نشیند
  const salaryType = await ensureSalaryExpenseType(tx);
  const breakdown =
    `${payTypeLabel(pt)} — ` +
    (pt === "daily"
      ? `نرخ روزانه ${formatMoney(nums.baseSalary, cur)} × ${nums.daysWorked} روز`
      : pt === "hourly"
        ? `${nums.overtimeHours} ساعت × ${formatMoney(nums.overtimeRate, cur)}`
        : pt === "casual"
          ? `پرداخت موردی ${formatMoney(nums.baseSalary, cur)}`
          : `پایه ${formatMoney(nums.baseSalary, cur)}`) +
    (pt !== "hourly" && nums.overtimeHours > 0
      ? ` + اضافه‌کاری ${nums.overtimeHours}ساعت × ${nums.overtimeRate.toLocaleString("en-US")}`
      : "") +
    (nums.bonus > 0 ? ` + پاداش ${formatMoney(nums.bonus, cur)}` : "") +
    (nums.deduction > 0 ? ` − کمکرد ${formatMoney(nums.deduction, cur)}` : "") +
    (nums.insurance > 0 ? ` − بیمه ${formatMoney(nums.insurance, cur)}` : "") +
    (nums.tax > 0 ? ` − مالیات ${formatMoney(nums.tax, cur)}` : "") +
    (nums.advanceDeducted > 0
      ? ` − کسر مساعده ${formatMoney(nums.advanceDeducted, cur)}`
      : "");

  const cost = await tx.materialCost.create({
    data: {
      expenseTypeId: salaryType.id,
      title: t("حقوق {p0} — دورهٔ {p1} ({p2})", { p0: entry.user.name, p1: entry.period.key, p2: payTypeLabel(pt) }),
      description: breakdown + (entry.note ? ` — یادداشت: ${entry.note}` : ""),
      amount: net,
      currency: cur, // فاز ۲۵: ارز خالص پرداختی
      status: "approved",
      module: "finance",
      createdById: actor.id,
      createdByName: actor.name,
    },
  });

  // 3) قفل ورودی
  await tx.payrollEntry.update({
    where: { id: entry.id },
    data: {
      status: "paid",
      paidAt: new Date(),
      netPay: net,
      costId: cost.id,
      modulesSnapshot: entry.user.modules.map((m) => m.module).join(","),
    },
  });

  // 4) نوتیف به کارمند — فاز ۲۵: ارز خالص پرداختی
  await tx.notification.create({
    data: {
      userId: entry.userId,
      title: t("پرداخت حقوق"),
      message: t("حقوق {p0} دورهٔ {p1} پرداخت شد — خالص {p2}", { p0: payTypeLabel(pt), p1: entry.period.key, p2: formatMoney(net, cur) }),
      type: "success",
      link: "profile:view",
    },
  });

  // 5) دوره: اگر همه پرداخت شدند — فاز ۲۵: اسنپ‌شات totalNet = معادل دیناری
  const remaining = await tx.payrollEntry.count({
    where: { periodId: entry.periodId, status: "draft" },
  });
  if (remaining === 0) {
    const paidEntries = await tx.payrollEntry.findMany({
      where: { periodId: entry.periodId, status: "paid" },
      select: { netPay: true, currency: true },
    });
    // فاز ۲۵.۱: هم‌ارزی دیناری با نرخ زنده (بازار) — قبلاً هاردکد ۱۳۱۰/۱۵۰۰۰۰ بود
    let rates: FxRates = FX_SEED;
    try {
      const live = await getLiveRates();
      rates = { USD_IQD: live.USD_IQD, USD_IRT: live.USD_IRT };
    } catch {}
    const usdToIqd = rates.USD_IQD > 0 ? rates.USD_IQD : FX_SEED.USD_IQD;
    const irtToIqd =
      rates.USD_IRT > 0 && rates.USD_IQD > 0 ? rates.USD_IQD / rates.USD_IRT : FX_SEED.USD_IQD / FX_SEED.USD_IRT;
    const totalNetIqd = paidEntries.reduce((s, e) => {
      const c = parseCurrency(e.currency);
      if (c === "IQD") return s + e.netPay;
      if (c === "USD") return s + e.netPay * usdToIqd;
      return s + e.netPay * irtToIqd; // تومان → دینار (IRT→IQD مستقیم)
    }, 0);
    await tx.payrollPeriod.update({
      where: { id: entry.periodId },
      data: {
        status: "paid",
        paidAt: new Date(),
        paidById: actor.id,
        totalNet: Math.round(totalNetIqd),
        entriesCount: paidEntries.length,
      },
    });
  }

  return { ok: true, netPay: net };
}

/** پرداخت تمام ورودی‌های draft یک دوره (تراکنشی — همه یا هیچ). */
export async function payPayrollPeriod(periodId: string, actor: CtxUser) {
  return db.$transaction(async (tx) => {
    const drafts = await tx.payrollEntry.findMany({
      where: { periodId, status: "draft" },
      select: { id: true },
      orderBy: { user: { name: "asc" } },
    });
    if (drafts.length === 0) {
      return { paid: [], skipped: [], error: t("ورودی پرداخت‌نشده‌ای در این دوره نیست") };
    }
    const paid: { name: string; netPay: number }[] = [];
    const skipped: { name: string; reason: string }[] = [];
    for (const d of drafts) {
      const res = await payPayrollEntry(tx, d.id, actor);
      if (res.ok) {
        const e = await tx.payrollEntry.findUnique({
          where: { id: d.id },
          include: { user: { select: { name: true } } },
        });
        paid.push({ name: e?.user.name ?? "", netPay: res.netPay });
      } else {
        const e = await tx.payrollEntry.findUnique({
          where: { id: d.id },
          include: { user: { select: { name: true } } },
        });
        skipped.push({ name: e?.user.name ?? "", reason: res.reason });
      }
    }
    // اگر همه skip شدند و دوره هنوز open است — خطای کلی
    if (paid.length === 0) {
      return {
        paid,
        skipped,
        error: skipped[0]?.reason ?? "هیچ ورودی قابل پرداخت نبود",
      };
    }
    return { paid, skipped, error: null };
  });
}
