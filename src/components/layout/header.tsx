"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/app-store";
import { api } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { findModule } from "@/lib/nav";

type Notification = {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  link: string | null;
  createdAt: string;
};

const typeIcon: Record<string, "info" | "checkCircle" | "alert" | "alertTriangle"> = {
  info: "info",
  success: "checkCircle",
  warning: "alertTriangle",
  error: "alert",
};

export function Header() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const { user, logout, navigate, module: modKey, page, toggleSidebar, setCommandOpen } = useAppStore();
  const qc = useQueryClient();
  const mod = findModule(modKey);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ notifications: Notification[]; unread: number }>("/api/notifications"),
    refetchInterval: 15000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/api/notifications/${id}`, { method: "PUT" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const notifications = data?.notifications ?? [];
  const unread = data?.unread ?? 0;

  const crumbs: { label: string }[] = [{ label: mod.faLabel }];
  const curGroup = mod.groups.find((g) => g.items.some((i) => i.page === page));
  if (curGroup) crumbs.push({ label: curGroup.label });
  const curItem = curGroup?.items.find((i) => i.page === page);
  if (curItem) crumbs.push({ label: curItem.label });

  async function handleLogout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {}
    logout();
    toast.success("خروج موفقیت‌آمیز بود");
    window.location.reload();
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/80 backdrop-blur px-3">
      <Button variant="ghost" size="icon" className="size-9" onClick={toggleSidebar}>
        <Icon name="menu" size={20} />
      </Button>

      {/* Breadcrumb */}
      <div className="hidden md:flex items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Icon name="chevronLeft" size={14} className="text-muted-foreground" />}
            <span className={i === crumbs.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"}>
              {c.label}
            </span>
          </React.Fragment>
        ))}
      </div>

      <div className="flex-1" />

      {/* Search / command */}
      <Button variant="outline" size="sm" className="gap-2 hidden sm:flex" onClick={() => setCommandOpen(true)}>
        <Icon name="search" size={16} />
        <span className="text-muted-foreground">جستجو...</span>
        <kbd className="pointer-events-none select-none rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
      </Button>

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-9 relative">
            <Icon name="bell" size={20} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between px-3 py-2.5 border-b">
            <div className="font-semibold text-sm">اعلان‌ها</div>
            {unread > 0 && <Badge variant="secondary" className="text-[10px]">{unread} خوانده‌نشده</Badge>}
          </div>
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                <Icon name="bell" size={32} className="opacity-30" />
                <span className="text-sm">اعلانی وجود ندارد</span>
              </div>
            ) : (
              notifications.map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  className="flex flex-col items-start gap-1 px-3 py-2.5 cursor-pointer focus:bg-accent"
                  onClick={() => {
                    if (!n.read) markRead.mutate(n.id);
                    if (n.link) {
                      const [m, p] = n.link.split(":");
                      navigate(m, p);
                    }
                  }}
                >
                  <div className="flex items-start gap-2.5 w-full">
                    <div className={`mt-0.5 size-7 rounded-lg grid place-items-center shrink-0 ${
                      n.type === "success" ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950" :
                      n.type === "warning" ? "bg-amber-100 text-amber-600 dark:bg-amber-950" :
                      n.type === "error" ? "bg-rose-100 text-rose-600 dark:bg-rose-950" :
                      "bg-primary/10 text-primary"
                    }`}>
                      <Icon name={typeIcon[n.type] ?? "info"} size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{n.title}</span>
                        {!n.read && <span className="size-1.5 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                      <span className="text-[10px] text-muted-foreground/70 mt-0.5 block">{relativeTime(n.createdAt)}</span>
                    </div>
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Theme */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-9">
            <Icon name={mounted && theme === "dark" ? "moon" : "sun"} size={20} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>پوسته</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={theme === "light"} onCheckedChange={() => setTheme("light")}>
            روشن
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={theme === "dark"} onCheckedChange={() => setTheme("dark")}>
            تاریک
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={theme === "system"} onCheckedChange={() => setTheme("system")}>
            سیستم
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* User */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-accent transition">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {user?.name?.charAt(0) ?? "A"}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:block text-right leading-tight">
              <div className="text-xs font-medium">{user?.name ?? "کاربر"}</div>
              <div className="text-[10px] text-muted-foreground">{user?.role === "master" ? "مدیر کل" : user?.email}</div>
            </div>
            <Icon name="chevronDown" size={14} className="text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{user?.name}</span>
              <span className="text-xs text-muted-foreground font-normal" dir="ltr">{user?.email}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("admin", "dashboard")}>
            <Icon name="userCircle" size={16} /> پروفایل من
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("admin", "settings")}>
            <Icon name="settings" size={16} /> تنظیمات
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleLogout}>
            <Icon name="logout" size={16} /> خروج
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
