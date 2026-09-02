import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isManager, requireManager } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// ─── Notifications API — Phase 12 ───────────────────────────────────
// GET  → ۳۰ اعلان آخر + شمار خوانده‌نشده
//        Phase 12: اعلانِ هدفمند (userId) فقط در پنل همان کاربر می‌آید؛
//        برای غیرمدیرها اعلان‌های عمومی (userId=null) + اعلان‌های خودشان.
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
    const unread = await db.notification.count({
      where: { ...scoped, read: false },
    });
    return NextResponse.json({ notifications, unread });
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
