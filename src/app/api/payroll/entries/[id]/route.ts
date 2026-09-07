import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff } from "@/lib/access";
import { sanitizePayrollNumbers, computeNetPay } from "@/lib/payroll";
import { jsonError } from "@/lib/api-error";

// ─── Phase 16: PUT /api/payroll/entries/[id] ────────────────────
// ویرایش ارقام یک ورودی حقوق (فقط draft؛ پرداخت‌شده قفل است).
// { baseSalary?, overtimeHours?, overtimeRate?, bonus?, deduction?,
//   insurance?, tax?, advanceDeducted?, note?, updateContract? }
// updateContract=true → baseSalary جدید در قرارداد کاربر (User) هم ذخیره می‌شود.

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
    const nums = sanitizePayrollNumbers({
      baseSalary: body.baseSalary ?? entry.baseSalary,
      overtimeHours: body.overtimeHours ?? entry.overtimeHours,
      overtimeRate: body.overtimeRate ?? entry.overtimeRate,
      bonus: body.bonus ?? entry.bonus,
      deduction: body.deduction ?? entry.deduction,
      insurance: body.insurance ?? entry.insurance,
      tax: body.tax ?? entry.tax,
      advanceDeducted: body.advanceDeducted ?? entry.advanceDeducted,
    });

    // سقف کسر مساعده = مجموع مساعده‌های کسرنشده (نمی‌شود بیشتر از واقعیت کسر کرد)
    const pendingSum = await db.payrollAdvance.aggregate({
      where: { userId: entry.userId, deductedPeriodId: null },
      _sum: { amount: true },
    });
    const pendingTotal = pendingSum._sum.amount ?? 0;
    if (nums.advanceDeducted > pendingTotal + 0.001) {
      return jsonError(
        new Error("adv-exceed"),
        `کسر مساعده بیشتر از مانده (${pendingTotal.toLocaleString("fa-IR")}) نیست`
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
        data: { ...nums, netPay: net, note },
      });
      if (body.updateContract && Number(body.baseSalary) !== entry.baseSalary) {
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
