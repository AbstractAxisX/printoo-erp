import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, unit, basePrice } = body;
    if (!name) return NextResponse.json({ error: "نام محصول الزامی است" }, { status: 400 });
    const product = await db.product.update({
      where: { id },
      data: {
        name,
        description: description || null,
        unit: unit || "عدد",
        basePrice: basePrice ? Number(basePrice) : null,
      },
    });
    return NextResponse.json({ product });
  } catch (e) {
    return NextResponse.json({ error: "خطا در ویرایش محصول" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "حذف ناموفق" }, { status: 500 });
  }
}
