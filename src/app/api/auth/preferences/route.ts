import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

// ─── Phase 23: ترجیحات شخصی کاربر ─────────────────────────────────
// PUT /api/auth/preferences  — فقط «خودِ» کاربرِ لاگین‌شده.
//
// Body: { guideTooltips?: boolean }
// هر کاربری (حتی تک-ماژوله) می‌تواند تولتیپ راهنمای خودش را خاموش/روشن
// کند — ترجیح در User.guideTooltips ذخیره می‌شود (دیفالت روشن).
//
// کاربر دمو اینجا هرگز نمی‌رسد: proxy.ts متدهای غیر-GET دمو را 403 می‌کند
// (دمو = فقط مشاهده، حتی ترجیحش تغییر نمی‌کند).

export async function PUT(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  try {
    const body = await req.json().catch(() => ({}));
    const { guideTooltips } = body ?? {};

    const data: { guideTooltips?: boolean } = {};
    if (typeof guideTooltips === "boolean") {
      data.guideTooltips = guideTooltips;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "ترجیحی برای به‌روزرسانی ارسال نشده است" },
        { status: 400 }
      );
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data,
      select: { id: true, guideTooltips: true },
    });

    return NextResponse.json({
      ok: true,
      preferences: { guideTooltips: updated.guideTooltips },
    });
  } catch {
    return NextResponse.json(
      { error: "خطا در ذخیرهٔ ترجیحات" },
      { status: 500 }
    );
  }
}
