import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSession, ensureSeedUser, verifyPassword } from "@/lib/auth";

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
    const user = await db.user.findUnique({ where: { email } });
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
    await setSession({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch {
    // Never leak raw exception text to the client (was a leak pre-Phase-1.5).
    return NextResponse.json(
      { error: "خطای سرور هنگام ورود" },
      { status: 500 }
    );
  }
}
