import { t as tr } from "@/lib/i18n";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parsePayType } from "@/lib/money";

// ─── Phase 16: منطق مشترک حقوق و دستمزد ──────────────────────────
// محاسبهٔ خالص + کسر FIFO مساعده‌ها + یافتن دستهٔ «حقوق».
// همهٔ توابع دیتابیسی client می‌پذیرند تا داخل transaction هم
// (بدون بن‌بست connection-limit=1 سکولایت) روی همان tx اجرا شوند.

type Client = Prisma.TransactionClient | typeof db;

export type PayrollEntryNumbers = {
  payType?: string; // فاز ۲۵: monthly | daily | hourly | casual
  baseSalary: number;
  daysWorked?: number; // فاز ۲۵: روزانه — تعداد روز
  overtimeHours: number;
  overtimeRate: number;
  bonus: number;
  deduction: number;
  insurance: number;
  tax: number;
  advanceDeducted: number;
};

/**
 * خالص پرداختی — فاز ۲۵: بر اساس «نوع پرداخت» شناور:
 *   monthly: پایه + اضافه‌کاری + پاداش − کسورات
 *   daily:   نرخ روزانه × روز کارشده + اضافه‌کاری + پاداش − کسورات
 *   hourly:  ساعت × نرخ ساعت + پاداش − کسورات (ساعت = کل ساعت کار)
 *   casual:  مبلغ آزاد (baseSalary) + پاداش − کسورات
 */
export function computeNetPay(n: PayrollEntryNumbers): number {
  const payType = parsePayType(n.payType);
  const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const base = num(n.baseSalary);
  const days = num(n.daysWorked);
  const hours = num(n.overtimeHours);
  const rate = num(n.overtimeRate);

  let gross = base;
  let ot = hours * rate;
  if (payType === "daily") {
    gross = base * days;
  } else if (payType === "hourly") {
    gross = hours * rate; // ساعت×نرخ = خودِ حقوق (اضافه‌کاری جدا نیست)
    ot = 0;
  } else if (payType === "casual") {
    gross = base; // مبلغ آزاد
    ot = 0;
  }
  const raw =
    gross + ot + num(n.bonus) -
    num(n.deduction) - num(n.insurance) - num(n.tax) - num(n.advanceDeducted);
  return Math.round(raw * 100) / 100;
}

/** نرمال‌سازی ورودی‌های عددی فرم (منفی/NaN/Infinity → ۰؛ سقف ۱ میلیارد) */
export function sanitizePayrollNumbers(n: Partial<PayrollEntryNumbers>): PayrollEntryNumbers {
  const clamp = (v: unknown): number => {
    const num = Number(v);
    if (!Number.isFinite(num) || num < 0) return 0;
    return Math.min(num, 1_000_000_000);
  };
  return {
    payType: n.payType,
    baseSalary: clamp(n.baseSalary),
    daysWorked: clamp(n.daysWorked),
    overtimeHours: clamp(n.overtimeHours),
    overtimeRate: clamp(n.overtimeRate),
    bonus: clamp(n.bonus),
    deduction: clamp(n.deduction),
    insurance: clamp(n.insurance),
    tax: clamp(n.tax),
    advanceDeducted: clamp(n.advanceDeducted),
  };
}

/** برچسب فارسی نوع پرداخت (breakdown هزینه/نوتیف). */
export function payTypeLabel(p: string | null | undefined): string {
  const t = parsePayType(p);
  if (t === "daily") return tr("روزانه");
  if (t === "hourly") return tr("ساعتی");
  if (t === "casual") return tr("موردی");
  return tr("ماهانه");
}

/** کسر FIFO مساعده‌های کسرنشدهٔ «هم‌ارز» — تا سقفِ بودجهٔ کسر، از قدیمی‌ترین‌ها.
 * فاز ۲۵: فقط مساعده‌های هم‌ارز با ارز ورودی کسر می‌شوند (تومان از دلار کسر نمی‌شود). */
export async function allocateAdvanceDeduction(
  userId: string,
  budget: number,
  periodId: string,
  client: Client = db,
  currency?: string
): Promise<{ advances: { id: string; amount: number }[]; allocated: number }> {
  const cur =
    currency === "USD" || currency === "IRT" ? currency : "IQD";
  const pending = await client.payrollAdvance.findMany({
    where: { userId, deductedPeriodId: null, currency: cur },
    orderBy: { createdAt: "asc" },
    select: { id: true, amount: true },
  });
  const picked: { id: string; amount: number }[] = [];
  let allocated = 0;
  for (const adv of pending) {
    if (allocated + adv.amount <= budget + 0.001) {
      picked.push(adv);
      allocated += adv.amount;
    }
  }
  return { advances: picked, allocated };
}

/** دستهٔ «حقوق» — همیشه موجود (هاردکد-پیش‌فرض). */
export async function ensureSalaryExpenseType(client: Client = db): Promise<{ id: string }> {
  let et = await client.expenseType.findFirst({ where: { name: "حقوق" }, select: { id: true } });
  if (!et) {
    et = await client.expenseType.create({
      data: { name: "حقوق", isDefault: true },
      select: { id: true },
    });
  }
  return et;
}
