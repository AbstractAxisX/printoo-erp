import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// ─── PUT /api/orders/[id]/item-dates — Phase 10 ─────────────────────
//
// ویرایش تاریخ‌های طراحی/چاپ «به‌ازای هر آیتم» از مودال جزئیات سفارش
// (خواستهٔ ۳: «براشون زمان طراحی و چاپ ثبت کنیم همونجا»).
//
// قرارداد: { updates: [{ itemId, designStart?, designEnd?, printStart?, printEnd? }] }
//   • فقط فیلدهای غیرتهی اعمال می‌شوند (partial) — مقدار قبلی هرگز پاک نمی‌شود.
//   • itemId باید متعلق به همین سفارش باشد (404 در غیر این صورت).
//   • مهرهای تکمیل (designCompletedAt/printCompletedAt) دست‌نخورده می‌مانند.
//   • همهٔ آپدیت‌ها در یک تراکنش — یا همه یا هیچ.

type ItemDatesUpdate = {
  itemId: string;
  designStart?: string | null;
  designEnd?: string | null;
  printStart?: string | null;
  printEnd?: string | null;
};

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Phase 12: ویرایش زمان‌بندی = عملیات مدیریتی
  const user = await requireManager();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    const body = (await req.json()) as { updates?: ItemDatesUpdate[] };
    const updates = Array.isArray(body.updates) ? body.updates : [];

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "هیچ تاریخی برای به‌روزرسانی ارسال نشده است" },
        { status: 400 }
      );
    }

    const order = await db.order.findUnique({
      where: { id },
      select: { id: true, items: { select: { id: true } } },
    });
    if (!order)
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });

    const validIds = new Set(order.items.map((i) => i.id));
    for (const u of updates) {
      if (!u.itemId || !validIds.has(u.itemId)) {
        return NextResponse.json(
          { error: "آیتم یافت نشد در این سفارش" },
          { status: 404 }
        );
      }
    }

    const updated = await db.$transaction(async (tx) => {
      let count = 0;
      for (const u of updates) {
        const data: Record<string, Date> = {};
        if (u.designStart) data.designStartDate = new Date(u.designStart);
        if (u.designEnd) data.designEndDate = new Date(u.designEnd);
        if (u.printStart) data.printStartDate = new Date(u.printStart);
        if (u.printEnd) data.printEndDate = new Date(u.printEnd);
        if (Object.keys(data).length === 0) continue; // هیچ تغییر واقعی
        await tx.orderItem.update({ where: { id: u.itemId }, data });
        count++;
      }
      return count;
    });

    return NextResponse.json({ ok: true, updated: updated });
  } catch (e) {
    return jsonError(e, "خطا در ذخیرهٔ زمان‌بندی آیتم‌ها");
  }
}
