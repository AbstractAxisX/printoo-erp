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

  return (
    <div className="space-y-5">
      <PageHeader
        title="تامین‌کنندگان (SRM)"
        description="مدیریت تامین‌کنندگان و چاپخانه‌های خارجی"
        icon="suppliers"
        actions={
          <>
            <div className="relative">
              <Icon name="search" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو..." className="pr-9 w-56" />
            </div>
            <Button onClick={() => setOpen(true)} className="gap-2"><Icon name="plus" size={16} /> تامین‌کننده جدید</Button>
          </>
        }
      />

      <Card className="p-0 overflow-hidden">
        {isLoading ? <LoadingState /> : suppliers.length === 0 ? (
          <EmptyState icon="suppliers" title="تامین‌کننده‌ای یافت نشد" description="اولین تامین‌کننده را اضافه کنید." action={<Button onClick={() => setOpen(true)} className="gap-2"><Icon name="plus" size={16} /> افزودن</Button>} />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-right font-medium px-4 py-3">نام</th>
                  <th className="text-right font-medium px-4 py-3">تلفن</th>
                  <th className="text-right font-medium px-4 py-3">مسئول ارتباط</th>
                  <th className="text-right font-medium px-4 py-3">مانده بدهی</th>
                  <th className="text-right font-medium px-4 py-3">تاریخ ثبت</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-accent/40 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="size-8 rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-950/40 grid place-items-center">
                          <Icon name="building" size={16} />
                        </div>
                        <span className="font-medium">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">{s.phone || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.contactPerson || "—"}</td>
                    <td className="px-4 py-3" dir="ltr">{formatCurrency(s.balanceDue)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
