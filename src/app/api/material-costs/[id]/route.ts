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
    // فقط مدیر یا ثبت‌کنندهٔ هزینه می‌تواند حذف کند
    const cost = await db.materialCost.findUnique({
      where: { id },
      select: { createdBy: true, createdById: true, status: true, includeInInvoice: true },
    });
    if (!cost) return NextResponse.json({ error: "هزینه یافت نشد" }, { status: 404 });
    if (!isManager(user) && cost.createdBy !== user.id && cost.createdById !== user.id) {
      return NextResponse.json({ error: "حذف این هزینه مجاز نیست" }, { status: 403 });
    }
    if (cost.status === "approved" && !isManager(user)) {
      return NextResponse.json(
        { error: "هزینهٔ تأییدشده قابل حذف نیست — از مالی بخواهید ابتدا رد کند" },
        { status: 409 }
      );
    }
    if (cost.includeInInvoice) {
      return NextResponse.json(
        { error: "هزینهٔ فاکتوری‌شده قابل حذف نیست — در فاکتور سفارش نشسته است" },
        { status: 409 }
      );
    }
    await db.materialCost.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "حذف ناموفق" }, { status: 500 });
  }
}
