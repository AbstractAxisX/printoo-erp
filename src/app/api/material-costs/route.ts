import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");
  const mod = searchParams.get("module");
  const status = searchParams.get("status");
  const where: Record<string, unknown> = {};
  if (orderId) where.orderId = orderId;
  if (mod) where.module = mod;
  if (status) where.status = status;
  const costs = await db.materialCost.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { supplier: true, expenseType: true, order: { include: { customer: true } } },
  });
  return NextResponse.json({ costs });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, supplierId, expenseTypeId, description, amount, fileUrl1, fileUrl2, module } = body;
    if (!orderId || !amount) return NextResponse.json({ error: "سفارش و مبلغ الزامی است" }, { status: 400 });
    const cost = await db.materialCost.create({
      data: {
        orderId,
        supplierId: supplierId || null,
        expenseTypeId: expenseTypeId || null,
        description: description || null,
        amount: Number(amount),
        fileUrl1: fileUrl1 || null,
        fileUrl2: fileUrl2 || null,
        module: module || "print",
      },
    });
    return NextResponse.json({ cost }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "خطا در ایجاد هزینه" }, { status: 500 });
  }
}
