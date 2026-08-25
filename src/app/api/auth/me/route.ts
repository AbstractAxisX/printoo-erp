import { NextResponse } from "next/server";
import { getSession, clearSession } from "@/lib/auth";
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
export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  try {
    const fresh = await db.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    if (!fresh || fresh.status !== "active") {
      await clearSession();
      return NextResponse.json({ user: null }, { status: 401 });
    }
    return NextResponse.json({
      user: {
        id: fresh.id,
        name: fresh.name,
        email: fresh.email,
        role: fresh.role,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "خطا در بررسی نشست" },
      { status: 500 }
    );
  }
}
