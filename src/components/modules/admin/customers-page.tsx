"use client";

// Printoo24 ERP — Phase 17-D: ماژول «مشتریان» ادمین داخلی
//
// بازسازی صفحهٔ سادهٔ قبلی به نمای حرفه‌ای:
//  - نوار خلاصه (تعداد / تسویه‌نشده‌ها / جمع مطالبات / مورد علاقه‌ها)
//  - چیپ‌های فیلتر همه | تسویه‌نشده | مورد علاقه + مصرف boardFilter
//    (کارت «مشتریان تسویه‌نکرده»ی داشبورد → اینجا می‌نشیند)
//  - جدول فشرده با «مانده حساب» کنار نام هر مشتری (چیپ رز/زمرد)
//  - کلیک ردیف → دیالوگ «پروندهٔ مشتری» (customers-detail-dialog)
//  - فرم ساخت/ویرایش با نام/تلفن/آدرس الزامی + شهر/استان/یادداشت/ویژه
//  - حذف با AlertDialog و پیام ۴۰۹-aware (مشتری با سفارش حذف نمی‌شود)
// Phase 18-b: شهر/استان فرم از فهرست مجاز /api/locations می‌آید (دراپ‌داون) —
// Customer همچنان «نام» رشته‌ای ذخیره می‌کند؛ value دراپ‌داون = نام، نه id.
// تا استان انتخاب نشود شهر قفل است؛ تغییر استان → پاک‌شدن شهرِ نا متعلق؛
// مقدار قدیمیِ خارج از فهرست به‌عنوان آپشن fallback حاضر می‌ماند.

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, EmptyState } from "@/components/shared";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ToggleButton } from "@/components/ui/toggle-button";
import { Textarea } from "@/components/ui/textarea";
import { SearchSelect } from "@/components/shared/search-select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { useAppStore } from "@/stores/app-store";
import { toast } from "sonner";
import {
  CustomersDetailDialog, type CustomerDetail,
} from "./customers/customers-detail-dialog";
import { cn } from "@/lib/utils";

// ─── تایپ‌ها ─────────────────────────────────────────────────────────────

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  city: string | null;
  province: string | null;
  isFavorite: boolean;
  balanceDue: number;
  note: string | null;
  createdAt: string;
  _count?: { orders: number; deals: number; activities: number };
  // Phase 17-D — فیلدهای additive سرور
  ordersCount: number;
  unsettled: number;
};

type CustomerForm = {
  name: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  note: string;
  isFavorite: boolean;
};

type FormErrors = { name?: boolean; phone?: boolean; address?: boolean };

type ChipFilter = "all" | "unsettled" | "favorite";

// Phase 18-b: جغرافیا برای دراپ‌داون‌های فرم — Customer شهر/استان را
// STRING (نام) ذخیره می‌کند → value دراپ‌داون = نام (آینهٔ /api/locations)
type LocationsData = {
  provinces: { id: string; name: string; cityCount: number }[];
  cities: { id: string; name: string; provinceId: string; provinceName: string }[];
};

/** شمارش فارسی برای اعداد کوچک */
const fa = (n: number) => n.toLocaleString("fa-IR");

const EMPTY_FORM: CustomerForm = {
  name: "", phone: "", address: "", city: "", province: "", note: "", isFavorite: false,
};

const CHIP_FILTERS: { value: ChipFilter; label: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { value: "all", label: "همه", icon: "grid2" },
  { value: "unsettled", label: "تسویه‌نشده", icon: "coins" },
  { value: "favorite", label: "مورد علاقه", icon: "star" },
];

// ─── صفحه ───────────────────────────────────────────────────────────────

export function CustomersPage() {
  const invalidate = useInvalidate();
  const boardFilter = useAppStore((s) => s.boardFilter);
  const setBoardFilter = useAppStore((s) => s.setBoardFilter);

  // جستجو (نام/تلفن) — سرور-side با debounce کوتاه
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // فیلتر چیپ — پیش‌فرض «همه»؛ کارت داشبورد «customers:unsettled» را فعال می‌کند
  const [chip, setChip] = React.useState<ChipFilter>("all");
  React.useEffect(() => {
    if (boardFilter?.module === "admin" && boardFilter.value === "customers:unsettled") {
      setChip("unsettled");
      setBoardFilter("admin", null); // مصرف شد
    }
  }, [boardFilter, setBoardFilter]);

  // دیالوگ‌ها
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CustomerRow | CustomerDetail | null>(null);
  const [form, setForm] = React.useState<CustomerForm>(EMPTY_FORM);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [deleting, setDeleting] = React.useState<CustomerRow | null>(null);

  // Phase 18-b: فهرست مجاز استان/شهر — همان کلید ["locations"] صفحهٔ مدیریت
  // جغرافیا و ویزارد سفارش → کش مشترک react-query
  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: () => api<LocationsData>("/api/locations"),
    staleTime: 5 * 60_000, // جغرافیا به‌ندرت وسط جلسه عوض می‌شود
  });
  const provinces = locations?.provinces ?? [];
  const cities = locations?.cities ?? [];

  // ── داده‌ها ──
  const { data, isLoading } = useQuery({
    queryKey: ["customers", "admin", search],
    queryFn: () =>
      api<{ customers: CustomerRow[] }>(
        `/api/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`
      ),
    refetchInterval: 60_000,
  });
  const customers = data?.customers ?? [];

  // نوار خلاصه — از کل لیستِ جستجوشده (چیپ روی آن اثر ندارد)
  const stats = React.useMemo(
    () => ({
      total: customers.length,
      unsettledCount: customers.filter((c) => c.unsettled > 0).length,
      unsettledSum: customers.reduce((s, c) => s + c.unsettled, 0),
      favorites: customers.filter((c) => c.isFavorite).length,
    }),
    [customers]
  );

  const rows = React.useMemo(
    () =>
      customers.filter((c) => {
        if (chip === "unsettled") return c.unsettled > 0;
        if (chip === "favorite") return c.isFavorite;
        return true;
      }),
    [customers, chip]
  );

  // ── دراپ‌داون استان/شهر (Phase 18-b) ──
  // آپشن استان‌ها — value = نام (Customer رشته ذخیره می‌کند، نه id).
  // اگر استانِ فعلیِ مشتری در فهرست نیست (دادهٔ قدیمی)، به‌عنوان آپشن
  // fallback اضافه می‌شود تا مقدار ذخیره‌شده گم نشود (pattern current-value)
  const provinceOptions = React.useMemo(() => {
    const opts = provinces.map((p) => ({ value: p.name, label: p.name }));
    if (form.province && !opts.some((o) => o.value === form.province)) {
      opts.push({ value: form.province, label: form.province });
    }
    return opts;
  }, [provinces, form.province]);

  // نام استان انتخاب‌شده → id (برای فیلتر شهرهای همان استان)
  const selectedProvinceId = provinces.find((p) => p.name === form.province)?.id ?? null;

  // شهرهای همان استان — فیلتر client-side روی provinceId.
  // شهرِ فعلیِ خارج از فهرست (دادهٔ قدیمی) به‌عنوان آپشن fallback می‌ماند
  const cityOptions = React.useMemo(() => {
    if (!form.province) return [];
    const opts = selectedProvinceId
      ? cities
          .filter((c) => c.provinceId === selectedProvinceId)
          .map((c) => ({ value: c.name, label: c.name }))
      : [];
    if (form.city && !opts.some((o) => o.value === form.city)) {
      opts.push({ value: form.city, label: form.city });
    }
    return opts;
  }, [cities, selectedProvinceId, form.province, form.city]);

  // ── Mutations ──
  const createMut = useMutation({
    mutationFn: (body: CustomerForm) => api("/api/customers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate(["customers", "customers-list", "customers-wizard", "dashboard"]);
      toast.success("مشتری ایجاد شد");
      setFormOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: (body: CustomerForm) =>
      api(`/api/customers/${editing?.id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate(["customers", "customers-list", "customers-wizard", "dashboard"]);
      toast.success("مشتری ویرایش شد");
      setFormOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/customers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["customers", "customers-list", "customers-wizard", "dashboard"]);
      toast.success("مشتری حذف شد");
      setDeleting(null);
    },
    // ۴۰۹ (سفارش ثبت‌شده) → توست فارسی؛ دیالوگ باز می‌ماند تا کاربر ببیند
    onError: (e: Error) => toast.error(e.message),
  });

  // ── فرم ──
  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormOpen(true);
  }
  function openEdit(c: CustomerRow | CustomerDetail) {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone,
      address: c.address ?? "",
      city: c.city ?? "",
      province: c.province ?? "",
      note: c.note ?? "",
      isFavorite: c.isFavorite,
    });
    setErrors({});
    setFormOpen(true);
  }
  // تغییر استان → اگر شهرِ فعلی به استان جدید تعلق ندارد، شهر خالی می‌شود
  // (اگر همان استان دوباره کلیک شود، SearchSelect مقدار را null می‌کند = پاک‌شدن)
  function handleProvinceChange(v: string | null) {
    const nextProvince = v ?? "";
    if (nextProvince === form.province) return;
    let nextCity = form.city;
    if (nextCity) {
      const pid = provinces.find((p) => p.name === nextProvince)?.id ?? null;
      const belongs = pid
        ? cities.some((c) => c.provinceId === pid && c.name === nextCity)
        : false;
      if (!belongs) nextCity = "";
    }
    setForm({ ...form, province: nextProvince, city: nextCity });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: FormErrors = {
      name: !form.name.trim(),
      phone: !form.phone.trim(),
      address: !form.address.trim(),
    };
    setErrors(errs);
    if (errs.name || errs.phone || errs.address) {
      toast.error("نام، شماره تلفن و آدرس الزامی است");
      return;
    }
    if (editing) updateMut.mutate(form);
    else createMut.mutate(form);
  }

  // ── ستون‌های جدول ──
  const columns: ColumnDef<CustomerRow>[] = [
    {
      accessorKey: "name",
      header: "مشتری",
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex items-center gap-2 min-w-0">
            {c.isFavorite && <Icon name="star" size={14} className="text-amber-500 shrink-0" />}
            <span className="font-semibold truncate">{c.name}</span>
            <BalanceChip value={c.unsettled} />
          </div>
        );
      },
      enableSorting: true,
      meta: { hideable: false },
    },
    {
      accessorKey: "phone",
      header: "تماس",
      cell: ({ row }) => (
        <span className="text-muted-foreground tabular-nums text-xs" dir="ltr">{row.original.phone}</span>
      ),
      enableSorting: true,
    },
    {
      id: "location",
      accessorFn: (r) => `${r.city ?? ""} ${r.province ?? ""}`.trim(),
      header: "شهر / استان",
      cell: ({ row }) => {
        const { city, province } = row.original;
        if (!city && !province) return <span className="text-muted-foreground/60 text-xs">—</span>;
        return (
          <div className="flex items-baseline gap-1.5 whitespace-nowrap">
            {city && <span className="text-xs font-medium">{city}</span>}
            {city && province && <span className="text-muted-foreground/40 text-[10px]">/</span>}
            {province && <span className="text-xs text-muted-foreground">{province}</span>}
          </div>
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: "address",
      header: "آدرس",
      cell: ({ row }) => {
        const a = row.original.address;
        if (!a) return <span className="text-muted-foreground/60 text-xs">—</span>;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block max-w-[220px] truncate text-xs text-muted-foreground cursor-help">
                {a}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
              {a}
            </TooltipContent>
          </Tooltip>
        );
      },
      enableSorting: false,
    },
    {
      id: "orders",
      accessorFn: (r) => r.ordersCount,
      header: "سفارش‌ها",
      cell: ({ row }) => (
        <span className="tabular-nums text-xs font-medium">{fa(row.original.ordersCount)}</span>
      ),
      enableSorting: true,
      meta: { align: "center" },
    },
    {
      accessorKey: "createdAt",
      header: "ثبت",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs tabular-nums whitespace-nowrap">
          {formatDate(row.original.createdAt)}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: "actions",
      header: () => <div className="text-center">عملیات</div>,
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-0.5">
          <Button
            variant="ghost" size="icon" className="size-8"
            onClick={(e) => { e.stopPropagation(); openEdit(row.original); }}
            title="ویرایش"
          >
            <Icon name="edit" size={16} />
          </Button>
          <Button
            variant="ghost" size="icon" className="size-8 hover:text-rose-600"
            onClick={(e) => { e.stopPropagation(); setDeleting(row.original); }}
            title="حذف"
          >
            <Icon name="trash" size={16} />
          </Button>
        </div>
      ),
      enableSorting: false,
      meta: { hideable: false },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="مشتریان"
        description={`${fa(stats.total)} مشتری · پرونده، مانده حساب و تاریخچه سفارش‌ها`}
        icon="customers"
        actions={
          <>
            <div className="relative w-full sm:w-56">
              <Icon name="search" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="جستجوی نام یا تلفن…"
                className="pr-9"
              />
            </div>
            <Button onClick={openNew} className="gap-2">
              <Icon name="plus" size={16} /> مشتری جدید
            </Button>
          </>
        }
      />

      {/* نوار خلاصه */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon="customers" color="violet" value={fa(stats.total)} label="تعداد مشتریان" />
        <SummaryCard icon="wallet" color="rose" value={fa(stats.unsettledCount)} label="تسویه‌نشده‌ها" />
        <SummaryCard icon="coins" color="teal" value={formatCurrency(stats.unsettledSum)} label="جمع مطالبات" isCurrency />
        <SummaryCard icon="star" color="amber" value={fa(stats.favorites)} label="مورد علاقه‌ها" />
      </div>

      {/* جدول + چیپ‌های فیلتر */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
            <Icon name="filter" size={13} /> نمایش:
          </span>
          <div
            role="radiogroup"
            aria-label="فیلتر مشتریان"
            className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-1"
          >
            {CHIP_FILTERS.map((f) => {
              const active = chip === f.value;
              const count =
                f.value === "all" ? stats.total
                : f.value === "unsettled" ? stats.unsettledCount
                : stats.favorites;
              return (
                <button
                  key={f.value}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setChip(f.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                    active
                      ? "bg-background text-foreground shadow-sm border"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                  )}
                >
                  <Icon name={f.icon} size={13} />
                  {f.label}
                  <span
                    className={cn(
                      "text-[10px] tabular-nums rounded-full px-1.5 py-0.5",
                      active ? "bg-muted text-foreground" : "bg-muted/60 text-muted-foreground"
                    )}
                  >
                    {fa(count)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          pageSize={10}
          dense
          onRowClick={(c) => setDetailId(c.id)}
          emptyState={
            <EmptyState
              icon="customers"
              title="مشتری‌ای یافت نشد"
              description={
                search
                  ? "نتیجه‌ای برای جستجوی شما نیست — عبارت دیگری امتحان کنید."
                  : chip === "unsettled"
                    ? "همهٔ مشتریان تسویه کرده‌اند."
                    : "اولین مشتری خود را اضافه کنید."
              }
              action={
                !search && chip === "all" ? (
                  <Button onClick={openNew} className="gap-2">
                    <Icon name="plus" size={16} /> افزودن مشتری
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </Card>

      {/* پروندهٔ مشتری — کلیک روی ردیف */}
      <CustomersDetailDialog
        customerId={detailId}
        open={!!detailId}
        onOpenChange={(o) => { if (!o) setDetailId(null); }}
        onEdit={(c) => { setDetailId(null); openEdit(c); }}
      />

      {/* فرم ساخت/ویرایش */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editing ? `ویرایش «${editing.name}»` : "مشتری جدید"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="نام مشتری" required>
                <Input
                  value={form.name}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); if (errors.name) setErrors({ ...errors, name: false }); }}
                  aria-invalid={errors.name || undefined}
                  placeholder="مثلاً فروشگاه مدار"
                />
              </Field>
              <Field label="شماره تلفن" required>
                <Input
                  value={form.phone}
                  onChange={(e) => { setForm({ ...form, phone: e.target.value }); if (errors.phone) setErrors({ ...errors, phone: false }); }}
                  aria-invalid={errors.phone || undefined}
                  dir="ltr"
                  placeholder="0770…"
                />
              </Field>
            </div>

            <Field label="آدرس" required>
              <Textarea
                value={form.address}
                onChange={(e) => { setForm({ ...form, address: e.target.value }); if (errors.address) setErrors({ ...errors, address: false }); }}
                aria-invalid={errors.address || undefined}
                rows={2}
                placeholder="اربیل - خیابان 60 - پلاک 12"
              />
            </Field>

            {/* Phase 18-b: شهر/استان از فهرست مجاز /api/locations — دراپ‌داون.
                تا استان انتخاب نشود شهر قفل است؛ مقدار قدیمی خارج از فهرست
                به‌عنوان آپشن fallback حاضر می‌ماند تا گم نشود */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="استان">
                <div role="group" aria-label="انتخاب استان">
                  <SearchSelect
                    value={form.province || null}
                    onChange={handleProvinceChange}
                    placeholder="انتخاب استان…"
                    searchPlaceholder="جستجوی استان…"
                    options={provinceOptions}
                    className="w-full"
                  />
                </div>
              </Field>
              <Field label="شهر">
                {form.province ? (
                  <div role="group" aria-label="انتخاب شهر">
                    <SearchSelect
                      value={form.city || null}
                      onChange={(v) => setForm({ ...form, city: v ?? "" })}
                      placeholder="انتخاب شهر…"
                      searchPlaceholder="جستجوی شهر…"
                      options={cityOptions}
                      className="w-full"
                    />
                  </div>
                ) : (
                  // SearchSelect پراپ disabled ندارد → تا انتخاب استان، تریگر
                  // خاموش با همان استایل (button disabled) جایگزین می‌شود
                  <button
                    type="button"
                    disabled
                    aria-label="شهر — ابتدا استان را انتخاب کنید"
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 py-2 text-sm min-w-0 text-muted-foreground opacity-50 cursor-not-allowed"
                  >
                    <span className="truncate">اول استان را انتخاب کنید</span>
                    <Icon name="chevronDown" size={14} className="text-muted-foreground shrink-0" />
                  </button>
                )}
              </Field>
            </div>

            <Field label="یادداشت">
              <Textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
                placeholder="نکته‌ای دربارهٔ این مشتری…"
              />
            </Field>

            <ToggleButton
              checked={form.isFavorite}
              onChange={(v) => setForm({ ...form, isFavorite: v })}
              id="fav"
              label="مشتری مورد علاقه"
              activeIcon="star"
              activeColor="amber"
            />

            {(errors.name || errors.phone || errors.address) && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                فیلدهای ستاره‌دار الزامی است.
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>انصراف</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="gap-2">
                {(createMut.isPending || updateMut.isPending) ? (
                  <Icon name="loading" size={16} className="animate-spin" />
                ) : (
                  <Icon name="check" size={16} />
                )}
                {editing ? "ذخیره تغییرات" : "ذخیره"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* حذف — با گارد ۴۰۹ سرور (مشتریِ دارای سفارش حذف نمی‌شود) */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Icon name="alertTriangle" size={18} className="text-rose-500" />
              حذف «{deleting?.name}»؟
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (deleting.ordersCount ?? 0) > 0
                ? "این مشتری سفارش ثبت‌شده دارد — سرور اجازهٔ حذف نخواهد داد."
                : "این عملیات قابل بازگشت نیست."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault(); // تا خطای ۴۰۹ دیالوگ باز بماند و توست دیده شود
                if (deleting) deleteMut.mutate(deleting.id);
              }}
            >
              {deleteMut.isPending && <Icon name="loading" size={14} className="animate-spin" />}
              بله، حذف کن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── اجزای کوچک ─────────────────────────────────────────────────────────

/** چیپ مانده حساب — کنار نام مشتری (خواستهٔ صریح کارفرما) */
function BalanceChip({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span
        dir="ltr"
        className="shrink-0 inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
        title="مانده حساب (طلب جاری)"
      >
        {formatCurrency(value)}
      </span>
    );
  }
  return (
    <span className="shrink-0 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
      تسویه‌شده
    </span>
  );
}

const SUMMARY_COLORS: Record<string, string> = {
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
  teal: "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
};

function SummaryCard({
  icon, color, value, label, isCurrency,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  color: string;
  value: string;
  label: string;
  isCurrency?: boolean;
}) {
  return (
    <Card className="p-3.5 flex items-center gap-3">
      <div className={cn("size-10 rounded-xl grid place-items-center shrink-0", SUMMARY_COLORS[color] ?? "bg-muted text-muted-foreground")}>
        <Icon name={icon} size={20} />
      </div>
      <div className="min-w-0">
        <div className={cn("font-bold tabular-nums truncate", isCurrency ? "text-base" : "text-xl")} dir="ltr">
          {value}
        </div>
        <div className="text-xs text-muted-foreground truncate">{label}</div>
      </div>
    </Card>
  );
}
