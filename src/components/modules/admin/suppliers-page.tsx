"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/shared";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";

type Supplier = {
  id: string; name: string; phone: string | null; contactPerson: string | null;
  address: string | null; balanceDue: number; note: string | null; createdAt: string;
};

export function SuppliersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", phone: "", contactPerson: "", address: "", note: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["suppliers", search],
    queryFn: () => api<{ suppliers: Supplier[] }>(`/api/suppliers${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });
  const suppliers = data?.suppliers ?? [];

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api("/api/suppliers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); toast.success("تامین‌کننده ایجاد شد"); setOpen(false); setForm({ name: "", phone: "", contactPerson: "", address: "", note: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = React.useMemo<ColumnDef<Supplier>[]>(() => [
    {
      accessorKey: "name",
      header: "نام",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-950/40 grid place-items-center">
            <Icon name="building" size={16} />
          </div>
          <span className="font-medium">{row.original.name}</span>
        </div>
      ),
      enableSorting: true,
    },
    {
      accessorKey: "phone",
      header: "تلفن",
      cell: ({ row }) => <span className="text-muted-foreground tabular-nums" dir="ltr">{row.original.phone || "—"}</span>,
    },
    {
      accessorKey: "contactPerson",
      header: "مسئول ارتباط",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.contactPerson || "—"}</span>,
    },
    {
      accessorKey: "balanceDue",
      header: "مانده بدهی",
      cell: ({ row }) => <span className="tabular-nums font-medium" dir="ltr">{formatCurrency(row.original.balanceDue)}</span>,
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
        title="تامین‌کنندگان (SRM)"
        description="مدیریت تامین‌کنندگان و چاپخانه‌های خارجی"
        icon="suppliers"
        actions={<Button onClick={() => setOpen(true)} className="gap-2"><Icon name="plus" size={16} /> تامین‌کننده جدید</Button>}
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
          emptyState={
            <EmptyState
              icon="suppliers"
              title="تامین‌کننده‌ای یافت نشد"
              description="اولین تامین‌کننده را اضافه کنید."
              action={<Button onClick={() => setOpen(true)} className="gap-2"><Icon name="plus" size={16} /> افزودن</Button>}
            />
          }
        />
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>تامین‌کننده جدید</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form); }} className="space-y-4">
            <div className="space-y-1.5"><Label>نام تامین‌کننده *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>تلفن</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" /></div>
              <div className="space-y-1.5"><Label>مسئول ارتباط</Label><Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>آدرس</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></div>
            <div className="space-y-1.5"><Label>یادداشت</Label><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} /></div>
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
