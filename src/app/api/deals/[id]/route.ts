import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toISO } from "@/lib/format";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deal = await db.deal.findUnique({
    where: { id },
    include: {
      customer: true,
      activities: {
        orderBy: { date: "desc" },
        take: 20,
        include: { customer: true },
      },
    },
  });
  if (!deal) {
    return NextResponse.json({ error: "معامله یافت نشد" }, { status: 404 });
  }
  return NextResponse.json({ deal });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const deal = await db.deal.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(customerId !== undefined && { customerId }),
        ...(value !== undefined && { value: Number(value) || 0 }),
        ...(stage !== undefined && { stage }),
        ...(probability !== undefined && { probability: Number(probability) || 0 }),
        ...(expectedCloseDate !== undefined && { expectedCloseDate: toISO(expectedCloseDate) }),
        ...(source !== undefined && { source: source || null }),
        ...(description !== undefined && { description: description || null }),
        ...(assignedTo !== undefined && { assignedTo: assignedTo || null }),
      },
      include: { customer: true },
    });
    return NextResponse.json({ deal });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ویرایش معامله" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.activity.deleteMany({ where: { dealId: id } });
    await db.deal.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "حذف ناموفق" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Lightweight stage update for drag-and-drop
  try {
    const { id } = await params;
    const { stage } = await req.json();
    if (!stage) {
      return NextResponse.json({ error: "stage الزامی است" }, { status: 400 });
    }
    const deal = await db.deal.update({
      where: { id },
      data: { stage },
      include: { customer: true },
    });
    return NextResponse.json({ deal });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در به‌روزرسانی مرحله" }, { status: 500 });
  }
}
