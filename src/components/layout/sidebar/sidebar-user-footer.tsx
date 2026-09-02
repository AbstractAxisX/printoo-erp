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
import { cn } from "@/lib/utils";

/**
 * پاص سایدبار — منوی کاربر (SidebarUserFooter) — نسخهٔ زیباسازی‌شدهٔ فاز ۶
 * ─────────────────────────────────────────────────────────────
 * دراپ‌داون کاربر در پاص سایدبار: نمایش نام/نقش + دکمهٔ خروج.
 *
 * قرارداد رفتاری (حفظ‌شده):
 *   - کلیک روی trigger → باز شدن دراپ‌داون (مدیریت محلی state).
 *   - کلیک روی «خروج» → فراخوانی /api/auth/logout → پاک‌سازی session
 *     → reload صفحه برای بازگشت به صفحهٔ لاگین.
 *
 * طراحی بصری (فاز ۶):
 *   - آواتار با گرادیانت emerald برای نقش master (گرافیکی‌تر).
 *   - hover با پس‌زمینهٔ accent و radius بزرگ‌تر.
 *   - تایپوگرافی ظریف: نام + نقش با سایز/رنگ متفاوت.
 *   - چرون بالای کوچک در انتها (سبک bookmark).
 *   - دراپ‌داون با فاصلهٔ داخلی سخاوتمندانه.
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

  const isMaster = user?.role === "master";
  // Phase 12: نقش‌نمایی بر اساس ماژول‌ها — «طراح»، «چاپ + کنترل کیفی»، ...
  const moduleLabel = React.useMemo(() => {
    if (isMaster) return "مدیر کل";
    const labels: Record<string, string> = {
      admin: "ادمین داخلی",
      designer: "طراح",
      print: "چاپ",
      warehouse: "انبار",
      finance: "مالی",
      qc: "کنترل کیفی",
      crm: "ارتباط با مشتری",
      srm: "ارتباط با تامین‌کننده",
    };
    const mods = (user?.modules ?? []).map((m) => labels[m] ?? m);
    return mods.length ? mods.slice(0, 2).join(" + ") + (mods.length > 2 ? " +…" : "") : "کاربر";
  }, [isMaster, user?.modules]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "group/user flex items-center gap-2.5 w-full rounded-xl p-2 transition-all duration-200",
            "hover:bg-sidebar-accent/60",
            "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0",
          )}
          aria-label="منوی کاربر"
        >
          {/* آواتار با گرادیانت emerald برای نقش master + نقطهٔ حضور آنلاین */}
          <span className="relative shrink-0">
            <Avatar className="size-8">
              <AvatarFallback
                className={cn(
                  "text-xs font-bold",
                  isMaster
                    ? "bg-gradient-to-br from-primary to-emerald-700 text-primary-foreground"
                    : "bg-primary text-primary-foreground",
                )}
              >
                {user?.name?.charAt(0) ?? "A"}
              </AvatarFallback>
            </Avatar>
            <span
              className="absolute -bottom-0.5 -left-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-sidebar"
              title="آنلاین"
              aria-label="آنلاین"
            />
          </span>
          <div className="min-w-0 flex-1 text-right group-data-[collapsible=icon]:hidden">
            <div className="text-xs font-medium truncate">{user?.name ?? "کاربر"}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {moduleLabel}
            </div>
          </div>
          <Icon
            name="chevronUp"
            size={14}
            className="text-muted-foreground/60 shrink-0 transition-colors group-hover/user:text-muted-foreground group-data-[collapsible=icon]:hidden"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{user?.name}</span>
            <span className="text-xs text-muted-foreground font-normal" dir="ltr">
              {user?.email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive cursor-pointer"
          onClick={handleLogout}
        >
          <Icon name="logout" size={16} />
          <span>خروج</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
