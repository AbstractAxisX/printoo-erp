import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toISO } from "@/lib/format";

// Change order status + optionally set module dates
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { status, designStart, designEnd, printStart, printEnd } = body;
  const data: Record<string, unknown> = {};
  if (status) data.status = status;

  const order = await db.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });

  // update order
  await db.order.update({ where: { id }, data });

  // update items' module dates
  await db.orderItem.updateMany({
    where: { orderId: id },
    data: {
      designStartDate: toISO(designStart),
      designEndDate: toISO(designEnd),
      printStartDate: toISO(printStart),
      printEndDate: toISO(printEnd),
    },
  });

  // auto-create a notification
  await db.notification.create({
    data: {
      title: `تغییر وضعیت سفارش #${order.number}`,
      message: `وضعیت سفارش به «${status}» تغییر یافت.`,
      type: "info",
      link: `admin:orders`,
    },
  });

  return NextResponse.json({ ok: true });
}
