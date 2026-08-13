import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSession, ensureSeedUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "ایمیل و رمز عبور الزامی است" }, { status: 400 });
    }
    await ensureSeedUser();
    const user = await db.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (!user || user.password !== password) {
      return NextResponse.json({ error: "ایمیل یا رمز عبور نادرست است" }, { status: 401 });
    }
    if (user.status !== "active") {
      return NextResponse.json({ error: "حساب کاربری غیرفعال است" }, { status: 403 });
    }
    await setSession({ id: user.id, name: user.name, email: user.email, role: user.role });
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    return NextResponse.json({ error: "خطای سرور: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
