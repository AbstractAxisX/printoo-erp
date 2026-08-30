"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, EmptyState } from "@/components/shared";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, relativeTime } from "@/lib/format";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  SupplierService,
  Supplier,
  SupplierCategory,
  PriceListEntry,
} from "./srm-types";

const UNIT_CHOICES = ["عدد", "متر", "کیلوگرم", "بسته", "صفحه", "ساعت", "متر مربع", "لیتر"];

// ─── Component ────────────────────────────────────────────────────────
export function SRMServices() {
  const invalidate = useInvalidate();

  const [search, setSearch] = React.useState("");
  const [supplierFilter, setSupplierFilter] = React.useState<string>("all");
  const [subcategoryFilter, setSubcategoryFilter] = React.useState<string>("all");
  const [selectedServiceId, setSelectedServiceId] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    supplierId: "",
    subcategoryId: "",
    name: "",
    description: "",
    unit: "عدد",
  });

  // Fetch services
  const { data, isLoading } = useQuery({
    queryKey: ["supplier-services", search],
    queryFn: () =>
      api<{ services: SupplierService[] }>(
        `/api/supplier-services${search ? `?search=${encodeURIComponent(search)}` : ""}`
      ),
    refetchInterval: 30000,
  });
  const servicesRaw = data?.services ?? [];

  // Fetch suppliers + categories for filter and dialog
  const { data: supData } = useQuery({
    queryKey: ["suppliers", "srm", "for-services"],
    queryFn: () => api<{ suppliers: Supplier[] }>("/api/suppliers"),
  });
  const suppliers = supData?.suppliers ?? [];

  const { data: catData } = useQuery({
    queryKey: ["supplier-categories", "for-services"],
    queryFn: () => api<{ categories: SupplierCategory[] }>("/api/supplier-categories"),
  });
  const categories = catData?.categories ?? [];

  // Flatten subcategories for filter
  const allSubcategories = React.useMemo(() => {
    return categories.flatMap((c) =>
      (c.subcategories ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        categoryName: c.name,
      }))
    );
  }, [categories]);

  // Apply filters
  const services = React.useMemo(() => {
    return servicesRaw.filter((s) => {
      if (supplierFilter !== "all" && s.supplierId !== supplierFilter) return false;
      if (subcategoryFilter !== "all" && s.subcategoryId !== subcategoryFilter) return false;
      return true;
    });
  }, [servicesRaw, supplierFilter, subcategoryFilter]);

  // Create service mutation
  const createMut = useMutation({
    mutationFn: (body: typeof form) =>
      api("/api/supplier-services", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate(["supplier-services", "srm-dashboard"]);
      toast.success("خدمه ایجاد شد");
      setDialogOpen(false);
      setForm({ supplierId: "", subcategoryId: "", name: "", description: "", unit: "عدد" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/supplier-services/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["supplier-services", "srm-dashboard"]);
      toast.success("خدمه حذف شد");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplierId) {
      toast.error("انتخاب تامین‌کننده الزامی است");
      return;
    }
    createMut.mutate(form);
  }

  // ── Columns ───────────────────────────────────────────────────────
  const columns: ColumnDef<SupplierService>[] = [
    {
      accessorKey: "name",
      header: "نام خدمه",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 grid place-items-center shrink-0">
            <Icon name="task" size={14} />
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{row.original.name}</div>
            {row.original.description && (
              <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                {row.original.description}
              </div>
            )}
          </div>
        </div>
      ),
      enableSorting: true,
    },
    {
      id: "supplier",
      accessorFn: (r) => r.supplier?.name ?? "",
      header: "تامین‌کننده",
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original.supplier?.name ?? "—"}</span>
      ),
      enableSorting: true,
    },
    {
      id: "subcategory",
      accessorFn: (r) => r.subcategory?.name ?? "",
      header: "دسته / زیردسته",
      cell: ({ row }) => {
        const sub = row.original.subcategory;
        if (!sub) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">{sub.category?.name ?? "—"}</span>
            <span className="text-xs font-medium">{sub.name}</span>
          </div>
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: "unit",
      header: "واحد",
      cell: ({ row }) => (
        <span className="text-xs bg-muted px-2 py-0.5 rounded">{row.original.unit}</span>
      ),
      enableSorting: true,
    },
    {
      id: "latestPrice",
      accessorFn: (r) => r.priceLists?.[0]?.price ?? 0,
      header: "آخرین قیمت",
      cell: ({ row }) => {
        const latest = row.original.priceLists?.[0];
        if (!latest) return <span className="text-[11px] text-muted-foreground">بدون قیمت</span>;
        return (
          <div className="text-left">
            <div className="text-sm font-bold tabular-nums" dir="ltr">
              {formatCurrency(latest.price)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              حداقل: {latest.minQuantity}
            </div>
          </div>
        );
      },
      enableSorting: true,
    },
    {
      id: "actions",
      header: () => <div className="text-center">عملیات</div>,
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedServiceId(row.original.id);
            }}
            title="جزئیات و تاریخچه قیمت"
          >
            <Icon name="eye" size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 hover:text-rose-600"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`حذف خدمه «${row.original.name}»؟`)) {
                deleteMut.mutate(row.original.id);
              }
            }}
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
        title="خدمات تامین‌کنندگان"
        description="مدیریت خدمات و لیست قیمت‌های هر تامین‌کننده"
        icon="task"
        actions={
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Icon name="plus" size={16} /> خدمه جدید
          </Button>
        }
      />

      <Card className="p-4">
        <DataTable
          columns={columns}
          data={services}
          isLoading={isLoading}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          searchPlaceholder="جستجوی نام خدمه..."
          pageSize={10}
          onRowClick={(s) => setSelectedServiceId(s.id)}
          toolbar={
            <div className="flex items-center gap-2">
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="همه تامین‌کنندگان" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه تامین‌کنندگان</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={subcategoryFilter} onValueChange={setSubcategoryFilter}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="همه زیردسته‌ها" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه زیردسته‌ها</SelectItem>
                  {allSubcategories.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.categoryName} / {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
          emptyState={
            <EmptyState
              icon="task"
              title="خدمه‌ای یافت نشد"
              description="اولین خدمه را اضافه کنید یا فیلترها را تغییر دهید."
              action={
                <Button onClick={() => setDialogOpen(true)} className="gap-2">
                  <Icon name="plus" size={16} /> افزودن خدمه
                </Button>
              }
            />
          }
        />
      </Card>

      {/* Create service dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>خدمه جدید</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Field label="تامین‌کننده" required>
              <Select
                value={form.supplierId}
                onValueChange={(v) => setForm({ ...form, supplierId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب تامین‌کننده..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      ابتدا تامین‌کننده بسازید
                    </div>
                  ) : (
                    suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field label="زیردسته">
              <Select
                value={form.subcategoryId}
                onValueChange={(v) => setForm({ ...form, subcategoryId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختیاری — انتخاب زیردسته..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <div key={c.id}>
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">
                        {c.name}
                      </div>
                      {c.subcategories.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="نام خدمه" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="مثال: چاپ افست ۴ رنگ"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="واحد">
                <Select
                  value={form.unit}
                  onValueChange={(v) => setForm({ ...form, unit: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_CHOICES.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="توضیحات">
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                انصراف
              </Button>
              <Button type="submit" disabled={createMut.isPending} className="gap-2">
                {createMut.isPending ? (
                  <Icon name="loading" size={16} className="animate-spin" />
                ) : (
                  <Icon name="check" size={16} />
                )}
                ذخیره
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Service detail drawer */}
      <ServiceDetailDrawer
        serviceId={selectedServiceId}
        onClose={() => setSelectedServiceId(null)}
      />
    </div>
  );
}

// ─── Service Detail Drawer (price history + add price) ────────────────
function ServiceDetailDrawer({
  serviceId,
  onClose,
}: {
  serviceId: string | null;
  onClose: () => void;
}) {
  const invalidate = useInvalidate();
  const open = !!serviceId;
  const [addPriceOpen, setAddPriceOpen] = React.useState(false);
  const [priceForm, setPriceForm] = React.useState({
    price: "",
    minQuantity: "1",
    note: "",
    validTo: "",
  });

  // Fetch service detail (re-fetch the service via list filtered by supplier? — we'll fetch via single list endpoint and find)
  // Simpler: fetch the full service list and find by id (the list endpoint already includes the latest price)
  const { data: svcListData, isLoading } = useQuery({
    queryKey: ["supplier-services", "detail", serviceId],
    queryFn: () => api<{ services: SupplierService[] }>("/api/supplier-services"),
    enabled: !!serviceId,
    refetchInterval: open ? 30000 : false,
  });
  const service = svcListData?.services.find((s) => s.id === serviceId) ?? null;

  // Fetch full price history for this service
  const { data: priceData, isLoading: pricesLoading } = useQuery({
    queryKey: ["price-lists", "by-service", serviceId],
    queryFn: () =>
      api<{ priceLists: PriceListEntry[] }>(
        `/api/price-lists?serviceId=${serviceId}`
      ),
    enabled: !!serviceId,
    refetchInterval: open ? 30000 : false,
  });
  const priceHistory = priceData?.priceLists ?? [];

  // Add price mutation
  const addPriceMut = useMutation({
    mutationFn: (body: { price: number; minQuantity: number; note: string; validTo: string }) =>
      api(`/api/price-lists`, {
        method: "POST",
        body: JSON.stringify({ ...body, serviceId }),
      }),
    onSuccess: () => {
      invalidate(["price-lists", "supplier-services", "srm-dashboard"]);
      toast.success("قیمت جدید ثبت شد");
      setAddPriceOpen(false);
      setPriceForm({ price: "", minQuantity: "1", note: "", validTo: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Delete price mutation
  const deletePriceMut = useMutation({
    mutationFn: (id: string) => api(`/api/price-lists/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["price-lists", "supplier-services", "srm-dashboard"]);
      toast.success("قیمت حذف شد");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  React.useEffect(() => {
    if (!open) {
      setAddPriceOpen(false);
    }
  }, [open]);

  function submitPrice(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(priceForm.price);
    if (!price || price <= 0) {
      toast.error("قیمت معتبر وارد کنید");
      return;
    }
    addPriceMut.mutate({
      price,
      minQuantity: Number(priceForm.minQuantity) || 1,
      note: priceForm.note,
      validTo: priceForm.validTo,
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="left" className="w-full sm:max-w-xl overflow-y-auto p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Icon name="task" size={18} className="text-violet-500" />
            جزئیات خدمه
          </SheetTitle>
          <SheetDescription>اطلاعات خدمه و تاریخچه قیمت‌ها</SheetDescription>
        </SheetHeader>

        {isLoading || !service ? (
          <div className="py-20 flex flex-col items-center gap-2">
            {isLoading ? (
              <>
                <Icon name="loading" size={28} className="animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">در حال بارگذاری...</span>
              </>
            ) : (
              <>
                <Icon name="alertTriangle" size={28} className="text-amber-500" />
                <span className="text-sm text-muted-foreground">خدمه یافت نشد.</span>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Profile */}
            <div className="px-5 py-4 border-b bg-muted/30">
              <div className="flex items-start gap-3">
                <div className="size-12 rounded-xl bg-violet-500 text-white grid place-items-center shrink-0">
                  <Icon name="task" size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold truncate">{service.name}</h3>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {service.supplier?.name ?? "—"}
                  </div>
                  {service.subcategory && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {service.subcategory.category?.name} / {service.subcategory.name}
                    </div>
                  )}
                </div>
              </div>

              {/* Stat tiles */}
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="rounded-lg bg-card border p-2 text-center">
                  <div className="text-[10px] text-muted-foreground">واحد</div>
                  <div className="text-sm font-bold">{service.unit}</div>
                </div>
                <div className="rounded-lg bg-card border p-2 text-center">
                  <div className="text-[10px] text-muted-foreground">تعداد قیمت</div>
                  <div className="text-sm font-bold tabular-nums">{priceHistory.length}</div>
                </div>
                <div className="rounded-lg bg-card border p-2 text-center">
                  <div className="text-[10px] text-muted-foreground">آخرین قیمت</div>
                  <div className="text-xs font-bold tabular-nums" dir="ltr">
                    {service.priceLists?.[0]
                      ? formatCurrency(service.priceLists[0].price)
                      : "—"}
                  </div>
                </div>
              </div>

              {service.description && (
                <div className="mt-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900 p-2.5 text-xs">
                  <div className="flex items-start gap-1.5">
                    <Icon name="info" size={12} className="text-violet-600 mt-0.5 shrink-0" />
                    <span>{service.description}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Price history */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon name="tag" size={16} className="text-primary" />
                  <h4 className="font-semibold text-sm">تاریخچه قیمت‌ها</h4>
                  <span className="text-[11px] text-muted-foreground">
                    ({priceHistory.length})
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => setAddPriceOpen(true)}
                  className="gap-1.5"
                >
                  <Icon name="plus" size={14} /> قیمت جدید
                </Button>
              </div>

              {pricesLoading ? (
                <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Icon name="loading" size={14} className="animate-spin" />
                  در حال بارگذاری قیمت‌ها...
                </div>
              ) : priceHistory.length === 0 ? (
                <EmptyState
                  icon="tag"
                  title="قیمتی ثبت نشده"
                  description="برای این خدمه هنوز قیمتی ثبت نشده است."
                  action={
                    <Button size="sm" onClick={() => setAddPriceOpen(true)} className="gap-2">
                      <Icon name="plus" size={14} /> ثبت قیمت
                    </Button>
                  }
                />
              ) : (
                <div className="relative">
                  <div className="absolute right-[19px] top-2 bottom-2 w-px bg-border" />
                  <div className="space-y-3">
                    {priceHistory.map((p, idx) => {
                      const isLatest = idx === 0;
                      return (
                        <div key={p.id} className="flex items-start gap-3 relative">
                          <div
                            className={cn(
                              "size-9 rounded-full grid place-items-center shrink-0 z-10 border-2 border-background",
                              isLatest
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            <Icon name={isLatest ? "checkCircle" : "tag"} size={14} />
                          </div>
                          <div className="flex-1 min-w-0 pt-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold tabular-nums" dir="ltr">
                                  {formatCurrency(p.price)}
                                </span>
                                {isLatest && (
                                  <span className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
                                    آخرین
                                  </span>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6 hover:text-rose-600"
                                onClick={() => {
                                  if (confirm("حذف این قیمت؟")) deletePriceMut.mutate(p.id);
                                }}
                                title="حذف قیمت"
                              >
                                <Icon name="trash" size={12} />
                              </Button>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-muted-foreground">
                                حداقل: {p.minQuantity} {service.unit}
                              </span>
                              <span className="text-[10px] text-muted-foreground">•</span>
                              <span className="text-[10px] text-muted-foreground">
                                {relativeTime(p.createdAt)}
                              </span>
                              {p.validTo && (
                                <>
                                  <span className="text-[10px] text-muted-foreground">•</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    اعتبار تا: {formatDate(p.validTo)}
                                  </span>
                                </>
                              )}
                            </div>
                            {p.note && (
                              <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                                {p.note}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>

      {/* Add price dialog (rendered as sibling) */}
      <Dialog open={addPriceOpen} onOpenChange={setAddPriceOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>ثبت قیمت جدید</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitPrice} className="space-y-4">
            {service && (
              <div className="rounded-lg bg-muted/40 p-2.5 text-xs">
                <span className="text-muted-foreground">خدمه: </span>
                <span className="font-medium">{service.name}</span>
                <span className="text-muted-foreground"> • </span>
                <span className="text-muted-foreground">{service.supplier?.name}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="قیمت (IQD)" required>
                <Input
                  type="number"
                  value={priceForm.price}
                  onChange={(e) => setPriceForm({ ...priceForm, price: e.target.value })}
                  required
                  dir="ltr"
                  placeholder="مثال: 5000"
                />
              </Field>
              <Field label="حداقل تعداد">
                <Input
                  type="number"
                  value={priceForm.minQuantity}
                  onChange={(e) => setPriceForm({ ...priceForm, minQuantity: e.target.value })}
                  dir="ltr"
                  min="1"
                />
              </Field>
            </div>
            <Field label="اعتبار تا (اختیاری)">
              <Input
                type="date"
                value={priceForm.validTo}
                onChange={(e) => setPriceForm({ ...priceForm, validTo: e.target.value })}
                dir="ltr"
              />
            </Field>
            <Field label="یادداشت">
              <Textarea
                value={priceForm.note}
                onChange={(e) => setPriceForm({ ...priceForm, note: e.target.value })}
                rows={2}
                placeholder="توضیح قیمت، شرایط ویژه و..."
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddPriceOpen(false)}>
                انصراف
              </Button>
              <Button type="submit" disabled={addPriceMut.isPending} className="gap-2">
                {addPriceMut.isPending ? (
                  <Icon name="loading" size={16} className="animate-spin" />
                ) : (
                  <Icon name="check" size={16} />
                )}
                ثبت قیمت
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
