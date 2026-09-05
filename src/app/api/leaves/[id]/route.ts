import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isManager } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// ─── DELETE /api/leaves/[id] — حذف مرخصی (مدیر) ──────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  if (!isManager(user)) {
    return NextResponse.json(
      { error: "حذف مرخصی مخصوص مدیر سیستم / مدیر داخلی است" },
      { status: 403 }
    );
  }

  const { id } = await params;
  try {
    const existing = await db.userLeave.findUnique({
      where: { id },
      select: { id: true, userId: true, startDate: true, endDate: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "مرخصی یافت نشد" }, { status: 404 });
    }
    await db.userLeave.delete({ where: { id } });

    // نوتیف به کاربر: «مرخصی‌ات حذف شد»
    try {
      await db.notification.create({
        data: {
          userId: existing.userId,
          title: "مرخصی حذف شد",
          message: `مرخصی ${existing.startDate} تا ${existing.endDate} توسط مدیر حذف شد.`,
          type: "warning",
          link: "profile:view",
        },
      });
    } catch {
      // best-effort
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, "حذف مرخصی ناموفق");
  }
}
