import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { computeNetPay, allocateAdvanceDeduction, ensureSalaryExpenseType } from "@/lib/payroll";

// ─── Phase 16: پرداختِ یک ورودی حقوق — منطق مشترک (رگانی/جاری) ──
// داخل transaction:
//   ۱) کسر FIFO مساعده‌های کسرنشده (تا سقف advanceDeducted)
//   ۲) ساخت MaterialCost با دستهٔ «حقوق» (هزینهٔ سیستم — خواستهٔ کاربر)
//   ۳) قفل ورودی (status=paid + paidAt + costId + snapshot ماژول‌ها)
//   ۴) نوتیف به کارمند
//   ۵) اگر همهٔ ورودی‌های دوره پرداخت شدند → دوره paid + اسنپ‌شات جمع

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
  if (!entry) return { ok: false, reason: "ورودی حقوق یافت نشد" };
  if (entry.status === "paid") return { ok: false, reason: "قبلاً پرداخت شده" };

  const nums = {
    baseSalary: entry.baseSalary,
    overtimeHours: entry.overtimeHours,
    overtimeRate: entry.overtimeRate,
    bonus: entry.bonus,
    deduction: entry.deduction,
    insurance: entry.insurance,
    tax: entry.tax,
    advanceDeducted: entry.advanceDeducted,
  };
  const net = computeNetPay(nums);
  if (net <= 0) return { ok: false, reason: "خالص حقوق باید مثبت باشد" };

  // ۱) کسر مساعده (FIFO تا سقف بودجهٔ کسرِ همین ورودی)
  const { advances: deducted } = await allocateAdvanceDeduction(
    entry.userId,
    entry.advanceDeducted,
    entry.periodId,
    tx
  );
  for (const adv of deducted) {
    await tx.payrollAdvance.update({
      where: { id: adv.id },
      data: { deductedPeriodId: entry.periodId, deductedAt: new Date() },
    });
  }

  // ۲) سند هزینه — «حقوق و دستمزد در سیستم به‌عنوان هزینه ثبت شود»
  const salaryType = await ensureSalaryExpenseType(tx);
  const breakdown =
    `پایه ${nums.baseSalary.toLocaleString("fa-IR")}` +
    (nums.overtimeHours > 0
      ? ` + اضافه‌کاری ${nums.overtimeHours}ساعت × ${nums.overtimeRate.toLocaleString("fa-IR")}`
      : "") +
    (nums.bonus > 0 ? ` + پاداش ${nums.bonus.toLocaleString("fa-IR")}` : "") +
    (nums.deduction > 0 ? ` − کمکرد ${nums.deduction.toLocaleString("fa-IR")}` : "") +
    (nums.insurance > 0 ? ` − بیمه ${nums.insurance.toLocaleString("fa-IR")}` : "") +
    (nums.tax > 0 ? ` − مالیات ${nums.tax.toLocaleString("fa-IR")}` : "") +
    (nums.advanceDeducted > 0
      ? ` − کسر مساعده ${nums.advanceDeducted.toLocaleString("fa-IR")}`
      : "");

  const cost = await tx.materialCost.create({
    data: {
      expenseTypeId: salaryType.id,
      title: `حقوق ${entry.user.name} — دورهٔ ${entry.period.key}`,
      description: breakdown + (entry.note ? ` — یادداشت: ${entry.note}` : ""),
      amount: net,
      status: "approved",
      module: "finance",
      createdById: actor.id,
      createdByName: actor.name,
    },
  });

  // ۳) قفل ورودی
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

  // ۴) نوتیف به کارمند
  await tx.notification.create({
    data: {
      userId: entry.userId,
      title: "پرداخت حقوق",
      message: `حقوق دورهٔ ${entry.period.key} پرداخت شد — خالص ${net.toLocaleString("fa-IR")} دینار`,
      type: "success",
      link: "profile:view",
    },
  });

  // ۵) دوره: اگر همه پرداخت شدند
  const remaining = await tx.payrollEntry.count({
    where: { periodId: entry.periodId, status: "draft" },
  });
  if (remaining === 0) {
    const agg = await tx.payrollEntry.aggregate({
      where: { periodId: entry.periodId, status: "paid" },
      _sum: { netPay: true },
      _count: true,
    });
    await tx.payrollPeriod.update({
      where: { id: entry.periodId },
      data: {
        status: "paid",
        paidAt: new Date(),
        paidById: actor.id,
        totalNet: agg._sum.netPay ?? 0,
        entriesCount: agg._count,
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
      return { paid: [], skipped: [], error: "ورودی پرداخت‌نشده‌ای در این دوره نیست" };
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
