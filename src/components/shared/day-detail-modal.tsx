"use client";

// Printoo24 ERP — Day Detail Modal (Phase 6.5 layout rebuild)
//
// ساختار جدید (پس از بازخورد «بهم ریخته»):
//   ┌────────────────────────────────────────────┐
//   │ هدر تمام‌عرض: تاریخ شمسی بزرگ + چیپ‌ها      │ ← X در همین ردیف جا می‌گیرد
//   ├────────────────────────────────────────────┤
//   │ تب‌های تمام‌عرض (نمای کلی/سفارشات/تسک‌ها)   │
//   ├──────────┬─────────────────────────────────┤
//   │ سایدبار  │ محتوای اسکرول‌شونده              │
//   │ آمار+نوار│                                 │
//   ├──────────┴─────────────────────────────────┤
//   │ ویرایشگر یادداشت روز (تمام‌عرض)            │
//   └────────────────────────────────────────────┘
// ارتفاع با flex مدیریت می‌شود (max-h تودرتو حذف شد) — هیچ «پله»ی
// ناهم‌تراز بین سایدبار و محتوا باقی نمی‌ماند.

import * as React from "react";
import { format, differenceInCalendarDays, parseISO, isValid } from "date-fns";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { CalendarEvent } from "./reusable-calendar";

type DayDetailModalProps = {
  date: Date | null;
  events: CalendarEvent[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEventClick?: (event: CalendarEvent) => void;
};

type DayNote = { id: string; date: string; content: string; color: string };

// ─── Gregorian helpers (کل سیستم میلادی است) ────────────────────────────
const weekdayFmt = new Intl.DateTimeFormat("fa-IR", { weekday: "long" });
const faNum = (n: number) => n.toLocaleString("fa-IR");

function toDate(d: string | Date): Date | null {
  try {
    const parsed = typeof d === "string" ? parseISO(d) : new Date(d);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function diffDays(end: string | Date, ref: Date): number {
  const e = toDate(end);
  if (!e) return NaN;
  return differenceInCalendarDays(e, ref);
}

const NOTE_COLORS = [
  { id: "default", dot: "bg-foreground/60", ring: "ring-foreground/40", label: "خنثی" },
  { id: "rose", dot: "bg-rose-500", ring: "ring-rose-400", label: "قرمز" },
  { id: "amber", dot: "bg-amber-500", ring: "ring-amber-400", label: "کهربایی" },
  { id: "emerald", dot: "bg-emerald-500", ring: "ring-emerald-400", label: "سبز" },
  { id: "blue", dot: "bg-blue-500", ring: "ring-blue-400", label: "آبی" },
] as const;

export function DayDetailModal({ date, events, open, onOpenChange, onEventClick }: DayDetailModalProps) {
  const [tab, setTab] = React.useState<"overview" | "orders" | "tasks" | "reports">("overview");
  const queryClient = useQueryClient();

  React.useEffect(() => { if (open) setTab("overview"); }, [open, date]);

  const dateKey = date ? format(date, "yyyy-MM-dd") : "";

  // ─── Day note (self-fetch → هیچ تقویمی تغییر نمی‌کند) ──────────────
  const noteQuery = useQuery({
    queryKey: ["day-note", dateKey],
    queryFn: () => api<{ note: DayNote | null }>(`/api/day-notes/${dateKey}`),
    enabled: open && !!dateKey,
    staleTime: 30_000,
  });

  const [noteDraft, setNoteDraft] = React.useState("");
  const [noteColor, setNoteColor] = React.useState("default");
  const [noteHydrated, setNoteHydrated] = React.useState("");

  React.useEffect(() => {
    if (!open || !dateKey) return;
    const key = `${dateKey}:${noteQuery.data?.note?.id ?? "none"}`;
    if (noteHydrated === key) return;
    setNoteHydrated(key);
    setNoteDraft(noteQuery.data?.note?.content ?? "");
    setNoteColor(noteQuery.data?.note?.color ?? "default");
  }, [open, dateKey, noteQuery.data, noteHydrated]);

  const saveNote = useMutation({
    mutationFn: () =>
      api<{ note: DayNote }>("/api/day-notes", {
        method: "POST",
        body: JSON.stringify({ date: dateKey, content: noteDraft, color: noteColor }),
      }),
    onSuccess: () => {
      toast.success("یادداشت روز ذخیره شد");
      queryClient.invalidateQueries({ queryKey: ["day-note", dateKey] });
      queryClient.invalidateQueries({ queryKey: ["day-notes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNote = useMutation({
    mutationFn: () => api(`/api/day-notes/${dateKey}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("یادداشت حذف شد");
      setNoteDraft("");
      setNoteColor("default");
      queryClient.invalidateQueries({ queryKey: ["day-note", dateKey] });
      queryClient.invalidateQueries({ queryKey: ["day-notes"] });
    },
    onError: () => toast.error("حذف یادداشت ناموفق بود"),
  });

  const hasNote = !!(noteQuery.data?.note && noteQuery.data.note.content.trim());

  const orders = events.filter((e) => e.type === "order");
  const tasks = events.filter((e) => e.type === "task");
  const reports = events.filter((e) => e.type === "report");
  const urgentOrders = orders.filter((e) => e.color === "yellow");
  const urgentTasks = tasks.filter((e) => e.color === "red");

  const totalEvents = events.length;
  const overdue = events.filter((e) => {
    const d = diffDays(e.endDate, new Date());
    return !Number.isNaN(d) && d < 0;
  }).length;
  const dueToday = events.filter((e) => {
    const d = diffDays(e.endDate, new Date());
    return !Number.isNaN(d) && d === 0;
  }).length;
  const upcoming = events.filter((e) => {
    const d = diffDays(e.endDate, new Date());
    return !Number.isNaN(d) && d > 0;
  }).length;

  if (!date) return null;

  const pct = (n: number) => (totalEvents > 0 ? Math.round((n / totalEvents) * 100) : 0);
  const urgentCount = urgentOrders.length + urgentTasks.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="sm:max-w-5xl w-[calc(100%-1.5rem)] max-h-[90vh] overflow-hidden p-0 gap-0 rounded-xl flex flex-col"
      >
        <DialogTitle className="sr-only">جزئیات روز {format(date, "yyyy/MM/dd")}</DialogTitle>

        {/* ─── هدر تمام‌عرض: تاریخ میلادی + اطلاعات روز ────────── */}
        <div className="shrink-0 flex items-center gap-4 px-6 pt-4 pb-3.5 pr-14 border-b bg-gradient-to-l from-primary/10 via-primary/5 to-transparent">
          {/* عدد بزرگ روز (میلادی) */}
          <div className="text-center shrink-0 -my-1">
            <div className="text-4xl font-black tabular-nums leading-none bg-gradient-to-b from-primary to-primary/60 bg-clip-text text-transparent" dir="ltr">
              {format(date, "d")}
            </div>
            <div className="text-[10px] font-bold text-muted-foreground tracking-wide mt-1" dir="ltr">{format(date, "yyyy/MM")}</div>
          </div>
          <div className="h-10 w-px bg-border shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold flex items-baseline gap-2 flex-wrap">
              <span>{weekdayFmt.format(date)}</span>
              <span className="text-muted-foreground font-medium tabular-nums" dir="ltr">{format(date, "yyyy/MM/dd")}</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              <span>{faNum(totalEvents)} رویداد</span>
            </div>
          </div>
          {urgentCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 shrink-0">
              <Icon name="alertTriangle" size={11} /> {faNum(urgentCount)} فوری
            </span>
          )}
          {hasNote && (
            <span className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 shrink-0">
              <Icon name="pencil" size={11} /> یادداشت
            </span>
          )}
        </div>

        {/* ─── تب‌های تمام‌عرض ─────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-1.5 px-6 py-2 border-b bg-card/60 flex-wrap">
          {([
            { id: "overview", label: "نمای کلی", icon: "dashboard" as const },
            { id: "orders", label: `سفارشات (${faNum(orders.length)})`, icon: "orders" as const },
            { id: "tasks", label: `تسک‌ها (${faNum(tasks.length)})`, icon: "task" as const },
            ...(reports.length > 0 ? [{ id: "reports" as const, label: `گزارش‌ها (${faNum(reports.length)})`, icon: "shield" as const }] : []),
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition",
                tab === t.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon name={t.icon} size={13} /> {t.label}
            </button>
          ))}
        </div>

        {/* ─── بدنه دوستونه: سایدبار آمار + محتوا ─────────────────── */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">

          {/* سایدبار (در RTL سمت راست) */}
          <aside className="md:w-56 shrink-0 md:overflow-y-auto scrollbar-thin bg-muted/20 p-3.5 flex flex-row md:flex-col gap-2.5 md:gap-2 md:border-l border-b md:border-b-0">
            <SideStat label="کل رویدادها" value={totalEvents} icon="inbox" tone="text-foreground" />
            <SideStat label="سفارشات" value={orders.length} icon="orders" tone="text-blue-600 dark:text-blue-400" />
            <SideStat label="تسک‌ها" value={tasks.length} icon="task" tone="text-emerald-600 dark:text-emerald-400" />
            <SideStat label="فوری" value={urgentCount} icon="alertTriangle" tone="text-rose-600 dark:text-rose-400" />

            {/* نوارهای وضعیت زمانی — فقط دسکتاپ */}
            <div className="hidden md:block rounded-xl border bg-card/70 p-3 space-y-2.5 mt-1">
              <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                <Icon name="clock" size={12} /> وضعیت زمانی
              </div>
              <TimeBar label="گذشته" value={overdue} pct={pct(overdue)} bar="bg-rose-500" text="text-rose-600 dark:text-rose-400" />
              <TimeBar label="موعد امروز" value={dueToday} pct={pct(dueToday)} bar="bg-amber-500" text="text-amber-600 dark:text-amber-400" />
              <TimeBar label="آینده" value={upcoming} pct={pct(upcoming)} bar="bg-emerald-500" text="text-emerald-600 dark:text-emerald-400" />
            </div>
          </aside>

          {/* محتوای اصلی */}
          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin p-5">

            {/* OVERVIEW TAB */}
            {tab === "overview" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <StatCard label="کل رویدادها" value={totalEvents} icon="inbox" color="bg-primary/10 text-primary" />
                  <StatCard label="سفارشات" value={orders.length} icon="orders" color="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400" />
                  <StatCard label="تسک‌ها" value={tasks.length} icon="task" color="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400" />
                  <StatCard label="فوری" value={urgentCount} icon="alertTriangle" color="bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400" />
                </div>

                {events.length > 0 && (
                  <div className="rounded-xl border p-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                      <Icon name="checkList" size={13} /> رویدادهای این روز
                    </div>
                    <div className="divide-y divide-border/60">
                      {events.slice(0, 6).map((e) => {
                        const daysLeft = diffDays(e.endDate, new Date());
                        return (
                          <button
                            key={e.id}
                            onClick={() => onEventClick?.(e)}
                            className="w-full flex items-center gap-2.5 text-xs py-2 px-2 -mx-2 rounded-lg hover:bg-accent/60 transition text-right"
                          >
                            <span className={cn("size-2.5 rounded-full shrink-0", DOT_BG[e.color])} />
                            <span className="flex-1 truncate font-medium">{e.fullTitle}</span>
                            <span className={cn("text-[11px] shrink-0 tabular-nums font-medium",
                              daysLeft < 0 ? "text-rose-600 dark:text-rose-400" :
                              daysLeft === 0 ? "text-amber-600 dark:text-amber-400" :
                              "text-muted-foreground")}>
                              {Number.isNaN(daysLeft) ? "—" : daysLeft > 0 ? `${faNum(daysLeft)} روز` : daysLeft === 0 ? "امروز" : `${faNum(Math.abs(daysLeft))} روز گذشته`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {events.length > 6 && (
                      <button onClick={() => setTab("orders")} className="w-full text-xs text-primary hover:underline text-center pt-2 mt-1 border-t border-dashed">
                        نمایش {faNum(events.length - 6)} مورد دیگر…
                      </button>
                    )}
                  </div>
                )}

                {events.length === 0 && !hasNote && (
                  <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                    <Icon name="inbox" size={36} className="opacity-30" />
                    <span className="text-sm">رویدادی در این روز نیست — روز آزاد است</span>
                  </div>
                )}
              </div>
            )}

            {/* ORDERS TAB */}
            {tab === "orders" && (
              <EventList events={orders} onEventClick={onEventClick} emptyMessage="سفارشی در این روز نیست" />
            )}

            {/* TASKS TAB */}
            {tab === "tasks" && (
              <EventList events={tasks} onEventClick={onEventClick} emptyMessage="تسکی در این روز نیست" />
            )}

            {/* REPORTS TAB */}
            {tab === "reports" && (
              <EventList events={reports} onEventClick={onEventClick} emptyMessage="گزارشی در این روز نیست" />
            )}
          </div>
        </div>

        {/* ─── ویرایشگر یادداشت — تمام‌عرض، در همه تب‌ها ─────────────── */}
        <div className="shrink-0 border-t bg-muted/30 px-6 py-3">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <div className="text-xs font-semibold flex items-center gap-1.5 shrink-0">
              <Icon name="pencil" size={13} className="text-amber-600" /> یادداشت این روز
            </div>
            <div className="flex items-center gap-1.5">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.id}
                  title={c.label}
                  aria-label={`رنگ ${c.label}`}
                  onClick={() => setNoteColor(c.id)}
                  className={cn(
                    "size-5 rounded-full transition hover:scale-110",
                    c.dot,
                    noteColor === c.id && cn("ring-2 ring-offset-2 ring-offset-background scale-110", c.ring)
                  )}
                />
              ))}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="مثلاً: تحویل بنر باشگاه ورشی، تماس با چاپخانه…"
              rows={2}
              className="flex-1 min-w-0 rounded-lg border bg-card px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex flex-col gap-1.5 shrink-0">
              <Button
                size="sm"
                onClick={() => saveNote.mutate()}
                disabled={saveNote.isPending || (!noteDraft.trim() && !hasNote)}
                className="h-8 gap-1"
              >
                <Icon name="check" size={14} />
                {saveNote.isPending ? "…" : "ذخیره"}
              </Button>
              {hasNote && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteNote.mutate()}
                  disabled={deleteNote.isPending}
                  className="h-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  حذف
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sidebar stat row ────────────────────────────────────────────────
function SideStat({ label, value, icon, tone }: { label: string; value: number; icon: IconName; tone: string }) {
  return (
    <div className="flex-1 md:flex-none flex items-center gap-2 rounded-lg bg-card border px-2.5 py-2">
      <Icon name={icon} size={14} className={cn("shrink-0", tone)} />
      <span className="text-[11px] text-muted-foreground flex-1 truncate">{label}</span>
      <span className={cn("text-sm font-bold tabular-nums", tone)}>{faNum(value)}</span>
    </div>
  );
}

function TimeBar({ label, value, pct, bar, text }: { label: string; value: number; pct: number; bar: string; text: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-bold tabular-nums", text)}>{faNum(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", bar)} style={{ width: `${Math.max(pct, value > 0 ? 8 : 0)}%` }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: IconName; color: string }) {
  return (
    <div className="rounded-xl border p-3 hover:shadow-sm transition">
      <div className={cn("size-9 rounded-lg grid place-items-center mb-2 mx-auto", color)}>
        <Icon name={icon} size={17} />
      </div>
      <div className="text-2xl font-black tabular-nums text-center">{faNum(value)}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5 text-center">{label}</div>
    </div>
  );
}

// ─── R17: static color-dot map ───────────────────────────────────────
const DOT_BG: Record<CalendarEvent["color"], string> = {
  blue: "bg-blue-500",
  yellow: "bg-amber-500",
  green: "bg-emerald-500",
  red: "bg-rose-500",
};

function EventList({ events, onEventClick, emptyMessage }: { events: CalendarEvent[]; onEventClick?: (e: CalendarEvent) => void; emptyMessage: string }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
        <Icon name="inbox" size={36} className="opacity-30" />
        <span className="text-sm">{emptyMessage}</span>
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {events.map((e) => {
        const start = toDate(e.startDate);
        const end = toDate(e.endDate);
        if (!start || !end) {
          return (
            <button
              key={e.id}
              onClick={() => onEventClick?.(e)}
              className={cn("w-full text-right rounded-xl border p-3.5 hover:shadow-md transition", "bg-muted/30 border-border")}
            >
              <div className="flex items-start gap-2.5">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm truncate">{e.fullTitle}</span>
                </div>
              </div>
            </button>
          );
        }
        const totalDays = differenceInCalendarDays(end, start) + 1;
        const daysLeft = differenceInCalendarDays(end, new Date());
        const colorBg = {
          blue: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
          yellow: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
          green: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900",
          red: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900",
        }[e.color];
        const colorText = {
          blue: "text-blue-600 dark:text-blue-400",
          yellow: "text-amber-600 dark:text-amber-400",
          green: "text-emerald-600 dark:text-emerald-400",
          red: "text-rose-600 dark:text-rose-400",
        }[e.color];
        return (
          <button
            key={e.id}
            onClick={() => onEventClick?.(e)}
            className={cn("w-full text-right rounded-xl border p-3.5 hover:shadow-md hover:-translate-y-px transition", colorBg)}
          >
            <div className="flex items-start gap-3">
              <div className={cn("size-10 rounded-lg grid place-items-center shrink-0 font-black text-sm tabular-nums", colorText, "bg-background/60 border border-current/10")}>
                {e.title.replace("#", "")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm truncate">{e.fullTitle}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1"><Icon name="calendar" size={11} /> {format(start, "yyyy/MM/dd")} → {format(end, "yyyy/MM/dd")}</span>
                  <span className="flex items-center gap-1"><Icon name="clock" size={11} /> {faNum(totalDays)} روز</span>
                  {daysLeft > 0 && <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium"><Icon name="checkCircle" size={11} /> {faNum(daysLeft)} روز باقی</span>}
                  {daysLeft === 0 && <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium"><Icon name="alertTriangle" size={11} /> موعد امروز</span>}
                  {daysLeft < 0 && <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1 font-medium"><Icon name="alertTriangle" size={11} /> {faNum(Math.abs(daysLeft))} روز گذشته</span>}
                </div>
              </div>
              <Icon name="chevronLeft" size={15} className="text-muted-foreground shrink-0 mt-2" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
