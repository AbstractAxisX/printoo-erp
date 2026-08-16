import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const types = await db.expenseType.findMany({ orderBy: { name: "asc" } });
  // Ensure default types exist
  if (types.length === 0) {
    await db.expenseType.createMany({
      data: [
        { name: "مواد اولیه", isDefault: true },
        { name: "چاپ", isDefault: true },
        { name: "اجاره", isDefault: true },
        { name: "حقوق", isDefault: true },
        { name: "سایر", isDefault: true },
      ],
    });
    const fresh = await db.expenseType.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ expenseTypes: fresh });
  }
  return NextResponse.json({ expenseTypes: types });
}

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: "نام الزامی است" }, { status: 400 });
    const type = await db.expenseType.create({ data: { name } });
    return NextResponse.json({ expenseType: type }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}
