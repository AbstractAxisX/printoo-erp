import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logOrderEvent } from "@/lib/order-events";

// ─── Phase 17: گیت خروج از انبار ─────────────────────────────────
// POST /api/orders/[id]/invoice-clear  { withPackage: boolean }
// مالی (یا master) علامت می‌زند: «فاکتور این سفارش همراه بسته ارسال می‌شود».
// با این علامت (یا تسویهٔ کامل فاکتور) انبار اجازهٔ خروج بسته را پیدا می‌کند.
// با withPackage=false علامت برداشته می‌شود.
//
// قرارداد UI (finance-order-modal): پس از موفقیت { ok, order: { invoiceWithPackage } }

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  if (user.role !== "master" && !user.modules.includes("finance")) {
    return NextResponse.json(
      { error: "فقط واحد مالی می‌تواند وضعیت ارسال فاکتور را تغییر دهد" },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const withPackage = body?.withPackage === true;

  const order = await db.order.findUnique({
    where: { id },
    select: {
      id: true, number: true, invoiceWithPackage: true, status: true,
      customerId: true,
      customer: { select: { name: true } },
      invoice: { select: { id: true, totalAmount: true, paidAmount: true, status: true } },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
  }

  if (order.invoiceWithPackage === withPackage) {
    // بدون تغییر — idempotent
    return NextResponse.json({ ok: true, order: { invoiceWithPackage: order.invoiceWithPackage } });
  }

  await db.order.update({
    where: { id },
    data: { invoiceWithPackage: withPackage },
  });

  // رویداد تاریخچه (غیرحساس تا ادمین داخلی هم ببیند)
  await logOrderEvent(db, {
    orderId: order.id,
    type: withPackage ? "invoice_flagged" : "invoice_unflagged",
    stage: "finance",
    actorId: user.id,
    actorName: user.name,
    title: withPackage ? "فاکتور همراه بسته ارسال می‌شود" : "علامت ارسال فاکتور برداشته شد",
    description: withPackage
      ? `مالی تأیید کرد فاکتور سفارش #${order.number} همراه بستهٔ ارسال می‌شود — خروج از انبار باز شد.`
      : `مالی علامت «فاکتور همراه بسته» را از سفارش #${order.number} برداشت — خروج از انبار مجدداً قفل است.`,
    sensitive: false,
  });

  // اعلان به کاربران انبار (best-effort)
  if (withPackage) {
    try {
      const warehouseUsers = await db.userModule.findMany({
        where: { module: "warehouse" },
        select: { userId: true, user: { select: { status: true } } },
      });
      const targets = warehouseUsers
        .filter((w) => w.user.status === "active")
        .map((w) => w.userId);
      if (targets.length) {
        await db.notification.createMany({
          data: targets.map((uid) => ({
            userId: uid,
            title: `خروج سفارش #${order.number} از انبار باز شد`,
            message: `مالی تأیید کرد فاکتور سفارش #${order.number}${
              order.customer?.name ? ` (${order.customer.name})` : ""
            } همراه بسته ارسال می‌شود — اجازهٔ ارسال دارید.`,
            type: "success",
            link: "warehouse:packages",
          })),
        });
      }
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({ ok: true, order: { invoiceWithPackage: withPackage } });
}
