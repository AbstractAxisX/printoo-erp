import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// ─── Phase 16: منطق مشترک حقوق و دستمزد ──────────────────────────
// محاسبهٔ خالص + کسر FIFO مساعده‌ها + یافتن دستهٔ «حقوق».
// همهٔ توابع دیتابیسی client می‌پذیرند تا داخل transaction هم
// (بدون بن‌بست connection-limit=1 سکولایت) روی همان tx اجرا شوند.

type Client = Prisma.TransactionClient | typeof db;

export type PayrollEntryNumbers = {
  baseSalary: number;
  overtimeHours: number;
  overtimeRate: number;
  bonus: number;
  deduction: number;
  insurance: number;
  tax: number;
  advanceDeducted: number;
};

/** خالص پرداختی = پایه + اضافه‌کاری + پاداش − کمکرد − بیمه − مالیات − مساعده */
export function computeNetPay(n: PayrollEntryNumbers): number {
  const ot = (Number.isFinite(n.overtimeHours) ? n.overtimeHours : 0) *
    (Number.isFinite(n.overtimeRate) ? n.overtimeRate : 0);
  const raw =
    (n.baseSalary || 0) + ot + (n.bonus || 0) -
    (n.deduction || 0) - (n.insurance || 0) - (n.tax || 0) - (n.advanceDeducted || 0);
  return Math.round(raw * 100) / 100;
}

/** نرمال‌سازی ورودی‌های عددی فرم (منفی/NaN/Infinity → 0؛ سقف ۱ میلیارد) */
export function sanitizePayrollNumbers(n: Partial<PayrollEntryNumbers>): PayrollEntryNumbers {
  const clamp = (v: unknown): number => {
    const num = Number(v);
    if (!Number.isFinite(num) || num < 0) return 0;
    return Math.min(num, 1_000_000_000);
  };
  return {
    baseSalary: clamp(n.baseSalary),
    overtimeHours: clamp(n.overtimeHours),
    overtimeRate: clamp(n.overtimeRate),
    bonus: clamp(n.bonus),
    deduction: clamp(n.deduction),
    insurance: clamp(n.insurance),
    tax: clamp(n.tax),
    advanceDeducted: clamp(n.advanceDeducted),
  };
}

/** کسر FIFO مساعده‌های کسرنشده: تا سقفِ بودجهٔ کسر، از قدیمی‌ترین‌ها. */
export async function allocateAdvanceDeduction(
  userId: string,
  budget: number,
  periodId: string,
  client: Client = db
): Promise<{ advances: { id: string; amount: number }[]; allocated: number }> {
  const pending = await client.payrollAdvance.findMany({
    where: { userId, deductedPeriodId: null },
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
