"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, EmptyState } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SupplierCategory, Supplier } from "./srm-types";

// Color palette for categories (cycled)
const CATEGORY_COLORS = [
  { bg: "bg-orange-500/10 text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
  { bg: "bg-teal-500/10 text-teal-600 dark:text-teal-400", dot: "bg-teal-500" },
  { bg: "bg-violet-500/10 text-violet-600 dark:text-violet-400", dot: "bg-violet-500" },
  { bg: "bg-rose-500/10 text-rose-600 dark:text-rose-400", dot: "bg-rose-500" },
  { bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  { bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  { bg: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400", dot: "bg-cyan-500" },
  { bg: "bg-pink-500/10 text-pink-600 dark:text-pink-400", dot: "bg-pink-500" },
];

// Icon choices for new categories
const ICON_CHOICES: IconName[] = [
  "grid",
  "suppliers",
  "print",
  "warehouse",
  "package",
  "boxes",
  "layers",
  "tag",
  "wallet",
  "factory",
  "store",
  "building",
];

function colorFor(idx: number) {
  return CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
}

// ─── Component ────────────────────────────────────────────────────────
export function SRMCategories() {
  const invalidate = useInvalidate();
  const navigate = useAppStore((s) => s.navigate);

  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = React.useState<string | null>(null);
  const [catDialogOpen, setCatDialogOpen] = React.useState(false);
  const [subDialogOpen, setSubDialogOpen] = React.useState(false);
  const [catForm, setCatForm] = React.useState({ name: "", icon: "grid" as string });
  const [subForm, setSubForm] = React.useState({ name: "", categoryId: "" });

  // Fetch categories
  const { data, isLoading } = useQuery({
    queryKey: ["supplier-categories"],
    queryFn: () => api<{ categories: SupplierCategory[] }>("/api/supplier-categories"),
    refetchInterval: 30000,
  });
  const categories = data?.categories ?? [];

  // Auto-select first category
  React.useEffect(() => {
    if (!selectedCategoryId && categories.length > 0) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  const selectedCategory = React.useMemo(
    () => categories.find((c) => c.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId]
  );

  // Fetch suppliers for selected subcategory
  const { data: subSuppliersData, isLoading: subSuppliersLoading } = useQuery({
    queryKey: ["suppliers", "by-subcategory", selectedSubcategoryId],
    queryFn: () =>
      api<{ suppliers: Supplier[] }>(
        `/api/suppliers?subcategoryId=${selectedSubcategoryId}`
      ),
    enabled: !!selectedSubcategoryId,
  });
  const subSuppliers = subSuppliersData?.suppliers ?? [];

  // Mutations
  const createCatMut = useMutation({
    mutationFn: (body: typeof catForm) =>
      api("/api/supplier-categories", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate(["supplier-categories", "srm-dashboard"]);
      toast.success("دسته ایجاد شد");
      setCatDialogOpen(false);
      setCatForm({ name: "", icon: "grid" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const createSubMut = useMutation({
    mutationFn: (body: typeof subForm) =>
      api("/api/supplier-subcategories", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate(["supplier-categories", "srm-dashboard"]);
      toast.success("زیردسته ایجاد شد");
      setSubDialogOpen(false);
      setSubForm({ name: "", categoryId: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteCatMut = useMutation({
    mutationFn: (id: string) => api(`/api/supplier-categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["supplier-categories", "srm-dashboard", "suppliers"]);
      toast.success("دسته حذف شد");
      setSelectedCategoryId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteSubMut = useMutation({
    mutationFn: (id: string) => api(`/api/supplier-subcategories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["supplier-categories", "srm-dashboard", "suppliers"]);
      toast.success("زیردسته حذف شد");
      setSelectedSubcategoryId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submitCat(e: React.FormEvent) {
    e.preventDefault();
    createCatMut.mutate(catForm);
  }
  function submitSub(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...subForm, categoryId: subForm.categoryId || selectedCategoryId || "" };
    if (!body.categoryId) {
      toast.error("انتخاب دسته الزامی است");
      return;
    }
    createSubMut.mutate(body);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="دسته‌بندی‌ها"
        description="مدیریت دسته‌بندی‌ها و زیردسته‌های تامین‌کنندگان و خدمات"
        icon="grid"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setSubDialogOpen(true)} className="gap-2">
              <Icon name="plus" size={16} /> زیردسته جدید
            </Button>
            <Button onClick={() => setCatDialogOpen(true)} className="gap-2">
              <Icon name="plus" size={16} /> دسته جدید
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Category list */}
        <Card className="p-0 overflow-hidden lg:col-span-4">
          <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="grid" size={16} className="text-primary" />
              <h3 className="font-semibold text-sm">دسته‌ها ({categories.length})</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setCatDialogOpen(true)}
              title="دسته جدید"
            >
              <Icon name="plus" size={14} />
            </Button>
          </div>
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Icon name="loading" size={16} className="animate-spin" />
              در حال بارگذاری...
            </div>
          ) : categories.length === 0 ? (
            <EmptyState
              icon="grid"
              title="دسته‌ای ثبت نشده"
              description="برای شروع، یک دسته جدید بسازید."
              action={
                <Button size="sm" onClick={() => setCatDialogOpen(true)} className="gap-2">
                  <Icon name="plus" size={14} /> افزودن دسته
                </Button>
              }
            />
          ) : (
            <div className="divide-y max-h-[560px] overflow-y-auto scrollbar-thin">
              {categories.map((c, idx) => {
                const color = colorFor(idx);
                const isSelected = c.id === selectedCategoryId;
                const icon = (c.icon as IconName) || "grid";
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCategoryId(c.id);
                      setSelectedSubcategoryId(null);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition text-right",
                      isSelected && "bg-primary/5 border-r-2 border-primary"
                    )}
                  >
                    <div className={cn("size-9 rounded-lg grid place-items-center shrink-0", color.bg)}>
                      <Icon name={icon} size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {c._count.subcategories} زیردسته
                      </div>
                    </div>
                    <Icon name="chevronLeft" size={14} className="text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Right: Subcategories of selected category */}
        <Card className="p-0 overflow-hidden lg:col-span-8">
          {!selectedCategory ? (
            <EmptyState
              icon="grid"
              title="یک دسته انتخاب کنید"
              description="برای مشاهده زیردسته‌ها، از لیست سمت راست یک دسته انتخاب کنید."
            />
          ) : (
            <>
              <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon name="layers" size={16} className="text-primary shrink-0" />
                  <h3 className="font-semibold text-sm truncate">
                    زیردسته‌های «{selectedCategory.name}»
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    ({selectedCategory.subcategories.length})
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 hover:text-rose-600"
                    onClick={() => {
                      if (confirm(`حذف دسته «${selectedCategory.name}» و همه زیردسته‌های آن؟`)) {
                        deleteCatMut.mutate(selectedCategory.id);
                      }
                    }}
                    title="حذف دسته"
                  >
                    <Icon name="trash" size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => {
                      setSubForm({ name: "", categoryId: selectedCategory.id });
                      setSubDialogOpen(true);
                    }}
                    title="زیردسته جدید"
                  >
                    <Icon name="plus" size={14} />
                  </Button>
                </div>
              </div>

              {selectedCategory.subcategories.length === 0 ? (
                <EmptyState
                  icon="layers"
                  title="زیردسته‌ای ثبت نشده"
                  description="برای این دسته زیردسته‌ای ثبت نشده است."
                  action={
                    <Button
                      size="sm"
                      onClick={() => {
                        setSubForm({ name: "", categoryId: selectedCategory.id });
                        setSubDialogOpen(true);
                      }}
                      className="gap-2"
                    >
                      <Icon name="plus" size={14} /> افزودن زیردسته
                    </Button>
                  }
                />
              ) : (
                <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedCategory.subcategories.map((s) => {
                    const isSel = s.id === selectedSubcategoryId;
                    const supplierCount = s._count?.suppliers ?? 0;
                    const serviceCount = s._count?.services ?? 0;
                    return (
                      <div
                        key={s.id}
                        className={cn(
                          "rounded-lg border p-3 transition cursor-pointer",
                          isSel
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                            : "hover:bg-accent/40"
                        )}
                        onClick={() => setSelectedSubcategoryId(s.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold truncate">{s.name}</div>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="text-[10px] bg-orange-500/10 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1">
                                <Icon name="suppliers" size={10} />
                                {supplierCount} تامین‌کننده
                              </span>
                              <span className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1">
                                <Icon name="task" size={10} />
                                {serviceCount} خدمه
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 hover:text-rose-600 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`حذف زیردسته «${s.name}»؟`)) {
                                deleteSubMut.mutate(s.id);
                              }
                            }}
                            title="حذف زیردسته"
                          >
                            <Icon name="trash" size={12} />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Suppliers in selected subcategory */}
              {selectedSubcategoryId && (
                <div className="border-t">
                  <div className="px-4 py-2.5 bg-muted/20 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs">
                      <Icon name="suppliers" size={14} className="text-orange-500" />
                      <span className="font-medium">تامین‌کنندگان این زیردسته</span>
                      <span className="text-muted-foreground">({subSuppliers.length})</span>
                    </div>
                    <button
                      onClick={() => navigate("srm", "suppliers")}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      همه تامین‌کنندگان <Icon name="arrowLeft" size={11} />
                    </button>
                  </div>
                  {subSuppliersLoading ? (
                    <div className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <Icon name="loading" size={14} className="animate-spin" />
                      در حال بارگذاری...
                    </div>
                  ) : subSuppliers.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      تامین‌کننده‌ای در این زیردسته ثبت نشده است.
                    </div>
                  ) : (
                    <div className="divide-y max-h-72 overflow-y-auto scrollbar-thin">
                      {subSuppliers.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-3 px-4 py-2 hover:bg-accent/40 transition"
                        >
                          <div className="size-8 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 grid place-items-center text-[10px] font-bold shrink-0">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{s.name}</div>
                            <div className="text-[11px] text-muted-foreground" dir="ltr">
                              {s.phone ?? "بدون تلفن"}
                            </div>
                          </div>
                          {s.balanceDue > 0 && (
                            <span className="text-[11px] text-rose-600 tabular-nums" dir="ltr">
                              {formatCurrencyShort(s.balanceDue)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Create category dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>دسته جدید</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCat} className="space-y-4">
            <div className="space-y-1.5">
              <Label>نام دسته *</Label>
              <Input
                value={catForm.name}
                onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                required
                placeholder="مثال: متریال، چاپ، خدمات..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>آیکون</Label>
              <div className="grid grid-cols-6 gap-2">
                {ICON_CHOICES.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setCatForm({ ...catForm, icon: ic })}
                    className={cn(
                      "size-10 rounded-lg border-2 grid place-items-center transition",
                      catForm.icon === ic
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input hover:border-foreground/30 text-muted-foreground"
                    )}
                  >
                    <Icon name={ic} size={18} />
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCatDialogOpen(false)}>
                انصراف
              </Button>
              <Button type="submit" disabled={createCatMut.isPending} className="gap-2">
                {createCatMut.isPending ? (
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

      {/* Create subcategory dialog */}
      <Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>زیردسته جدید</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitSub} className="space-y-4">
            <div className="space-y-1.5">
              <Label>دسته والد *</Label>
              <Select
                value={subForm.categoryId}
                onValueChange={(v) => setSubForm({ ...subForm, categoryId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب دسته..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>نام زیردسته *</Label>
              <Input
                value={subForm.name}
                onChange={(e) => setSubForm({ ...subForm, name: e.target.value })}
                required
                placeholder="مثال: پیپر بگ، کارت ویزیت..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSubDialogOpen(false)}>
                انصراف
              </Button>
              <Button type="submit" disabled={createSubMut.isPending} className="gap-2">
                {createSubMut.isPending ? (
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
    </div>
  );
}

// Small currency formatter (no IQD suffix) for inline use
function formatCurrencyShort(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
