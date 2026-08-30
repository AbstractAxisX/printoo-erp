import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/api-error";

// ─── Notifications API ───────────────────────────────────────────────
// GET  → ۳۰ اعلان آخر + شمار خوانده‌نشده
// POST → ایجاد اعلان (internal)
// خطاهای Prisma (کلاینت/دیتابیس کهنه) با پیام قابل‌اقدام فارسی
// برمی‌گردند — jsonError را ببینید.

export async function GET() {
  try {
    const notifications = await db.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const unread = await db.notification.count({ where: { read: false } });
    return NextResponse.json({ notifications, unread });
  } catch (e) {
    return jsonError(e, "خطا در دریافت اعلان‌ها");
  }
}

// Create a notification
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, message, type, link } = body;
    if (!title) return NextResponse.json({ error: "عنوان الزامی است" }, { status: 400 });
    const n = await db.notification.create({
      data: { title, message: message || "", type: type || "info", link: link || null },
    });
    return NextResponse.json({ notification: n }, { status: 201 });
  } catch (e) {
    return jsonError(e, "خطا در ایجاد اعلان");
  }
}
