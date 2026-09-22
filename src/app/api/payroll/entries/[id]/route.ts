import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff } from "@/lib/access";
import { sanitizePayrollNumbers, computeNetPay } from "@/lib/payroll";
import { jsonError } from "@/lib/api-error";
import { parseCurrency, parsePayType, formatMoney } from "@/lib/money";

// ─── Phase 16: PUT /api/payroll/entries/[id] ────────────────────
// ویرایش ارقام یک ورودی حقوق (فقط draft؛ پرداخت‌شده قفل است).
// { payType?, currency?, baseSalary?, daysWorked?, overtimeHours?,
//   overtimeRate?, bonus?, deduction?, insurance?, tax?, advanceDeducted?,
//   note?, updateContract? }
// updateContract=true → baseSalary جدید در قرارداد کاربر (User) هم ذخیره می‌شود
// (فقط برای payType=monthly — نرخ روزانه/ساعتی/موردی قرارداد ماهانه را خراب نمی‌کند).

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!isFinanceStaff(user)) {
    return NextResponse.json({ error: "ویرایش حقوق فقط توسط واحد مالی" }, { status: 403 });
  }
  try {
    const { id } = await ctx.params;
    const entry = await db.payrollEntry.findUnique({
      where: { id },
      include: { period: { select: { key: true, status: true } } },
    });
    if (!entry) return jsonError(new Error("nf"), "ورودی حقوق یافت نشد", 404);
    if (entry.status === "paid") {
      return jsonError(new Error("locked"), "این حقوق پرداخت شده و قابل ویرایش نیست", 409);
    }

    const body = await req.json();
    // ── فاز ۲۵: نوع پرداخت + ارز + روز کارشده ──
    const payType = body.payType !== undefined ? parsePayType(body.payType) : parsePayType(entry.payType);
    const currency = body.currency !== undefined ? parseCurrency(body.currency) : parseCurrency(entry.currency);
    const nums = sanitizePayrollNumbers({
      payType,
      baseSalary: body.baseSalary ?? entry.baseSalary,
      daysWorked: body.daysWorked ?? entry.daysWorked,
      overtimeHours: body.overtimeHours ?? entry.overtimeHours,
      overtimeRate: body.overtimeRate ?? entry.overtimeRate,
      bonus: body.bonus ?? entry.bonus,
      deduction: body.deduction ?? entry.deduction,
      insurance: body.insurance ?? entry.insurance,
      tax: body.tax ?? entry.tax,
      advanceDeducted: body.advanceDeducted ?? entry.advanceDeducted,
    });

    // سقف کسر مساعده = مجموع مساعده‌های کسرنشدهٔ «هم‌ارز» (فاز ۲۵)
    const pendingRows = await db.payrollAdvance.findMany({
      where: { userId: entry.userId, deductedPeriodId: null, currency },
      select: { amount: true },
    });
    const pendingTotal = pendingRows.reduce((s, a) => s + a.amount, 0);
    if (nums.advanceDeducted > pendingTotal + 0.001) {
      return jsonError(
        new Error("adv-exceed"),
        `کسر مساعدهٔ ${currency} بیشتر از مانده (${formatMoney(pendingTotal, currency)}) نیست`
      , 400);
    }

    const net = computeNetPay(nums);
    if (net < 0) {
      return jsonError(new Error("neg"), "خالص حقوق منفی شد — کسورات را کم کنید", 400);
    }

    const note = typeof body.note === "string" ? body.note.trim() : entry.note;

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.payrollEntry.update({
        where: { id },
        data: {
          ...nums,
          payType,
          currency,
          netPay: net,
          note,
        },
      });
      // قرارداد فقط از حقوق «ماهانه» به‌روز می‌شود (فاز ۲۵)
      if (body.updateContract && payType === "monthly" && Number(body.baseSalary) !== entry.baseSalary) {
        await tx.user.update({
          where: { id: entry.userId },
          data: { baseSalary: nums.baseSalary },
        });
      }
      return row;
    });

    return NextResponse.json({
      entry: updated,
      netPay: net,
      pendingAdvanceSum: pendingTotal,
    });
  } catch (e) {
    return jsonError(e, "خطا در ذخیرهٔ حقوق");
  }
}
