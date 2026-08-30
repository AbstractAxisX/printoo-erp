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
import { Slider } from "@/components/ui/slider";
import { Icon } from "@/lib/icons";
import { toast } from "sonner";
import {
  type Deal,
  type DealStage,
  type DealSource,
  STAGE_OPTIONS,
  SOURCE_OPTIONS,
  DEFAULT_PROBABILITY,
  STAGE_COLORS,
  STAGE_LABELS,
} from "./crm-types";

type CustomerOption = { id: string; name: string; phone: string };

type DealFormValues = {
  title: string;
  customerId: string;
  value: number;
  stage: DealStage;
  probability: number;
  expectedCloseDate: Date | null;
  source: DealSource | "";
  description: string;
  assignedTo: string;
};

const EMPTY: DealFormValues = {
  title: "",
  customerId: "",
  value: 0,
  stage: "lead",
  probability: 10,
  expectedCloseDate: null,
  source: "",
  description: "",
  assignedTo: "",
};

export function DealFormDialog({
  open,
  onOpenChange,
  deal,
  customers,
  defaultStage,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  deal?: Deal | null;
  customers: CustomerOption[];
  defaultStage?: DealStage;
  onSaved?: () => void;
}) {
  const invalidate = useInvalidate();
  const isEdit = !!deal;
  const [form, setForm] = React.useState<DealFormValues>(EMPTY);

  React.useEffect(() => {
    if (!open) return;
    if (deal) {
      setForm({
        title: deal.title,
        customerId: deal.customerId,
        value: deal.value,
        stage: deal.stage,
        probability: deal.probability,
        expectedCloseDate: deal.expectedCloseDate ? new Date(deal.expectedCloseDate) : null,
        source: (deal.source as DealSource) || "",
        description: deal.description || "",
        assignedTo: deal.assignedTo || "",
      });
    } else {
      const stage = defaultStage || "lead";
      setForm({ ...EMPTY, stage, probability: DEFAULT_PROBABILITY[stage] });
    }
  }, [open, deal, defaultStage]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        title: form.title,
        customerId: form.customerId,
        value: Number(form.value) || 0,
        stage: form.stage,
        probability: Number(form.probability) || 0,
        expectedCloseDate: form.expectedCloseDate?.toISOString() ?? null,
        source: form.source || null,
        description: form.description || null,
        assignedTo: form.assignedTo || null,
      };
      if (isEdit && deal) {
        return api(`/api/deals/${deal.id}`, { method: "PUT", body: JSON.stringify(body) });
      }
      return api("/api/deals", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      invalidate(["deals", "crm-dashboard", "crm-activities", "customers"]);
      toast.success(isEdit ? "معامله ویرایش شد" : "معامله ایجاد شد");
      onOpenChange(false);
      onSaved?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("عنوان معامله الزامی است");
      return;
    }
    if (!form.customerId) {
      toast.error("انتخاب مشتری الزامی است");
      return;
    }
    saveMut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="orders" size={18} className="text-primary" />
            {isEdit ? "ویرایش معامله" : "معامله جدید"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? "اطلاعات معامله را به‌روزرسانی کنید" : "یک معامله جدید در قیف فروش ایجاد کنید"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="عنوان معامله" required>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="مثلاً: چاپ کاتالوگ ۵۰۰ نسخه"
              required
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="مشتری" required>
              <Select
                value={form.customerId}
                onValueChange={(v) => setForm({ ...form, customerId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب مشتری..." />
                </SelectTrigger>
                <SelectContent>
                  {customers.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                      ابتدا یک مشتری ایجاد کنید
                    </div>
                  ) : (
                    customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground mx-1">•</span>
                        <span dir="ltr" className="text-xs">{c.phone}</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Field>

            <Field label="ارزش معامله (IQD)">
              <Input
                type="number"
                value={form.value || ""}
                onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                dir="ltr"
                min={0}
              />
            </Field>

            <Field label="مرحله">
              <Select
                value={form.stage}
                onValueChange={(v) => {
                  const stage = v as DealStage;
                  setForm({ ...form, stage, probability: DEFAULT_PROBABILITY[stage] });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`size-1.5 rounded-full ${STAGE_COLORS[s.value].dot}`} />
                        {s.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="منبع">
              <Select
                value={form.source || "none"}
                onValueChange={(v) => setForm({ ...form, source: v === "none" ? "" : (v as DealSource) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {SOURCE_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="تاریخ بسته شدن پیش‌بینی">
              <DatePicker
                value={form.expectedCloseDate}
                onChange={(d) => setForm({ ...form, expectedCloseDate: d })}
              />
            </Field>

            <Field label="مسئول">
              <Input
                value={form.assignedTo}
                onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
              />
            </Field>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>احتمال موفقیت</Label>
              <span className="text-sm font-semibold tabular-nums" dir="ltr">
                {form.probability}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={5}
              value={[form.probability]}
              onValueChange={(v) => setForm({ ...form, probability: v[0] ?? 0 })}
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>کم</span>
              <span>متوسط</span>
              <span>زیاد</span>
            </div>
          </div>

          <Field label="توضیحات">
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
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
              {isEdit ? "ذخیره تغییرات" : "ایجاد معامله"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StageBadge({ stage }: { stage: DealStage }) {
  const color = STAGE_COLORS[stage];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${color.bg} ${color.text}`}
    >
      <span className={`size-1.5 rounded-full ${color.dot}`} />
      {STAGE_LABELS[stage]}
    </span>
  );
}
