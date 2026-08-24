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
    return parsed;
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
export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = await getSession();
  if (!user) {
    return NextResponse.json(
      { error: "دسترسی غیرمجاز — ابتدا وارد شوید" },
      { status: 401 }
    );
  }
  return user;
}

// Convenience: boolean form for inline checks.
export async function isAuthed(): Promise<boolean> {
  return (await getSession()) !== null;
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
