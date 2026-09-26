import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSession, ensureSeedUser, verifyPassword, safeParsePages } from "@/lib/auth";
import { isModuleLevel } from "@/lib/module-pages";

// ─── POST /api/auth/login — Phase 12: حضور و غیاب + ماژول‌ها ─────
// علاوه بر ورود امضاشده (HMAC):
//   • lastLoginAt / lastSeenAt / loginCount++ → آمار ورود کارمندان
//   • UserActivityLog("login") → خط زمانی روزانهٔ حضور
//   • ماژول‌های کاربر در پاسخ + داخل cookie (sidebar بر اساس آن فیلتر می‌شود)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return NextResponse.json(
        { error: "ایمیل و رمز عبور الزامی است" },
        { status: 400 }
      );
    }
    await ensureSeedUser();
    const user = await db.user.findUnique({
      where: { email },
      include: { modules: { select: { module: true, pages: true, level: true } } },
    });
    // Always run verify to keep timing roughly constant (mitigate user-enumeration).
    const ok = user ? await verifyPassword(password, user.password) : false;
    if (!user || !ok) {
      return NextResponse.json(
        { error: "ایمیل یا رمز عبور نادرست است" },
        { status: 401 }
      );
    }
    if (user.status !== "active") {
      return NextResponse.json(
        { error: "حساب کاربری غیرفعال است" },
        { status: 403 }
      );
    }

    // Phase 23: حساب دمو منقضی — همان پیام عمومی ورود (بدون افشای دلیل)
    if (user.isDemo && user.demoExpiresAt && user.demoExpiresAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "حساب دمو منقضی شده است — از مدیر سیستم بخواهید دموی جدید بسازد" },
        { status: 403 }
      );
    }

    const now = new Date();
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: now,
          lastSeenAt: now,
          loginCount: { increment: 1 },
        },
      }),
      db.userActivityLog.create({
        data: { userId: user.id, action: "login" },
      }),
    ]);

    const modules = user.role === "master"
      ? [] // master دسترسی ضمنی دارد — UI خودش همه را نشان می‌دهد
      : user.modules.map((m) => m.module);

    // Phase 18: صفحات مجاز هر ماژول — null = همه
    const modulePages: Record<string, string[] | null> = {};
    // Phase 24: سطح ۳لایهٔ هر ماژول — داخل کوکی برای گیت proxy
    const moduleLevels: Record<string, string> = {};
    for (const m of user.modules) {
      modulePages[m.module] = m.pages ? safeParsePages(m.pages) : null;
      moduleLevels[m.module] = isModuleLevel(m.level) ? m.level : "delete";
    }

    await setSession({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isDemo: user.isDemo,
      modules,
      modulePages,
      moduleLevels,
    });
    return NextResponse.json({
      // Phase 27: language هم برگردده می‌شود تا کاربر بلافاصله با زبان خودش فرود بیاید
      user: { id: user.id, name: user.name, email: user.email, role: user.role, isDemo: user.isDemo, language: user.language === "fa" ? "fa" : "en", guideTooltips: user.guideTooltips, modules, modulePages, moduleLevels },
    });
  } catch {
    // Never leak raw exception text to the client (was a leak pre-Phase-1.5).
    return NextResponse.json(
      { error: "خطای سرور هنگام ورود" },
      { status: 500 }
    );
  }
}
