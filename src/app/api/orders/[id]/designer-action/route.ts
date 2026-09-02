import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isOrderAssigneeAllowed, hasModule } from "@/lib/access";
import { recomputeOrderStatus } from "@/lib/order-flow";
import { jsonError } from "@/lib/api-error";

// ─── Designer actions — Phase 12 rebuild ─────────────────────────────
//
// گردش کار طراح روی سفارش (به‌ویژه گروهی):
//   complete_item {itemId} — تکمیل طراحی «یک» آیتم:
//     item.stage: design → print + مهر designCompletedAt + designCompletedBy.
//     سفارش فقط وقتی به in_printing می‌رود که «همهٔ» آیتم‌های طراحی
//     تمام شده باشند (recomputeOrderStatus). تا آن لحظه هیچ ماژول
//     دیگری حق کار روی سفارش را ندارد.
//   send_next {note} — تکمیل گروهی: همهٔ آیتم‌های design یک‌جا + ارسال
//     (برای سفارش‌های تک‌آیتم همان complete_item است).
//   report_qc {description} — گزارش کنترل کیفیت (وضعیت دست‌نخورده).
//
// گیت‌های Phase 12 (امنیت و تخصیص):
//   ۱) ماژول: کاربر باید ماژول designer را داشته باشد (یا master/admin باشد).
//   ۲) تخصیص: اگر سفارش به طراح دیگری تخصیص یافته → 403 — «این سفارش
//      فقط از پنل همان طراح قابل اقدام است» (خواستهٔ صریح کاربر).
//   ۳) انتساب: هر آیتمی که این کاربر تکمیل می‌کند با designCompletedBy
//      مهر می‌خورد — آمار «مدیریت کارمندان» از همین تغذیه می‌شود.
//   ۴) نوتیف: وقتی سفارش به چاپ رسید، کاربرِ چاپِ تخصیص‌یافته اعلان
//      هدفمند می‌گیرد (Notification.userId).

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    const body = await req.json();
    const { action, note, description, itemId } = body;

    // ── Gate 1: دسترسی ماژول طراحی ──
    if (!hasModule(user, "designer")) {
      return NextResponse.json(
        { error: "اقدام روی مرحلهٔ طراحی مخصوص کاربران ماژول طراحی است" },
        { status: 403 }
      );
    }

    const order = await db.order.findUnique({
      where: { id },
      include: {
        items: { select: { id: true, stage: true } },
        customer: { select: { name: true } },
        assignedPrinter: { select: { id: true, name: true } },
      },
    });
    if (!order)
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });

    // ── Gate 2: تخصیص — فقط طراحِ خودِ سفارش (مدیر همیشه مجاز) ──
    if (action !== "report_qc") {
      const allowed = isOrderAssigneeAllowed(user, order, "design");
      if (!allowed.ok) {
        return NextResponse.json({ error: allowed.message }, { status: 403 });
      }
    }

    // ── Gate: فقط سفارش در مرحلهٔ طراحی قابل اقدام است ──
    const designItems = order.items.filter((i) => i.stage === "design");
    if (action !== "report_qc" && order.status !== "pending_design") {
      return NextResponse.json(
        {
          error:
            order.status === "in_printing"
              ? "طراحی این سفارش قبلاً کامل شده — سفارش در مرحلهٔ چاپ است"
              : "این سفارش در مرحلهٔ طراحی نیست",
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
      if (item.stage !== "design")
        return NextResponse.json(
          { error: "این آیتم در مرحلهٔ طراحی نیست (قبلاً تکمیل شده است)" },
          { status: 409 }
        );

      const result = await db.$transaction(async (tx) => {
        // Phase 12: مهر «کی» + «کی»
        await tx.orderItem.update({
          where: { id: itemId },
          data: { stage: "print", designCompletedAt: new Date(), designCompletedBy: user.id },
        });
        if (note) {
          await tx.order.update({ where: { id }, data: { designerNote: note } });
        }
        return recomputeOrderStatus(tx, id);
      });

      // اعلان چاپ‌کار تخصیص‌یافته وقتی سفارش به چاپ رسید
      if (result.status === "in_printing" && order.assignedPrinterId) {
        await notifyPrinter(order.assignedPrinterId, order.number, order.customer?.name);
      }

      return NextResponse.json({
        ok: true,
        action: "complete_item",
        orderStatus: result.status,
        advanced: result.status !== "pending_design",
        remainingDesign: result.remaining.design,
      });
    }

    if (action === "send_next") {
      // تکمیل همهٔ آیتم‌های باقی‌ماندهٔ طراحی + بازمحاسبه
      if (designItems.length === 0) {
        return NextResponse.json(
          { error: "آیتمی در مرحلهٔ طراحی باقی نمانده است" },
          { status: 409 }
        );
      }

      const result = await db.$transaction(async (tx) => {
        await tx.orderItem.updateMany({
          where: { orderId: id, stage: "design" },
          data: { stage: "print", designCompletedAt: new Date(), designCompletedBy: user.id },
        });
        await tx.order.update({
          where: { id },
          data: { designerNote: note || null },
        });
        return recomputeOrderStatus(tx, id);
      });

      if (result.status === "in_printing" && order.assignedPrinterId) {
        await notifyPrinter(order.assignedPrinterId, order.number, order.customer?.name);
      }

      return NextResponse.json({
        ok: true,
        action: "send_next",
        orderStatus: result.status,
        completedItems: designItems.length,
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
          fromModule: "designer",
          description: String(description).trim(),
          reportedBy: "designer",
          reportedById: user.id,
        },
      });
      await db.notification.create({
        data: {
          title: "گزارش کنترل کیفیت",
          message: `طراح گزارشی را برای کنترل کیفیت ثبت کرد.`,
          type: "warning",
          link: "qc:dashboard",
        },
      });
      return NextResponse.json({ ok: true, action: "report_qc" });
    }

    return NextResponse.json({ error: "action نامعتبر" }, { status: 400 });
  } catch (e) {
    return jsonError(e, "خطا در اقدام طراح");
  }
}

async function notifyPrinter(printerId: string, orderNumber: number, customerName?: string) {
  try {
    await db.notification.create({
      data: {
        userId: printerId,
        title: "سفارش به چاپ شما رسید",
        message: `طراحی سفارش #${orderNumber}${
          customerName ? ` (${customerName})` : ""
        } کامل شد — آمادهٔ چاپ است.`,
        type: "success",
        link: "print:orders",
      },
    });
  } catch {
    // best-effort
  }
}
