import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toISO } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { syncItemsToStatus, type OrderStatusStr } from "@/lib/order-flow";
import { jsonError } from "@/lib/api-error";

// Change order status + optionally set module dates
// Phase 9: تغییر دستی وضعیت → stage آیتم‌ها همگام می‌شود
// (syncItemsToStatus) تا سفارش و آیتم‌هایش هرگز ناهمخوان نباشند.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    const body = await req.json();
    const { status, designStart, designEnd, printStart, printEnd } = body;

    const VALID_STATUSES = [
      "pending_design",
      "in_printing",
      "warehouse_logistics",
      "completed",
      "archived",
      "cancelled",
    ];
    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `وضعیت نامعتبر: ${status ?? "—"}` },
        { status: 400 }
      );
    }

    const order = await db.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });

    // یک تراکنش: آپدیت سفارش + همگام‌سازی آیتم‌ها + تاریخ‌های ماژول + نوتیف
    await db.$transaction(async (tx) => {
      await tx.order.update({ where: { id }, data: { status } });

      // آیتم‌ها با کفِ وضعیت جدید همگام شوند (فقط برای وضعیت‌های جریان)
      await syncItemsToStatus(tx, id, status as OrderStatusStr);

      // تاریخ‌های برنامه‌ریزی ماژول‌ها (اگر ارسال شده باشند)
      await tx.orderItem.updateMany({
        where: { orderId: id },
        data: {
          designStartDate: toISO(designStart),
          designEndDate: toISO(designEnd),
          printStartDate: toISO(printStart),
          printEndDate: toISO(printEnd),
        },
      });

      await tx.notification.create({
        data: {
          title: `تغییر وضعیت سفارش #${order.number}`,
          message: `وضعیت سفارش به «${status}» تغییر یافت.`,
          type: "info",
          link: `admin:orders`,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, "خطا در تغییر وضعیت سفارش");
  }
}
