import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get("supplierId");
  const subcategoryId = searchParams.get("subcategoryId");
  const where: Record<string, unknown> = {};
  if (supplierId) where.supplierId = supplierId;
  if (subcategoryId) where.subcategoryId = subcategoryId;
  const services = await db.supplierService.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      supplier: true,
      subcategory: { include: { category: true } },
      priceLists: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return NextResponse.json({ services });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { supplierId, subcategoryId, name, description, unit } = body;
    if (!supplierId || !name) return NextResponse.json({ error: "تامین‌کننده و نام الزامی است" }, { status: 400 });
    const svc = await db.supplierService.create({
      data: {
        supplierId,
        subcategoryId: subcategoryId || null,
        name,
        description: description || null,
        unit: unit || "عدد",
      },
    });
    return NextResponse.json({ service: svc }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}
