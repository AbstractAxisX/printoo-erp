import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const where = search
    ? { OR: [{ name: { contains: search } }, { phone: { contains: search } }] }
    : {};
  const customers = await db.customer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { orders: true } } },
  });
  return NextResponse.json({ customers });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, phone, isFavorite, note } = body;
    if (!name || !phone) {
      return NextResponse.json({ error: "نام و شماره تلفن الزامی است" }, { status: 400 });
    }
    const customer = await db.customer.create({
      data: { name, phone, isFavorite: !!isFavorite, note: note || null },
    });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "خطا در ایجاد مشتری" }, { status: 500 });
  }
}
