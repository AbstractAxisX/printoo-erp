// Frontend API helper

import { useAppStore } from "@/stores/app-store";

// Endpoints that legitimately return 401 while logged-OUT (the login
// form itself). A failed login attempt must NOT trigger the bounce.
const AUTH_ENDPOINTS = ["/api/auth/login", "/api/auth/me", "/api/auth/logout"];

// Hard bounce for ghost sessions: the server rejected a request while the
// client still believed it was logged in (stale HMAC cookie after a DB
// reset / user deletion). Instead of leaving the user staring at broken
// mutations ("خطا در دریافت تسک‌ها"…), wipe the client state and reload —
// page.tsx re-runs /api/auth/me → 401 → clean login form → fresh data.
function bounceIfGhostSession(path: string, status: number) {
  if (status !== 401) return;
  if (AUTH_ENDPOINTS.some((p) => path.startsWith(p))) return;
  const { user, logout } = useAppStore.getState();
  if (!user) return; // already logged out — let the caller handle the error
  logout();
  window.location.assign(window.location.pathname);
}

// ─── Phase 23: دمو = فقط مشاهده (سمت کلاینت) ───────────────────────
// قبل از اینکه حتی یک بایت به سرور برود، متدهای نوشتاری برای کاربر دمو
// بلاک می‌شوند — بازخورد فوری به کاربر (توست خطا از mutation handlerها).
// منبع حقیقت همچنان سرور است (proxy.ts + requireUser)؛ این فقط UX است.
// استثنا: خروج از حساب + heartbeat (اثر جانبی سیستمی، نه دیتای کاربر).
const DEMO_ALLOWED_METHODS = ["GET", "HEAD", "OPTIONS"];
const DEMO_WRITABLE_PATHS = ["/api/auth/logout", "/api/auth/heartbeat"];

function demoBlocked(path: string, method: string): boolean {
  const { user } = useAppStore.getState();
  if (!user?.isDemo) return false;
  if (DEMO_ALLOWED_METHODS.includes(method)) return false;
  if (DEMO_WRITABLE_PATHS.some((p) => path === p || path.startsWith(p + "/"))) return false;
  return true;
}

const DEMO_ERROR_MESSAGE = "حساب دمو فقط مشاهده است — امکان ثبت یا تغییر داده ندارید";

export async function api<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<T> {
  // Phase 23: بلاک فوری نوشتن‌های دمو (سرور هم بلاک می‌کند — دفاع در عمق)
  if (demoBlocked(path, (options?.method ?? "GET").toUpperCase())) {
    throw new Error(DEMO_ERROR_MESSAGE);
  }
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    bounceIfGhostSession(path, res.status);
    let msg = `خطای سرور (${res.status})`;
    try {
      const data = await res.json();
      msg = data.error || data.message || msg;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
