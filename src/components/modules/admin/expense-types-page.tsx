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
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

type ExpenseType = {
  id: string; name: string; isDefault: boolean; createdAt: string;
};

export function ExpenseTypesPage() {
  const invalidate = useInvalidate();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["expense-types"],
    queryFn: () => api<{ expenseTypes: ExpenseType[] }>("/api/expense-types"),
    refetchInterval: 30000,
  });
  const types = data?.expenseTypes ?? [];

  const createMut = useMutation({
    mutationFn: (n: string) => api("/api/expense-types", { method: "POST", body: JSON.stringify({ name: n }) }),
    onSuccess: () => { invalidate(["expense-types"]); toast.success("نوع هزینه ایجاد شد"); setOpen(false); setName(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/expense-types/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(["expense-types"]); toast.success("حذف شد"); setDeleteId(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: ColumnDef<ExpenseType>[] = [
    { accessorKey: "name", header: "نام نوع هزینه", cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center"><Icon name="tag" size={16} /></div>
        <span className="font-medium">{row.original.name}</span>
        {row.original.isDefault && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">پیش‌فرض</span>}
      </div>
    ), enableSorting: true },
    { accessorKey: "createdAt", header: "تاریخ ثبت", cell: ({ row }) => <span className="text-muted-foreground text-xs">{formatDate(row.original.createdAt)}</span>, enableSorting: true },
    { id: "actions", header: () => <div className="text-center">عملیات</div>, cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Button variant="ghost" size="icon" className="size-8 hover:text-rose-600" onClick={(e) => { e.stopPropagation(); setDeleteId(row.original.id); }} title="حذف" disabled={row.original.isDefault}>
          <Icon name="trash" size={16} />
        </Button>
      </div>
    ), enableSorting: false, meta: { hideable: false } },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="انواع هزینه" description="مدیریت انواع هزینه برای ثبت هزینه‌های چاپ و انبار" icon="tag"
        actions={<Button onClick={() => setOpen(true)} className="gap-2"><Icon name="plus" size={16} /> نوع هزینه جدید</Button>} />
      <Card className="p-4">
        <DataTable columns={columns} data={types} isLoading={isLoading} pageSize={10}
          emptyState={<EmptyState icon="tag" title="نوع هزینه‌ای یافت نشد" action={<Button onClick={() => setOpen(true)} className="gap-2"><Icon name="plus" size={16} /> افزودن</Button>} />} />
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>نوع هزینه جدید</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) createMut.mutate(name.trim()); }} className="space-y-4">
            <div className="space-y-1.5"><Label>نام *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
              <Button type="submit" disabled={createMut.isPending} className="gap-2">{createMut.isPending ? <Icon name="loading" size={16} className="animate-spin" /> : <Icon name="check" size={16} />} ذخیره</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>حذف نوع هزینه</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">آیا مطمئن هستید؟</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>انصراف</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMut.mutate(deleteId)} className="gap-2"><Icon name="trash" size={16} /> حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
