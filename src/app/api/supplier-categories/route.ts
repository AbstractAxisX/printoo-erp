import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const categories = await db.supplierCategory.findMany({
    orderBy: { name: "asc" },
    include: {
      subcategories: {
        orderBy: { name: "asc" },
        include: { _count: { select: { suppliers: true, services: true } } },
      },
      _count: { select: { subcategories: true } },
    },
  });
  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  try {
    const { name, icon } = await req.json();
    if (!name) return NextResponse.json({ error: "نام الزامی است" }, { status: 400 });
    const cat = await db.supplierCategory.create({ data: { name, icon: icon || null } });
    return NextResponse.json({ category: cat }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}
