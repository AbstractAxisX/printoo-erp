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

export async function api<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<T> {
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
