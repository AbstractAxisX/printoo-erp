import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isManager, localDayKey, activeLeaveToday, type LeaveSpan } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// ─── /api/leaves — مرخصی (Phase 13) ──────────────────────────────
//
// GET  ?userId= → مدیر: هر کاربر؛ کاربر عادی: فقط خودش.
//      بدون userId → همهٔ مرخصی‌های آینده/جاری (برای تقویم مدیر).
// POST (مدیر) { userId, startDate, endDate, note? } — ثبت بازهٔ مرخصی.
//      «ادمین بتونه در بخش پروفایل کاربر واسش مرخصی رد کنه تو تقویم
//       بصورت انتخاب بازه» + «زمان مرخصی ثبت میشه» (برای حقوق آینده).
//
// تاریخ‌ها yyyy-MM-dd لوکال‌اند (بدون تایم‌زون — مثل DayNote).

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const manager = isManager(user);
    const targetId = userId ?? (manager ? undefined : user.id);

    const leaves = await db.userLeave.findMany({
      where: targetId ? { userId: targetId } : undefined,
      select: {
        id: true,
        userId: true,
        startDate: true,
        endDate: true,
        note: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
        createdByUser: { select: { id: true, name: true } },
      },
      orderBy: { startDate: "desc" },
    });

    // فیلد کمکی: آیا امروز جاری است؟
    const today = localDayKey();
    return NextResponse.json({
      leaves: leaves.map((l) => ({
        ...l,
        activeToday: l.startDate <= today && today <= l.endDate,
        isFuture: l.startDate > today,
      })),
    });
  } catch (e) {
    return jsonError(e, "خطا در دریافت مرخصی‌ها");
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  if (!isManager(user)) {
    return NextResponse.json(
      { error: "ثبت مرخصی مخصوص مدیر سیستم / مدیر داخلی است" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { userId, startDate, endDate, note } = body ?? {};

    if (typeof userId !== "string" || !userId) {
      return NextResponse.json({ error: "کاربر مرخصی الزامی است" }, { status: 400 });
    }
    const target = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, status: true },
    });
    if (!target) {
      return NextResponse.json({ error: "کاربر یافت نشد" }, { status: 404 });
    }
    if (typeof startDate !== "string" || !DAY_RE.test(startDate)) {
      return NextResponse.json(
        { error: "تاریخ شروع مرخصی معتبر نیست (yyyy-MM-dd)" },
        { status: 400 }
      );
    }
    if (typeof endDate !== "string" || !DAY_RE.test(endDate)) {
      return NextResponse.json(
        { error: "تاریخ پایان مرخصی معتبر نیست (yyyy-MM-dd)" },
        { status: 400 }
      );
    }
    if (endDate < startDate) {
      return NextResponse.json(
        { error: "تاریخ پایان مرخصی نمی‌تواند قبل از شروع باشد" },
        { status: 400 }
      );
    }

    // هم‌پوشانی با مرخصی موجود → خطای روشن (نه سکوت)
    const overlapping = await db.userLeave.findFirst({
      where: { userId, startDate: { lte: endDate }, endDate: { gte: startDate } },
      select: { id: true, startDate: true, endDate: true },
    });
    if (overlapping) {
      return NextResponse.json(
        {
          error: `این بازه با مرخصی موجود (${overlapping.startDate} تا ${overlapping.endDate}) هم‌پوشانی دارد`,
        },
        { status: 409 }
      );
    }

    const leave = await db.userLeave.create({
      data: {
        userId,
        startDate,
        endDate,
        note: typeof note === "string" && note.trim() ? note.trim() : null,
        createdById: user.id,
      },
      select: { id: true, userId: true, startDate: true, endDate: true, note: true },
    });

    // نوتیف به خود کاربر: «مرخصی‌ات ثبت شد»
    try {
      await db.notification.create({
        data: {
          userId,
          title: "مرخصی ثبت شد",
          message: `مرخصی شما از ${startDate} تا ${endDate} توسط مدیر ثبت شد.`,
          type: "info",
          link: "profile:view",
        },
      });
    } catch {
      // best-effort
    }

    return NextResponse.json({ leave }, { status: 201 });
  } catch (e) {
    return jsonError(e, "خطا در ثبت مرخصی");
  }
}
