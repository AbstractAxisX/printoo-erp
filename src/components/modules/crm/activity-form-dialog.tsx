"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Icon } from "@/lib/icons";
import { toast } from "sonner";
import {
  type Activity,
  type ActivityType,
  ACTIVITY_TYPES,
  ACTIVITY_META,
} from "./crm-types";

type CustomerOption = { id: string; name: string };
type DealOption = { id: string; title: string; customerId: string };

type ActivityFormValues = {
  type: ActivityType;
  title: string;
  description: string;
  customerId: string;
  dealId: string;
  date: Date | null;
};

const EMPTY: ActivityFormValues = {
  type: "call",
  title: "",
  description: "",
  customerId: "",
  dealId: "",
  date: null,
};

export function ActivityFormDialog({
  open,
  onOpenChange,
  activity,
  customers,
  deals,
  defaultCustomerId,
  defaultDealId,
  defaultType,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activity?: Activity | null;
  customers: CustomerOption[];
  deals: DealOption[];
  defaultCustomerId?: string;
  defaultDealId?: string;
  defaultType?: ActivityType;
  onSaved?: () => void;
}) {
  const invalidate = useInvalidate();
  const isEdit = !!activity;
  const [form, setForm] = React.useState<ActivityFormValues>(EMPTY);

  React.useEffect(() => {
    if (!open) return;
    if (activity) {
      setForm({
        type: activity.type,
        title: activity.title,
        description: activity.description || "",
        customerId: activity.customerId || "",
        dealId: activity.dealId || "",
        date: new Date(activity.date),
      });
    } else {
      setForm({
        ...EMPTY,
        type: defaultType || "call",
        customerId: defaultCustomerId || "",
        dealId: defaultDealId || "",
        date: new Date(),
      });
    }
  }, [open, activity, defaultCustomerId, defaultDealId, defaultType]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        type: form.type,
        title: form.title,
        description: form.description || null,
        customerId: form.customerId || null,
        dealId: form.dealId || null,
        date: (form.date ?? new Date()).toISOString(),
      };
      if (isEdit && activity) {
        return api(`/api/activities/${activity.id}`, { method: "PUT", body: JSON.stringify(body) });
      }
      return api("/api/activities", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      invalidate(["activities", "crm-activities", "crm-dashboard", "customers", "deals"]);
      toast.success(isEdit ? "فعالیت ویرایش شد" : "فعالیت ثبت شد");
      onOpenChange(false);
      onSaved?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("عنوان فعالیت الزامی است");
      return;
    }
    saveMut.mutate();
  }

  // Filter deals by customer
  const availableDeals = form.customerId
    ? deals.filter((d) => d.customerId === form.customerId)
    : deals;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="task" size={18} className="text-primary" />
            {isEdit ? "ویرایش فعالیت" : "ثبت فعالیت جدید"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? "اطلاعات فعالیت را به‌روزرسانی کنید" : "تماس، جلسه یا تعامل با مشتری را ثبت کنید"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>نوع فعالیت</Label>
            <div className="grid grid-cols-5 gap-1.5">
              {ACTIVITY_TYPES.map((t) => {
                const meta = ACTIVITY_META[t];
                const active = form.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, type: t })}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-input hover:bg-accent"
                    }`}
                  >
                    <div className={`size-7 rounded-lg grid place-items-center ${meta.bg}`}>
                      <Icon name={meta.icon} size={14} className={meta.color} />
                    </div>
                    <span className={`text-[10px] ${active ? "font-semibold" : "text-muted-foreground"}`}>
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="عنوان" required>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="مثلاً: تماس برای پیگیری سفارش کاتالوگ"
              required
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="مشتری">
              <Select
                value={form.customerId || "none"}
                onValueChange={(v) => setForm({ ...form, customerId: v === "none" ? "" : v, dealId: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="معامله مرتبط">
              <Select
                value={form.dealId || "none"}
                onValueChange={(v) => setForm({ ...form, dealId: v === "none" ? "" : v })}
                disabled={availableDeals.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {availableDeals.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="تاریخ و زمان" className="sm:col-span-2">
              <DatePicker
                value={form.date}
                onChange={(d) => setForm({ ...form, date: d })}
              />
            </Field>
          </div>

          <Field label="توضیحات">
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              انصراف
            </Button>
            <Button type="submit" disabled={saveMut.isPending} className="gap-2">
              {saveMut.isPending ? (
                <Icon name="loading" size={16} className="animate-spin" />
              ) : (
                <Icon name="check" size={16} />
              )}
              {isEdit ? "ذخیره تغییرات" : "ثبت فعالیت"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
