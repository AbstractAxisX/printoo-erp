import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const where = serviceId ? { serviceId } : {};
  const prices = await db.priceList.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { service: { include: { supplier: true } } },
  });
  return NextResponse.json({ priceLists: prices });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { serviceId, price, minQuantity, note, validTo } = body;
    if (!serviceId || price === undefined) return NextResponse.json({ error: "خدمه و قیمت الزامی است" }, { status: 400 });
    const pl = await db.priceList.create({
      data: {
        serviceId,
        price: Number(price),
        minQuantity: Number(minQuantity) || 1,
        note: note || null,
        validTo: validTo ? new Date(validTo) : null,
      },
    });
    return NextResponse.json({ priceList: pl }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}
