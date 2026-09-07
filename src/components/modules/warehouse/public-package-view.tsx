"use client";

// ─── Phase 16: صفحهٔ عمومی بسته — /?pkg=CODE (بدون لاگین) ─────────
// QR روی بج بسته مستقیماً به همین صفحه می‌رسد. خودِ کدِ غیرقابل‌حدس =
// توکن دسترسی؛ فقط دادهٔ مورد نیاز مأمور ارسال/مشتری برگردانده
// می‌شود (قیمت‌ها و وضعیت مالی داخلی هرگز).
//
// نکته: این صفحه «خارج از پوستهٔ برنامه» است (page.tsx قبل از لاگین
// رندرش می‌کند) — بنابراین fetch ساده (نه api()) و بدون sidebar/header.

import * as React from "react";
import { Icon, type IconName } from "@/lib/icons";
import { StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────

type PublicOrder = {
  number: number;
  status: string;
  customer: { name: string; phone: string; address: string | null };
  address: string | null;
  items: { name: string; quantity: number }[];
};

type PublicPkg = {
  code: string;
  seq: number;
  status: "packing" | "ready" | "sent" | "delivered" | "cancelled";
  address: string;
  receiverName: string | null;
  receiverPhone: string | null;
  contentsNote: string | null;
  courier: string | null;
  trackingNo: string | null;
  packedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  codAmount: number;
  codCollected: boolean;
  orders: PublicOrder[];
  company: { name: string; faName: string; phone: string };
};

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; data: PublicPkg };

const fa = (n: number) => n.toLocaleString("fa-IR");

// ─── Status meta ───────────────────────────────────────────────────────

const STATUS_FA: Record<PublicPkg["status"], { label: string; cls: string; icon: IconName; step: number }> = {
  packing: {
    label: "در حال بسته‌بندی",
    cls: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    icon: "package",
    step: 0,
  },
  ready: {
    label: "آمادهٔ ارسال",
    cls: "text-teal-600 dark:text-teal-400 bg-teal-500/10",
    icon: "packageAdd",
    step: 1,
  },
  sent: {
    label: "ارسال شد",
    cls: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
    icon: "truckDelivery",
    step: 2,
  },
  delivered: {
    label: "تحویل شد",
    cls: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    icon: "packageDelivered",
    step: 3,
  },
  cancelled: {
    label: "لغو شده",
    cls: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
    icon: "cancel",
    step: -1,
  },
};

// ─── لوگوی پرینتو (همان طرح بج) ───────────────────────────────────────

function BrandLogo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#111827" />
      <rect x="16" y="14" width="32" height="22" rx="4" fill="none" stroke="#ffffff" strokeWidth="4" />
      <path d="M16 36 L28 24 L36 32 L44 26 L52 34 L52 50 L16 50 Z" fill="#10b981" />
      <circle cx="44" cy="21" r="4" fill="#f59e0b" />
    </svg>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────

export function PublicPackageView({ code }: { code: string }) {
  const [state, setState] = React.useState<FetchState>({ status: "loading" });

  React.useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fetch(`/api/public/packages/${encodeURIComponent(code)}`)
      .then(async (res) => {
        const data: unknown = await res.json().catch(() => null);
        if (!alive) return;
        if (res.ok && data && typeof data === "object" && "code" in data) {
          setState({ status: "ok", data: data as PublicPkg });
        } else {
          const msg =
            data && typeof data === "object" && "error" in data
              ? String((data as { error?: unknown }).error)
              : "خطا در دریافت اطلاعات بسته";
          setState({ status: "error", message: msg });
        }
      })
      .catch(() => {
        if (alive) setState({ status: "error", message: "خطای شبکه در دریافت اطلاعات بسته" });
      });
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-slate-50 to-teal-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-start sm:items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-3xl space-y-4">
        {state.status === "loading" && <LoadingCard />}
        {state.status === "error" && <ErrorCard message={state.message} code={code} />}
        {state.status === "ok" && <PkgCard pkg={state.data} />}

        <div className="text-center space-y-3 pb-4">
          <div className="text-[11px] text-muted-foreground">
            Printoo24 — سامانه مدیریت چاپ
          </div>
          <Button
            variant="outline"
            className="gap-2 bg-card shadow-sm"
            onClick={() => {
              window.location.href = "/";
            }}
          >
            <Icon name="login" size={15} />
            ورود به سامانه
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Loading skeleton ──────────────────────────────────────────────────

function LoadingCard() {
  return (
    <div className="rounded-2xl border bg-card shadow-sm p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-2xl bg-muted animate-pulse" />
        <div className="space-y-2 flex-1">
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          <div className="h-3 w-24 rounded bg-muted animate-pulse" />
        </div>
      </div>
      <div className="h-10 w-48 rounded-xl bg-muted animate-pulse" />
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
      <div className="h-28 rounded-xl bg-muted animate-pulse" />
    </div>
  );
}

// ─── Error state ───────────────────────────────────────────────────────

function ErrorCard({ message, code }: { message: string; code: string }) {
  return (
    <div className="rounded-2xl border bg-card shadow-sm p-8 flex flex-col items-center text-center gap-3">
      <div className="size-14 rounded-2xl bg-rose-500/10 text-rose-600 grid place-items-center">
        <Icon name="alertTriangle" size={26} />
      </div>
      <h1 className="font-bold text-lg">بسته یافت نشد</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <code className="text-xs bg-muted rounded-md px-2.5 py-1 font-mono" dir="ltr">
        {code}
      </code>
    </div>
  );
}

// ─── Main card ─────────────────────────────────────────────────────────

function PkgCard({ pkg }: { pkg: PublicPkg }) {
  const meta = STATUS_FA[pkg.status] ?? {
    label: pkg.status,
    cls: "text-muted-foreground bg-muted",
    icon: "package" as IconName,
    step: -1,
  };
  const company = pkg.company;

  const steps: { label: string; date: string | null }[] = [
    { label: "بسته‌بندی", date: pkg.packedAt },
    { label: "آمادهٔ ارسال", date: null },
    { label: "ارسال", date: pkg.sentAt },
    { label: "تحویل", date: pkg.deliveredAt },
  ];
  const current = meta.step;
  const isDone = (i: number) => current >= i;

  const showCourier = !!(pkg.courier || pkg.trackingNo);

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      {/* سربرگ برند */}
      <div className="px-5 py-4 border-b bg-muted/30 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BrandLogo />
          <div>
            <div className="font-bold text-base">{company?.faName ?? "پرینتو ۲۴"}</div>
            <div className="text-[10px] text-muted-foreground tracking-wide" dir="ltr">
              {company?.name ?? "Printoo24"} — printoo24.com
            </div>
          </div>
        </div>
        {company?.phone && (
          <a
            href={`tel:${company.phone.replace(/\s/g, "")}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition border rounded-full px-3 py-1.5 bg-card"
            dir="ltr"
          >
            <Icon name="customerService" size={13} />
            {company.phone}
          </a>
        )}
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        {/* هیرو: کد + وضعیت */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="space-y-1.5">
            <div className="text-[11px] text-muted-foreground">کد پیگیری بسته</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="font-mono text-lg font-extrabold bg-foreground text-background rounded-lg px-3 py-1.5 tracking-wider"
                dir="ltr"
              >
                {pkg.code}
              </span>
              <span className="text-xs font-semibold border rounded-full px-2.5 py-1">
                بستهٔ #{pkg.seq}
              </span>
            </div>
          </div>
          <div className={cn("rounded-2xl px-4 py-2.5 flex items-center gap-2.5", meta.cls)}>
            <Icon name={meta.icon} size={24} />
            <span className="text-lg font-bold">{meta.label}</span>
          </div>
        </div>

        {/* استپر وضعیت */}
        {pkg.status !== "cancelled" ? (
          <div className="rounded-xl border p-4 flex items-start">
            {steps.map((s, i) => (
              <React.Fragment key={s.label}>
                <div className="flex flex-col items-center gap-1.5 min-w-[64px]">
                  <div
                    className={cn(
                      "size-8 rounded-full grid place-items-center border-2",
                      isDone(i) && i === current && "border-primary bg-primary/10 text-primary",
                      isDone(i) && i !== current &&
                        "border-emerald-500/60 bg-emerald-500/10 text-emerald-600",
                      !isDone(i) && "border-muted bg-muted/30 text-muted-foreground"
                    )}
                  >
                    <Icon name={isDone(i) ? "check" : "clock"} size={14} />
                  </div>
                  <span
                    className={cn(
                      "text-[11px] font-medium text-center",
                      i === current ? "text-foreground" : isDone(i) ? "text-foreground/80" : "text-muted-foreground"
                    )}
                  >
                    {s.label}
                  </span>
                  <span className="text-[9px] text-muted-foreground tabular-nums text-center">
                    {s.date ? formatDate(s.date) : isDone(i) ? "انجام شد" : "—"}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 mt-4 rounded-full min-w-2",
                      isDone(i) && isDone(i + 1) ? "bg-emerald-500/50" : "bg-muted"
                    )}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <Icon name="cancel" size={16} className="shrink-0" />
            این بسته لغو شده است — برای پیگیری با پرینتو ۲۴ تماس بگیرید
          </div>
        )}

        {/* شبکهٔ اطلاعات */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <InfoTile icon="mapPin" label="آدرس تحویل" value={pkg.address} className="sm:col-span-2" />
          <InfoTile
            icon="user"
            label="گیرنده"
            value={pkg.receiverName}
            sub={pkg.receiverPhone}
            ltrSub
          />
          {pkg.contentsNote && (
            <InfoTile icon="layers" label="محتویات" value={pkg.contentsNote} />
          )}
          {showCourier && (
            <InfoTile icon="truck" label="پیک" value={pkg.courier} sub={pkg.trackingNo} ltrSub />
          )}
          {pkg.codAmount > 0 && <CodTile pkg={pkg} />}
        </div>

        {/* سفارش‌ها */}
        {pkg.orders.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Icon name="orders" size={16} className="text-primary" />
              سفارش‌های داخل این بسته
              <span className="text-[11px] text-muted-foreground font-medium">
                ({fa(pkg.orders.length)} سفارش)
              </span>
            </div>
            {pkg.orders.map((o, i) => (
              <div key={i} className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold">سفارش #{o.number}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="text-xs text-muted-foreground">{o.customer?.name}</div>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  {o.items.map((it, j) => (
                    <div
                      key={j}
                      className="flex items-center justify-between text-sm bg-muted/30 rounded-lg px-3 py-1.5"
                    >
                      <span className="truncate">{it.name}</span>
                      <span className="font-bold tabular-nums shrink-0">{fa(it.quantity)}×</span>
                    </div>
                  ))}
                </div>
                {(o.customer?.phone || o.address) && (
                  <div className="mt-2.5 text-[11px] text-muted-foreground space-y-1">
                    {o.customer?.phone && (
                      <div className="flex items-center gap-1.5">
                        <Icon name="customers" size={12} className="shrink-0" />
                        <span dir="ltr" className="tabular-nums">
                          {o.customer.phone}
                        </span>
                      </div>
                    )}
                    {o.address && (
                      <div className="flex items-start gap-1.5">
                        <Icon name="mapPin" size={12} className="mt-0.5 shrink-0" />
                        <span className="break-words">{o.address}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Info tiles ────────────────────────────────────────────────────────

function InfoTile({
  icon,
  label,
  value,
  sub,
  ltrSub,
  className,
}: {
  icon: IconName;
  label: string;
  value: string | null | undefined;
  sub?: string | null;
  ltrSub?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-muted/20 p-3 flex items-start gap-2.5", className)}>
      <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
        <Icon name={icon} size={15} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className="text-sm font-medium mt-0.5 break-words">{value?.trim() || "—"}</div>
        {sub && sub.trim() && (
          <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums" dir={ltrSub ? "ltr" : undefined}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function CodTile({ pkg }: { pkg: PublicPkg }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 flex items-start gap-2.5",
        pkg.codCollected
          ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20"
          : "border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20"
      )}
    >
      <div
        className={cn(
          "size-8 rounded-lg grid place-items-center shrink-0",
          pkg.codCollected
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        )}
      >
        <Icon name={pkg.codCollected ? "checkCircle" : "money"} size={15} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground">پول در محل (COD)</div>
        <div className="text-sm font-bold mt-0.5 tabular-nums" dir="ltr">
          {formatCurrency(pkg.codAmount)}
        </div>
        <div
          className={cn(
            "text-[11px] mt-0.5",
            pkg.codCollected
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-700 dark:text-amber-300"
          )}
        >
          {pkg.codCollected ? "دریافت شد" : "این مبلغ هنگام تحویل دریافت می‌شود"}
        </div>
      </div>
    </div>
  );
}
