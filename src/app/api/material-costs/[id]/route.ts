import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET a single material cost by id (with relations)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cost = await db.materialCost.findUnique({
    where: { id },
    include: {
      supplier: true,
      expenseType: true,
      order: { include: { customer: true } },
    },
  });
  if (!cost) return NextResponse.json({ error: "هزینه یافت نشد" }, { status: 404 });
  return NextResponse.json({ cost });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status } = body;
    const cost = await db.materialCost.update({ where: { id }, data: { status } });
    return NextResponse.json({ cost });
  } catch (e) {
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.materialCost.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "حذف ناموفق" }, { status: 500 });
  }
}
