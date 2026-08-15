"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, LoadingState, EmptyState, PriorityBadge } from "@/components/shared";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Task = {
  id: string; title: string; description: string | null; status: string; priority: string;
  dueDate: string | null; module: string; createdAt: string;
};

const STATUS_BADGE: Record<string, string> = {
  todo: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
};
const STATUS_LABEL: Record<string, string> = { todo: "در صف", in_progress: "در حال انجام", done: "انجام شده" };

export function TasksPage() {
  const invalidate = useInvalidate();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", description: "", priority: "normal", dueDate: "", module: "admin" });

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", "admin"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks?module=admin"),
  });
  const tasks = data?.tasks ?? [];

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api("/api/tasks", { method: "POST", body: JSON.stringify({ ...body, dueDate: body.dueDate || null }) }),
    onSuccess: () => { invalidate(["tasks"]); toast.success("تسک ایجاد شد"); setOpen(false); setForm({ title: "", description: "", priority: "normal", dueDate: "", module: "admin" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: { key: string; label: string }[] = [
    { key: "todo", label: "در صف" },
    { key: "in_progress", label: "در حال انجام" },
    { key: "done", label: "انجام شده" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="تسک‌ها"
        description="مدیریت کارها و وظایف"
        icon="task"
        actions={<Button onClick={() => setOpen(true)} className="gap-2"><Icon name="plus" size={16} /> تسک جدید</Button>}
      />

      {isLoading ? <LoadingState /> : tasks.length === 0 && !open ? (
        <Card className="p-0"><EmptyState icon="task" title="تسکی وجود ندارد" description="اولین تسک را ایجاد کنید." action={<Button onClick={() => setOpen(true)} className="gap-2"><Icon name="plus" size={16} /> افزودن تسک</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {columns.map((col) => {
            const items = tasks.filter((t) => t.status === col.key);
            return (
              <Card key={col.key} className="p-3 flex flex-col max-h-[70vh]">
                <div className="flex items-center justify-between px-2 py-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("size-2.5 rounded-full", col.key === "todo" ? "bg-slate-400" : col.key === "in_progress" ? "bg-amber-500" : "bg-emerald-500")} />
                    <span className="font-medium text-sm">{col.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-2 overflow-y-auto scrollbar-thin flex-1">
                  {items.map((t) => (
                    <div key={t.id} className="rounded-lg border bg-card p-3 hover:shadow-sm transition">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-sm">{t.title}</span>
                        <PriorityBadge priority={t.priority} />
                      </div>
                      {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
                      {t.dueDate && <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1"><Icon name="calendar" size={12} /> {formatDate(t.dueDate)}</div>}
                    </div>
                  ))}
                  {items.length === 0 && <div className="text-center text-xs text-muted-foreground py-6">خالی</div>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>تسک جدید</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form); }} className="space-y-4">
            <div className="space-y-1.5"><Label>عنوان *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label>توضیحات</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>اولویت</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="normal">معمولی</SelectItem><SelectItem value="urgent">فوری</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>تاریخ سررسید</Label><DatePicker value={form.dueDate || null} onChange={(d) => setForm({ ...form, dueDate: d ? d.toISOString().slice(0,10) : "" })} placeholder="انتخاب تاریخ" /></div>
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
