import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff } from "@/lib/access";
import { ensureSalaryExpenseType } from "@/lib/payroll";
import { jsonError } from "@/lib/api-error";

// ─── Phase 16: POST /api/payroll/advances ───────────────────────
// ثبت مساعده/پیش‌پرداخت حقوق: پول الان خارج می‌شود → همین لحظه
// MaterialCost با دستهٔ «حقوق» ثبت می‌شود (شمارش دوباره در دورهٔ بعد
// ندارد — آنجا فقط «کسر» می‌شود).

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!isFinanceStaff(user)) {
    return NextResponse.json({ error: "ثبت مساعده فقط توسط واحد مالی" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const userId = typeof body.userId === "string" ? body.userId : "";
    const amount = Number(body.amount);
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!userId) return jsonError(new Error("v"), "کارمند را انتخاب کنید", 400);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
      return jsonError(new Error("v"), "مبلغ مساعده باید عددی بزرگ‌تر از صفر باشد", 400);
    }

    const emp = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });
    if (!emp) return jsonError(new Error("nf"), "کارمند یافت نشد", 404);
    if (emp.role === "master") {
      return jsonError(new Error("master"), "برای مدیر سیستم مساعده ثبت نمی‌شود", 400);
    }

    const result = await db.$transaction(async (tx) => {
      const salaryType = await ensureSalaryExpenseType(tx);
      const cost = await tx.materialCost.create({
        data: {
          expenseTypeId: salaryType.id,
          title: `مساعده ${emp.name}`,
          description: "پیش‌پرداخت حقوق — در دورهٔ بعد کسر می‌شود" + (note ? ` — ${note}` : ""),
          amount,
          status: "approved",
          module: "finance",
          createdById: user.id,
          createdByName: user.name,
        },
      });
      const advance = await tx.payrollAdvance.create({
        data: {
          userId: emp.id,
          amount,
          note: note || null,
          costId: cost.id,
          createdById: user.id,
          createdByName: user.name,
        },
      });
      await tx.notification.create({
        data: {
          userId: emp.id,
          title: "پرداخت مساعده",
          message: `مساعده ${amount.toLocaleString("fa-IR")} دینار به شما پرداخت شد — در حقوق دورهٔ بعد کسر می‌شود`,
          type: "info",
          link: "profile:view",
        },
      });
      return advance;
    });

    return NextResponse.json(
      { advance: result, message: `مساعده ثبت و به‌عنوان هزینهٔ حقوق درج شد` },
      { status: 201 }
    );
  } catch (e) {
    return jsonError(e, "خطا در ثبت مساعده");
  }
}
