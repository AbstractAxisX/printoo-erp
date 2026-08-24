"use client";

import * as React from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/lib/icons";
import { useAppStore } from "@/stores/app-store";
import { api } from "@/lib/api";
import { toast } from "sonner";

/**
 * پاص سایدبار — منوی کاربر (SidebarUserFooter)
 * ─────────────────────────────────────────────────────────────
 * دراپ‌داون کاربر در پاص سایدبار: نمایش نام/نقش + دکمهٔ خروج.
 *
 * قرارداد رفتاری:
 *   - کلیک روی trigger → باز شدن دراپ‌داون (مدیریت محلی state).
 *   - کلیک روی «خروج» → فراخوانی /api/auth/logout → پاک‌سازی session
 *     → reload صفحه برای بازگشت به صفحهٔ لاگین.
 *
 * نکته: این کامپوننت state محلی خودکفا دارد (نیازی به useDrawerSync
 * ندارد چون باز/بسته شدن دراپ‌داون به state ماژول وابسته نیست).
 */
export function SidebarUserFooter() {
  const { user, logout } = useAppStore();
  const [open, setOpen] = React.useState(false);

  async function handleLogout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // حتی اگر فراخوانی API ناموفق بود، state محلی را پاک می‌کنیم
    }
    logout();
    toast.success("خروج موفقیت‌آمیز بود");
    window.location.reload();
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 w-full rounded-lg p-2 hover:bg-accent transition group-data-[collapsible=icon]:justify-center">
          <Avatar className="size-8 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {user?.name?.charAt(0) ?? "A"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 text-right group-data-[collapsible=icon]:hidden">
            <div className="text-xs font-medium truncate">
              {user?.name ?? "کاربر"}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              {user?.role === "master" ? "مدیر کل" : user?.email}
            </div>
          </div>
          <Icon
            name="chevronUp"
            size={14}
            className="text-muted-foreground shrink-0 group-data-[collapsible=icon]:hidden"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{user?.name}</span>
            <span
              className="text-xs text-muted-foreground font-normal"
              dir="ltr"
            >
              {user?.email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={handleLogout}
        >
          <Icon name="logout" size={16} /> خروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
