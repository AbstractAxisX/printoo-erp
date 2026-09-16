import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isManager, isFinanceStaff } from "@/lib/access";
import { logOrderEvent, actorNameOf } from "@/lib/order-events";

// ─── Phase 15: تأیید/رد هزینه — فقط مالی (یا مدیر) ──────────────
// ماتریس انتقال:
//   pending  → approved | rejected
//   rejected → pending (بازگشت به صف بررسی)
//   approved → rejected (اصلاح اشتباه)
// رویداد cost_approved/cost_rejected حساس است (ادمین داخلی نمی‌بیند).

const TRANSITIONS: Record<string, string[]> = {
  pending: ["approved", "rejected"],
  rejected: ["pending"],
  approved: ["rejected"],
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cost = await db.materialCost.findUnique({
    where: { id },
    include: {
      supplier: true,
      expenseType: true,
      attachments: true,
      createdByUser: { select: { id: true, name: true } },
      order: { include: { customer: true } },
    },
  });
  if (!cost) return NextResponse.json({ error: "هزینه یافت نشد" }, { status: 404 });
  return NextResponse.json({ cost });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  // قبلاً این مسیر بدون احراز هویت بود — هر کسی می‌توانست وضعیت را
  // فلیپ کند. حالا: فقط واحد مالی (یا مدیر) تأیید/رد می‌کند.
  if (!isFinanceStaff(user) && !isManager(user)) {
    return NextResponse.json(
      { error: "تأیید/رد هزینه فقط توسط واحد مالی انجام می‌شود" },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { status } = body;
    if (!["pending", "approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "وضعیت نامعتبر است" }, { status: 400 });
    }

    const existing = await db.materialCost.findUnique({
      where: { id },
      select: { id: true, status: true, orderId: true, title: true, description: true, amount: true, module: true, materialId: true, materialQty: true },
    });
    if (!existing) return NextResponse.json({ error: "هزینه یافت نشد" }, { status: 404 });

    const allowed = TRANSITIONS[existing.status] ?? [];
    if (existing.status !== status && !allowed.includes(status)) {
      return NextResponse.json(
        { error: `تغییر وضعیت از «${existing.status}» به «${status}» مجاز نیست` },
        { status: 409 }
      );
    }

    const cost = await db.materialCost.update({ where: { id }, data: { status } });

    // Phase 16: تأیید هزینهٔ خرید ماده → ورود خودکار به انبار (یک‌بار)
    let stockIn: { material: string; quantity: number; unit: string } | null = null;
    if (
      existing.status !== "approved" &&
      status === "approved" &&
      existing.materialId &&
      (existing.materialQty ?? 0) > 0
    ) {
      const already = await db.materialStockMove.findFirst({
        where: { costId: id },
        select: { id: true },
      });
      if (!already) {
        const mat = await db.material.findUnique({ where: { id: existing.materialId } });
        if (mat) {
          const qty = existing.materialQty ?? 0;
          await db.$transaction(async (tx) => {
            await tx.materialStockMove.create({
              data: {
                materialId: mat.id,
                delta: qty,
                reason: `خرید — ${existing.title || "هزینهٔ متریال"}`,
                costId: id,
                createdById: user.id,
                createdByName: user.name,
              },
            });
            await tx.material.update({
              where: { id: mat.id },
              data: { quantity: { increment: qty } },
            });
          });
          stockIn = { material: mat.name, quantity: qty, unit: mat.unit };
        }
      }
    }

    // رویداد تأیید/رد — حساس (فقط مالی/مستر)
    if (existing.status !== status && existing.orderId) {
      const actorName = await actorNameOf(user.id);
      await logOrderEvent(db, {
        orderId: existing.orderId,
        type: status === "approved" ? "cost_approved" : "cost_rejected",
        stage: existing.module,
        actorId: user.id,
        actorName,
        title: status === "approved" ? "هزینه تأیید شد" : "هزینه رد شد",
        description: `${existing.title || existing.description || "هزینه"} — ${existing.amount.toLocaleString("en-US")} دینار`,
        sensitive: true,
      });
    }

    return NextResponse.json({
      cost,
      ...(stockIn
        ? {
            stockIn,
            message: `هزینه تأیید شد — ${stockIn.quantity.toLocaleString("fa-IR")} ${stockIn.unit} «${stockIn.material}» به انبار اضافه شد`,
          }
        : {}),
    });
  } catch (e) {
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    if (user instanceof NextResponse) return user;
    const cost = await db.materialCost.findUnique({
      where: { id },
      select: {
        createdBy: true,
        createdById: true,
        status: true,
        includeInInvoice: true,
        title: true,
        amount: true,
        orderId: true,
      },
    });
    if (!cost) return NextResponse.json({ error: "هزینه یافت نشد" }, { status: 404 });

    // ─── فاز ۲۲ (خواسته‌های ۵ و ۸): چه کسی می‌تواند حذف کند؟ ───
    //   • واحد مالی / مستر: هزینه‌های «در انتظار» و «ردشده» را حذف می‌کند
    //     (خواستهٔ ۵: هزینهٔ ردشده فقط اطلاعات اضافی است؛ خواستهٔ ۸: هزینهٔ
    //     اشتباهی ثبت‌شده — با یا بدون سفارش — قابل حذف باشد).
    //   • هزینهٔ «تأییدشده»: اول باید از مالی رد شود، بعد حذف (گارد مالی).
    //     مستر/مدیر می‌تواند مستقیم حذف کند (اصلاح سریع رئیس).
    //   • ثبت‌کنندهٔ خود هزینه (طراح/چاپ/انبار): فقط تا وقتی تأیید نشده.
    const isFinance = isFinanceStaff(user);
    const isBoss = isManager(user);
    const isCreator = cost.createdBy === user.id || cost.createdById === user.id;

    if (!isBoss && !isFinance && !isCreator) {
      return NextResponse.json(
        { error: "حذف این هزینه مجاز نیست — فقط واحد مالی یا ثبت‌کنندهٔ آن" },
        { status: 403 }
      );
    }
    if (cost.status === "approved" && !isBoss) {
      return NextResponse.json(
        { error: "هزینهٔ تأییدشده قابل حذف نیست — ابتدا از مالی آن را رد کنید، سپس حذف کنید" },
        { status: 409 }
      );
    }
    // هزینه‌ای که در سند فاکتور/پیش‌فاکتور «نشسته» و ردنشده است — فقط با
    // رد شدن از فاکتور کنار می‌کشد (گارد گم‌نشدن هزینه در سند).
    if (cost.includeInInvoice && cost.status !== "rejected") {
      return NextResponse.json(
        { error: "هزینهٔ فاکتوری‌شده قابل حذف نیست — ابتدا آن را رد کنید تا از فاکتور کنار برود" },
        { status: 409 }
      );
    }

    await db.materialCost.delete({ where: { id } });

    // رویداد حساس برای تاریخچهٔ سفارش (فقط مالی/مستر می‌بیند)
    if (cost.orderId) {
      try {
        const actorName = user.name;
        await logOrderEvent(db, {
          orderId: cost.orderId,
          type: "cost_rejected",
          stage: "finance",
          actorId: user.id,
          actorName,
          title: "هزینه حذف شد",
          description: `${cost.title || "هزینه"} — ${cost.amount.toLocaleString("en-US")} دینار (${cost.status === "rejected" ? "ردشده" : cost.status === "pending" ? "در انتظار" : "تأییدشده"}) توسط ${user.name} حذف شد`,
          sensitive: true,
        });
      } catch {
        // best-effort — حذف اصلی انجام شده
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "حذف ناموفق" }, { status: 500 });
  }
}
