import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isManager, requireManager } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// ─── Notifications API — Phase 12 / Phase 17 ───────────────────────
// GET  → ۳۰ اعلان آخر + شمار خوانده‌نشده
//        Phase 12: اعلانِ هدفمند (userId) فقط در پنل همان کاربر می‌آید؛
//        برای غیرمدیرها اعلان‌های عمومی (userId=null) + اعلان‌های خودشان.
//        Phase 17: «خوانده» per-user از NotificationRead محاسبه می‌شود
//        (اعلان عمومی که یک کاربر خواند برای بقیه ناخوانده می‌ماند) —
//        ستون legacy-read دیگر بازنویتی نمی‌شود.
// POST → ایجاد اعلان (مدیریت) — routeهای داخلی مستقیم از db.create استفاده می‌کنند.
//
// خطاهای Prisma با پیام قابل‌اقدام فارسی برمی‌گردند — jsonError را ببینید.

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  try {
    const scoped = isManager(user)
      ? {} // مدیر: همهٔ اعلان‌ها (عمومی + هدفمند)
      : { OR: [{ userId: null }, { userId: user.id }] };

    const notifications = await db.notification.findMany({
      where: scoped,
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    // Phase 17: read هر-کاربر — ردیف‌های خوانده‌شدهٔ «این» کاربر
    const myReads = await db.notificationRead.findMany({
      where: {
        userId: user.id,
        notificationId: { in: notifications.map((n) => n.id) },
      },
      select: { notificationId: true },
    });
    const readSet = new Set(myReads.map((r) => r.notificationId));

    const items = notifications.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      link: n.link,
      userId: n.userId,
      createdAt: n.createdAt,
      read: readSet.has(n.id), // per-user — ستون legacy-read دست‌نخورده
    }));
    const unread = items.filter((n) => !n.read).length;
    return NextResponse.json({ notifications: items, unread });
  } catch (e) {
    return jsonError(e, "خطا در دریافت اعلان‌ها");
  }
}

// Create a notification (management only)
export async function POST(req: NextRequest) {
  const user = await requireManager();
  if (user instanceof NextResponse) return user;

  try {
    const body = await req.json();
    const { title, message, type, link, userId } = body;
    if (!title) return NextResponse.json({ error: "عنوان الزامی است" }, { status: 400 });
    const n = await db.notification.create({
      data: {
        title,
        message: message || "",
        type: type || "info",
        link: link || null,
        // هدفمند اختیاری — اگر userId معتبر باشد فقط همان کاربر می‌بیند
        ...(typeof userId === "string" && userId ? { userId } : {}),
      },
    });
    return NextResponse.json({ notification: n }, { status: 201 });
  } catch (e) {
    return jsonError(e, "خطا در ایجاد اعلان");
  }
}
