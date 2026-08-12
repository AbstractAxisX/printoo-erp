"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
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
  const qc = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", description: "", unit: "عدد", basePrice: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["products", search],
    queryFn: () => api<{ products: Product[] }>(`/api/products${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });
  const products = data?.products ?? [];

  const createMut = useMutation({
    mutationFn: (body: { name: string; description: string; unit: string; basePrice: number | null }) =>
      api("/api/products", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast.success("محصول ایجاد شد"); setOpen(false); setForm({ name: "", description: "", unit: "عدد", basePrice: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="محصولات"
        description="مدیریت محصولات و خدمات قابل ارائه"
        icon="package"
        actions={
          <>
            <div className="relative">
              <Icon name="search" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو..." className="pr-9 w-56" />
            </div>
            <Button onClick={() => setOpen(true)} className="gap-2"><Icon name="plus" size={16} /> محصول جدید</Button>
          </>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : products.length === 0 ? (
        <Card className="p-0"><EmptyState icon="package" title="محصولی یافت نشد" description="اولین محصول را اضافه کنید." action={<Button onClick={() => setOpen(true)} className="gap-2"><Icon name="plus" size={16} /> افزودن محصول</Button>} /></Card>
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
                <span className="text-sm font-semibold" dir="ltr">{p.basePrice ? formatCurrency(p.basePrice) : "—"}</span>
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
              <div className="space-y-1.5"><Label>قیمت پایه (تومان)</Label><Input value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} type="number" dir="ltr" /></div>
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
