import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// ─── Phase 16: DELETE /api/payroll/advances/[id] ────────────────
// حذف مساعدهٔ «کسرنشده» — همراه با سند هزینهٔ وصل‌شده (برگشت پول).
// مساعدهٔ کسرشده (در دورهٔ حقوق حساب شده) قابل حذف نیست.

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!isFinanceStaff(user)) {
    return NextResponse.json({ error: "حذف مساعده فقط توسط واحد مالی" }, { status: 403 });
  }
  try {
    const { id } = await ctx.params;
    const adv = await db.payrollAdvance.findUnique({ where: { id } });
    if (!adv) return jsonError(new Error("nf"), "مساعده یافت نشد", 404);
    if (adv.deductedPeriodId) {
      return jsonError(
        new Error("deducted"),
        "این مساعده در دورهٔ حقوق کسر شده و قابل حذف نیست",
        409
      );
    }

    await db.$transaction(async (tx) => {
      if (adv.costId) {
        // سند هزینهٔ وصل‌شده هم حذف می‌شود (برگشت کامل پول)
        const cost = await tx.materialCost.findUnique({ where: { id: adv.costId } });
        if (cost) {
          await tx.materialCost.delete({ where: { id: cost.id } });
        }
      }
      await tx.payrollAdvance.delete({ where: { id } });
    });

    return NextResponse.json({ message: "مساعده و سند هزینهٔ آن حذف شد" });
  } catch (e) {
    return jsonError(e, "خطا در حذف مساعده");
  }
}
