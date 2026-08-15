import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toISO } from "@/lib/format";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const stage = searchParams.get("stage");
  const source = searchParams.get("source");
  const customerId = searchParams.get("customerId");

  const where: Record<string, unknown> = {};
  if (stage) where.stage = stage;
  if (source) where.source = source;
  if (customerId) where.customerId = customerId;
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { customer: { name: { contains: search } } },
      { customer: { phone: { contains: search } } },
    ];
  }

  const deals = await db.deal.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      customer: true,
      _count: { select: { activities: true } },
    },
  });
  return NextResponse.json({ deals });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      customerId,
      value,
      stage,
      probability,
      expectedCloseDate,
      source,
      description,
      assignedTo,
    } = body;

    if (!title || !customerId) {
      return NextResponse.json(
        { error: "عنوان معامله و مشتری الزامی است" },
        { status: 400 }
      );
    }

    const deal = await db.deal.create({
      data: {
        title,
        customerId,
        value: Number(value) || 0,
        stage: stage || "lead",
        probability: Number(probability) || 0,
        expectedCloseDate: toISO(expectedCloseDate),
        source: source || null,
        description: description || null,
        assignedTo: assignedTo || null,
      },
      include: { customer: true },
    });
    return NextResponse.json({ deal }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ایجاد معامله" }, { status: 500 });
  }
}
