// Printoo24 ERP — Edge middleware (Phase 1.5 baseline security)
// Gates /api/* (except /api/auth/login) by session-cookie presence.
// Full HMAC verification happens server-side in getSession()/requireUser().
// Keeping this edge-safe (cookie presence only) so it stays fast and
// runs without Node crypto bindings.
//
// IMPORTANT: Next.js auto-invokes the file at src/middleware.ts exporting
// `middleware` (named) — this is the conventional entrypoint. Naming it
// proxy.ts / `export function proxy` would silently never run.
//
// When full RBAC lands, this stays as the coarse gate; fine-grained
// permission checks happen in-route via requirePermission().

import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "printoo24_session";
const PUBLIC_API = ["/api/auth/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only guard API routes (the app shell is a single SPA route "/" and
  // handles its own auth gate via useAppStore user state + /api/auth/me).
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Public API endpoints (login). /api/auth/me and /api/auth/logout are
  // intentionally NOT public — me returns null when unauthenticated (safe),
  // logout is a no-op without a session.
  if (PUBLIC_API.some((p) => pathname === p)) {
    return NextResponse.next();
  }

  // Coarse presence gate. Real verification in getSession().
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!cookie || cookie.split(".").length !== 2) {
    return NextResponse.json(
      { error: "نشست نامعتبر — ابتدا وارد شوید" },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
