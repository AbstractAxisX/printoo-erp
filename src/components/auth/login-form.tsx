"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/lib/icons";
import { COMPANY } from "@/lib/constants";
import { useAppStore } from "@/stores/app-store";
import { api } from "@/lib/api";
import { getLang, setLang, t } from "@/lib/i18n";
import { Field } from "@/components/ui/field";

export function LoginForm() {
  const router = useRouter();
  const setUser = useAppStore((s) => s.setUser);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  // Phase 27: زبان صفحهٔ لاگین — تا قبل از ورود، localStorage مبناست
  const [lang, setLangState] = React.useState(getLang());

  function switchLang(next: "en" | "fa") {
    if (next === lang) return;
    setLang(next);
    setLangState(next);
    window.location.reload(); // رندر تمیز همهٔ متن‌ها با زبان جدید
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { user } = await api<{
        user: {
          id: string;
          name: string;
          email: string;
          role: string;
          isDemo?: boolean;
          guideTooltips?: boolean;
          language?: "en" | "fa";
          modules?: string[];
          // Phase 18: صفحات مجاز هر ماژول (null = همه)
          modulePages?: Record<string, string[] | null> | null;
        } | null;
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!user) throw new Error(t("ورود ناموفق"));
      setUser({
        ...user,
        modules: user.modules ?? [],
        modulePages: user.modulePages ?? {},
        isDemo: user.isDemo ?? false,
        guideTooltips: user.guideTooltips ?? true,
        language: user.language ?? "en",
      }); // Phase 12/18/23/27: sanitize ناوبری + پرچم دمو + ترجیح تولتیپ + زبان
      toast.success(t("خوش آمدید، {p0}", { p0: user.name }));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("ورود ناموفق بود"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-primary text-primary-foreground">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, white 0, transparent 40%), radial-gradient(circle at 80% 80%, white 0, transparent 35%)" }} />
        <div className="relative flex items-center gap-3">
          <div className="size-11 rounded-2xl bg-white/15 backdrop-blur grid place-items-center">
            <Icon name="print" size={26} />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight">{COMPANY.name}</div>
            <div className="text-xs text-primary-foreground/70">{COMPANY.tagline}</div>
          </div>
        </div>

        <div className="relative space-y-6">
          <h1 className="text-4xl font-bold leading-tight">
            {t("سامانه یکپارچه")}<br />{t("مدیریت چاپ")}
          </h1>
          <p className="text-primary-foreground/80 max-w-md leading-7">
            {t("مدیریت کامل چرخه سفارش‌های چاپ — از دریافت سفارش تا طراحی، چاپ، انبار، مالی و کنترل کیفی، همه در یک پلتفرم.")}
          </p>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            {[
              { icon: "orders", label: t("سفارش‌ها") },
              { icon: "design", label: t("طراحی") },
              { icon: "print", label: t("چاپ") },
              { icon: "warehouse", label: t("انبار") },
              { icon: "wallet", label: t("مالی") },
              { icon: "shield", label: t("کنترل کیفی") },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 rounded-xl bg-white/10 backdrop-blur px-3 py-2.5">
                <Icon name={f.icon as "orders"} size={18} />
                <span className="text-sm">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-primary-foreground/60">
          {t("© {p0} {p1} — تمامی حقوق محفوظ است.", { p0: new Date().getFullYear(), p1: COMPANY.name })}
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        {/* کارت سفید — سطح یکدست برای همهٔ فیلدها تا چیپ برچسب کاملاً همرنگ شود */}
        <div className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-6 sm:p-8 shadow-sm">
          {/* Phase 27: تاگل زبان — پیش از ورود (دیفالت انگلیسی) */}
          <div className="flex justify-end -mb-3">
            <button
              type="button"
              onClick={() => switchLang(lang === "fa" ? "en" : "fa")}
              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition"
              aria-label={lang === "fa" ? "Switch to English" : t("تغییر به فارسی")}
            >
              <Icon name="globe" size={14} />
              <span className="font-medium">{lang === "fa" ? "English" : t("فارسی")}</span>
            </button>
          </div>
          <div className="lg:hidden flex items-center gap-3 mb-2">
            <div className="size-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
              <Icon name="print" size={22} />
            </div>
            <div className="text-xl font-bold">{COMPANY.name}</div>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-bold tracking-tight">{t("ورود به حساب")}</h2>
            <p className="text-sm text-muted-foreground">{t("برای ادامه، اطلاعات کاربری خود را وارد کنید.")}</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label={t("ایمیل")} required>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Icon name="mail" size={18} />
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                dir="ltr"
                data-guide="login:email"
                className="w-full rounded-lg border border-input bg-transparent pr-10 pl-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition"
                placeholder="you@example.com"
              />
            </Field>

            <Field label={t("رمز عبور")} required>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Icon name="lock" size={18} />
              </span>
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                dir="ltr"
                data-guide="login:password"
                className="w-full rounded-lg border border-input bg-transparent pr-10 pl-10 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
              >
                <Icon name={show ? "eyeOff" : "eye"} size={18} />
              </button>
            </Field>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded border-input" />
                <span className="text-muted-foreground">{t("مرا به خاطر بسپار")}</span>
              </label>
              <button type="button" className="text-primary hover:underline">{t("فراموشی رمز؟")}</button>
            </div>

            <button
              type="submit"
              disabled={loading}
              data-guide="login:submit"
              className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? <Icon name="loading" size={18} className="animate-spin" /> : <Icon name="lockPassword" size={18} />}
              {loading ? t("در حال ورود...") : t("ورود")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
