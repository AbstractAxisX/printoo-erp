"use client";

// Printoo24 ERP — Phase 18: صفحهٔ «شهرها و استان‌ها» (ادمین داخلی)
//
// مدیریت فهرست مجاز جغرافیا برای دراپ‌داون‌های مشتری:
//  - ستون استان: افزودن/حذف + شمار شهرها + جستجو
//  - ستون شهر: افزودن (با انتخاب استان) / حذف + جستجو + فیلتر استان
//  - حذف با گارد 409: استانِ دارای شهر یا مشتری، و شهرِ دارای مشتری
//    حذف نمی‌شود (پیام فارسی سرور توست می‌شود)
//  - سید پایه (19 استان عراق) از قبل در DB هست — صفحه فقط مدیریت است

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, EmptyState, LoadingState } from "@/components/shared";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { SearchSelect } from "@/components/shared/search-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

// ─── تایپ‌ها ─────────────────────────────────────────────────────────────

type ProvinceRow = { id: string; name: string; cityCount: number; createdAt: string };
type CityRow = { id: string; name: string; provinceId: string; provinceName: string; createdAt: string };

const fa = (n: number) => n.toLocaleString("en-US");

// ─── صفحه ───────────────────────────────────────────────────────────────

export function LocationsPage() {
  const invalidate = useInvalidate();

  // فیلترها/جستجو
  const [provSearch, setProvSearch] = React.useState("");
  const [citySearch, setCitySearch] = React.useState("");
  const [cityProvFilter, setCityProvFilter] = React.useState<string | null>(null);

  // دیالوگ‌ها
  const [provFormOpen, setProvFormOpen] = React.useState(false);
  const [provName, setProvName] = React.useState("");
  const [cityFormOpen, setCityFormOpen] = React.useState(false);
  const [cityName, setCityName] = React.useState("");
  const [cityProvince, setCityProvince] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<
    { kind: "province" | "city"; id: string; name: string } | null
  >(null);

  // ── داده‌ها ──
  const { data, isLoading } = useQuery({
    queryKey: ["locations"],
    queryFn: () => api<{ provinces: ProvinceRow[]; cities: CityRow[] }>("/api/locations"),
    refetchInterval: 60_000,
  });
  const provinces = data?.provinces ?? [];
  const cities = data?.cities ?? [];

  const filteredProvinces = React.useMemo(() => {
    const q = provSearch.trim();
    return q ? provinces.filter((p) => p.name.includes(q)) : provinces;
  }, [provinces, provSearch]);

  const filteredCities = React.useMemo(() => {
    const q = citySearch.trim();
    return cities.filter(
      (c) => (!cityProvFilter || c.provinceId === cityProvFilter) && (!q || c.name.includes(q))
    );
  }, [cities, citySearch, cityProvFilter]);

  // ── Mutations ──
  const createProvinceMut = useMutation({
    mutationFn: (name: string) =>
      api("/api/locations", { method: "POST", body: JSON.stringify({ kind: "province", name }) }),
    onSuccess: () => {
      invalidate(["locations"]);
      toast.success(t("استان ثبت شد"));
      setProvFormOpen(false);
      setProvName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createCityMut = useMutation({
    mutationFn: (body: { name: string; provinceId: string }) =>
      api("/api/locations", { method: "POST", body: JSON.stringify({ kind: "city", ...body }) }),
    onSuccess: () => {
      invalidate(["locations"]);
      toast.success(t("شهر ثبت شد"));
      setCityFormOpen(false);
      setCityName("");
      setCityProvince(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (t: { kind: "province" | "city"; id: string }) =>
      api(`/api/locations/${t.kind === "province" ? "provinces" : "cities"}/${t.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      invalidate(["locations"]);
      invalidate(["customers"]);
      toast.success(t("حذف شد"));
      setDeleting(null);
    },
    // 409 (شهر/مشتری وابسته) → توست فارسی؛ دیالوگ باز می‌ماند
    onError: (e: Error) => toast.error(e.message),
  });

  const provinceOptions = provinces.map((p) => ({
    value: p.id,
    label: p.name,
    sub: t("{p0} شهر", { p0: fa(p.cityCount) }),
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("شهرها و استان‌ها")}
        description={t("{p0} استان · {p1} شهر — فهرست مجاز دراپ‌داون مشتریان", { p0: fa(provinces.length), p1: fa(cities.length) })}
        icon="mapPin"
        actions={
          <>
            <Button variant="outline" className="gap-2" onClick={() => setCityFormOpen(true)}>
              <Icon name="plus" size={16} /> {t("شهر جدید")}
            </Button>
            <Button className="gap-2" onClick={() => setProvFormOpen(true)}>
              <Icon name="plus" size={16} /> {t("استان جدید")}
            </Button>
          </>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* ── ستون استان‌ها ── */}
          <Card className="p-4 space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="size-8 rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300 grid place-items-center">
                  <Icon name="mapPin" size={16} />
                </span>
                <div>
                  <div className="font-semibold text-sm">{t("استان‌ها")}</div>
                  <div className="text-[11px] text-muted-foreground">{t("{p0} استان", { p0: fa(provinces.length) })}</div>
                </div>
              </div>
            </div>
            <div className="relative">
              <Icon name="search" size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={provSearch}
                onChange={(e) => setProvSearch(e.target.value)}
                placeholder={t("جستجوی استان…")}
                className="pr-9 h-9 text-sm"
              />
            </div>
            <div className="divide-y rounded-lg border max-h-[520px] overflow-y-auto scrollbar-thin">
              {filteredProvinces.length === 0 ? (
                <EmptyState
                  icon="mapPin"
                  title={t("استانی یافت نشد")}
                  description={provSearch ? t("نتیجه‌ای برای جستجو نیست.") : t("اولین استان را ثبت کنید.")}
                />
              ) : (
                filteredProvinces.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/40 transition-colors">
                    <Icon name="mapPin" size={14} className="text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        {t("{p0} شهر · {p1}", { p0: fa(p.cityCount), p1: formatDate(p.createdAt) })}
                      </div>
                    </div>
                    <Button
                      variant="ghost" size="icon" className="size-8 hover:text-rose-600 shrink-0"
                      onClick={() => setDeleting({ kind: "province", id: p.id, name: p.name })}
                      title={t("حذف استان")}
                    >
                      <Icon name="trash" size={15} />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* ── ستون شهرها ── */}
          <Card className="p-4 space-y-3 lg:col-span-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="size-8 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300 grid place-items-center">
                  <Icon name="warehouse" size={16} />
                </span>
                <div>
                  <div className="font-semibold text-sm">{t("شهرها")}</div>
                  <div className="text-[11px] text-muted-foreground">{t("{p0} شهر نمایش‌داده‌شده", { p0: fa(filteredCities.length) })}</div>
                </div>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCityFormOpen(true)}>
                <Icon name="plus" size={14} /> {t("شهر")}
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="relative">
                <Icon name="search" size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={citySearch}
                  onChange={(e) => setCitySearch(e.target.value)}
                  placeholder={t("جستجوی شهر…")}
                  className="pr-9 h-9 text-sm"
                />
              </div>
              <SearchSelect
                value={cityProvFilter}
                onChange={(v) => setCityProvFilter(v)}
                placeholder={t("همهٔ استان‌ها")}
                searchPlaceholder={t("جستجوی استان…")}
                options={provinceOptions}
                className="h-9 text-sm"
              />
            </div>
            <div className="divide-y rounded-lg border max-h-[520px] overflow-y-auto scrollbar-thin">
              {filteredCities.length === 0 ? (
                <EmptyState
                  icon="warehouse"
                  title={t("شهری یافت نشد")}
                  description={
                    citySearch || cityProvFilter
                      ? t("نتیجه‌ای برای این فیلتر نیست.")
                      : t("اولین شهر را ثبت کنید — انتخاب استان الزامی است.")
                  }
                />
              ) : (
                filteredCities.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/40 transition-colors">
                    <span
                      className="shrink-0 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                      title={t("استان این شهر")}
                    >
                      {c.provinceName}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">{formatDate(c.createdAt)}</div>
                    </div>
                    <Button
                      variant="ghost" size="icon" className="size-8 hover:text-rose-600 shrink-0"
                      onClick={() => setDeleting({ kind: "city", id: c.id, name: `${c.name} (${c.provinceName})` })}
                      title={t("حذف شهر")}
                    >
                      <Icon name="trash" size={15} />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── فرم استان جدید ── */}
      <Dialog open={provFormOpen} onOpenChange={setProvFormOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="mapPin" size={18} className="text-primary" /> {t("ثبت استان جدید")}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!provName.trim()) return toast.error(t("نام استان الزامی است"));
              createProvinceMut.mutate(provName.trim());
            }}
            className="space-y-4"
          >
            <Field label={t("نام استان")} required>
              <Input
                value={provName}
                onChange={(e) => setProvName(e.target.value)}
                autoFocus
                placeholder={t("مثلاً سلیمانیه")}
              />
            </Field>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {t("استان‌ها فهرست مجاز دراپ‌داون «استان» فرم مشتری هستند — حذف استانِ دارای شهر یا مشتری ممکن نیست.")}
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProvFormOpen(false)}>{t("انصراف")}</Button>
              <Button type="submit" disabled={createProvinceMut.isPending} className="gap-2">
                {createProvinceMut.isPending ? (
                  <Icon name="loading" size={16} className="animate-spin" />
                ) : (
                  <Icon name="check" size={16} />
                )}
                {t("ثبت استان")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── فرم شهر جدید ── */}
      <Dialog open={cityFormOpen} onOpenChange={setCityFormOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="warehouse" size={18} className="text-primary" /> {t("ثبت شهر جدید")}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!cityName.trim()) return toast.error(t("نام شهر الزامی است"));
              if (!cityProvince) return toast.error(t("استان شهر را انتخاب کنید"));
              createCityMut.mutate({ name: cityName.trim(), provinceId: cityProvince });
            }}
            className="space-y-4"
          >
            <Field label={t("استان")} required>
              <SearchSelect
                value={cityProvince}
                onChange={(v) => setCityProvince(v)}
                placeholder={t("انتخاب استان…")}
                searchPlaceholder={t("جستجوی استان…")}
                options={provinceOptions}
                allowClear={false}
              />
            </Field>
            <Field label={t("نام شهر")} required>
              <Input
                value={cityName}
                onChange={(e) => setCityName(e.target.value)}
                placeholder={t("مثلاً شقلاوه")}
              />
            </Field>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {t("شهر حذفِ استان را با خود نمی‌برد — حذف شهرِ دارای مشتری هم مسدود است.")}
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCityFormOpen(false)}>{t("انصراف")}</Button>
              <Button type="submit" disabled={createCityMut.isPending} className="gap-2">
                {createCityMut.isPending ? (
                  <Icon name="loading" size={16} className="animate-spin" />
                ) : (
                  <Icon name="check" size={16} />
                )}
                {t("ثبت شهر")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── حذف (گارد 409 سرور) ── */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Icon name="alertTriangle" size={18} className="text-rose-500" />
              حذف {deleting?.kind === "province" ? t("استان") : t("شهر")} «{deleting?.name}»؟
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.kind === "province"
                ? t("استانِ دارای شهر یا مشتریِ ثبت‌شده قابل حذف نیست — سرور اجازه نمی‌دهد.")
                : t("شهرِ دارای مشتریِ ثبت‌شده قابل حذف نیست — سرور اجازه نمی‌دهد.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("انصراف")}</AlertDialogCancel>
            <AlertDialogAction
              className={cn("bg-rose-600 hover:bg-rose-700")}
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault(); // تا خطای 409 دیده شود و دیالوگ باز بماند
                if (deleting) deleteMut.mutate({ kind: deleting.kind, id: deleting.id });
              }}
            >
              {deleteMut.isPending && <Icon name="loading" size={14} className="animate-spin" />}
              {t("بله، حذف کن")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
