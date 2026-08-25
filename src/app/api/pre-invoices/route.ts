import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");
  const where = orderId ? { orderId } : {};
  const preInvoices = await db.preInvoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { customer: true, order: { include: { items: { include: { product: true } } } } },
  });
  return NextResponse.json({ preInvoices });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, customerId, items, paidAmount } = body;
    if (!orderId || !customerId) {
      return NextResponse.json({ error: "سفارش و مشتری الزامی است" }, { status: 400 });
    }
    const order = await db.order.findUnique({ where: { id: orderId }, include: { items: { include: { product: true } } } });
    if (!order) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });

    // Build items from order if not provided
    let itemsData = items;
    if (!itemsData) {
      itemsData = order.items.map((it) => ({
        name: it.product.name,
        quantity: it.quantity,
        total: it.totalAmount,
        paid: 0,
      }));
    }
    const totalAmount = itemsData.reduce((s: number, i: { total: number }) => s + i.total, 0);
    const paid = paidAmount ?? itemsData.reduce((s: number, i: { paid: number }) => s + (Number(i.paid) || 0), 0);

    // R3: atomic Counter upsert (replaces aggregate _max + 1 — race-free, O(1)).
    // Single SQL UPDATE with increment; no read-then-write gap even without a
    // transaction wrapper. Was: `db.preInvoice.aggregate({ _max: ... }) + 1`.
    const counter = await db.counter.upsert({
      where: { id: "preInvoice" },
      update: { next: { increment: 1 } },
      create: { id: "preInvoice", next: 1 },
    });
    const number = counter.next;

    const preInvoice = await db.preInvoice.create({
      data: {
        number,
        orderId,
        customerId,
        totalAmount,
        paidAmount: paid,
        items: JSON.stringify(itemsData),
      },
    });
    // Update order paid amount
    await db.order.update({ where: { id: orderId }, data: { paidAmount: paid } });
    return NextResponse.json({ preInvoice }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ایجاد پیش‌فاکتور" }, { status: 500 });
  }
}
