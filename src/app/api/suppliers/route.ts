import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const subcategoryId = searchParams.get("subcategoryId");
  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [{ name: { contains: search } }, { phone: { contains: search } }];
  }
  if (subcategoryId) where.subcategoryId = subcategoryId;
  const suppliers = await db.supplier.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      subcategory: { include: { category: true } },
      _count: { select: { services: true, materialCosts: true } },
    },
  });
  return NextResponse.json({ suppliers });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, phone, contactPerson, address, note, subcategoryId } = body;
    if (!name) return NextResponse.json({ error: "نام تامین‌کننده الزامی است" }, { status: 400 });
    const supplier = await db.supplier.create({
      data: {
        name,
        phone: phone || null,
        contactPerson: contactPerson || null,
        address: address || null,
        note: note || null,
        subcategoryId: subcategoryId || null,
      },
    });
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "خطا در ایجاد تامین‌کننده" }, { status: 500 });
  }
}
