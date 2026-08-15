"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";

type Product = {
  id: string; name: string; description: string | null; unit: string; basePrice: number | null; createdAt: string;
};

export function ProductsPage() {
  const invalidate = useInvalidate();
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", description: "", unit: "عدد", basePrice: "" });
  const [view, setView] = React.useState<"grid" | "table">("table");

  const { data, isLoading } = useQuery({
    queryKey: ["products", search],
    queryFn: () => api<{ products: Product[] }>(`/api/products${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });
  const products = data?.products ?? [];

  const createMut = useMutation({
    mutationFn: (body: { name: string; description: string; unit: string; basePrice: number | null }) =>
      api("/api/products", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(["products", "products-list", "products-wizard", "dashboard"]); toast.success("محصول ایجاد شد"); setOpen(false); setForm({ name: "", description: "", unit: "عدد", basePrice: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = React.useMemo<ColumnDef<Product>[]>(() => [
    {
      accessorKey: "name",
      header: "نام محصول",
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
            <Icon name="package" size={18} />
          </div>
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-muted-foreground">{row.original.unit}</div>
          </div>
        </div>
      ),
      enableSorting: true,
    },
    {
      accessorKey: "description",
      header: "توضیحات",
      cell: ({ row }) => <span className="text-sm text-muted-foreground line-clamp-1 max-w-[300px]">{row.original.description || "—"}</span>,
    },
    {
      accessorKey: "basePrice",
      header: "قیمت پایه",
      cell: ({ row }) => <span className="tabular-nums font-semibold" dir="ltr">{row.original.basePrice ? formatCurrency(row.original.basePrice) : "—"}</span>,
      enableSorting: true,
    },
    {
      accessorKey: "createdAt",
      header: "تاریخ ثبت",
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{formatDate(row.original.createdAt)}</span>,
      enableSorting: true,
    },
  ], []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="محصولات"
        description="مدیریت محصولات و خدمات قابل ارائه"
        icon="package"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border p-0.5">
              <button onClick={() => setView("table")} className={`px-2.5 py-1 rounded text-xs flex items-center gap-1 ${view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                <Icon name="grid" size={13} /> جدول
              </button>
              <button onClick={() => setView("grid")} className={`px-2.5 py-1 rounded text-xs flex items-center gap-1 ${view === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                <Icon name="layers" size={13} /> کارت
              </button>
            </div>
            <Button onClick={() => setOpen(true)} className="gap-2"><Icon name="plus" size={16} /> محصول جدید</Button>
          </div>
        }
      />

      {view === "table" ? (
        <Card className="p-4">
          <DataTable
            columns={columns}
            data={products}
            isLoading={isLoading}
            globalFilter={search}
            onGlobalFilterChange={setSearch}
            searchPlaceholder="جستجوی محصول..."
            pageSize={10}
            emptyState={
              <EmptyState
                icon="package"
                title="محصولی یافت نشد"
                description="اولین محصول را اضافه کنید."
                action={<Button onClick={() => setOpen(true)} className="gap-2"><Icon name="plus" size={16} /> افزودن محصول</Button>}
              />
            }
          />
        </Card>
      ) : isLoading ? (
        <LoadingState />
      ) : products.length === 0 ? (
        <Card className="p-0"><EmptyState icon="package" title="محصولی یافت نشد" action={<Button onClick={() => setOpen(true)} className="gap-2"><Icon name="plus" size={16} /> افزودن محصول</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((p) => (
            <Card key={p.id} className="p-4 hover:shadow-md transition">
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                  <Icon name="package" size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{p.unit}</div>
                </div>
              </div>
              {p.description && <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{p.description}</p>}
              <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <span className="text-sm font-semibold tabular-nums" dir="ltr">{p.basePrice ? formatCurrency(p.basePrice) : "—"}</span>
                <span className="text-[11px] text-muted-foreground">{formatDate(p.createdAt)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>محصول جدید</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createMut.mutate({ name: form.name, description: form.description, unit: form.unit, basePrice: form.basePrice ? Number(form.basePrice) : null }); }} className="space-y-4">
            <div className="space-y-1.5"><Label>نام محصول *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>واحد</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>قیمت پایه (IQD)</Label><Input value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} type="number" dir="ltr" /></div>
            </div>
            <div className="space-y-1.5"><Label>توضیحات</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
              <Button type="submit" disabled={createMut.isPending} className="gap-2">
                {createMut.isPending ? <Icon name="loading" size={16} className="animate-spin" /> : <Icon name="check" size={16} />}
                ذخیره
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
