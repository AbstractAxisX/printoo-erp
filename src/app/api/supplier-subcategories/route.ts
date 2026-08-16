import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");
  const where = categoryId ? { categoryId } : {};
  const subs = await db.supplierSubcategory.findMany({
    where,
    orderBy: { name: "asc" },
    include: { _count: { select: { suppliers: true, services: true } } },
  });
  return NextResponse.json({ subcategories: subs });
}

export async function POST(req: NextRequest) {
  try {
    const { name, categoryId } = await req.json();
    if (!name || !categoryId) return NextResponse.json({ error: "نام و دسته الزامی است" }, { status: 400 });
    const sub = await db.supplierSubcategory.create({ data: { name, categoryId } });
    return NextResponse.json({ subcategory: sub }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}
