// Printoo24 ERP — Edge proxy (Phase 1.5 baseline security)
// Gates /api/* (except /api/auth/login) by session-cookie presence.
// Full HMAC verification happens server-side in getSession()/requireUser().
// Keeping this edge-safe (cookie presence only) so it stays fast and
// runs without Node crypto bindings.
//
// Next.js 16 convention: the edge entrypoint is `src/proxy.ts` exporting
// `proxy` (the `middleware` filename/export is DEPRECATED in v16 and emits
// a build warning — see nextjs.org/docs/messages/middleware-to-proxy).
//
// When full RBAC lands, this stays as the coarse gate; fine-grained
// permission checks happen in-route via requirePermission().

import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "printoo24_session";
const PUBLIC_API = ["/api/auth/login"];

export function proxy(req: NextRequest) {
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
