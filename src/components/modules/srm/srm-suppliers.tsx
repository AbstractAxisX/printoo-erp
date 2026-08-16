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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, relativeTime } from "@/lib/format";
import { useAppStore } from "@/stores/app-store";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Supplier,
  SupplierCategory,
  SupplierDetail,
  MaterialCost,
} from "./srm-types";

// ─── Status / Module meta (for costs tab) ─────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "در انتظار",
  approved: "تأیید شده",
  rejected: "رد شده",
};

// ─── Component ────────────────────────────────────────────────────────
export function SRMSuppliers() {
  const invalidate = useInvalidate();
  const navigate = useAppStore((s) => s.navigate);

  const [search, setSearch] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string>("all");
  const [subcategoryId, setSubcategoryId] = React.useState<string>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Supplier | null>(null);
  const [form, setForm] = React.useState({
    name: "",
    phone: "",
    contactPerson: "",
    address: "",
    note: "",
    subcategoryId: "",
  });

  // Fetch suppliers
  const { data, isLoading } = useQuery({
    queryKey: ["suppliers", "srm", search],
    queryFn: () =>
      api<{ suppliers: Supplier[] }>(
        `/api/suppliers${search ? `?search=${encodeURIComponent(search)}` : ""}`
      ),
    refetchInterval: 30000,
  });

  // Fetch categories with subcategories (for filters + dialog)
  const { data: catData } = useQuery({
    queryKey: ["supplier-categories"],
    queryFn: () => api<{ categories: SupplierCategory[] }>("/api/supplier-categories"),
  });
  const categories = catData?.categories ?? [];

  // Build subcategory options based on selected category
  const subcategoryOptions = React.useMemo(() => {
    if (categoryId === "all") return [];
    const cat = categories.find((c) => c.id === categoryId);
    return cat?.subcategories ?? [];
  }, [categoryId, categories]);

  const suppliersRaw = data?.suppliers ?? [];

  // Apply client-side filter by category/subcategory
  const suppliers = React.useMemo(() => {
    return suppliersRaw.filter((s) => {
      if (subcategoryId !== "all" && s.subcategoryId !== subcategoryId) return false;
      if (categoryId !== "all" && s.subcategory?.category?.id !== categoryId) return false;
      return true;
    });
  }, [suppliersRaw, categoryId, subcategoryId]);

  // Reset subcategory when category changes
  React.useEffect(() => {
    setSubcategoryId("all");
  }, [categoryId]);

  // Mutations
  const createMut = useMutation({
    mutationFn: (body: typeof form) =>
      api("/api/suppliers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate(["suppliers", "srm-dashboard"]);
      toast.success("تامین‌کننده ایجاد شد");
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: (body: typeof form) =>
      api(`/api/suppliers/${editing?.id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate(["suppliers", "supplier-detail", "srm-dashboard"]);
      toast.success("تامین‌کننده ویرایش شد");
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/suppliers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["suppliers", "srm-dashboard"]);
      toast.success("تامین‌کننده حذف شد");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setEditing(null);
    setForm({ name: "", phone: "", contactPerson: "", address: "", note: "", subcategoryId: "" });
    setDialogOpen(true);
  }
  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name,
      phone: s.phone ?? "",
      contactPerson: s.contactPerson ?? "",
      address: s.address ?? "",
      note: s.note ?? "",
      subcategoryId: s.subcategoryId ?? "",
    });
    setDialogOpen(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) updateMut.mutate(form);
    else createMut.mutate(form);
  }

  // ── Columns ───────────────────────────────────────────────────────
  const columns: ColumnDef<Supplier>[] = [
    {
      accessorKey: "name",
      header: "نام تامین‌کننده",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 grid place-items-center text-xs font-bold shrink-0">
            {row.original.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{row.original.name}</div>
            {row.original.contactPerson && (
              <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                {row.original.contactPerson}
              </div>
            )}
          </div>
        </div>
      ),
      enableSorting: true,
    },
    {
      id: "category",
      accessorFn: (r) => r.subcategory?.category?.name ?? "",
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
      accessorKey: "phone",
      header: "تلفن",
      cell: ({ row }) => (
        <span className="text-muted-foreground tabular-nums text-xs" dir="ltr">
          {row.original.phone ?? "—"}
        </span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: "contactPerson",
      header: "شخص مسئول",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.contactPerson ?? "—"}</span>
      ),
      enableSorting: true,
    },
    {
      id: "services",
      accessorFn: (r) => r._count?.services ?? 0,
      header: "خدمات",
      cell: ({ row }) => (
        <span className={cn("tabular-nums", (row.original._count?.services ?? 0) === 0 && "text-muted-foreground")}>
          {row.original._count?.services ?? 0}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: "costs",
      accessorFn: (r) => r._count?.materialCosts ?? 0,
      header: "هزینه‌ها",
      cell: ({ row }) => (
        <span className={cn("tabular-nums", (row.original._count?.materialCosts ?? 0) === 0 && "text-muted-foreground")}>
          {row.original._count?.materialCosts ?? 0}
        </span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: "balanceDue",
      header: "مانده حساب",
      cell: ({ row }) => (
        <span
          className={cn(
            "tabular-nums font-medium",
            row.original.balanceDue > 0 ? "text-rose-600" : "text-muted-foreground"
          )}
          dir="ltr"
        >
          {formatCurrency(row.original.balanceDue)}
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
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(row.original.id);
            }}
            title="مشاهده جزئیات"
          >
            <Icon name="eye" size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(row.original);
            }}
            title="ویرایش"
          >
            <Icon name="edit" size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 hover:text-rose-600"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`حذف "${row.original.name}"؟ این عمل قابل بازگشت نیست.`)) {
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
        title="تامین‌کنندگان"
        description="نمای ۳۶۰ درجه تامین‌کنندگان، خدمات و هزینه‌ها"
        icon="suppliers"
        actions={
          <Button onClick={openNew} className="gap-2">
            <Icon name="plus" size={16} /> تامین‌کننده جدید
          </Button>
        }
      />

      <Card className="p-4">
        <DataTable
          columns={columns}
          data={suppliers}
          isLoading={isLoading}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          searchPlaceholder="جستجوی نام یا تلفن..."
          pageSize={10}
          onRowClick={(s) => setSelectedId(s.id)}
          toolbar={
            <div className="flex items-center gap-2">
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="همه دسته‌ها" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه دسته‌ها</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={subcategoryId} onValueChange={setSubcategoryId} disabled={categoryId === "all"}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="همه زیردسته‌ها" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه زیردسته‌ها</SelectItem>
                  {subcategoryOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
          emptyState={
            <EmptyState
              icon="suppliers"
              title="تامین‌کننده‌ای یافت نشد"
              description="اولین تامین‌کننده را اضافه کنید یا فیلترها را تغییر دهید."
              action={
                <Button onClick={openNew} className="gap-2">
                  <Icon name="plus" size={16} /> افزودن تامین‌کننده
                </Button>
              }
            />
          }
        />
      </Card>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "ویرایش تامین‌کننده" : "تامین‌کننده جدید"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>نام تامین‌کننده *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="نام شرکت یا فرد"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>شماره تلفن</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  dir="ltr"
                  placeholder="0912..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>شخص مسئول</Label>
                <Input
                  value={form.contactPerson}
                  onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                  placeholder="نام شخص رابط"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>نشانی</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="نشانی کامل"
              />
            </div>
            <div className="space-y-1.5">
              <Label>دسته / زیردسته</Label>
              <Select
                value={form.subcategoryId}
                onValueChange={(v) => setForm({ ...form, subcategoryId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب زیردسته..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">ابتدا دسته بسازید</div>
                  ) : (
                    categories.map((c) => (
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
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>یادداشت</Label>
              <Textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                انصراف
              </Button>
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

      {/* Supplier 360 drawer */}
      <SupplierDetailDrawer
        supplierId={selectedId}
        onClose={() => setSelectedId(null)}
        onEdit={(s) => {
          setSelectedId(null);
          openEdit(s);
        }}
        onNavigateCosts={() => navigate("srm", "costs")}
      />
    </div>
  );
}

// ─── Supplier 360° Drawer ─────────────────────────────────────────────
function SupplierDetailDrawer({
  supplierId,
  onClose,
  onEdit,
  onNavigateCosts,
}: {
  supplierId: string | null;
  onClose: () => void;
  onEdit: (s: Supplier) => void;
  onNavigateCosts: () => void;
}) {
  const open = !!supplierId;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["supplier-detail", supplierId],
    queryFn: async () => {
      if (!supplierId) return null;
      const res = await api<{ supplier: SupplierDetail }>(`/api/suppliers/${supplierId}`);
      return res?.supplier ?? null;
    },
    enabled: !!supplierId,
    refetchInterval: open ? 30000 : false,
  });

  const detail = data;
  const notFound = !isLoading && !isError && !detail;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="left" className="w-full sm:max-w-xl overflow-y-auto p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Icon name="suppliers" size={18} className="text-orange-500" />
            نمای ۳۶۰ درجه تامین‌کننده
          </SheetTitle>
          <SheetDescription>اطلاعات کامل، خدمات و هزینه‌ها</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="py-20 flex flex-col items-center gap-2">
            <Icon name="loading" size={28} className="animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">در حال بارگذاری...</span>
          </div>
        ) : isError ? (
          <div className="py-20 flex flex-col items-center gap-2">
            <Icon name="alertTriangle" size={28} className="text-rose-500" />
            <span className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "خطا در بارگذاری تامین‌کننده"}
            </span>
            <Button variant="outline" size="sm" onClick={onClose} className="mt-2">
              بستن
            </Button>
          </div>
        ) : notFound ? (
          <div className="py-20 flex flex-col items-center gap-2">
            <Icon name="alertTriangle" size={28} className="text-amber-500" />
            <span className="text-sm text-muted-foreground">
              تامین‌کننده یافت نشد. ممکن است حذف شده باشد.
            </span>
            <Button variant="outline" size="sm" onClick={onClose} className="mt-2">
              بستن
            </Button>
          </div>
        ) : detail ? (
          <div className="flex flex-col">
            {/* Profile header */}
            <div className="px-5 py-4 border-b bg-muted/30">
              <div className="flex items-start gap-3">
                <div className="size-14 rounded-2xl bg-orange-500 text-white grid place-items-center text-xl font-bold shrink-0">
                  {detail.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold truncate">{detail.name}</h3>
                  {detail.subcategory && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <Icon name="grid" size={12} />
                      {detail.subcategory.category?.name} / {detail.subcategory.name}
                    </div>
                  )}
                  {detail.phone && (
                    <div className="text-sm text-muted-foreground mt-0.5" dir="ltr">
                      {detail.phone}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => onEdit({
                    id: detail.id,
                    name: detail.name,
                    phone: detail.phone,
                    contactPerson: detail.contactPerson,
                    address: detail.address,
                    balanceDue: detail.balanceDue,
                    note: detail.note,
                    subcategoryId: detail.subcategoryId,
                    subcategory: detail.subcategory,
                  })}
                >
                  <Icon name="edit" size={14} /> ویرایش
                </Button>
              </div>

              {/* Stat tiles */}
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="rounded-lg bg-card border p-2 text-center">
                  <div className="text-[10px] text-muted-foreground">خدمات</div>
                  <div className="text-base font-bold tabular-nums">{detail._count.services}</div>
                </div>
                <div className="rounded-lg bg-card border p-2 text-center">
                  <div className="text-[10px] text-muted-foreground">هزینه‌ها</div>
                  <div className="text-base font-bold tabular-nums">{detail._count.materialCosts}</div>
                </div>
                <div className="rounded-lg bg-card border p-2 text-center">
                  <div className="text-[10px] text-muted-foreground">مانده حساب</div>
                  <div className="text-xs font-bold tabular-nums" dir="ltr">
                    {formatCurrency(detail.balanceDue)}
                  </div>
                </div>
              </div>

              {/* Quick info */}
              {(detail.contactPerson || detail.address) && (
                <div className="mt-3 space-y-1.5 text-xs">
                  {detail.contactPerson && (
                    <div className="flex items-center gap-1.5">
                      <Icon name="user" size={12} className="text-muted-foreground" />
                      <span className="text-muted-foreground">شخص مسئول:</span>
                      <span className="font-medium">{detail.contactPerson}</span>
                    </div>
                  )}
                  {detail.address && (
                    <div className="flex items-start gap-1.5">
                      <Icon name="mapPin" size={12} className="text-muted-foreground mt-0.5" />
                      <span className="text-muted-foreground shrink-0">نشانی:</span>
                      <span className="font-medium">{detail.address}</span>
                    </div>
                  )}
                </div>
              )}

              {detail.note && (
                <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2.5 text-xs">
                  <div className="flex items-start gap-1.5">
                    <Icon name="info" size={12} className="text-amber-600 mt-0.5 shrink-0" />
                    <span>{detail.note}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Tabs */}
            <Tabs defaultValue="services" className="flex-1">
              <div className="px-5 pt-3">
                <TabsList className="w-full">
                  <TabsTrigger value="services" className="flex-1 gap-1">
                    <Icon name="task" size={14} />
                    خدمات ({detail.services.length})
                  </TabsTrigger>
                  <TabsTrigger value="costs" className="flex-1 gap-1">
                    <Icon name="coins" size={14} />
                    هزینه‌ها ({detail.materialCosts.length})
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Services tab */}
              <TabsContent value="services" className="px-5 py-3 m-0">
                {detail.services.length === 0 ? (
                  <EmptyState icon="task" title="خدماتی ثبت نشده" />
                ) : (
                  <div className="space-y-2">
                    {detail.services.map((svc) => {
                      const latest = svc.priceLists?.[0];
                      return (
                        <div
                          key={svc.id}
                          className="rounded-lg border p-2.5 hover:bg-accent/40 transition"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{svc.name}</div>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {svc.subcategory && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {svc.subcategory.category?.name} / {svc.subcategory.name}
                                  </span>
                                )}
                                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                                  واحد: {svc.unit}
                                </span>
                              </div>
                              {svc.description && (
                                <div className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                                  {svc.description}
                                </div>
                              )}
                            </div>
                            <div className="text-left shrink-0">
                              {latest ? (
                                <>
                                  <div className="text-sm font-semibold tabular-nums" dir="ltr">
                                    {formatCurrency(latest.price)}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    حداقل: {latest.minQuantity} {svc.unit}
                                  </div>
                                </>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">بدون قیمت</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* Costs tab */}
              <TabsContent value="costs" className="px-5 py-3 m-0">
                <div className="flex items-center justify-end mb-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onNavigateCosts}
                    className="gap-1.5"
                  >
                    <Icon name="arrowLeft" size={14} /> مشاهده در ماژول هزینه‌ها
                  </Button>
                </div>
                {detail.materialCosts.length === 0 ? (
                  <EmptyState icon="coins" title="هزینه‌ای ثبت نشده" />
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
                    {detail.materialCosts.map((c: MaterialCost) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 rounded-lg border p-2.5 hover:bg-accent/40 transition"
                      >
                        <div className="size-9 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 grid place-items-center font-bold text-xs shrink-0">
                          #{c.order?.number ?? "—"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {c.description || c.expenseType?.name || `سفارش #${c.order?.number ?? "—"}`}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {c.order?.customer?.name ?? "—"} • {relativeTime(c.createdAt)}
                          </div>
                        </div>
                        <div className="text-left shrink-0">
                          <div className="text-sm font-semibold tabular-nums" dir="ltr">
                            {formatCurrency(c.amount)}
                          </div>
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full",
                              STATUS_BADGE[c.status] ?? "bg-muted text-muted-foreground"
                            )}
                          >
                            {STATUS_LABEL[c.status] ?? c.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
