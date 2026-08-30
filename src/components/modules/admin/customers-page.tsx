"use client";

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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";

type Customer = {
  id: string; name: string; phone: string; isFavorite: boolean; balanceDue: number;
  note: string | null; createdAt: string; _count?: { orders: number };
};

export function CustomersPage() {
  const invalidate = useInvalidate();
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
    onSuccess: () => { invalidate(["customers", "customers-list", "customers-wizard", "dashboard"]); toast.success("مشتری ایجاد شد"); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: (body: typeof form) => api(`/api/customers/${editing?.id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(["customers", "customers-list", "customers-wizard", "dashboard"]); toast.success("مشتری ویرایش شد"); setOpen(false); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/customers/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(["customers", "customers-list", "customers-wizard", "dashboard"]); toast.success("مشتری حذف شد"); },
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
    if (editing) {
      updateMut.mutate(form);
    } else {
      createMut.mutate(form);
    }
  }

  const columns: ColumnDef<Customer>[] = [
    {
      accessorKey: "name",
      header: "نام مشتری",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.isFavorite && <Icon name="star" size={14} className="text-amber-500" />}
          <span className="font-medium">{row.original.name}</span>
        </div>
      ),
      enableSorting: true,
    },
    {
      accessorKey: "phone",
      header: "تلفن",
      cell: ({ row }) => <span className="text-muted-foreground tabular-nums" dir="ltr">{row.original.phone}</span>,
      enableSorting: true,
    },
    {
      id: "orders",
      accessorFn: (r) => r._count?.orders ?? 0,
      header: "سفارش‌ها",
      cell: ({ row }) => <span className="tabular-nums">{row.original._count?.orders ?? 0}</span>,
      enableSorting: true,
    },
    {
      accessorKey: "balanceDue",
      header: "مانده حساب",
      cell: ({ row }) => <span className="tabular-nums font-medium" dir="ltr">{formatCurrency(row.original.balanceDue)}</span>,
      enableSorting: true,
    },
    {
      accessorKey: "createdAt",
      header: "تاریخ ثبت",
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{formatDate(row.original.createdAt)}</span>,
      enableSorting: true,
    },
    {
      id: "actions",
      header: () => <div className="text-center">عملیات</div>,
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-0.5">
          <Button variant="ghost" size="icon" className="size-8" onClick={(e) => { e.stopPropagation(); openEdit(row.original); }} title="ویرایش">
            <Icon name="edit" size={16} />
          </Button>
          <Button variant="ghost" size="icon" className="size-8 hover:text-rose-600" onClick={(e) => { e.stopPropagation(); if (confirm(`حذف "${row.original.name}"؟`)) deleteMut.mutate(row.original.id); }} title="حذف">
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
        title="مشتریان (CRM)"
        description="مدیریت مشتریان و ارتباطات"
        icon="customers"
        actions={<Button onClick={openNew} className="gap-2"><Icon name="plus" size={16} /> مشتری جدید</Button>}
      />

      <Card className="p-4">
        <DataTable
          columns={columns}
          data={customers}
          isLoading={isLoading}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          searchPlaceholder="جستجوی نام یا تلفن..."
          pageSize={10}
          emptyState={
            <EmptyState
              icon="customers"
              title="مشتری‌ای یافت نشد"
              description="اولین مشتری خود را اضافه کنید."
              action={<Button onClick={openNew} className="gap-2"><Icon name="plus" size={16} /> افزودن مشتری</Button>}
            />
          }
        />
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editing ? "ویرایش مشتری" : "مشتری جدید"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Field label="نام مشتری" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="شماره تلفن" required>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required dir="ltr" placeholder="0912..." />
            </Field>
            <div className="flex items-center gap-2">
              <ToggleButton checked={form.isFavorite} onChange={(v) => setForm({ ...form, isFavorite: v })} id="fav" label="مشتری ویژه" />
            </div>
            <Field label="یادداشت">
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="gap-2">
                {(createMut.isPending || updateMut.isPending) ? <Icon name="loading" size={16} className="animate-spin" /> : <Icon name="check" size={16} />}
                {editing ? "ذخیره تغییرات" : "ذخیره"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
