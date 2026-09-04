import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isItemActionAllowed, isManager, hasModule } from "@/lib/access";
import { recomputeOrderStatus } from "@/lib/order-flow";
import { jsonError } from "@/lib/api-error";

// ─── Print actions — Phase 13 rebuild (per-item) ────────────────
//
//   complete_item {itemId} — تکمیل چاپ «یک» آیتم (گیت مجری per-item).
//   confirm_material — تایید تأمین متریال (همهٔ آیتم‌های سفارش).
//   send_warehouse — تکمیل گروهی آیتم‌های چاپِ «خودِ کاربر».
//   report_qc {description} — گزارش کنترل کیفیت.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    const body = await req.json();
    const { action, description, itemId } = body;

    // ── Gate 1: دسترسی ماژول چاپ ──
    if (!hasModule(user, "print")) {
      return NextResponse.json(
        { error: "اقدام روی مرحلهٔ چاپ مخصوص کاربران ماژول چاپ است" },
        { status: 403 }
      );
    }

    const order = await db.order.findUnique({
      where: { id },
      include: {
        items: {
          select: {
            id: true,
            stage: true,
            designAssigneeId: true,
            printAssigneeId: true,
          },
        },
        customer: { select: { name: true } },
      },
    });
    if (!order)
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });

    // ── Gate 2: تخصیص per-item — فقط مجریِ خودِ آیتم (مدیر همیشه مجاز) ──
    if (action !== "report_qc" && !isManager(user)) {
      const printItemsNow = order.items.filter((i) => i.stage === "print");
      const mine = printItemsNow.filter(
        (i) => isItemActionAllowed(user, i, order, "print").ok
      );
      if (mine.length === 0 && printItemsNow.length > 0) {
        return NextResponse.json(
          {
            error:
              "آیتم‌های چاپ این سفارش به چاپ‌کار دیگری تخصیص یافته است — از پنل او قابل اقدام است",
          },
          { status: 403 }
        );
      }
    }

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

      // Phase 13: گیت مجری همین آیتم
      const gate = isItemActionAllowed(user, item, order, "print");
      if (!gate.ok) {
        return NextResponse.json({ error: gate.message }, { status: 403 });
      }

      const result = await db.$transaction(async (tx) => {
        await tx.orderItem.update({
          where: { id: itemId },
          data: { stage: "warehouse", printCompletedAt: new Date(), printCompletedBy: user.id },
        });
        return recomputeOrderStatus(tx, id);
      });

      if (result.status === "warehouse_logistics") {
        await notifyWarehouse(order.number, order.customer?.name);
      }

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
          message: `متریال سفارش #${order.number} تأمین شد و به چاپ منتقل شد.`,
          type: "success",
          link: "print:orders",
        },
      });
      return NextResponse.json({ ok: true, action: "confirm_material" });
    }

    if (action === "send_warehouse") {
      // تکمیل همهٔ آیتم‌های چاپِ «قابل-اقدام توسط این کاربر» — آیتم‌های
      // تخصیص‌یافته به چاپ‌کار دیگر دست‌نخورده می‌مانند.
      const printItems = order.items.filter((i) => i.stage === "print");
      if (printItems.length === 0) {
        return NextResponse.json(
          { error: "آیتمی در مرحلهٔ چاپ باقی نمانده است" },
          { status: 409 }
        );
      }
      const actionable = printItems.filter(
        (i) => isItemActionAllowed(user, i, order, "print").ok
      );
      if (actionable.length === 0) {
        return NextResponse.json(
          {
            error: `همهٔ ${printItems.length} آیتم چاپ این سفارش به چاپ‌کار دیگری تخصیص یافته است`,
          },
          { status: 403 }
        );
      }

      const result = await db.$transaction(async (tx) => {
        await tx.orderItem.updateMany({
          where: { id: { in: actionable.map((i) => i.id) }, stage: "print" },
          data: { stage: "warehouse", printCompletedAt: new Date(), printCompletedBy: user.id },
        });
        return recomputeOrderStatus(tx, id);
      });

      if (result.status === "warehouse_logistics") {
        await notifyWarehouse(order.number, order.customer?.name);
      }

      return NextResponse.json({
        ok: true,
        action: "send_warehouse",
        orderStatus: result.status,
        completedItems: actionable.length,
        skippedForeignItems: printItems.length - actionable.length,
        remainingPrint: result.remaining.print,
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
          reportedById: user.id,
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

async function notifyWarehouse(orderNumber: number, customerName?: string) {
  try {
    await db.notification.create({
      data: {
        title: "سفارش به انبار رسید",
        message: `چاپ سفارش #${orderNumber}${
          customerName ? ` (${customerName})` : ""
        } کامل شد — آمادهٔ انبار و لجستیک است.`,
        type: "info",
        link: "warehouse:orders",
      },
    });
  } catch {
    // best-effort
  }
}
