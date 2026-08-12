// Simple cookie-based session for Printoo24 ERP.
// Master admin (full access) logs in — no real RBAC enforcement yet (per user request, added later).

import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "printoo24_session";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

// UTF-8 safe base64 (btoa can't handle Persian characters)
function b64encode(str: string): string {
  return Buffer.from(str, "utf-8").toString("base64");
}
function b64decode(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf-8");
}

// Server-side: get current user from cookie
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64decode(raw)) as SessionUser;
    return parsed;
  } catch {
    return null;
  }
}

export async function setSession(user: SessionUser) {
  const store = await cookies();
  store.set(SESSION_COOKIE, b64encode(JSON.stringify(user)), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// Ensure a default master user exists (for sandbox/demo)
export async function ensureSeedUser() {
  const existing = await db.user.findUnique({ where: { email: "admin@printoo24.com" } });
  if (existing) return existing;
  return db.user.create({
    data: {
      name: "مدیر سیستم",
      email: "admin@printoo24.com",
      password: "admin123",
      role: "master",
    },
  });
}
