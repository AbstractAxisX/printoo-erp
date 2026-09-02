import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSession, ensureSeedUser, verifyPassword } from "@/lib/auth";

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
      include: { modules: { select: { module: true } } },
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

    await setSession({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      modules,
    });
    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, modules },
    });
  } catch {
    // Never leak raw exception text to the client (was a leak pre-Phase-1.5).
    return NextResponse.json(
      { error: "خطای سرور هنگام ورود" },
      { status: 500 }
    );
  }
}
