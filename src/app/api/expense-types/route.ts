import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff, isManager } from "@/lib/access";

// ─── Phase 15: دسته‌بندی هزینه‌های آزاد (ExpenseType) ─────────────
// GET    → همهٔ دسته‌ها + تضمین پنج دستهٔ پیش‌فرض (حقوق هاردکد —
//          حقوق و دستمزد از جای دیگری تنظیم می‌شود ولی باید در این
//          دسته‌بندی بیاید؛ به همین دلیل default است و حذف نمی‌شود)
// POST   → دستهٔ جدید (مالی/مدیر)
// DELETE → فقط دسته‌های غیرپیش‌فرض (بدون هزینه) — [id]

const DEFAULTS = ["مواد اولیه", "چاپ", "اجاره", "حقوق", "سایر"];

async function ensureDefaults() {
  for (const name of DEFAULTS) {
    await db.expenseType.upsert({
      where: { name },
      update: { isDefault: true },
      create: { name, isDefault: true },
    });
  }
}

export async function GET() {
  await ensureDefaults();
  const types = await db.expenseType.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ expenseTypes: types });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  // ساخت دسته = عملیات مالی/مدیریتی
  if (!isFinanceStaff(user) && !isManager(user)) {
    return NextResponse.json({ error: "ساخت دستهٔ هزینه فقط توسط مالی/مدیر" }, { status: 403 });
  }
  try {
    const { name } = await req.json();
    const clean = typeof name === "string" ? name.trim() : "";
    if (!clean) return NextResponse.json({ error: "نام الزامی است" }, { status: 400 });
    if (clean.length > 60) return NextResponse.json({ error: "نام دسته حداکثر ۶۰ حرف" }, { status: 400 });
    const type = await db.expenseType.create({ data: { name: clean } });
    return NextResponse.json({ expenseType: type }, { status: 201 });
  } catch (e) {
    const msg = String((e as { code?: string }).code) === "P2002" ? "این دسته قبلاً ثبت شده است" : "خطا";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
