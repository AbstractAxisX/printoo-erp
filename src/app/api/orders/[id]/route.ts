import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toISO } from "@/lib/format";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      customer: true,
      items: { include: { product: true } },
      preInvoices: true,
      invoice: true,
      tasks: true,
    },
  });
  if (!order) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
  return NextResponse.json({ order });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await db.order.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "حذف ناموفق" }, { status: 500 });
  }
}

// Update order (note, endDate, etc.)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.note === "string") data.note = body.note;
  if (typeof body.endDate !== "undefined") data.endDate = toISO(body.endDate);
  if (typeof body.noEndDate === "boolean") data.noEndDate = body.noEndDate;
  if (typeof body.priority === "string") data.priority = body.priority;
  if (typeof body.totalAmount === "number") data.totalAmount = body.totalAmount;
  const order = await db.order.update({ where: { id }, data });
  return NextResponse.json({ order });
}
