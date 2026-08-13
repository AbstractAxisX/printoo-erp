"use client";

import * as React from "react";
import { useAppStore } from "@/stores/app-store";
import { api } from "@/lib/api";
import { LoginForm } from "@/components/auth/login-form";
import { AppShell } from "@/components/app-shell";
import { LoadingState } from "@/components/shared";

export default function Home() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const [checking, setChecking] = React.useState(true);

  // Check existing session on mount
  React.useEffect(() => {
    (async () => {
      try {
        const { user: u } = await api<{ user: { id: string; name: string; email: string; role: string } | null }>("/api/auth/me");
        if (u) setUser(u);
      } catch {
        /* not logged in */
      } finally {
        setChecking(false);
      }
    })();
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
