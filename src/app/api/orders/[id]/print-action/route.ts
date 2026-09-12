import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isItemActionAllowed, isManager, hasModule } from "@/lib/access";
import { recomputeOrderStatus } from "@/lib/order-flow";
import { logOrderEvent } from "@/lib/order-events";
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
            product: { select: { name: true } },
          },
        },
        customer: { select: { name: true } },
        // Phase 17: گیت مالی — برای تشخیص «تسویه‌شده» قبل از نوتیف فاکتور
        invoice: { select: { totalAmount: true, paidAmount: true } },
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
        // Phase 14: تاریخچه — چاپ این آیتم تکمیل شد
        await logOrderEvent(tx, {
          orderId: id,
          type: "print_completed",
          stage: "print",
          actorId: user.id,
          actorName: user.name,
          title: `چاپ آیتم «${item.product?.name ?? "—"}» تکمیل شد`,
        });
        return recomputeOrderStatus(tx, id);
      });

      if (result.status === "warehouse_logistics") {
        await notifyWarehouse(order.number, order.customer?.name);
        // Phase 17: اطلاع مالی برای تسویهٔ فاکتور (فقط گذار تازه — گیت
        // in_printing بالاتر تضمین می‌کند این بلوک در هر گذار فقط یک‌بار می‌جوشد:
        // complete_item و send_warehouse هر دو در همان گذار مشترک‌اند و درخواست
        // بعدی با 409 رد می‌شود)
        await notifyFinanceSettlement(order);
        await logOrderEvent(db, {
          orderId: id,
          type: "sent_to_warehouse",
          stage: "warehouse",
          actorId: user.id,
          actorName: user.name,
          title: `سفارش به انبار و لجستیک ارسال شد`,
          description: `تکمیل چاپ توسط ${user.name}`,
        });
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
      const count = await db.orderItem.count({
        where: { orderId: id, needsMaterial: true, materialConfirmed: false },
      });
      await db.orderItem.updateMany({
        where: { orderId: id },
        data: { materialConfirmed: true },
      });
      // Phase 14: تاریخچه — متریال خریداری/تأمین شد
      await logOrderEvent(db, {
        orderId: id,
        type: "material_confirmed",
        stage: "print",
        actorId: user.id,
        actorName: user.name,
        title: `تأمین متریال تأیید شد`,
        description: count > 0 ? `${count} آیتم متریال خود را دریافت کردند` : null,
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
        // Phase 14: تاریخچه — تکمیل گروهی چاپ
        await logOrderEvent(tx, {
          orderId: id,
          type: "print_completed",
          stage: "print",
          actorId: user.id,
          actorName: user.name,
          title: `چاپ ${actionable.length} آیتم سفارش تکمیل شد`,
        });
        return recomputeOrderStatus(tx, id);
      });

      if (result.status === "warehouse_logistics") {
        await notifyWarehouse(order.number, order.customer?.name);
        // Phase 17: همان اطلاع مالی — چون send_warehouse هم می‌تواند گذار را
        // نهایی کند (آخرین آیتم‌ها)، همان گیت تازه‌بودنِ بالا صادق است.
        await notifyFinanceSettlement(order);
        await logOrderEvent(db, {
          orderId: id,
          type: "sent_to_warehouse",
          stage: "warehouse",
          actorId: user.id,
          actorName: user.name,
          title: `سفارش به انبار و لجستیک ارسال شد`,
          description: `تکمیل چاپ توسط ${user.name}`,
        });
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
      await logOrderEvent(db, {
        orderId: id,
        type: "qc_reported",
        stage: "qc",
        actorId: user.id,
        actorName: user.name,
        title: `گزارش به کنترل کیفیت از مرحلهٔ چاپ`,
        description: String(description).trim(),
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

// ─── Phase 17: گیت خروج از انبار — اطلاع مالی هنگام رسیدن چاپ به انبار ──
// سفارش تازه به warehouse_logistics رسیده؛ اگر فاکتورش تسویه نیست و علامت
// «فاکتور همراه بسته» هم نخورده، به همهٔ کاربران فعال ماژول مالی اعلان
// هدفمند می‌رود تا پرداخت را ثبت کنند یا پرچم را بزنند.
async function notifyFinanceSettlement(
  order: {
    number: number;
    invoiceWithPackage: boolean;
    invoice: { totalAmount: number; paidAmount: number } | null;
    customer: { name: string } | null;
  }
) {
  try {
    const settled =
      order.invoiceWithPackage === true ||
      (order.invoice !== null &&
        order.invoice.totalAmount > 0 &&
        order.invoice.paidAmount >= order.invoice.totalAmount);
    if (settled) return; // بدون نویز — فاکتور یا تسویه است یا همراه بسته می‌رود

    const financeUsers = await db.userModule.findMany({
      where: { module: "finance" },
      select: { userId: true, user: { select: { status: true } } },
    });
    const targets = financeUsers
      .filter((f) => f.user.status === "active")
      .map((f) => f.userId);
    if (targets.length === 0) return;

    const customerName = order.customer?.name;
    await db.notification.createMany({
      data: targets.map((uid) => ({
        userId: uid,
        title: `تسویهٔ فاکتور سفارش #${order.number}`,
        message:
          `چاپ سفارش #${order.number}${customerName ? ` (${customerName})` : ""}` +
          ` کامل شد و به انبار رفت — پرداخت فاکتور را انجام دهید یا «ارسال فاکتور همراه بسته» را علامت بزنید؛` +
          ` تا آن زمان انبار اجازهٔ خروج ندارد.`,
        type: "warning",
        link: "finance:orders",
      })),
    });
  } catch {
    // best-effort — اکشن اصلی چاپ هرگز نباید به‌خاطر اعلان شکست بخورد
  }
}
