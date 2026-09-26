"use client";

// ─── فاز ۲۵: گیت انتخاب ارز قبل از چاپ ─────────────────────────────
// «قبل از چاپ فاکتور بپرسد: دلاری / دیناری / تومانی؟ بعد جمع بزند،
//  لحظه‌ای تبدیل کند، رند کند» — این دیالوگ روی هر دکمهٔ چاپ/PDF
//  فاکتور، پیش‌فاکتور و صورت‌حساب جمعی نشسته است.
//
//  جریان: کلیک چاپ → گیت باز می‌شود (نرخ لحظه‌ای + پیش‌نمایش تبدیل)
//  → کاربر ارز را انتخاب می‌کند → onConfirm با نرخ‌های زنده →
//  caller مبالغ را convertMoney می‌کند و سند را چاپ می‌کند.

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useFxRates, fxSourceLabel } from "@/components/shared/fx-widgets";
import { CURRENCIES, CURRENCY_LIST, convertMoney, formatMoney, type Currency } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";

export type PrintCurrencyResult = {
  currency: Currency;
  rates: { USD_IQD: number; USD_IRT: number };
  fxLine: { usdIqd: number; usdIrt: number; at: string | null; source: string };
  converted: boolean;
};

export function PrintCurrencyGate({
  open,
  onOpenChange,
  docCurrency,
  docTitle,
  previewTotal,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** ارز اصلی مبالغ سند */
  docCurrency: Currency | string;
  /** عنوان سند برای متن دیالوگ */
  docTitle?: string;
  /** جمع کل سند در ارز خودش — برای پیش‌نمایش تبدیل */
  previewTotal?: number;
  onConfirm: (r: PrintCurrencyResult) => void;
}) {
  const { data, rates } = useFxRates();
  const docCur: Currency = (["IQD", "USD", "IRT"] as const).includes(docCurrency as Currency)
    ? (docCurrency as Currency)
    : "IQD";

  const build = (c: Currency): PrintCurrencyResult => ({
    currency: c,
    rates: { USD_IQD: rates.USD_IQD, USD_IRT: rates.USD_IRT },
    fxLine: {
      usdIqd: rates.USD_IQD,
      usdIrt: rates.USD_IRT,
      at: data?.fetchedAt?.USD_IQD ?? null,
      source: data?.sources?.USD_IQD ?? "auto",
    },
    converted: c !== docCur,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="printer" size={18} className="text-primary" />
            {t("چاپ {p0} با کدام ارز؟", { p0: docTitle ?? t("سند") })}
          </DialogTitle>
          <DialogDescription className="text-right">
            مبالغ سند {docCur === "IRT" ? t("تومانی") : docCur === "USD" ? t("دلاری") : t("دیناری")} است
            {docCur !== "IQD" ? "" : t(" (ارز اصلی سیستم)")} — با انتخاب ارز دیگر، همهٔ مبالغ با نرخ
            {t("لحظه‌ای تبدیل و رند می‌شوند. نرخ روی سند چاپی درج خواهد شد.")}
          </DialogDescription>
        </DialogHeader>

        {/* نرخ لحظه‌ای */}
        <div
          className="rounded-lg border bg-muted/25 px-3 py-2 flex items-center gap-2 flex-wrap text-[11px]"
          dir="ltr"
        >
          <span className="font-bold text-muted-foreground">USD</span>
          <span className="tabular-nums">1 $ = {rates.USD_IQD.toLocaleString("en-US")} IQD</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="tabular-nums">{t("1 $ = {p0} تومان", { p0: rates.USD_IRT.toLocaleString("en-US") })}</span>
          {data && (
            <span className="ms-auto rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              {fxSourceLabel(data.sources.USD_IQD)}
              {data.ageHours > 0.05 ? t(" · {p0}ساعت قبل", { p0: Math.round(data.ageHours) }) : ""}
            </span>
          )}
        </div>

        {/* سه گزینه ارز */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {CURRENCY_LIST.map((c) => {
            const isDoc = c === docCur;
            const preview =
              previewTotal != null && Number.isFinite(previewTotal)
                ? convertMoney(previewTotal, docCur, c, rates)
                : null;
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onConfirm(build(c));
                  onOpenChange(false);
                }}
                className={cn(
                  "rounded-xl border p-3 text-right transition hover:border-primary/60 hover:bg-accent/40",
                  isDoc && "border-primary/50 bg-primary/5"
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-bold">{CURRENCIES[c].fa}</span>
                  {isDoc && (
                    <span className="text-[9px] font-medium text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                      {t("ارز سند")}
                    </span>
                  )}
                </div>
                {preview != null && (
                  <div className="mt-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground" dir="ltr">
                    {formatMoney(preview, c)}
                  </div>
                )}
                {preview != null && c !== docCur && (
                  <div className="mt-0.5 text-[9.5px] text-amber-600 dark:text-amber-400">{t("تبدیل لحظه‌ای")}</div>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <Icon name="info" size={12} className="shrink-0" />
          {t("خط نرخ لحظه‌ای به‌صورت خودکار بالای سند چاپی درج می‌شود — مبنای تبدیل، همین نرخ است.")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
