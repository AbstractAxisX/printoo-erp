"use client";

// ─── Phase 25: هوک + اجزای مشترک ارز (کلاینت) ───────────────────
// useFxRates → react-query روی /api/fx (۱۵ دقیقه رفرش)
// CurrencySelect → سگمنت دینار/دلار/تومان (فرم‌ها)
// CurrencyChip → بج کوچک ارز روی جداول/کارت‌ها
// FxBar → نوار نرخ لحظه‌ای فشرده (ویزارد/دیالوگ‌ها)
// FxRatesPanel → پنل کامل نرخ‌ها + ویرایش دستی (داشبورد مالی)

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CURRENCIES, CURRENCY_LIST, parseCurrency, type Currency, type FxRates } from "@/lib/money";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type FxApiResponse = {
  rates: { USD_IQD: number; USD_IRT: number; IQD_IRT: number };
  sources: { USD_IQD: string; USD_IRT: string };
  fetchedAt: { USD_IQD: string | null; USD_IRT: string | null };
  ageHours: number;
  stale: boolean;
  canEdit: boolean;
};

/** هوک نرخ زنده — همهٔ مصرف‌کننده‌ها یک کش مشترک. */
export function useFxRates() {
  const q = useQuery({
    queryKey: ["fx-rates"],
    queryFn: () => api<FxApiResponse>("/api/fx"),
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
    retry: 1,
  });
  const rates: FxRates = React.useMemo(
    () => ({
      USD_IQD: q.data?.rates.USD_IQD ?? 1310,
      USD_IRT: q.data?.rates.USD_IRT ?? 150000,
    }),
    [q.data]
  );
  return { ...q, rates };
}

// ─── CurrencySelect — سگمنت سه‌گزینه‌ای ─────────────────────────────

export function CurrencySelect({
  value,
  onChange,
  size = "md",
  className,
  disabled,
}: {
  value: Currency | string;
  onChange: (c: Currency) => void;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
}) {
  const cur = parseCurrency(value);
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border bg-muted/30 p-0.5",
        size === "sm" ? "text-[11px]" : "text-xs",
        disabled && "opacity-60 pointer-events-none",
        className
      )}
      role="radiogroup"
      aria-label="ارز"
    >
      {CURRENCY_LIST.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={cur === c}
          disabled={disabled}
          onClick={() => onChange(c)}
          className={cn(
            "rounded-md font-medium transition whitespace-nowrap",
            size === "sm" ? "px-2 py-1" : "px-2.5 py-1.5",
            cur === c
              ? "bg-background text-foreground shadow-sm border"
              : "text-muted-foreground hover:bg-background/60"
          )}
          title={CURRENCIES[c].fa}
        >
          {CURRENCIES[c].short}
        </button>
      ))}
    </div>
  );
}

// ─── CurrencyChip — بج کوچک روی جداول ───────────────────────────────

export function CurrencyChip({ currency, className }: { currency: Currency | string | null | undefined; className?: string }) {
  const c = parseCurrency(currency);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap",
        CURRENCIES[c].chip,
        className
      )}
      title={CURRENCIES[c].fa}
    >
      {CURRENCIES[c].short}
    </span>
  );
}

// ─── FxBar — نوار فشردهٔ نرخ لحظه‌ای ────────────────────────────────

export function FxBar({ className }: { className?: string }) {
  const { data, isLoading } = useFxRates();
  if (isLoading && !data) {
    return (
      <div className={cn("text-[11px] text-muted-foreground flex items-center gap-1.5", className)}>
        <span className="size-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
        در حال دریافت نرخ ارز…
      </div>
    );
  }
  const r = data?.rates;
  if (!r) return null;
  const src = data.sources.USD_IQD === "manual" ? "دستی" : data.sources.USD_IQD === "fallback" ? "پیش‌فرض" : "خودکار";
  return (
    <div
      className={cn(
        "flex items-center gap-2 flex-wrap text-[11px] rounded-lg border bg-muted/25 px-2.5 py-1.5",
        data.stale && "border-amber-400/50",
        className
      )}
      dir="ltr"
    >
      <span className="font-bold text-muted-foreground">USD</span>
      <span className="tabular-nums text-foreground">
        1 $ = {r.USD_IQD.toLocaleString("en-US")} IQD
      </span>
      <span className="text-muted-foreground/40">·</span>
      <span className="tabular-nums text-foreground">
        1 $ = {r.USD_IRT.toLocaleString("en-US")} تومان
      </span>
      <span className="text-muted-foreground/40">·</span>
      <span className="tabular-nums text-muted-foreground">
        1000 تومان = {r.IQD_IRT.toLocaleString("en-US")} IQD
      </span>
      <span className={cn("ms-auto rounded-full px-1.5 py-0.5 text-[9px] font-medium", data.stale ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" : "bg-muted text-muted-foreground")}>
        {src}
        {data.ageHours > 0.05 ? ` · ${Math.round(data.ageHours)}ساعت قبل` : ""}
      </span>
    </div>
  );
}

// ─── FxRatesPanel — پنل کامل (داشبورد مالی) ─────────────────────────

export function FxRatesPanel({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useFxRates();
  const [editing, setEditing] = React.useState(false);
  const [usdIqd, setUsdIqd] = React.useState("");
  const [usdIrt, setUsdIrt] = React.useState("");

  React.useEffect(() => {
    if (data && editing && !usdIqd && !usdIrt) {
      setUsdIqd(String(Math.round(data.rates.USD_IQD)));
      setUsdIrt(String(Math.round(data.rates.USD_IRT)));
    }
  }, [data, editing, usdIqd, usdIrt]);

  const saveMut = useMutation({
    mutationFn: () =>
      api("/api/fx", {
        method: "POST",
        body: JSON.stringify({
          USD_IQD: Number(usdIqd.replace(/[^\d.]/g, "")) || undefined,
          USD_IRT: Number(usdIrt.replace(/[^\d.]/g, "")) || undefined,
        }),
      }),
    onSuccess: () => {
      toast.success("نرخ ارز دستی ثبت شد — تا فچ بعدی معتبر است");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["fx-rates"] });
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading && !data) {
    return (
      <div className={cn("rounded-xl border bg-card p-4 text-xs text-muted-foreground", className)}>
        در حال دریافت نرخ ارز…
      </div>
    );
  }
  const r = data?.rates;
  if (!r) return null;
  const srcLabel = (s: string) => (s === "manual" ? "دستی" : s === "fallback" ? "پیش‌فرض اضطراری" : "خودکار (er-api)");
  const age = data.ageHours > 0.05 ? ` · ${Math.round(data.ageHours)} ساعت قبل` : " · تازه";

  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 grid place-items-center shrink-0">
            <span className="text-sm font-black">$</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm">نرخ لحظه‌ای ارز</h3>
            <p className="text-[11px] text-muted-foreground">
              مبنای تبدیل‌ها و اسناد چاپی — {srcLabel(data.sources.USD_IQD)}{age}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => refetch()}
            className="size-8 rounded-lg border grid place-items-center hover:bg-accent transition text-muted-foreground"
            title="به‌روزرسانی نرخ"
          >
            <span className={cn("text-xs", isFetching && "animate-spin inline-block")}>↻</span>
          </button>
          {data.canEdit && (
            <button
              onClick={() => setEditing((v) => !v)}
              className={cn(
                "h-8 rounded-lg border px-3 text-xs font-medium transition",
                editing ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
            >
              {editing ? "انصراف" : "ثبت دستی نرخ"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3.5">
        <div className="rounded-lg bg-muted/30 px-3 py-2.5" dir="ltr">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">1 USD =</div>
          <div className="text-lg font-bold tabular-nums mt-0.5">
            {r.USD_IQD.toLocaleString("en-US")} <span className="text-[10px] font-medium text-muted-foreground">IQD</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{srcLabel(data.sources.USD_IQD)}</div>
        </div>
        <div className="rounded-lg bg-muted/30 px-3 py-2.5" dir="ltr">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">1 USD =</div>
          <div className="text-lg font-bold tabular-nums mt-0.5">
            {r.USD_IRT.toLocaleString("en-US")} <span className="text-[10px] font-medium text-muted-foreground">تومان</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{srcLabel(data.sources.USD_IRT)}</div>
        </div>
        <div className="rounded-lg bg-muted/30 px-3 py-2.5" dir="ltr">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">1000 تومان =</div>
          <div className="text-lg font-bold tabular-nums mt-0.5">
            {r.IQD_IRT.toLocaleString("en-US")} <span className="text-[10px] font-medium text-muted-foreground">IQD</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">مشتق از دو نرخ بالا</div>
        </div>
      </div>

      {editing && (
        <div className="mt-3.5 rounded-lg border bg-muted/20 p-3 space-y-2.5">
          <p className="text-[11px] text-muted-foreground">
            نرخ بازار واقعی خودتان را وارد کنید — روی همهٔ تبدیل‌ها و اسناد چاپی همین اعمال می‌شود.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">1 دلار = چند دینار</span>
              <input
                dir="ltr"
                inputMode="decimal"
                value={usdIqd}
                onChange={(e) => setUsdIqd(e.target.value)}
                className="mt-1 w-full h-9 rounded-lg border bg-background px-3 text-sm tabular-nums text-center"
                placeholder="1310"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">1 دلار = چند تومان</span>
              <input
                dir="ltr"
                inputMode="decimal"
                value={usdIrt}
                onChange={(e) => setUsdIrt(e.target.value)}
                className="mt-1 w-full h-9 rounded-lg border bg-background px-3 text-sm tabular-nums text-center"
                placeholder="150000"
              />
            </label>
          </div>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition disabled:opacity-60"
          >
            {saveMut.isPending ? "در حال ثبت…" : "ثبت نرخ دستی"}
          </button>
        </div>
      )}

      {data.stale && (
        <p className="mt-2.5 text-[11px] text-amber-600 dark:text-amber-400">
          نرخ‌ها ممکن است قدیمی باشند — دستی به‌روز کنید یا رفرش بزنید.
        </p>
      )}
    </div>
  );
}
