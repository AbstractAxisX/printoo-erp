import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff } from "@/lib/access";
import { payPayrollPeriod } from "@/lib/payroll-pay";
import { jsonError } from "@/lib/api-error";

// ─── Phase 16: POST /api/payroll/periods/[id]/pay ───────────────
// پرداخت یکجای کل دوره: همهٔ ورودی‌های draft → هزینه + کسر مساعده +
// نوتیف + قفل. تراکنشی؛ ردیف‌های نامعتبر (خالص ≤ 0) skip و گزارش می‌شوند.

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!isFinanceStaff(user)) {
    return NextResponse.json({ error: "پرداخت دوره فقط توسط واحد مالی/مدیر سیستم" }, { status: 403 });
  }
  try {
    const { id } = await ctx.params;
    const period = await db.payrollPeriod.findUnique({ where: { id }, select: { id: true, key: true, status: true } });
    if (!period) return jsonError(new Error("nf"), "دورهٔ حقوق یافت نشد", 404);
    if (period.status === "paid") {
      return jsonError(new Error("paid"), "این دوره قبلاً پرداخت شده است", 409);
    }

    const result = await payPayrollPeriod(period.id, { id: user.id, name: user.name });
    if (result.error) {
      return jsonError(new Error(result.error), result.error, 409);
    }

    const total = result.paid.reduce((s, p) => s + p.netPay, 0);
    return NextResponse.json({
      paidCount: result.paid.length,
      skipped: result.skipped,
      total,
      message:
        `دورهٔ ${period.key} پرداخت شد — ${result.paid.length} کارمند، جمع ${total.toLocaleString("fa-IR")} دینار` +
        (result.skipped.length > 0
          ? ` (⚠ ${result.skipped.length} مورد رد شد — خالص ≤ 0)`
          : ""),
    });
  } catch (e) {
    return jsonError(e, "خطا در پرداخت دورهٔ حقوق");
  }
}
