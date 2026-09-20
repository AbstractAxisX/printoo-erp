import { NextResponse } from "next/server";
import { getSession, clearSession, touchLastSeen, safeParsePages, setSession } from "@/lib/auth";
import { isModuleLevel } from "@/lib/module-pages";
import { db } from "@/lib/db";

// /api/auth/me — session bootstrap for the client shell.
//
// Hotfix (ghost sessions): previously this echoed the HMAC cookie payload
// verbatim. A cookie signed before a DB reset / user deletion kept the
// client "logged in" as a user that no longer exists — every subsequent
// mutation then failed with confusing errors (the stale-tab 500s saga).
// Now the user row is re-verified: deleted/inactive → cookie cleared +
// 401, so page.tsx renders the login form and the next login pulls
// FRESH ids (assignee pickers, order links, everything).
//
// Phase 12: ماژول‌های کاربر هم تازه برمی‌گردند (sidebar فوراً فیلتر می‌شود
// اگر master دسترسی‌ها را کم/زیاد کرد) + lastSeenAt لمس می‌شود — این
// endpoint نقش heartbeat اولیه را هم دارد.
export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  try {
    const fresh = await db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        isDemo: true,
        demoExpiresAt: true,
        guideTooltips: true,
        modules: { select: { module: true, pages: true, level: true } },
      },
    });
    if (!fresh || fresh.status !== "active") {
      await clearSession();
      return NextResponse.json({ user: null }, { status: 401 });
    }
    // Phase 23: انقضای حساب دمو — همان رفتار requireUser (بدون DB-write)
    if (fresh.isDemo && fresh.demoExpiresAt && fresh.demoExpiresAt.getTime() <= Date.now()) {
      await clearSession();
      return NextResponse.json({ user: null }, { status: 401 });
    }
    void touchLastSeen(fresh.id);
    // Phase 18: صفحات مجاز هر ماژول هم تازه برمی‌گردند (مثل modules)
    const modulePages: Record<string, string[] | null> = {};
    // Phase 24: سطح ۳لایهٔ هر ماژول (view/edit/delete)
    const moduleLevels: Record<string, string> = {};
    for (const m of fresh.modules) {
      modulePages[m.module] = m.pages ? safeParsePages(m.pages) : null;
      moduleLevels[m.module] = isModuleLevel(m.level) ? m.level : "delete";
    }
    // Phase 24: کوکی دوباره prime می‌شود تا گیت proxy در edge همیشه
    // سطح‌های تازه ببیند (بعد از تغییر دسترسی توسط master، بارگذاری
    // بعدی صفحه یا heartbeat ۴۵ثانیه‌ای آن را اعمال می‌کند).
    await setSession({
      id: fresh.id,
      name: fresh.name,
      email: fresh.email,
      role: fresh.role,
      isDemo: fresh.isDemo,
      modules: fresh.role === "master" ? [] : fresh.modules.map((m) => m.module),
      modulePages,
      moduleLevels,
    });
    return NextResponse.json({
      user: {
        id: fresh.id,
        name: fresh.name,
        email: fresh.email,
        role: fresh.role,
        isDemo: fresh.isDemo,
        // Phase 23: ترجیح تولتیپ راهنما (دیفالت روشن)
        guideTooltips: fresh.guideTooltips,
        modules:
          fresh.role === "master"
            ? [] // master = همهٔ ماژول‌ها (UI می‌داند)
            : fresh.modules.map((m) => m.module),
        modulePages,
        moduleLevels,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "خطا در بررسی نشست" },
      { status: 500 }
    );
  }
}
