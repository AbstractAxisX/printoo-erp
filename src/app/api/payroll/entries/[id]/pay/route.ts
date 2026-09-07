import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff } from "@/lib/access";
import { payPayrollEntry } from "@/lib/payroll-pay";
import { jsonError } from "@/lib/api-error";

// ─── Phase 16: POST /api/payroll/entries/[id]/pay ───────────────
// پرداخت حقوق یک کارمند: هزینهٔ «حقوق» + کسر FIFO مساعده + نوتیف + قفل.

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!isFinanceStaff(user)) {
    return NextResponse.json({ error: "پرداخت حقوق فقط توسط واحد مالی/مدیر سیستم" }, { status: 403 });
  }
  try {
    const { id } = await ctx.params;
    const result = await db.$transaction(async (tx) =>
      payPayrollEntry(tx, id, { id: user.id, name: user.name })
    );
    if (!result.ok) {
      return jsonError(new Error(result.reason), result.reason, 409);
    }
    return NextResponse.json({
      netPay: result.netPay,
      message: `حقوق پرداخت شد و به‌عنوان هزینه ثبت گردید (${result.netPay.toLocaleString("fa-IR")} دینار)`,
    });
  } catch (e) {
    return jsonError(e, "خطا در پرداخت حقوق");
  }
}
