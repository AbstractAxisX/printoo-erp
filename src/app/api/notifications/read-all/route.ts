import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isManager } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// POST /api/notifications/read-all — Phase 17
// همهٔ اعلان‌های «قابل‌مشاهده و ناخوانده» برای کاربر جاری را خوانده می‌کند:
// createMany ردیف‌های NotificationRead (skipDuplicates) — per-user، بدون
// دست‌زدن به ستون legacy-read سراسری.
// پاسخ: { ok: true, marked: n } — n = تعداد ردیف‌های تازه خوانده‌شده.
export async function POST() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  try {
    const scoped = isManager(user)
      ? {} // مدیر: همهٔ اعلان‌ها (عمومی + هدفمند)
      : { OR: [{ userId: null }, { userId: user.id }] };

    // قابل‌مشاهده + هنوز توسط این کاربر خوانده‌نشده
    const visibleUnread = await db.notification.findMany({
      where: { ...scoped, reads: { none: { userId: user.id } } },
      select: { id: true },
    });
    if (visibleUnread.length === 0) {
      return NextResponse.json({ ok: true, marked: 0 });
    }

    // نکته: SQLite از skipDuplicates پشتیبانی نمی‌کند — اما ردیف تکراری
    // ممکن نیست چون فقط اعلان‌های «بدون ردیف خواندنِ این کاربر» انتخاب
    // شده‌اند (شرط reads:none بالاتر).
    const res = await db.notificationRead.createMany({
      data: visibleUnread.map((n) => ({ userId: user.id, notificationId: n.id })),
    });
    return NextResponse.json({ ok: true, marked: res.count });
  } catch (e) {
    return jsonError(e, "خطا در علامت‌گذاری همهٔ اعلان‌ها");
  }
}
