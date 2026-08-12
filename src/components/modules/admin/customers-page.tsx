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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";

type Customer = {
  id: string; name: string; phone: string; isFavorite: boolean; balanceDue: number;
  note: string | null; createdAt: string; _count?: { orders: number };
};

export function CustomersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [form, setForm] = React.useState({ name: "", phone: "", isFavorite: false, note: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["customers", search],
    queryFn: () => api<{ customers: Customer[] }>(`/api/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });
  const customers = data?.customers ?? [];

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api("/api/customers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); toast.success("مشتری ایجاد شد"); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setEditing(null);
    setForm({ name: "", phone: "", isFavorite: false, note: "" });
    setOpen(true);
  }
  function openEdit(c: Customer) {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone, isFavorite: c.isFavorite, note: c.note || "" });
    setOpen(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    createMut.mutate(form);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="مشتریان (CRM)"
        description="مدیریت مشتریان و ارتباطات"
        icon="customers"
        actions={
          <>
            <div className="relative">
              <Icon name="search" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجوی نام یا تلفن..." className="pr-9 w-56" />
            </div>
            <Button onClick={openNew} className="gap-2"><Icon name="plus" size={16} /> مشتری جدید</Button>
          </>
        }
      />

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : customers.length === 0 ? (
          <EmptyState icon="customers" title="مشتری‌ای یافت نشد" description="اولین مشتری خود را اضافه کنید." action={<Button onClick={openNew} className="gap-2"><Icon name="plus" size={16} /> افزودن مشتری</Button>} />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-right font-medium px-4 py-3">نام مشتری</th>
                  <th className="text-right font-medium px-4 py-3">تلفن</th>
                  <th className="text-right font-medium px-4 py-3">سفارش‌ها</th>
                  <th className="text-right font-medium px-4 py-3">مانده حساب</th>
                  <th className="text-right font-medium px-4 py-3">تاریخ ثبت</th>
                  <th className="text-center font-medium px-4 py-3">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-accent/40 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {c.isFavorite && <Icon name="star" size={14} className="text-amber-500" />}
                        <span className="font-medium">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">{c.phone}</td>
                    <td className="px-4 py-3">{c._count?.orders ?? 0}</td>
                    <td className="px-4 py-3" dir="ltr">{formatCurrency(c.balanceDue)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(c.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(c)}>
                          <Icon name="edit" size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "ویرایش مشتری" : "مشتری جدید"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>نام مشتری *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="نام و نام خانوادگی" />
            </div>
            <div className="space-y-1.5">
              <Label>شماره تلفن *</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required dir="ltr" placeholder="0912..." />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isFavorite} onCheckedChange={(v) => setForm({ ...form, isFavorite: v })} id="fav" />
              <Label htmlFor="fav">مشتری ویژه</Label>
            </div>
            <div className="space-y-1.5">
              <Label>یادداشت</Label>
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} />
            </div>
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
