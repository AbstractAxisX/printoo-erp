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
//
// ─── Phase 23: کاربر دمو (فقط مشاهده) ─────────────────────────────
// session cookie امضاشده است (HMAC) پس payload آن قابل اعتماد است —
// بدون DB، middleware می‌تواند isDemo را از payload بخواند و «همهٔ»
// متدهای غیر-GET را ببندد. تلاش برای جعل isDemo=false بی‌اثر است چون
// امضا mismatch می‌شود و requireUser سمت سرور 401 می‌دهد (fail-closed).
// استثناهای مجاز برای دمو: خروج از حساب + heartbeat حضور (هر دو فقط
// اثر جانبی سیستمی دارند، نه تغییر دیتای کاربر).

import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "printoo24_session";
const PUBLIC_API = ["/api/auth/login", "/api/public"];

// متدهای مجاز برای کاربر دمو — فقط خواندن
const DEMO_ALLOWED_METHODS = ["GET", "HEAD", "OPTIONS"];

// مسیرهای غیر-GET که دمو همچنان می‌زند (خروج + حضور آنلاین)
const DEMO_WRITABLE_PATHS = ["/api/auth/logout", "/api/auth/heartbeat"];

/** خواندن امن فیلد isDemo از payload کوکی — بدون اعتبارسنجی HMAC
 *  (آن اینجا edge نیست؟) درست است: فقط «بستن بیشتر» ممکن است، جعل
 *  کوکی همیشه در requireUser سمت سرور رد می‌شود. */
function sessionIsDemo(rawCookie: string | undefined): boolean {
  if (!rawCookie) return false;
  try {
    const [payloadB64] = rawCookie.split(".");
    if (!payloadB64) return false;
    // base64url → JSON (edge-safe، بدون Node crypto)
    const json = decodeURIComponent(
      atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const parsed = JSON.parse(json) as { isDemo?: boolean };
    return parsed?.isDemo === true;
  } catch {
    return false;
  }
}

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
  // Phase 16: /api/public/* (صفحهٔ عمومی بسته — QR روی بج، بدون لاگین)
  if (PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
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

  // ─── Phase 23: دمو = فقط مشاهده ────────────────────────────────
  // همهٔ متدهای نوشتاری (POST/PUT/DELETE/PATCH) روی همهٔ routeها بسته
  // می‌شوند — حتی routeهایی که در آینده اضافه شوند (دفاع در عمق).
  if (
    sessionIsDemo(cookie) &&
    !DEMO_ALLOWED_METHODS.includes(req.method) &&
    !DEMO_WRITABLE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.json(
      { error: "حساب دمو فقط مشاهده است — امکان ثبت یا تغییر داده ندارید" },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
