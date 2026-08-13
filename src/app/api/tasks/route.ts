import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mod = searchParams.get("module");
  const status = searchParams.get("status");
  const where: Record<string, unknown> = {};
  if (mod) where.module = mod;
  if (status) where.status = status;
  const tasks = await db.task.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { order: { include: { customer: true } } },
  });
  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, description, priority, dueDate, module, orderId, customerId, assignedTo } = body;
  if (!title) return NextResponse.json({ error: "عنوان الزامی است" }, { status: 400 });
  const task = await db.task.create({
    data: {
      title,
      description: description || null,
      priority: priority || "normal",
      module: module || "admin",
      dueDate: dueDate ? new Date(dueDate) : null,
      orderId: orderId || null,
      customerId: customerId || null,
      assignedTo: assignedTo || null,
    },
  });
  return NextResponse.json({ task }, { status: 201 });
}
