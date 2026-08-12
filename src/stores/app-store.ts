"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// Client-side navigation: (module, page) since we only expose "/" route.
export type NavTarget = { module: string; page: string; param?: string };

type AppState = {
  // auth (client mirror)
  user: { id: string; name: string; email: string; role: string } | null;
  setUser: (u: AppState["user"]) => void;
  logout: () => void;

  // navigation
  module: string;
  page: string;
  param?: string;
  navigate: (module: string, page: string, param?: string) => void;

  // sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // command palette
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;

  // notifications panel
  notifOpen: boolean;
  setNotifOpen: (open: boolean) => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (u) => set({ user: u }),
      logout: () => set({ user: null, module: "admin", page: "dashboard" }),

      module: "admin",
      page: "dashboard",
      navigate: (module, page, param) => set({ module, page, param }),

      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      commandOpen: false,
      setCommandOpen: (open) => set({ commandOpen: open }),

      notifOpen: false,
      setNotifOpen: (open) => set({ notifOpen: open }),
    }),
    {
      name: "printoo24-app",
      partialize: (s) => ({
        user: s.user,
        module: s.module,
        page: s.page,
        sidebarOpen: s.sidebarOpen,
      }),
    }
  )
);
