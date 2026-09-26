"use client";

// ─── Phase 26: دیالوگ تسویه گروهی بدهی مشتری ──────────────────────────
//
// سناریو: مشتری ۵ سفارش تسویه‌نشده/نیمه‌تسویه دارد و یک‌جا پول می‌دهد.
// به‌جای باز کردن تک‌تک سفارش‌ها:
//   ۱) مشتری را انتخاب کن (فقط بدهکارها — با جمع بدهی)
//   ۲) ارز وجه را انتخاب کن (فقط ارزهایی که بدهی دارند)
//   ۳) مبلغ دریافتی + روش + یادداشت را وارد کن
//   ۴) سیستم خودش «قدیمی‌ترین‌اول» تخصیص می‌دهد؛ هر ردیف قابل ویرایش
//      دستی است (صفر = نادیده) — «بازچین خودکار» همیشه در دسترس
//   ۵) ثبت → یک تراکنش اتمیک روی سرور (همان مسیر امن پرداخت موجود)
//   ۶) نتیجه: چه‌قدر داده، هر سفارش چقدر تسویه شد، چقدر مانده
//
// مازادِ وجه (بیش از بدهی یا ردیف‌های صفرشده) «excess» است — ثبت
// نمی‌شود و قبل از تایید با هشدار amber دیده می‌شود.

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { SearchSelect, type SearchOption } from "@/components/shared/search-select";
import { CurrencyChip, useFxRates } from "@/components/shared/fx-widgets";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  formatMoney,
  sumByCurrency,
  toIqdEquivalent,
  CURRENCIES,
  CURRENCY_LIST,
  parseCurrency,
  type Currency,
} from "@/lib/money";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

// ─── Types ─────────────────────────────────────────────────────────────

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  unsettled?: number;
  unsettledPer?: Record<string, number> | null;
};

type OpenOrder = {
  id: string;
  number: number;
  status: string;
  totalAmount: number;
  paidAmount: number;
  currency?: string | null;
  createdAt: string;
  items?: { id: string; product?: { name: string } | null }[] | null;
};

type BulkSettleResponse = {
  ok: boolean;
  customer: { id: string; name: string };
  currency: Currency;
  requestedAmount: number;
  totalApplied: number;
  excess: number;
  applied: {
    orderId: string;
    number: number;
    applied: number;
    paidAfter: number;
    remainingAfter: number;
    fullySettled: boolean;
  }[];
  remainingDebtPer: Record<Currency, number>;
  remainingDebtIqdEq: number;
};

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "cash", label: t("نقدی") },
  { value: "transfer", label: t("کارت به کارت") },
  { value: "cheque", label: t("چک") },
];

// ─── Component ─────────────────────────────────────────────────────────

export function BulkSettleDialog({
  open,
  onOpenChange,
  presetCustomerId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** از دراور ۳۶۰ مشتری — مستقیم به مرحلهٔ تخصیص می‌رود */
  presetCustomerId?: string | null;
}) {
  const invalidate = useInvalidate();
  const { rates } = useFxRates();

  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [currency, setCurrency] = React.useState<Currency>("IQD");
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState("cash");
  const [note, setNote] = React.useState("");
  // تخصیص دستی: orderId → رشتهٔ اینپوت
  const [alloc, setAlloc] = React.useState<Record<string, string>>({});
  // کاربر ردیفی را دستی تغییر داده؟ تا بازچین خودکار منطقی بماند
  const [manualDirty, setManualDirty] = React.useState(false);
  const [result, setResult] = React.useState<BulkSettleResponse | null>(null);

  // ریست کامل موقع باز شدن
  React.useEffect(() => {
    if (open) {
      setResult(null);
      setAmount("");
      setNote("");
      setMethod("cash");
      setAlloc({});
      setManualDirty(false);
      setCustomerId(presetCustomerId ?? null);
      setCurrency("IQD");
    }
  }, [open, presetCustomerId]);

  // ── مشتری‌های بدهکار ──
  const { data: custData, isLoading: custLoading } = useQuery({
    queryKey: ["bulk-settle", "customers"],
    queryFn: () => api<{ customers: CustomerRow[] }>("/api/customers"),
    enabled: open && !presetCustomerId,
    staleTime: 30_000,
  });

  // ── سفارش‌های مشتری ──
  const { data: ordData, isLoading: ordLoading } = useQuery({
    queryKey: ["bulk-settle", "orders", customerId],
    queryFn: () =>
      api<{ orders: OpenOrder[] }>(
        `/api/orders?customerId=${customerId}&excludeArchived=false`
      ),
    enabled: open && !!customerId,
  });

  // ── سفارش‌های باز (بدهکار) ──
  const openOrders = React.useMemo(() => {
    const all = ordData?.orders ?? [];
    return all
      .filter(
        (o) =>
          o.status !== "cancelled" &&
          (o.totalAmount || 0) - (o.paidAmount || 0) > 0.001
      )
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
          a.number - b.number
      );
  }, [ordData]);

  // بدهی به تفکیک ارز
  const debtPer = React.useMemo(
    () =>
      sumByCurrency(
        openOrders.map((o) => ({
          amount: (o.totalAmount || 0) - (o.paidAmount || 0),
          currency: o.currency,
        }))
      ),
    [openOrders]
  );
  const debtCurrencies = CURRENCY_LIST.filter((c) => debtPer[c] > 0.0001);
  const debtMixed = debtCurrencies.length > 1;

  // ارز پیش‌فرض = بیشترین بدهی
  React.useEffect(() => {
    if (!openOrders.length) return;
    if (!debtCurrencies.includes(currency)) {
      const best = [...debtCurrencies].sort((a, b) => debtPer[b] - debtPer[a])[0];
      if (best) setCurrency(best);
    }
     
  }, [openOrders.length]);

  // ردیف‌های همین ارز
  const rows = React.useMemo(
    () => openOrders.filter((o) => parseCurrency(o.currency) === currency),
    [openOrders, currency]
  );
  const rowsDebt = React.useMemo(
    () => rows.reduce((s, o) => s + ((o.totalAmount || 0) - (o.paidAmount || 0)), 0),
    [rows]
  );

  // ── بازچین خودکار FIFO (قدیمی‌ترین‌اول) ──
  const autoFifo = React.useCallback(() => {
    let money = Number(amount);
    const next: Record<string, string> = {};
    if (Number.isFinite(money) && money > 0) {
      for (const o of rows) {
        if (money <= 0.001) break;
        const rem = (o.totalAmount || 0) - (o.paidAmount || 0);
        const give = Math.min(rem, money);
        if (give > 0.001) {
          next[o.id] = String(Math.round(give * 100) / 100);
          money -= give;
        }
      }
    }
    setAlloc(next);
    setManualDirty(false);
  }, [amount, rows]);

  // بازچین خودکار وقتی مبلغ/ارز/مشتری عوض می‌شود (تا وقتی دستی نشده)
  React.useEffect(() => {
    if (!manualDirty) autoFifo();
  }, [amount, rows, manualDirty, autoFifo]);

  // عدد تخصیص هر ردیف
  const allocNum = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const o of rows) {
      const raw = alloc[o.id];
      const v = raw === undefined || raw === "" ? 0 : Number(raw);
      m.set(o.id, Number.isFinite(v) ? Math.max(0, v) : 0);
    }
    return m;
  }, [alloc, rows]);

  const allocatedSum = React.useMemo(() => {
    let s = 0;
    for (const o of rows) s += allocNum.get(o.id) ?? 0;
    return Math.round(s * 100) / 100;
  }, [rows, allocNum]);

  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const excess = amountValid
    ? Math.round((amountNum - allocatedSum) * 100) / 100
    : 0;
  const debtAfter = Math.max(0, Math.round((rowsDebt - allocatedSum) * 100) / 100);

  // ── ثبت ──
  const settleMut = useMutation({
    mutationFn: () => {
      const allocations = rows
        .map((o) => ({ orderId: o.id, amount: allocNum.get(o.id) ?? 0 }))
        .filter((a) => a.amount > 0.001);
      return api<BulkSettleResponse>("/api/finance/bulk-settle", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          currency,
          amount: amountNum,
          method,
          note: note.trim() || undefined,
          allocations,
        }),
      });
    },
    onSuccess: (res) => {
      setResult(res);
      invalidate(["orders", "revenues", "finance", "dashboard", "customers", "customer-detail"]);
      toast.success(
        t("تسویه گروهی ثبت شد — {p0} روی {p1} سفارش", { p0: formatMoney(res.totalApplied, res.currency), p1: res.applied.length })
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── رندر ──
  const customer = (custData?.customers ?? []).find((c) => c.id === customerId);

  const setAllocValue = (orderId: string, value: string) => {
    setManualDirty(true);
    setAlloc((prev) => ({ ...prev, [orderId]: value }));
  };

  const clampAllocValue = (o: OpenOrder, raw: string) => {
    const v = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(v) || v <= 0) {
      setAlloc((prev) => ({ ...prev, [o.id]: "" }));
      return;
    }
    const rem = (o.totalAmount || 0) - (o.paidAmount || 0);
    const clamped = Math.min(Math.max(0, v), rem);
    setAlloc((prev) => ({ ...prev, [o.id]: String(Math.round(clamped * 100) / 100) }));
  };

  const closeDialog = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!settleMut.isPending) onOpenChange(v); }}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl p-0 gap-0 max-h-[90vh] overflow-y-auto scrollbar-thin">
        {/* سربرگ */}
        <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-l from-teal-500/10 to-transparent sticky top-0 bg-background/95 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 grid place-items-center shrink-0">
              <Icon name="wallet" size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-bold">
                {result ? t("نتیجهٔ تسویه گروهی") : t("تسویه گروهی بدهی")}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {result
                  ? t("{p0} — {p1} از {p2}", { p0: result.customer.name, p1: formatMoney(result.totalApplied, result.currency), p2: formatMoney(result.requestedAmount, result.currency) })
                  : customerId && customer
                  ? t("{p0} • {p1} سفارش بدهکار", { p0: customer.name, p1: formatNumber(openOrders.length) })
                  : customerId
                  ? t("در حال دریافت سفارش‌های باز…")
                  : t("یک موج پرداخت را روی همهٔ سفارش‌های باز مشتری تخصیص بده")}
              </p>
            </div>
            {customerId && !result && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 shrink-0"
                onClick={() => {
                  if (!presetCustomerId) {
                    setCustomerId(null);
                    setAmount("");
                    setNote("");
                    setAlloc({});
                    setManualDirty(false);
                  } else {
                    closeDialog();
                  }
                }}
              >
                {!presetCustomerId && <Icon name="arrowLeft" size={13} />}
                {!presetCustomerId ? t("تغییر مشتری") : t("بستن")}
              </Button>
            )}
          </div>
        </div>

        {/* ═══ نتیجه ═══ */}
        {result ? (
          <div className="px-6 py-4 space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-3">
              <Icon name="check" size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="text-xs leading-relaxed">
                <b>{formatMoney(result.totalApplied, result.currency)}</b> {t("از")}{" "}
                {t("{p0} دریافتی، روی{p1}", { p0: formatMoney(result.requestedAmount, result.currency), p1: " " })}
                <b>{result.applied.length}</b> {t("سفارش ثبت شد.")}
                {result.excess > 0.001 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {" "}
                    {t("مازاد {p0} بدهی نداشت و ثبت نشد.", { p0: formatMoney(result.excess, result.currency) })}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr className="text-muted-foreground">
                    <th className="text-right font-medium px-3 py-2">{t("سفارش")}</th>
                    <th className="text-right font-medium px-3 py-2">{t("تخصیص")}</th>
                    <th className="text-right font-medium px-3 py-2">{t("پرداخت‌شده")}</th>
                    <th className="text-right font-medium px-3 py-2">{t("مانده")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.applied.map((r) => (
                    <tr key={r.orderId} className="border-t">
                      <td className="px-3 py-2 font-mono font-bold">#{r.number}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold text-emerald-600 dark:text-emerald-400" dir="ltr">
                        {formatMoney(r.applied, result.currency)}
                      </td>
                      <td className="px-3 py-2 tabular-nums" dir="ltr">
                        {formatMoney(r.paidAfter, result.currency)}
                      </td>
                      <td className="px-3 py-2">
                        {r.fullySettled ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">{t("تسویه کامل ✓")}</span>
                        ) : (
                          <span className="tabular-nums text-rose-600 dark:text-rose-400 font-semibold" dir="ltr">
                            {formatMoney(r.remainingAfter, result.currency)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* بدهی باقی‌ماندهٔ مشتری (همهٔ ارزها) */}
            <div className="rounded-lg bg-muted/40 p-3 space-y-1.5">
              <div className="text-[11px] text-muted-foreground">{t("بدهی باقی‌ماندهٔ {p0}:", { p0: result.customer.name })}</div>
              {CURRENCY_LIST.filter((c) => result.remainingDebtPer[c] > 0.0001).length > 0 ? (
                CURRENCY_LIST.filter((c) => result.remainingDebtPer[c] > 0.0001).map((c) => (
                  <div key={c} className="flex items-center gap-2 text-xs">
                    <CurrencyChip currency={c} />
                    <span className="tabular-nums font-semibold" dir="ltr">
                      {formatMoney(result.remainingDebtPer[c], c)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {t("هیچ — تمام بدهی‌ها تسویه شد ✓")}
                </div>
              )}
            </div>
          </div>
        ) : !customerId ? (
          /* ═══ مرحلهٔ ۱: انتخاب مشتری ═══ */
          <div className="px-6 py-5">
            <Field label={t("مشتری بدهکار")} required hint={t("فقط مشتری‌هایی که ماندهٔ باز دارند")}>
              {custLoading ? (
                <div className="h-10 rounded-lg bg-muted/40 animate-pulse" />
              ) : (
                <SearchSelect
                  value={customerId}
                  onChange={(v) => setCustomerId(v)}
                  placeholder={t("انتخاب مشتری…")}
                  searchPlaceholder={t("جستجوی نام یا شماره…")}
                  options={(custData?.customers ?? [])
                    .filter((c) => (c.unsettled ?? 0) > 0.0001)
                    .sort((a, b) => (b.unsettled ?? 0) - (a.unsettled ?? 0))
                    .map(
                      (c) =>
                        ({
                          value: c.id,
                          label: c.name,
                          sub: t("{p0} • بدهی: {p1}", { p0: c.phone, p1: formatMoney(c.unsettled ?? 0, "IQD") }),
                        } as SearchOption)
                    )}
                  className="w-full"
                />
              )}
            </Field>
            <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
              {t("همهٔ سفارش‌های بازِ همین مشتری به تفکیک ارز نمایش داده می‌شود؛ مبلغ دریافتی")}
              {t("را یک‌بار وارد می‌کنید و سیستم خودش آن را «قدیمی‌ترین‌اول» تخصیص می‌دهد —")}
              {t("قابل ویرایش دستی.")}
            </p>
          </div>
        ) : (
          /* ═══ مرحلهٔ ۲: مبلغ + تخصیص ═══ */
          <div className="px-6 py-4 space-y-3.5">
            {ordLoading ? (
              <div className="py-10 grid place-items-center text-muted-foreground gap-2">
                <Icon name="loading" size={20} className="animate-spin" />
                <span className="text-xs">{t("در حال دریافت سفارش‌های باز…")}</span>
              </div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground space-y-2">
                <Icon name="check" size={24} className="mx-auto text-emerald-500" />
                {t("این مشتری در ارز انتخابی بدهی باز ندارد.")}
              </div>
            ) : (
              <>
                {/* ارز وجه */}
                {debtCurrencies.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-muted-foreground shrink-0">{t("ارز وجه دریافتی:")}</span>
                    {debtCurrencies.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCurrency(c)}
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold tabular-nums border transition",
                          currency === c
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:bg-accent"
                        )}
                        dir="ltr"
                      >
                        {CURRENCIES[c].short} · {formatMoney(debtPer[c], c)}
                      </button>
                    ))}
                  </div>
                )}

                {/* آمار سریع */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-rose-500/8 p-2.5">
                    <div className="text-[10px] text-muted-foreground">{t("بدهی این ارز")}</div>
                    <div className="text-sm font-bold tabular-nums mt-1 text-rose-600 dark:text-rose-400" dir="ltr">
                      {formatMoney(rowsDebt, currency)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2.5">
                    <div className="text-[10px] text-muted-foreground">{t("سفارش باز این ارز")}</div>
                    <div className="text-sm font-bold tabular-nums mt-1">
                      {formatNumber(rows.length)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2.5">
                    <div className="text-[10px] text-muted-foreground">{t("بدهی کل (معادل دیناری)")}</div>
                    <div className="text-sm font-bold tabular-nums mt-1" dir="ltr">
                      {formatMoney(toIqdEquivalent(debtPer, rates), "IQD")}
                    </div>
                  </div>
                </div>

                {/* مبلغ + روش */}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5">
                  <Field label={t("مبلغ دریافتی ({p0})", { p0: CURRENCIES[currency].fa })} required>
                    <Input
                      type="number"
                      min={0}
                      dir="ltr"
                      className="text-center h-11 text-lg font-bold tabular-nums"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={t("مثلاً 500000")}
                    />
                  </Field>
                  <Field label={t("روش پرداخت")}>
                    <div className="flex gap-1 h-11 items-center">
                      {PAYMENT_METHODS.map((m) => (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => setMethod(m.value)}
                          className={cn(
                            "h-9 px-3 rounded-lg text-xs font-medium border transition",
                            method === m.value
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border hover:bg-accent"
                          )}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>

                {/* جدول تخصیص */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-muted-foreground">
                      {t("تخصیص روی سفارش‌ها (قدیمی‌ترین اول)")}
                    </span>
                    <button
                      type="button"
                      onClick={autoFifo}
                      className="text-[11px] text-primary hover:underline flex items-center gap-1"
                    >
                      <Icon name="refresh" size={11} /> {t("بازچین خودکار")}
                    </button>
                  </div>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr className="text-muted-foreground">
                          <th className="text-right font-medium px-2.5 py-2">{t("سفارش")}</th>
                          <th className="text-right font-medium px-2.5 py-2">{t("جمع")}</th>
                          <th className="text-right font-medium px-2.5 py-2">{t("پرداخت‌شده")}</th>
                          <th className="text-right font-medium px-2.5 py-2">{t("مانده")}</th>
                          <th className="text-right font-medium px-2.5 py-2 w-[130px]">{t("تخصیص")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((o) => {
                          const rem = (o.totalAmount || 0) - (o.paidAmount || 0);
                          const a = allocNum.get(o.id) ?? 0;
                          const full = a >= rem - 0.001;
                          const productName = o.items?.[0]?.product?.name;
                          return (
                            <tr key={o.id} className="border-t">
                              <td className="px-2.5 py-2">
                                <div className="font-mono font-bold">#{o.number}</div>
                                {productName && (
                                  <div className="text-[10px] text-muted-foreground truncate max-w-[110px]">
                                    {productName}
                                  </div>
                                )}
                              </td>
                              <td className="px-2.5 py-2 tabular-nums" dir="ltr">
                                {formatMoney(o.totalAmount || 0, currency)}
                              </td>
                              <td className="px-2.5 py-2 tabular-nums text-emerald-600 dark:text-emerald-400" dir="ltr">
                                {formatMoney(o.paidAmount || 0, currency)}
                              </td>
                              <td className="px-2.5 py-2 tabular-nums font-semibold text-rose-600 dark:text-rose-400" dir="ltr">
                                {formatMoney(rem, currency)}
                              </td>
                              <td className="px-2.5 py-2">
                                <Input
                                  type="number"
                                  min={0}
                                  max={rem}
                                  dir="ltr"
                                  className="h-8 text-center tabular-nums font-semibold"
                                  value={alloc[o.id] ?? ""}
                                  onChange={(e) => setAllocValue(o.id, e.target.value)}
                                  onBlur={(e) => clampAllocValue(o, e.target.value)}
                                  placeholder="0"
                                />
                                {a > 0 && full && (
                                  <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold text-center mt-0.5">
                                    {t("تسویه کامل ✓")}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    عدد هر ردیف را دستی عوض کن (صفر = رد نشود) — سرور باز هم همه را با
                    {t("ماندهٔ تازهٔ دیتابیس چک و کلمپ می‌کند.")}
                  </p>
                </div>

                {/* یادداشت */}
                <Field label={t("یادداشت (اختیاری)")}>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t("مثلاً: تسویهٔ حساب روز گذشته")}
                    maxLength={300}
                  />
                </Field>

                {/* جمع زنده */}
                <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t("مبلغ دریافتی")}</div>
                    <div className="text-sm font-bold tabular-nums mt-0.5" dir="ltr">
                      {amountValid ? formatMoney(amountNum, currency) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t("ثبت می‌شود")}</div>
                    <div className="text-sm font-bold tabular-nums mt-0.5 text-emerald-600 dark:text-emerald-400" dir="ltr">
                      {formatMoney(allocatedSum, currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t("بدهی این ارز بعد از تسویه")}</div>
                    <div className={cn(
                      "text-sm font-bold tabular-nums mt-0.5",
                      debtAfter <= 0.001
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    )} dir="ltr">
                      {formatMoney(debtAfter, currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t("ردیف تخصیص‌یافته")}</div>
                    <div className="text-sm font-bold tabular-nums mt-0.5">
                      {formatNumber(rows.filter((o) => (allocNum.get(o.id) ?? 0) > 0.001).length)}
                    </div>
                  </div>
                </div>

                {/* هشدار مازاد */}
                {amountValid && excess > 0.001 && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-xs flex items-start gap-2">
                    <Icon name="coins" size={14} className="text-amber-600 mt-0.5 shrink-0" />
                    <span className="leading-relaxed">
                      <b>{t("مازاد {p0}", { p0: formatMoney(excess, currency) })}</b> {t("بدهی متناظری ندارد و ثبت")}
                      {t("نمی‌شود — اگر مشتری بیشتر از بدهی‌اش پول داده، این مبلغ را جدا پیگیری")}
                      {t("کنید. برای ثبت کامل، عدد ردیف‌ها را در جدول بالا کم کنید.")}
                    </span>
                  </div>
                )}

                {/* یادآوری ارزهای دیگر */}
                {debtMixed && (
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("⚠ این مشتری در ارزهای دیگر هم بدهی دارد")} (
                    {debtCurrencies
                      .filter((c) => c !== currency)
                      .map((c) => `${CURRENCIES[c].short}: ${formatMoney(debtPer[c], c)}`)
                      .join(" + ")}{" "}
                    ) {t("— آن‌ها دست‌نخورده می‌مانند؛ بعداً با ارز مربوط تسویه کنید.")}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* فوتر */}
        <DialogFooter className="px-6 py-3 border-t bg-muted/30 flex items-center gap-2">
          {result ? (
            <>
              <Button variant="ghost" size="sm" onClick={closeDialog}>
                {t("بستن")}
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setResult(null);
                  setAmount("");
                  setNote("");
                  setAlloc({});
                  setManualDirty(false);
                }}
              >
                <Icon name="creditCard" size={14} />
                {t("پرداخت دیگر")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={closeDialog} disabled={settleMut.isPending}>
                {t("انصراف")}
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={
                  settleMut.isPending ||
                  !customerId ||
                  rows.length === 0 ||
                  !amountValid ||
                  allocatedSum <= 0.001
                }
                onClick={() => settleMut.mutate()}
              >
                {settleMut.isPending ? (
                  <Icon name="loading" size={14} className="animate-spin" />
                ) : (
                  <Icon name="check" size={14} />
                )}
                {t("ثبت تسویه گروهی")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
