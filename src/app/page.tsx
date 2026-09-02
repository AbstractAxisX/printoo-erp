"use client";

import * as React from "react";
import { useAppStore } from "@/stores/app-store";
import { api } from "@/lib/api";
import { LoginForm } from "@/components/auth/login-form";
import { AppShell } from "@/components/app-shell";
import { LoadingState } from "@/components/shared";

type MeUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  modules?: string[];
};

export default function Home() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const [checking, setChecking] = React.useState(true);

  // Check existing session on mount
  // Phase 12: me هر ۶۰ ثانیه هم دوباره صدا زده می‌شود تا اگر مدیر دسترسی‌های
  // کاربر را کم/زیاد کرد، sidebar او بلافاصله (نه بعد از رفرش دستی) فیلتر شود.
  React.useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const { user: u } = await api<{ user: MeUser | null }>("/api/auth/me");
        if (!alive) return;
        if (u) setUser({ ...u, modules: u.modules ?? [] });
      } catch {
        /* not logged in */
      } finally {
        if (alive) setChecking(false);
      }
    };
    void refresh();
    const id = setInterval(() => {
      // فقط وقتی کاربر لاگین است و tab مرئی است
      if (useAppStore.getState().user && document.visibilityState === "visible") {
        void refresh();
      }
    }, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [setUser]);

  if (checking) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <LoadingState label="در حال بارگذاری سامانه..." />
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return <AppShell />;
}
