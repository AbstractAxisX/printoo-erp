// Printoo24 ERP — Auth baseline (Phase 1.5)
// - bcrypt password hashing
// - HMAC-SHA256 signed session cookie (forgery-proof)
// - requireUser() route guard helper (returns user or 401)
//
// Full RBAC (roles/modules/field-filters) is a future system-level phase.
// See: ARCHITECTURE-NOTES-MUST-READ.md §3.2 for the full RBAC design.
// Until then, requireUser() is the swap-point: when RBAC lands, replace its
// body with requirePermission(action, moduleKey) — callsites stay unchanged.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHmac, timingSafeEqual } from "crypto";
import { hashPassword, verifyPassword } from "@/lib/password";

// Re-export password primitives so existing imports
// `import { hashPassword } from "@/lib/auth"` keep working.
export { hashPassword, verifyPassword } from "@/lib/password";

export const SESSION_COOKIE = "printoo24_session";

// Dev fallback secret — MUST be overridden in production via env.
// Generated once; rotating it invalidates all sessions (acceptable in dev).
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "printoo24-dev-secret-change-in-prod-7f3a9c1e8b2d4a6f";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  // Phase 12: ماژول‌هایی که کاربر به آن‌ها دسترسی دارد (منبع: UserModule).
  // cookie این را حمل می‌کند ولی هر requireUser از DB تازه می‌خواند تا
  // تغییر دسترسی بلافاصله اعمال شود (نه ۷ روز بعد).
  modules: string[];
};

// ─── Signed session (HMAC) ─────────────────────────────────────
function b64encode(str: string): string {
  return Buffer.from(str, "utf-8").toString("base64url");
}
function b64decode(b64: string): string {
  return Buffer.from(b64, "base64url").toString("utf-8");
}

function sign(payload: string): string {
  return createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

// Server-side: get current user from cookie (verifies HMAC signature).
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const [payloadB64, sigB64] = raw.split(".");
    if (!payloadB64 || !sigB64) return null;
    const expectedSig = sign(payloadB64);
    if (!constantTimeEqual(sigB64, expectedSig)) return null;
    const parsed = JSON.parse(b64decode(payloadB64)) as SessionUser;
    if (!parsed.id || !parsed.email) return null;
    return {
      ...parsed,
      modules: Array.isArray(parsed.modules) ? parsed.modules : [],
    };
  } catch {
    return null;
  }
}

export async function setSession(user: SessionUser) {
  const store = await cookies();
  const payload = b64encode(JSON.stringify(user));
  const sig = sign(payload);
  const value = `${payload}.${sig}`;
  store.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// ─── Route guard ───────────────────────────────────────────────
// Usage in any route handler:
//   const user = await requireUser();
//   if (user instanceof NextResponse) return user; // 401
// When RBAC lands, this becomes requirePermission(action, moduleKey).
//
// Hotfix (ghost sessions): the HMAC cookie is self-contained, so a signature
// stays valid for 7 days even if the user row was deleted or deactivated
// (DB reset, employee offboarding…). Every guarded route then ran with a
// "ghost" identity — the stale-tab 500s. Now the user row is re-verified
// against the DB on every guarded call: deleted/inactive → cookie cleared
// + 401, so the client bounces to a clean re-login with fresh data.
export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = await getSession();
  if (!user) {
    return NextResponse.json(
      { error: "دسترسی غیرمجاز — ابتدا وارد شوید" },
      { status: 401 }
    );
  }

  // Re-verify against DB: exists AND active. Stale-but-valid-signature
  // cookies (user deleted / DB reset / deactivated) must NOT pass.
  // Phase 12: modules هم از DB تازه خوانده می‌شود + presence لمس می‌شود.
  try {
    const fresh = await db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        modules: { select: { module: true } },
      },
    });
    if (!fresh || fresh.status !== "active") {
      await clearSession();
      return NextResponse.json(
        { error: "نشست شما منقضی شده — دوباره وارد شوید" },
        { status: 401 }
      );
    }
    // presence: هر فراخوانی API یعنی کاربر فعلاست — throttle داخل خود تابع
    void touchLastSeen(user.id);
    // Return the FRESH row — role/module changes apply immediately,
    // not 7 days later when the cookie expires.
    return {
      id: fresh.id,
      name: fresh.name,
      email: fresh.email,
      role: fresh.role,
      modules: fresh.modules.map((m) => m.module),
    };
  } catch {
    // DB unreachable — fail closed.
    return NextResponse.json(
      { error: "خطا در اعتبارسنجی نشست" },
      { status: 500 }
    );
  }
}

// Convenience: boolean form for inline checks.
export async function isAuthed(): Promise<boolean> {
  return (await getSession()) !== null;
}

// ─── Phase 12: presence (حضور آنلاین) ──────────────────────────
// با throttle ۴۵ثانیه‌ای — روی هر requireUser صدا زده می‌شود تا «فعال بودن»
// واقعی باشد (هر فراخوانی API = کاربر پشت صفحه است)، بی‌آنکه هر GET یک
// نوشتهٔ DB بگذارد. اینجا مانده تا import-cycle با access.ts نداشته باشیم.
export async function touchLastSeen(userId: string): Promise<void> {
  try {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { lastSeenAt: true },
    });
    if (!u) return;
    if (u.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < 45_000) return;
    await db.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    });
  } catch {
    // presence best-effort است — هرگز درخواست اصلی را نمی‌کشد
  }
}

// ─── Seed (master admin) ───────────────────────────────────────
export async function ensureSeedUser() {
  const existing = await db.user.findUnique({
    where: { email: "admin@printoo24.com" },
  });
  if (existing) {
    // Auto-migrate legacy plaintext password to bcrypt on first login attempt.
    if (existing.password && !existing.password.startsWith("$2")) {
      const hashed = await hashPassword(existing.password);
      await db.user.update({
        where: { id: existing.id },
        data: { password: hashed },
      });
    }
    return existing;
  }
  const hashed = await hashPassword("admin123");
  return db.user.create({
    data: {
      name: "مدیر سیستم",
      email: "admin@printoo24.com",
      password: hashed,
      role: "master",
    },
  });
}
