"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { allowedModuleKeys } from "@/lib/nav";

// Client-side navigation: (module, page) since we only expose "/" route.
export type NavTarget = { module: string; page: string; param?: string };

export type Tab = {
  id: string; // `${module}:${page}`
  module: string;
  page: string;
  label: string;
  icon: string;
};

type AppUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  // Phase 12: ماژول‌های تیک‌خوردهٔ کاربر — منبع فیلتر sidebar/naوبری
  modules: string[];
};

type AppState = {
  // auth (client mirror)
  user: AppUser | null;
  setUser: (u: AppUser | null) => void;
  logout: () => void;

  // navigation
  module: string;
  page: string;
  param?: string;
  navigate: (module: string, page: string, param?: string) => void;

  // tabs (chrome-like)
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  closeAllTabs: () => void;

  // header/tabbar collapse
  headerCollapsed: boolean;
  toggleHeader: () => void;
  tabbarCollapsed: boolean;
  toggleTabbar: () => void;

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

  // dashboard shortcuts (bookmarked pages, keys formatted as "module:page")
  shortcuts: string[];
  addShortcut: (key: string) => void;
  removeShortcut: (key: string) => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      // Phase 12: setUser = ورود/تعویض هویت — navigation را هم «بهداشتی»
      // می‌کنیم: تب‌های بازِ حساب قبلی (localStorage مشترک بین کاربران)
      // حذف می‌شوند و ماژول فعال روی اولین ماژولِ مجازِ کاربر جدید می‌نشیند.
      // بدون این، بعد از logout مدیر و login طراح، پنل ادمین با تب‌های
      // ماندگار رندر می‌شد (قبلاً دقیقاً همین باگ: «سایدبار کل منوها را داشت»).
      setUser: (u) =>
        set((s) => {
          if (!u) return { ...s, user: null };
          const allowed = allowedModuleKeys(u);
          const sanitizedTabs = s.tabs.filter((t) => allowed.includes(t.module));
          const activeOk =
            s.activeTabId != null &&
            sanitizedTabs.some((t) => t.id === s.activeTabId);
          const currentOk = allowed.includes(s.module);
          const fallbackModule = allowed[0] ?? "admin";
          return {
            ...s,
            user: { ...u, modules: u.modules ?? [] },
            tabs: sanitizedTabs,
            activeTabId: activeOk
              ? s.activeTabId
              : sanitizedTabs[0]?.id ?? null,
            module: currentOk ? s.module : fallbackModule,
            page: currentOk ? s.page : "dashboard",
            param: currentOk ? s.param : undefined,
          };
        }),
      logout: () => set({ user: null, module: "admin", page: "dashboard", tabs: [], activeTabId: null, param: undefined }),

      module: "admin",
      page: "dashboard",
      navigate: (module, page, param) => {
        const state = get();
        const tabId = `${module}:${page}`;
        const existing = state.tabs.find((t) => t.id === tabId);
        if (existing) {
          // Switch to existing tab
          set({ module, page, param, activeTabId: tabId });
        } else {
          // Will be picked up by useAutoTabs to open a new tab
          set({ module, page, param });
        }
      },

      tabs: [],
      activeTabId: null,
      openTab: (tab) => {
        const state = get();
        const exists = state.tabs.find((t) => t.id === tab.id);
        if (exists) {
          set({ activeTabId: tab.id, module: tab.module, page: tab.page });
        } else {
          set({ tabs: [...state.tabs, tab], activeTabId: tab.id, module: tab.module, page: tab.page });
        }
      },
      closeTab: (id) => {
        const state = get();
        const idx = state.tabs.findIndex((t) => t.id === id);
        const newTabs = state.tabs.filter((t) => t.id !== id);
        if (state.activeTabId === id) {
          const next = newTabs[idx] ?? newTabs[idx - 1] ?? newTabs[0];
          if (next) {
            set({ tabs: newTabs, activeTabId: next.id, module: next.module, page: next.page });
          } else {
            set({ tabs: newTabs, activeTabId: null, module: "admin", page: "dashboard" });
          }
        } else {
          set({ tabs: newTabs });
        }
      },
      switchTab: (id) => {
        const tab = get().tabs.find((t) => t.id === id);
        if (tab) set({ activeTabId: id, module: tab.module, page: tab.page });
      },
      closeAllTabs: () => set({ tabs: [], activeTabId: null, module: "admin", page: "dashboard" }),

      headerCollapsed: false,
      toggleHeader: () => set((s) => ({ headerCollapsed: !s.headerCollapsed })),
      tabbarCollapsed: false,
      toggleTabbar: () => set((s) => ({ tabbarCollapsed: !s.tabbarCollapsed })),

      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      commandOpen: false,
      setCommandOpen: (open) => set({ commandOpen: open }),

      notifOpen: false,
      setNotifOpen: (open) => set({ notifOpen: open }),

      shortcuts: [
        "admin:dashboard",
        "admin:orders",
        "admin:orders-new",
        "admin:customers",
        "admin:calendar",
      ],
      addShortcut: (key) =>
        set((s) =>
          s.shortcuts.includes(key) ? s : { shortcuts: [...s.shortcuts, key] }
        ),
      removeShortcut: (key) =>
        set((s) => ({ shortcuts: s.shortcuts.filter((k) => k !== key) })),
    }),
    {
      name: "printoo24-app",
      partialize: (s) => ({
        user: s.user,
        module: s.module,
        page: s.page,
        sidebarOpen: s.sidebarOpen,
        tabs: s.tabs,
        activeTabId: s.activeTabId,
        headerCollapsed: s.headerCollapsed,
        tabbarCollapsed: s.tabbarCollapsed,
        shortcuts: s.shortcuts,
      }),
    }
  )
);
