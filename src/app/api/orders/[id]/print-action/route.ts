import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { recomputeOrderStatus } from "@/lib/order-flow";
import { jsonError } from "@/lib/api-error";

// ─── Print actions — Phase 9 rebuild ───────────────────────────────
//
// گردش کار چاپ روی سفارش:
//   complete_item {itemId} — تکمیل چاپ «یک» آیتم:
//     item.stage: print → warehouse + مهر printCompletedAt.
//     سفارش وقتی به warehouse_logistics می‌رود که همهٔ آیتم‌های چاپ
//     تمام شده باشند (recomputeOrderStatus).
//   confirm_material — تایید تأمین متریال (همهٔ آیتم‌های سفارش).
//   send_warehouse — تکمیل گروهی همهٔ آیتم‌های چاپ + ارسال به انبار.
//   report_qc {description} — گزارش کنترل کیفیت.
//
// گیت: چاپ فقط روی سفارش in_printing کار می‌کند — سفارش گروهی تا
// طراحیِ همهٔ آیتم‌هایش تمام نشده اصلاً به این مرحله نمی‌رسد.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    const body = await req.json();
    const { action, description, itemId } = body;

    const order = await db.order.findUnique({
      where: { id },
      include: { items: { select: { id: true, stage: true } } },
    });
    if (!order)
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });

    // ── Gate: چاپ فقط روی سفارش در مرحلهٔ چاپ ──
    if (action !== "report_qc" && order.status !== "in_printing") {
      return NextResponse.json(
        {
          error:
            order.status === "pending_design"
              ? "طراحی این سفارش هنوز کامل نشده — پس از اتمام طراحی، سفارش به چاپ می‌آید"
              : "این سفارش در مرحلهٔ چاپ نیست",
        },
        { status: 409 }
      );
    }

    if (action === "complete_item") {
      if (!itemId)
        return NextResponse.json({ error: "شناسه آیتم الزامی است" }, { status: 400 });
      const item = order.items.find((i) => i.id === itemId);
      if (!item)
        return NextResponse.json({ error: "آیتم در این سفارش یافت نشد" }, { status: 404 });
      if (item.stage !== "print")
        return NextResponse.json(
          {
            error:
              item.stage === "design"
                ? "طراحی این آیتم هنوز تکمیل نشده است"
                : "این آیتم در مرحلهٔ چاپ نیست (قبلاً تکمیل شده است)",
          },
          { status: 409 }
        );

      const result = await db.$transaction(async (tx) => {
        await tx.orderItem.update({
          where: { id: itemId },
          data: { stage: "warehouse", printCompletedAt: new Date() },
        });
        return recomputeOrderStatus(tx, id);
      });

      return NextResponse.json({
        ok: true,
        action: "complete_item",
        orderStatus: result.status,
        advanced: result.status !== "in_printing",
        remainingPrint: result.remaining.print,
      });
    }

    if (action === "confirm_material") {
      await db.orderItem.updateMany({
        where: { orderId: id },
        data: { materialConfirmed: true },
      });
      await db.notification.create({
        data: {
          title: "تایید تأمین متریال",
          message: `متریال سفارش تأمین شد و به چاپ منتقل شد.`,
          type: "success",
          link: "print:orders",
        },
      });
      return NextResponse.json({ ok: true, action: "confirm_material" });
    }

    if (action === "send_warehouse") {
      const printItems = order.items.filter((i) => i.stage === "print");
      if (printItems.length === 0) {
        return NextResponse.json(
          { error: "آیتمی در مرحلهٔ چاپ باقی نمانده است" },
          { status: 409 }
        );
      }

      const result = await db.$transaction(async (tx) => {
        await tx.orderItem.updateMany({
          where: { orderId: id, stage: "print" },
          data: { stage: "warehouse", printCompletedAt: new Date() },
        });
        return recomputeOrderStatus(tx, id);
      });

      return NextResponse.json({
        ok: true,
        action: "send_warehouse",
        orderStatus: result.status,
        completedItems: printItems.length,
      });
    }

    if (action === "report_qc") {
      if (!description || !String(description).trim()) {
        return NextResponse.json(
          { error: "توضیح گزارش الزامی است" },
          { status: 400 }
        );
      }
      await db.qcReport.create({
        data: {
          orderId: id,
          fromModule: "print",
          description: String(description).trim(),
          reportedBy: "print",
        },
      });
      await db.notification.create({
        data: {
          title: "گزارش کنترل کیفیت از چاپ",
          message: `چاپ گزارشی را برای کنترل کیفیت ثبت کرد.`,
          type: "warning",
          link: "qc:dashboard",
        },
      });
      return NextResponse.json({ ok: true, action: "report_qc" });
    }

    return NextResponse.json({ error: "action نامعتبر" }, { status: 400 });
  } catch (e) {
    return jsonError(e, "خطا در اقدام چاپ");
  }
}
