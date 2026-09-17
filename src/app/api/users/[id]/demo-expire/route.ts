import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

// ─── Phase 23: اکسپایر کردن کاربر دمو ───────────────────────────────
// POST /api/users/[id]/demo-expire  (فقط master)
//
// demoExpiresAt = «الان» → هر فراخوانیِ بعدیِ کاربر دمو (requireUser/me/
// login) ۴۰۱ می‌دهد + کوکی پاک می‌شود → پرتاب فوری به صفحهٔ ورود.
// ثبت لاگ ورود/خروج دمو دست‌نخورده می‌ماند (تاریخچه قابل ممیزی).

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireUser();
  if (session instanceof NextResponse) return session;

  if (session.role !== "master") {
    return NextResponse.json(
      { error: "فقط مدیر ارشد می‌تواند حساب دمو را اکسپایر کند" },
      { status: 403 }
    );
  }
  if (session.isDemo) {
    return NextResponse.json(
      { error: "حساب دمو فقط مشاهده است" },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const target = await db.user.findUnique({
      where: { id },
      select: { id: true, isDemo: true, name: true, demoExpiresAt: true },
    });
    if (!target) {
      return NextResponse.json({ error: "کاربر یافت نشد" }, { status: 404 });
    }
    if (!target.isDemo) {
      return NextResponse.json(
        { error: "این کاربر دمو نیست — اکسپایر فقط برای حساب‌های دمو" },
        { status: 400 }
      );
    }

    const alreadyExpired =
      !!target.demoExpiresAt && target.demoExpiresAt.getTime() <= Date.now();
    if (!alreadyExpired) {
      await db.user.update({
        where: { id },
        data: { demoExpiresAt: new Date() },
      });
    }

    return NextResponse.json({
      ok: true,
      user: { id: target.id, name: target.name, demoExpiresAt: target.demoExpiresAt ?? new Date() },
    });
  } catch {
    return NextResponse.json(
      { error: "خطا در اکسپایر کردن حساب دمو" },
      { status: 500 }
    );
  }
}
