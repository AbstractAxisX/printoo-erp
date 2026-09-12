"use client";

/**
 * هدر ERP (Header) — نسخهٔ زیباسازی‌شدهٔ فاز ۶ / پنل اعلان‌های فاز ۱۷
 * ─────────────────────────────────────────────────────────────
 * هدر چسبان بالای محتوای اصلی: همبرگر + breadcrumb + اکشن‌سریع
 * (سفارش جدید) + سوییچ تم + پاپ‌آور اعلان‌ها.
 *
 * پنل اعلان‌ها (فاز ۱۷ — بازطراحی کامل):
 *   - Popover غنی ۳۸۰/۴۲۰px به‌جای DropdownMenu ساده.
 *   - وضعیت «خوانده» per-user (NotificationRead): اعلان عمومی که یک
 *     کاربر خواند برای بقیه ناخوانده می‌ماند.
 *   - سربرگ (آیکون + بج ناخوانده) + «همه را خواندم» + رفرش.
 *   - فیلتر چیپ: همه/خوانده‌نشده + نوع (اطلاع/موفق/هشدار/خطا).
 *   - آیتم‌ها با نوار رنگی نوع + آیکون رنگی + نسبی/تاریخ دقیق.
 *   - فوتر شمارنده + اشاره به به‌روزرسانی خودکار ۱۵ ثانیه‌ای.
 *
 * حفظ‌شده از فازهای قبل:
 *   - badge اعلان: z-10 + ring-2 ring-background.
 *   - TYPE_VISUALS (نقشهٔ نوع → آیکون/رنگ) — فاز ۱۷: info=violet.
 *   - کوئری ["notifications"] با refetchInterval=15000 (هم‌راه با polling).
 *   - aria-label روی همهٔ دکمه‌های فقط-آیکون.
 *   - navigate از Zustand store می‌آید (useAppStore).
 */

import * as React from "react";
import { useTheme } from "next-themes";
import { Icon, type IconName } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/app-store";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { findModule } from "@/lib/nav";
import { cn } from "@/lib/utils";

type Notification = {
  id: string; title: string; message: string; type: string;
  read: boolean; link: string | null; createdAt: string;
};

// نوع‌های معتبر اعلان (API در زمان اجرا ممکن است رشته‌های ناشناخته هم بفرستد)
type NotificationType = "info" | "success" | "warning" | "error";

// نقشهٔ نوع اعلان → (آیکون، پس‌زمینهٔ آیکون، نوار کناری) — یک منبع حقیقت.
// فاز ۱۷: رنگ‌ها بولدتر — info=violet (بدون آبی)، success=emerald،
// warning=amber، error=rose؛ آیکون روی پس‌زمینهٔ تختِ رنگی، سفید.
const TYPE_VISUALS: Record<NotificationType, { icon: IconName; tint: string; stripe: string }> = {
  info:    { icon: "info",          tint: "bg-violet-500 text-white shadow-sm shadow-violet-500/30",   stripe: "bg-violet-500" },
  success: { icon: "checkCircle",  tint: "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30", stripe: "bg-emerald-500" },
  warning: { icon: "alertTriangle", tint: "bg-amber-500 text-white shadow-sm shadow-amber-500/30",    stripe: "bg-amber-500" },
  error:   { icon: "alert",        tint: "bg-rose-500 text-white shadow-sm shadow-rose-500/30",       stripe: "bg-rose-500" },
};

// fallback دفاعی برای انواع ناشناخته از API
const FALLBACK_VISUAL = TYPE_VISUALS.info;

const fa = (n: number) => n.toLocaleString("fa-IR");

// تاریخ دقیق فارسی برای سطر meta (نسبی + دقیق)
const faExactDate = (d: string) => {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(d));
  } catch {
    return "";
  }
};

// فیلترهای خوانده‌شده/نوع — چیپ‌های دستی (سبک‌تر از ToggleGroup)
const READ_FILTERS = [
  { key: "all", label: "همه" },
  { key: "unread", label: "خوانده‌نشده" },
] as const;
type ReadFilter = (typeof READ_FILTERS)[number]["key"];

const TYPE_FILTERS: { key: NotificationType; label: string }[] = [
  { key: "info", label: "اطلاع" },
  { key: "success", label: "موفق" },
  { key: "warning", label: "هشدار" },
  { key: "error", label: "خطا" },
];

export function Header() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const { navigate, module: modKey, page, toggleSidebar } = useAppStore();
  const qc = useQueryClient();
  const mod = findModule(modKey);

  // ── پنل اعلان‌ها: باز/بسته + فیلترها ──
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [readFilter, setReadFilter] = React.useState<ReadFilter>("all");
  const [typeFilter, setTypeFilter] = React.useState<NotificationType | "all">("all");

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ notifications: Notification[]; unread: number }>("/api/notifications"),
    refetchInterval: 15000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/api/notifications/${id}`, { method: "PUT" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // فاز ۱۷: همهٔ اعلان‌های قابل‌مشاهدهٔ این کاربر را خوانده کن (per-user)
  const readAll = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; marked: number }>("/api/notifications/read-all", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const notifications = data?.notifications ?? [];
  const unread = data?.unread ?? 0;

  // فیلتر سمت کلاینت روی همان ۳۰ اعلانِ واکشی‌شده
  const filtered = notifications.filter((n) => {
    if (readFilter === "unread" && n.read) return false;
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    return true;
  });

  const openNotification = (n: Notification) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.link) {
      const parts = n.link.split(":");
      const m = parts[0];
      const p = parts[1];
      if (m && p) navigate(m, p);
    }
    setNotifOpen(false);
  };

  const crumbs: { label: string }[] = [{ label: mod.faLabel }];
  const curGroup = mod.groups.find((g) => g.items.some((i) => i.page === page));
  if (curGroup) crumbs.push({ label: curGroup.label });
  const curItem = curGroup?.items.find((i) => i.page === page);
  if (curItem) crumbs.push({ label: curItem.label });

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer",
      active
        ? "bg-primary/10 text-primary border-primary/30"
        : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
    );

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

      {/* ── اعلان‌ها — پنل غنی Popover (فاز ۱۷) ── */}
      <Popover open={notifOpen} onOpenChange={setNotifOpen}>
        <PopoverTrigger asChild>
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
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[380px] sm:w-[420px] max-w-[calc(100vw-2rem)] p-0 rounded-xl border shadow-lg overflow-hidden"
        >
          {/* سربرگ پنل — آیکون + بج ناخوانده + «همه را خواندم» + رفرش */}
          <div className="bg-muted/60 border-b px-3 py-3 flex items-center justify-between gap-2 bg-gradient-to-l from-primary/[0.06] to-transparent">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-9 rounded-lg bg-gradient-to-br from-primary/20 to-emerald-500/20 text-primary grid place-items-center shrink-0 border border-primary/20">
                <Icon name="bell" size={17} />
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-bold shrink-0">اعلان‌ها</span>
                {unread > 0 && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 bg-primary/10 text-primary border border-primary/20 shrink-0"
                  >
                    {fa(unread)} خوانده‌نشده
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {unread > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-lg text-primary hover:text-primary"
                  onClick={() => readAll.mutate()}
                  disabled={readAll.isPending}
                  title="همه را خواندم"
                  aria-label="همه را خواندم"
                >
                  <Icon
                    name={readAll.isPending ? "loading" : "checkBadge"}
                    size={15}
                    className={readAll.isPending ? "animate-spin" : ""}
                  />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-lg"
                onClick={() => void refetch()}
                title="به‌روزرسانی"
                aria-label="به‌روزرسانی اعلان‌ها"
              >
                <Icon
                  name="refresh"
                  size={15}
                  className={isFetching ? "animate-spin" : ""}
                />
              </Button>
            </div>
          </div>

          {/* چیپ‌های فیلتر — همه/خوانده‌نشده + نوع */}
          <div className="px-3 pb-2 pt-2 flex items-center gap-1.5 flex-wrap border-b bg-muted/20">
            {READ_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={chip(readFilter === f.key)}
                onClick={() => setReadFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
            <span className="w-px h-4 bg-border mx-0.5" aria-hidden="true" />
            <button
              type="button"
              className={chip(typeFilter === "all")}
              onClick={() => setTypeFilter("all")}
            >
              همهٔ انواع
            </button>
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={chip(typeFilter === f.key)}
                onClick={() => setTypeFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* لیست اعلان‌ها */}
          <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground px-4 text-center">
                <div className="size-14 rounded-2xl bg-muted/80 border grid place-items-center">
                  <Icon name="bellOff" size={24} className="opacity-60" />
                </div>
                {notifications.length === 0 ? (
                  <>
                    <span className="text-sm font-medium text-foreground/80">
                      اعلان جدیدی نیست
                    </span>
                    <span className="text-xs">اینجا خبرهای سفارش‌ها و تسویه‌ها می‌آید</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium text-foreground/80">
                      اعلانی مطابق این فیلتر نیست
                    </span>
                    <span className="text-xs">فیلتر را عوض کنید تا اعلان‌ها را ببینید</span>
                  </>
                )}
              </div>
            ) : (
              filtered.map((n) => {
                // یک منبع حقیقت برای آیکون و رنگ (DRY)
                const visuals = TYPE_VISUALS[n.type as NotificationType] ?? FALLBACK_VISUAL;
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={cn(
                      "relative w-full text-right flex items-start gap-2.5 p-3 border-b border-border/40 last:border-b-0 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                      !n.read && "bg-primary/5"
                    )}
                    onClick={() => openNotification(n)}
                  >
                    {/* نوار رنگی نوع — سمت راست آیتم */}
                    <span
                      className={cn("absolute right-0 top-2 bottom-2 w-0.5 rounded-full", visuals.stripe)}
                      aria-hidden="true"
                    />
                    {/* آیکون نوع — مربع رنگی با آیکون سفید */}
                    <span className={cn("size-9 rounded-lg grid place-items-center shrink-0", visuals.tint)}>
                      <Icon name={visuals.icon} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{n.title}</span>
                        {!n.read && (
                          <span
                            className="size-2 rounded-full bg-emerald-500 shrink-0"
                            aria-label="خوانده‌نشده"
                          />
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground line-clamp-2 leading-relaxed mt-0.5">
                        {n.message}
                      </span>
                      <span className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground/80 flex-wrap">
                        <span>{relativeTime(n.createdAt)}</span>
                        <span aria-hidden="true">•</span>
                        <span className="tabular-nums">{faExactDate(n.createdAt)}</span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* فوتر پنل — شمارنده + اشاره به به‌روزرسانی خودکار */}
          <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center justify-between gap-2">
            <span className="tabular-nums">
              {fa(unread)} خوانده‌نشده از {fa(notifications.length)}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
              <Icon name="clock" size={11} className="shrink-0" />
              به‌روزرسانی خودکار هر ۱۵ ثانیه
            </span>
          </div>
        </PopoverContent>
      </Popover>
    </header>
  );
}
