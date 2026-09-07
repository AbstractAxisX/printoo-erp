import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canUserViewOrder } from "@/lib/access";
import { applyPaidAmountChange, inferRevenueModule } from "@/lib/paid-sync";
import { logOrderEvent, actorNameOf } from "@/lib/order-events";
import { jsonError } from "@/lib/api-error";

// ─── Phase 15: درآمد سفارش — ثبت پرداخت با تفاضل هوشمند ─────────
//
// GET  /api/orders/[id]/payments → لاگ‌های درآمد این سفارش (مالی/مدیر)
// POST /api/orders/[id]/payments
//   { total?: number, amount?: number, method?: string, note?: string }
//
// دو حالت ثبت:
//   total  = «کل پرداخت‌شده تا الان» (ادیت پیش‌فاکتور) — سیستم خودش
//            diff را حساب می‌کند: ۱۰۰۰→۶۰۰۰ یعنی ۵۰۰۰ درآمد جدید.
//   amount = «چقدر الان گرفتم» (دریافت نقدی لجستیک در محل) — به کل
//            اضافه می‌شود.
//
// در هر دو حالت: RevenueLog (مبلغ، جمع پس از تغییر، ماژول، کارمند،
// تاریخ/ساعت دقیق) + همگام‌سازی پیش‌فاکتور/فاکتور + رویداد حساس.
//
// دسترسی: مالی، مدیر (master/admin)، لجستیک (انبار).

async function canRecord(user: { role: string; modules: string[] }) {
  return (
    user.role === "master" ||
    user.modules.includes("finance") ||
    user.modules.includes("admin") ||
    user.modules.includes("warehouse")
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  const logs = await db.revenueLog.findMany({
    where: { orderId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ logs });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!(await canRecord(user))) {
    return NextResponse.json(
      { error: "ثبت درآمد فقط توسط مالی، مدیر یا لجستیک (تحویل در محل) انجام می‌شود" },
      { status: 403 }
    );
  }

  const { id } = await params;
  try {
    const order = await db.order.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        paidAmount: true,
        totalAmount: true,
        status: true,
        customerId: true,
        items: { select: { stage: true } },
        assignedDesignerId: true,
        assignedPrinterId: true,
      },
    });
    if (!order) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
    if (order.status === "cancelled") {
      return NextResponse.json({ error: "سفارش باطل‌شده قابل دریافت وجه نیست" }, { status: 409 });
    }
    if (!canUserViewOrder(user, { ...order, items: [] })) {
      return NextResponse.json({ error: "دسترسی به این سفارش ندارید" }, { status: 403 });
    }

    const body = await req.json();
    const { total, amount, method, note } = body ?? {};

    const hasTotal = total !== undefined && total !== null && total !== "";
    const hasAmount = amount !== undefined && amount !== null && amount !== "";
    if (!hasTotal && !hasAmount) {
      return NextResponse.json(
        { error: "مبلغ (کل یا مبلغ دریافتی) الزامی است" },
        { status: 400 }
      );
    }

    // رزولوشن مبلغ جدید:
    //   total  → «کل پرداخت‌شده» — diff هوشمند محاسبه می‌شود
    //   amount → «دریافتی الان» — به کل فعلی اضافه می‌شود
    let newPaid: number;
    if (hasTotal) {
      newPaid = Number(total);
      if (!Number.isFinite(newPaid) || newPaid < 0) {
        return NextResponse.json({ error: "کل پرداخت‌شده باید عددی ≥ صفر باشد" }, { status: 400 });
      }
    } else {
      const add = Number(amount);
      if (!Number.isFinite(add) || add <= 0) {
        return NextResponse.json(
          { error: "مبلغ دریافتی باید عددی بزرگ‌تر از صفر باشد" },
          { status: 400 }
        );
      }
      newPaid = order.paidAmount + add;
    }

    const actorName = (await actorNameOf(user.id)) ?? user.name;
    const result = await db.$transaction(async (tx) =>
      applyPaidAmountChange(tx, {
        orderId: id,
        newPaid,
        actor: {
          userId: user.id,
          userName: actorName,
          module: inferRevenueModule(user),
          method: typeof method === "string" && method ? method : null,
          note: typeof note === "string" && note.trim() ? note.trim() : null,
        },
      })
    );

    // رویداد حساس — ادمین داخلی اسناد مالی را نمی‌بیند
    await logOrderEvent(db, {
      orderId: id,
      type: "payment_recorded",
      stage: "finance",
      actorId: user.id,
      actorName,
      title: "پرداخت مشتری ثبت شد",
      description: `${result.diff >= 0 ? "درآمد جدید" : "اصلاح کاهشی"}: ${Math.abs(result.diff).toLocaleString("en-US")} دینار — کل پرداخت‌شده: ${result.totalAfter.toLocaleString("en-US")} دینار`,
      sensitive: true,
    });

    const log = await db.revenueLog.findFirst({
      where: { orderId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      {
        ok: true,
        diff: result.diff,
        totalAfter: result.totalAfter,
        log,
      },
      { status: 201 }
    );
  } catch (e) {
    return jsonError(e, "خطا در ثبت درآمد");
  }
}
