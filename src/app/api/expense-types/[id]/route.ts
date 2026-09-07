import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff, isManager } from "@/lib/access";

// ─── Phase 15: حذف دستهٔ هزینهٔ آزاد ──────────────────────────────
// دسته‌های پیش‌فرض (حقوق/اجاره/…) قابل حذف نیستند؛ دستهٔ دارای هزینهٔ
// ثبت‌شده هم نه (تاریخچه خراب نشود).

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!isFinanceStaff(user) && !isManager(user)) {
    return NextResponse.json({ error: "حذف دسته فقط توسط مالی/مدیر" }, { status: 403 });
  }
  const { id } = await params;
  const type = await db.expenseType.findUnique({
    where: { id },
    include: { _count: { select: { materialCosts: true } } },
  });
  if (!type) return NextResponse.json({ error: "دسته یافت نشد" }, { status: 404 });
  if (type.isDefault) {
    return NextResponse.json(
      { error: "دسته‌های پیش‌فرض (حقوق و…) قابل حذف نیستند" },
      { status: 409 }
    );
  }
  if (type._count.materialCosts > 0) {
    return NextResponse.json(
      { error: "این دسته هزینهٔ ثبت‌شده دارد — اول هزینه‌ها را جابه‌جا کنید" },
      { status: 409 }
    );
  }
  await db.expenseType.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
