import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isItemActionAllowed, isManager, hasModule } from "@/lib/access";
import { recomputeOrderStatus } from "@/lib/order-flow";
import { jsonError } from "@/lib/api-error";

// ─── Designer actions — Phase 13 rebuild (per-item) ─────────────
//
// گردش کار طراح روی سفارش:
//   complete_item {itemId} — تکمیل طراحی «یک» آیتم:
//     item.stage: design → print + مهر designCompletedAt + designCompletedBy.
//     گیت: مجریِ مؤثر همین آیتم باید خودش باشد (یا استخر عمومی).
//   send_next {note} — تکمیل گروهی: همهٔ آیتم‌های designِ «خودِ کاربر»
//     (آیتم دیگران دست‌نخورده می‌ماند و remaining گزارش می‌شود).
//   report_qc {description} — گزارش کنترل کیفیت.
//
// نوتیف: وقتی سفارش به چاپ رسید، «همهٔ چاپ‌کارهای مؤثرِ آیتم‌های چاپ»
// اعلان هدفمند می‌گیرند (per-item، نه فقط سطح سفارش).

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
        items: {
          select: {
            id: true,
            stage: true,
            designAssigneeId: true,
            printAssigneeId: true,
            product: { select: { name: true } },
          },
        },
        customer: { select: { name: true } },
        assignedPrinter: { select: { id: true, name: true } },
      },
    });
    if (!order)
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });

    // ── Gate 2: تخصیص per-item — فقط مجریِ خودِ آیتم (مدیر همیشه مجاز) ──
    // فاز ۱۳: چک در خود اکشن انجام می‌شود (هر آیتم مجری خودش را دارد).
    if (action !== "report_qc" && !isManager(user)) {
      const designItemsNow = order.items.filter((i) => i.stage === "design");
      const mine = designItemsNow.filter(
        (i) => isItemActionAllowed(user, i, order, "design").ok
      );
      if (mine.length === 0 && designItemsNow.length > 0) {
        return NextResponse.json(
          {
            error:
              "آیتم‌های طراحی این سفارش به طراح دیگری تخصیص یافته است — از پنل او قابل اقدام است",
          },
          { status: 403 }
        );
      }
    }

    // ── Gate: فقط سفارش در مرحلهٔ طراحی قابل اقدام است ──
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

      // Phase 13: گیت مجری همین آیتم
      const gate = isItemActionAllowed(user, item, order, "design");
      if (!gate.ok) {
        return NextResponse.json({ error: gate.message }, { status: 403 });
      }

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

      // اعلان چاپ‌کارهای مؤثر وقتی سفارش به چاپ رسید
      if (result.status === "in_printing") {
        await notifyEffectivePrinters(order);
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
      // تکمیل همهٔ آیتم‌های باقی‌ماندهٔ طراحی «قابل-اقدام توسط این کاربر» +
      // بازمحاسبه — آیتم‌های تخصیص‌یافته به طراح دیگر دست‌نخورده می‌مانند.
      const designItems = order.items.filter((i) => i.stage === "design");
      if (designItems.length === 0) {
        return NextResponse.json(
          { error: "آیتمی در مرحلهٔ طراحی باقی نمانده است" },
          { status: 409 }
        );
      }
      const actionable = designItems.filter(
        (i) => isItemActionAllowed(user, i, order, "design").ok
      );
      if (actionable.length === 0) {
        return NextResponse.json(
          {
            error: `همهٔ ${designItems.length} آیتم طراحی این سفارش به طراح دیگری تخصیص یافته است`,
          },
          { status: 403 }
        );
      }

      const result = await db.$transaction(async (tx) => {
        await tx.orderItem.updateMany({
          where: { id: { in: actionable.map((i) => i.id) }, stage: "design" },
          data: { stage: "print", designCompletedAt: new Date(), designCompletedBy: user.id },
        });
        await tx.order.update({
          where: { id },
          data: { designerNote: note || null },
        });
        return recomputeOrderStatus(tx, id);
      });

      if (result.status === "in_printing") {
        await notifyEffectivePrinters(order);
      }

      return NextResponse.json({
        ok: true,
        action: "send_next",
        orderStatus: result.status,
        completedItems: actionable.length,
        skippedForeignItems: designItems.length - actionable.length,
        remainingDesign: result.remaining.design,
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

async function notifyEffectivePrinters(order: {
  number: number;
  customer?: { name: string } | null;
  assignedPrinterId: string | null;
  items: { stage: string; printAssigneeId: string | null }[];
}) {
  try {
    // Phase 13: همهٔ چاپ‌کارهای مؤثر آیتم‌های چاپ (per-item + سطح سفارش)
    const targets = new Set<string>();
    for (const it of order.items) {
      const eff = it.printAssigneeId ?? order.assignedPrinterId ?? null;
      if (eff) targets.add(eff);
    }
    for (const uid of targets) {
      await db.notification.create({
        data: {
          userId: uid,
          title: "سفارش به چاپ شما رسید",
          message: `طراحی سفارش #${order.number}${
            order.customer?.name ? ` (${order.customer.name})` : ""
          } کامل شد — آمادهٔ چاپ است.`,
          type: "success",
          link: "print:orders",
        },
      });
    }
  } catch {
    // best-effort
  }
}
