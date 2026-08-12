import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const where = search ? { name: { contains: search } } : {};
  const products = await db.product.findMany({ where, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ products });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, unit, basePrice } = body;
    if (!name) return NextResponse.json({ error: "نام محصول الزامی است" }, { status: 400 });
    const product = await db.product.create({
      data: {
        name,
        description: description || null,
        unit: unit || "عدد",
        basePrice: basePrice ? Number(basePrice) : null,
      },
    });
    return NextResponse.json({ product }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "خطا در ایجاد محصول" }, { status: 500 });
  }
}
