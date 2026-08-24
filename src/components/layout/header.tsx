"use client";

/**
 * هدر ERP (Header) — نسخهٔ زیباسازی‌شدهٔ فاز ۶
 * ─────────────────────────────────────────────────────────────
 * هدر چسبان بالای محتوای اصلی: همبرگر + breadcrumb + اکشن‌سریع
 * (سفارش جدید) + سوییچ تم + دراپ‌داون اعلان‌ها.
 *
 * طراحی بصری (فاز ۶ — زیباسازی):
 *   - ارتفاع بیشتر (h-16) برای فضای تنفس.
 *   - glass-morphism قوی‌تر: bg-background/70 backdrop-blur-md.
 *   - خط پایین گرادیانتی emerald (via-primary/30) برای عمق.
 *   - دکمهٔ «سفارش جدید» به‌عنوان CTA hero با گرادیانت emerald
 *     و سایهٔ نورانی + فیدبک لمسی (active:scale-95).
 *   - breadcrumb با چرون‌های ظریف‌تر.
 *   - همهٔ دکمه‌ها با rounded-lg و انیمیشن نرم.
 *
 * حفظ‌شده از فاز ۴:
 *   - badge اعلان: z-10 + ring-2 ring-background.
 *   - refactoring DRY: TYPE_VISUALS برای type→(icon, color).
 *   - aria-label روی همهٔ دکمه‌های فقط-آیکون.
 *
 * حفظ‌شده از فاز ۳:
 *   - هیچ ناوبری در سایدبار از هدر انجام نمی‌شود (به‌جز از CTA).
 *   - navigate از Zustand store می‌آید (useAppStore).
 */

import * as React from "react";
import { useTheme } from "next-themes";
import { Icon, type IconName } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/app-store";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { findModule } from "@/lib/nav";

type Notification = {
  id: string; title: string; message: string; type: string;
  read: boolean; link: string | null; createdAt: string;
};

// نوع‌های معتبر اعلان (API در زمان اجرا ممکن است رشته‌های ناشناخته هم بفرستد)
type NotificationType = "info" | "success" | "warning" | "error";

// نقشهٔ نوع اعلان → (آیکون، کلاس رنگی) — یک منبع حقیقت (اصل DRY).
// از این نقشه هم برای آیکون و هم برای className رنگی استفاده می‌شود
// تا همیشه هماهنگ بمانند (اگر یک نوع اضافه شد، فقط همین‌جا تغییر کند).
const TYPE_VISUALS: Record<NotificationType, { icon: IconName; tint: string }> = {
  info:    { icon: "info",          tint: "bg-primary/10 text-primary" },
  success: { icon: "checkCircle",  tint: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950" },
  warning: { icon: "alertTriangle", tint: "bg-amber-100 text-amber-600 dark:bg-amber-950" },
  error:   { icon: "alert",        tint: "bg-rose-100 text-rose-600 dark:bg-rose-950" },
};

// fallback دفاعی برای انواع ناشناخته از API
const FALLBACK_VISUAL = TYPE_VISUALS.info;

export function Header() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const { navigate, module: modKey, page, toggleSidebar } = useAppStore();
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

  return (
    <header className="sticky top-0 z-40 relative flex h-16 items-center gap-2.5 border-b border-border/60 bg-background/70 backdrop-blur-md px-4">
      {/* خط پایین گرادیانتی emerald برای عمق بصری */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-l from-transparent via-primary/30 to-transparent" aria-hidden="true" />

      {/* همبرگر — toggle سایدبار */}
      <Button
        variant="ghost"
        size="icon"
        className="size-9 rounded-lg hover:bg-accent transition-all duration-200"
        onClick={toggleSidebar}
        aria-label="باز/بسته کردن سایدبار"
      >
        <Icon name="menu" size={20} className="transition-transform duration-200" />
      </Button>

      {/* Breadcrumb — مسیر فعّال */}
      <div className="hidden md:flex items-center gap-1.5 text-sm min-w-0">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <Icon
                name="chevronLeft"
                size={14}
                className="text-muted-foreground/50 shrink-0"
                aria-hidden="true"
              />
            )}
            <span
              className={`truncate transition-colors ${
                i === crumbs.length - 1
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {c.label}
            </span>
          </React.Fragment>
        ))}
      </div>

      <div className="flex-1" />

      {/* اکشن سریع: سفارش جدید — CTA hero با گرادیانت emerald */}
      <Button
        size="sm"
        className="gap-1.5 rounded-lg bg-gradient-to-r from-primary to-emerald-700 px-3.5 shadow-md shadow-primary/25 transition-all duration-200 hover:shadow-lg hover:shadow-primary/30 hover:brightness-105 active:scale-95 border border-primary/30"
        onClick={() => navigate("admin", "orders-new")}
        aria-label="سفارش جدید"
      >
        <Icon name="plus" size={16} className="shrink-0" />
        <span className="hidden sm:inline">سفارش جدید</span>
      </Button>

      {/* سوییچ تم — مستقیم، بدون پاپ‌آپ. mounted-guard برای جلوگیری از mismatch hydration */}
      <Button
        variant="ghost"
        size="icon"
        className="size-9 rounded-lg hover:bg-accent transition-all duration-200"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        title={theme === "dark" ? "حالت روشن" : "حالت تاریک"}
        aria-label={theme === "dark" ? "حالت روشن" : "حالت تاریک"}
      >
        <Icon
          name={mounted && theme === "dark" ? "moon" : "sun"}
          size={20}
          className="transition-transform duration-300 hover:scale-110"
        />
      </Button>

      {/* اعلان‌ها — badge با z-10 + ring-2 ring-background (فاز ۴) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-lg relative hover:bg-accent transition-all duration-200"
            aria-label="اعلان‌ها"
          >
            <Icon name="bell" size={20} className="transition-transform duration-200" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -left-0.5 z-10 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center ring-2 ring-background shadow-sm shadow-destructive/30">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
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
              notifications.map((n) => {
                // یک منبع حقیقت برای آیکون و رنگ (DRY — فاز ۴)
                const visuals = TYPE_VISUALS[n.type as NotificationType] ?? FALLBACK_VISUAL;
                return (
                <DropdownMenuItem
                  key={n.id}
                  className="flex flex-col items-start gap-1 px-3 py-2.5 cursor-pointer focus:bg-accent transition-colors"
                  onClick={() => {
                    if (!n.read) markRead.mutate(n.id);
                    if (n.link) {
                      const parts = n.link.split(":");
                      const m = parts[0];
                      const p = parts[1];
                      if (m && p) navigate(m, p);
                    }
                  }}
                >
                  <div className="flex items-start gap-2.5 w-full">
                    <div className={`mt-0.5 size-7 rounded-lg grid place-items-center shrink-0 ${visuals.tint}`}>
                      <Icon name={visuals.icon} size={16} />
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
                );
              })
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
