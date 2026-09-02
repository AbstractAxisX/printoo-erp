"use client";

import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";

/**
 * useHeartbeat — Phase 12 presence pulse.
 *
 * هر ۴۵ ثانیه (فقط وقتی tab مرئی است) به /api/auth/heartbeat زنگ می‌زند
 * تا «آنلاین» بودن کاربر زنده بماند — حضور و غیاب واقعی به‌جای ثبت دستی.
 * سرور خودش با throttle ۴۵s از نوشتن بی‌مورد جلوگیری می‌کند.
 */
export function useHeartbeat() {
  const user = useAppStore((s) => s.user);

  useEffect(() => {
    if (!user) return;

    const ping = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/auth/heartbeat", { method: "POST" }).catch(() => {
        // حضور best-effort است — خطای شبکه نادیده
      });
    };

    ping();
    const id = setInterval(ping, 45_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id]);
}
