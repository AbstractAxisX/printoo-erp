import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const customerId = searchParams.get("customerId");
  const dealId = searchParams.get("dealId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const take = Number(searchParams.get("limit") || "50");

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (customerId) where.customerId = customerId;
  if (dealId) where.dealId = dealId;
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }

  const activities = await db.activity.findMany({
    where,
    orderBy: { date: "desc" },
    take,
    include: {
      customer: true,
      deal: true,
    },
  });
  return NextResponse.json({ activities });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, title, description, customerId, dealId, date } = body;

    if (!type || !title) {
      return NextResponse.json(
        { error: "نوع و عنوان فعالیت الزامی است" },
        { status: 400 }
      );
    }

    const activity = await db.activity.create({
      data: {
        type,
        title,
        description: description || null,
        customerId: customerId || null,
        dealId: dealId || null,
        date: date ? new Date(date) : new Date(),
      },
      include: { customer: true, deal: true },
    });
    return NextResponse.json({ activity }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ثبت فعالیت" }, { status: 500 });
  }
}
