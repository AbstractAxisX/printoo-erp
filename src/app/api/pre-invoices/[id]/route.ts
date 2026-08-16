import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preInvoice = await db.preInvoice.findUnique({
    where: { id },
    include: { customer: true, order: { include: { items: { include: { product: true } } } } },
  });
  if (!preInvoice) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  return NextResponse.json({ preInvoice });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { items, paidAmount } = body;
    const itemsData = items;
    const totalAmount = itemsData.reduce((s: number, i: { total: number }) => s + i.total, 0);
    const paid = paidAmount ?? itemsData.reduce((s: number, i: { paid: number }) => s + (Number(i.paid) || 0), 0);
    const preInvoice = await db.preInvoice.update({
      where: { id },
      data: {
        items: JSON.stringify(itemsData),
        totalAmount,
        paidAmount: paid,
      },
    });
    // Update order paid
    await db.order.update({ where: { id: preInvoice.orderId }, data: { paidAmount: paid } });
    return NextResponse.json({ preInvoice });
  } catch (e) {
    return NextResponse.json({ error: "خطا در ویرایش" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.preInvoice.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "حذف ناموفق" }, { status: 500 });
  }
}
