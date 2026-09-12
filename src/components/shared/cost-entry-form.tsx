"use client";

// ─── Phase 15: فرم ثبت هزینه — عین «افزودن آیتم» ویزارد سفارش ──────
// همان زبان بصری ItemRow ویزارد: ردیف‌های جمع‌وجور با فیلدهای notch،
// دکمهٔ «افزودن ردیف دیگر»، جمع زنده و اعتبارسنجی بصری.
//
// حالت‌ها:
//   mode="order"  + orderId         → فرم داخل مودال سفارش (چاپ/لجستیک)
//   mode="order"  + selectableOrder → فرم مالی (دراپ‌داون سرچ سفارش +
//                                     گزینهٔ «ثبت هزینه در فاکتور»)
//   mode="free"                     → هزینهٔ آزاد مالی (کرایه، حقوق…)

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { safeUuid } from "@/lib/safe-uuid";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/shared/search-select";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────

export type UploadedFile = { url: string; fileName: string; mimeType: string; size: number };

type CostDraft = {
  key: string;
  title: string;
  amount: string;
  supplierId: string;
  expenseTypeId: string;
  description: string;
  module: string;
  includeInInvoice: boolean;
  attachments: UploadedFile[];
};

type OrderOption = {
  id: string;
  number: number;
  customerName: string;
  totalAmount: number;
  status: string;
  preInvoiceCount: number;
};

// ─── Phase 17-A: ردیف خام GET /api/orders ──────────────────────────
// هر دو شکل سرور را می‌پذیرد (رفع باگ «undefined» در دراپ‌داون سفارش):
//  • شکل تخت (Phase 17+): customerName / preInvoiceCount
//  • شکل تودرتو (قدیمی): customer.name / _count.preInvoices
type OrderApiRow = {
  id: string;
  number: number;
  totalAmount: number;
  status: string;
  customerName?: string;
  preInvoiceCount?: number;
  customer?: { name?: string | null } | null;
  _count?: { preInvoices?: number } | null;
};

/** نرمال‌سازی ردیف سفارش → OrderOption (بدون undefined در هر شکلی) */
function toOrderOption(o: OrderApiRow): OrderOption {
  return {
    id: o.id,
    number: o.number,
    customerName: o.customerName ?? o.customer?.name ?? "—",
    totalAmount: o.totalAmount,
    status: o.status,
    preInvoiceCount: o.preInvoiceCount ?? o._count?.preInvoices ?? 0,
  };
}

export const MODULE_LABELS: Record<string, string> = {
  print: "چاپ",
  material: "متریال",
  warehouse: "انبار",
  logistics: "لجستیک",
  finance: "مالی",
};

type CostEntryFormProps = {
  mode: "order" | "free";
  /** سفارش ثابت (فرم داخل مودال سفارش چاپ/لجستیک) */
  orderId?: string;
  /** دراپ‌داون سرچ سفارش (فرم مالی) */
  selectableOrder?: boolean;
  /** ماژول‌های قابل انتخاب برای ثبت (پنل چاپ: [print, material]) */
  modules?: string[];
  /** ماژول ثابت (لجستیک: warehouse؛ آزاد: finance) */
  fixedModule?: string;
  /** انتخاب تامین‌کننده (پیش‌فرض: حالت سفارش) */
  showSupplier?: boolean;
  /** گزینهٔ «ثبت هزینه در فاکتور» (فقط مالی) */
  showInvoiceOption?: boolean;
  /** دکمهٔ مدیریت دسته‌ها (هزینهٔ آزاد) */
  onManageCategories?: () => void;
  /** بعد از ثبت موفق */
  onSubmitted?: () => void;
  className?: string;
  /** لیبل دکمهٔ ثبت */
  submitLabel?: string;
};

// ─── Upload helper (همان قرارداد /api/uploads) ────────────────────────

async function uploadFiles(files: File[]): Promise<UploadedFile[]> {
  const out: UploadedFile[] = [];
  for (const f of files) {
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    if (!res.ok) {
      let msg = `آپلود «${f.name}» ناموفق بود`;
      try {
        const data = await res.json();
        if (data.error) msg = data.error;
      } catch {}
      throw new Error(msg);
    }
    const data = (await res.json()) as { files: UploadedFile[] };
    out.push(...data.files);
  }
  return out;
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function newDraft(module: string): CostDraft {
  return {
    key: safeUuid(),
    title: "",
    amount: "",
    supplierId: "",
    expenseTypeId: "",
    description: "",
    module,
    includeInInvoice: false,
    attachments: [],
  };
}

// ─── Component ─────────────────────────────────────────────────────────

export function CostEntryForm({
  mode,
  orderId,
  selectableOrder,
  modules,
  fixedModule,
  showSupplier,
  showInvoiceOption,
  onManageCategories,
  onSubmitted,
  className,
  submitLabel,
}: CostEntryFormProps) {
  const isFree = mode === "free";
  const defaultModule = fixedModule ?? modules?.[0] ?? "print";
  const moduleOptions = modules?.length ? modules : fixedModule ? [fixedModule] : ["print"];

  const [drafts, setDrafts] = React.useState<CostDraft[]>([newDraft(defaultModule)]);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploadingKey, setUploadingKey] = React.useState<string | null>(null);

  // انتخاب سفارش (فرم مالی)
  const [selectedOrder, setSelectedOrder] = React.useState<OrderOption | null>(null);
  const [orderQuery, setOrderQuery] = React.useState("");

  const { data: expenseTypes } = useQuery({
    queryKey: ["expense-types"],
    queryFn: () => api<{ expenseTypes: { id: string; name: string; isDefault: boolean }[] }>("/api/expense-types"),
    staleTime: 60_000,
  });
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api<{ suppliers: { id: string; name: string }[] }>("/api/suppliers"),
    staleTime: 60_000,
    enabled: showSupplier !== false && !isFree,
  });
  const { data: ordersData } = useQuery({
    queryKey: ["orders", "cost-form"],
    queryFn: () => api<{ orders: OrderApiRow[] }>("/api/orders?excludeArchived=false"),
    staleTime: 30_000,
    enabled: !!selectableOrder,
  });

  // نرمال‌شدهٔ سفارش‌ها — هم شکل تخت و هم تودرتو (سرچ/انتخاب روی این می‌نشیند)
  const allOrderOptions = React.useMemo(
    () => (ordersData?.orders ?? []).map(toOrderOption),
    [ordersData]
  );

  // ── draft helpers ──
  const addRow = () => setDrafts((d) => [...d, newDraft(defaultModule)]);
  const removeRow = (key: string) =>
    setDrafts((d) => (d.length === 1 ? [newDraft(defaultModule)] : d.filter((r) => r.key !== key)));
  const updateRow = (key: string, patch: Partial<CostDraft>) =>
    setDrafts((d) => d.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const amountNum = (r: CostDraft) => {
    const n = Number(r.amount);
    return r.amount !== "" && Number.isFinite(n) && n > 0 ? n : 0;
  };
  const rowValid = (r: CostDraft) => amountNum(r) > 0 && r.title.trim().length > 0;
  const totalSum = drafts.reduce((s, r) => s + amountNum(r), 0);
  const validCount = drafts.filter(rowValid).length;

  // سفارش‌های قابل انتخاب (سرچ محلی: نام مشتری / شماره)
  const orderOptions = React.useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    const filtered = q
      ? allOrderOptions.filter(
          (o) =>
            (o.customerName ?? "").toLowerCase().includes(q) ||
            String(o.number).includes(q.replace(/[^0-9]/g, ""))
        )
      : allOrderOptions;
    return filtered.slice(0, 60);
  }, [allOrderOptions, orderQuery]);

  const canSubmit =
    !submitting &&
    drafts.length > 0 &&
    drafts.every(rowValid) &&
    (isFree || !!orderId || !!selectedOrder);

  // ── submit: هر ردیف یک POST ──
  const submit = async () => {
    if (submitting) return;
    if (drafts.some((r) => !rowValid(r))) {
      toast.error("ردیف‌های ناقص را کامل کنید — نام و مبلغ هر هزینه الزامی است");
      return;
    }
    const targetOrderId = isFree ? null : orderId ?? selectedOrder?.id ?? null;
    if (!isFree && !targetOrderId) {
      toast.error("سفارش را انتخاب کنید");
      return;
    }
    setSubmitting(true);
    let ok = 0;
    try {
      for (const r of drafts) {
        const res = await fetch("/api/material-costs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: targetOrderId,
            title: r.title.trim(),
            description: r.description.trim() || null,
            amount: amountNum(r),
            supplierId: r.supplierId || null,
            expenseTypeId: r.expenseTypeId || null,
            module: moduleOptions.length === 1 ? moduleOptions[0] : r.module,
            includeInInvoice: !!r.includeInInvoice,
            attachments: r.attachments,
          }),
        });
        if (res.ok) ok++;
        else {
          const data = await res.json().catch(() => ({}));
          toast.error((data as { error?: string }).error ?? "ثبت هزینه ناموفق بود");
          break;
        }
      }
      if (ok > 0) {
        toast.success(
          ok === 1 ? "هزینه ثبت شد" : `${ok.toLocaleString("fa-IR")} هزینه ثبت شد`
        );
        setDrafts([newDraft(defaultModule)]);
        if (!orderId && !isFree) setSelectedOrder(null);
        onSubmitted?.();
      }
    } catch {
      toast.error("خطای شبکه در ثبت هزینه");
    } finally {
      setSubmitting(false);
    }
  };

  // ── آپلود پیوست برای ردیف ──
  const handleFiles = async (key: string, files: FileList | null) => {
    if (!files || !files.length) return;
    const row = drafts.find((r) => r.key === key);
    if (!row) return;
    const room = 6 - row.attachments.length;
    const arr = Array.from(files).slice(0, Math.max(0, room));
    if (!arr.length) {
      toast.error("حداکثر ۶ پیوست برای هر هزینه");
      return;
    }
    setUploadingKey(key);
    try {
      const uploaded = await uploadFiles(arr);
      updateRow(key, { attachments: [...row.attachments, ...uploaded] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploadingKey(null);
    }
  };

  const expenseOptions = (expenseTypes?.expenseTypes ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }));
  const supplierOptions = (suppliers?.suppliers ?? []).map((s) => ({
    value: s.id,
    label: s.name,
  }));

  return (
    <div className={cn("space-y-3", className)}>
      {/* انتخاب سفارش (فرم مالی — حالت روی سفارش) */}
      {selectableOrder && !isFree && (
        <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
          <Field label="سفارش" required>
            <SearchSelect
              value={selectedOrder?.id ?? null}
              onChange={(v) => {
                const found = allOrderOptions.find((o) => o.id === v) ?? null;
                setSelectedOrder(found);
                setOrderQuery("");
              }}
              placeholder="جستجوی سفارش — نام مشتری یا شماره…"
              searchPlaceholder="نام مشتری / شمارهٔ سفارش…"
              options={orderOptions.map((o) => ({
                value: o.id,
                label: `#${o.number} — ${o.customerName}`,
                sub: `${formatCurrency(o.totalAmount)} • ${o.preInvoiceCount} پیش‌فاکتور`,
              }))}
              allowClear={false}
              className="w-full"
            />
          </Field>
          {selectedOrder && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <Icon name="checkCircle" size={14} className="text-emerald-500" />
              <span>
                سفارش <b className="text-foreground">#{selectedOrder.number}</b> —{" "}
                {selectedOrder.customerName} • جمع:{" "}
                <b dir="ltr" className="text-foreground tabular-nums">
                  {formatCurrency(selectedOrder.totalAmount)}
                </b>
                {selectedOrder.preInvoiceCount > 1 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {" "}
                    • {selectedOrder.preInvoiceCount.toLocaleString("fa-IR")} پیش‌فاکتور (هزینهٔ
                    فاکتوری روی سند اول می‌نشیند)
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ردیف‌های هزینه */}
      <div className="space-y-2">
        {drafts.map((row, i) => {
          const invalid = row.amount !== "" || row.title.trim() !== "";
          const missing = !rowValid(row);
          return (
            <div
              key={row.key}
              className={cn(
                "rounded-xl border bg-card p-3 space-y-3 transition",
                invalid && missing && "border-rose-300 dark:border-rose-900/60"
              )}
            >
              {/* سربرگ ردیف — مثل ItemRow ویزارد */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="size-7 rounded-md bg-primary/10 text-primary grid place-items-center text-xs font-bold shrink-0">
                    {(i + 1).toLocaleString("fa-IR")}
                  </div>
                  <span className="text-sm font-semibold truncate">
                    {row.title.trim() || "ردیف هزینه"}
                  </span>
                  {isFree && row.expenseTypeId && (
                    <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                      {expenseOptions.find((t) => t.value === row.expenseTypeId)?.label ?? "دسته"}
                    </span>
                  )}
                  {row.attachments.length > 0 && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                      {row.attachments.length.toLocaleString("fa-IR")} پیوست
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm font-bold tabular-nums" dir="ltr">
                    {amountNum(row) > 0 ? formatCurrency(amountNum(row)) : "—"}
                  </span>
                  <label className="cursor-pointer" title="پیوست فایل (فاکتور/سند)">
                    <input
                      type="file"
                      multiple
                      className="sr-only"
                      onChange={(e) => handleFiles(row.key, e.target.files)}
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.zip"
                    />
                    <span className="inline-flex items-center justify-center size-8 rounded-md hover:bg-accent transition text-muted-foreground">
                      <Icon
                        name={uploadingKey === row.key ? "loading" : "upload"}
                        size={15}
                        className={uploadingKey === row.key ? "animate-spin" : ""}
                      />
                    </span>
                  </label>
                  {drafts.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-rose-600 hover:text-rose-700"
                      onClick={() => removeRow(row.key)}
                      title="حذف ردیف"
                    >
                      <Icon name="trash" size={15} />
                    </Button>
                  )}
                </div>
              </div>

              {/* فیلدها — گرید ۱۲ ستونه مثل ویزارد */}
              <div className="grid grid-cols-2 md:grid-cols-12 gap-x-3 gap-y-2.5">
                <Field label="نام هزینه" required className="col-span-2 md:col-span-4">
                  <Input
                    value={row.title}
                    onChange={(e) => updateRow(row.key, { title: e.target.value })}
                    placeholder={isFree ? "مثلاً کرایهٔ مغازه" : "مثلاً خرید کاغذ گلاسه"}
                  />
                </Field>
                <Field label="مبلغ (IQD)" required className="col-span-1 md:col-span-3">
                  <Input
                    type="number"
                    min={0}
                    dir="ltr"
                    className="text-center"
                    value={row.amount}
                    onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                    placeholder="0"
                  />
                </Field>
                <Field
                  label={isFree ? "دستهٔ هزینه" : "نوع هزینه"}
                  required={isFree}
                  className="col-span-1 md:col-span-2"
                >
                  <SearchSelect
                    value={row.expenseTypeId || null}
                    onChange={(v) => updateRow(row.key, { expenseTypeId: v ?? "" })}
                    placeholder={isFree ? "انتخاب دسته…" : "اختیاری…"}
                    options={expenseOptions}
                    allowClear={!isFree}
                    className="w-full"
                  />
                </Field>
                {moduleOptions.length > 1 && (
                  <Field label="ثبت از طرف" className="col-span-1 md:col-span-3 ">
                    <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
                      {moduleOptions.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => updateRow(row.key, { module: m })}
                          className={cn(
                            "flex-1 inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition",
                            row.module === m
                              ? "bg-background text-foreground shadow-sm border"
                              : "text-muted-foreground hover:bg-background/60"
                          )}
                        >
                          {MODULE_LABELS[m] ?? m}
                        </button>
                      ))}
                    </div>
                  </Field>
                                  )}
                {!isFree && showSupplier !== false && (
                  <Field label="تامین‌کننده" className="col-span-2 md:col-span-3">
                    <SearchSelect
                      value={row.supplierId || null}
                      onChange={(v) => updateRow(row.key, { supplierId: v ?? "" })}
                      placeholder="اختیاری…"
                      options={supplierOptions}
                      className="w-full"
                    />
                  </Field>
                )}
                <Field label="توضیح" className="col-span-2 md:col-span-5">
                  <Input
                    value={row.description}
                    onChange={(e) => updateRow(row.key, { description: e.target.value })}
                    placeholder="اختیاری…"
                  />
                </Field>
                {showInvoiceOption && !isFree && (
                  <div className="col-span-2 md:col-span-4 flex items-center">
                    <label className="flex items-center gap-2 h-9 w-full px-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition text-xs">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={row.includeInInvoice}
                        onChange={(e) =>
                          updateRow(row.key, { includeInInvoice: e.target.checked })
                        }
                      />
                      <span className="text-muted-foreground">
                        ثبت هزینه در <b className="text-foreground">فاکتور سفارش</b> — به مبلغ
                        کل اضافه می‌شود
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* پیوست‌های ردیف */}
              {row.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {row.attachments.map((a, j) => (
                    <span
                      key={a.url}
                      className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/30 pl-1 pr-2 py-1 text-xs max-w-full"
                    >
                      <Icon name="file" size={13} className="text-primary shrink-0" />
                      <span className="truncate max-w-[160px]">{a.fileName}</span>
                      {formatSize(a.size) && (
                        <span className="text-[10px] text-muted-foreground shrink-0" dir="ltr">
                          {formatSize(a.size)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          updateRow(row.key, {
                            attachments: row.attachments.filter((_, x) => x !== j),
                          })
                        }
                        className="text-muted-foreground hover:text-rose-600 transition shrink-0"
                        title="حذف پیوست"
                      >
                        <Icon name="cancel" size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* فوتر — افزودن ردیف + جمع + ثبت */}
      <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
            <Icon name="plus" size={14} />
            افزودن ردیف هزینه دیگر
          </Button>
          {onManageCategories && (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={onManageCategories}>
              <Icon name="gear" size={14} />
              مدیریت دسته‌ها
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm">
            <span className="text-muted-foreground">مجموع: </span>
            <span className="font-bold" dir="ltr">
              {formatCurrency(totalSum)}
            </span>
          </div>
          <Button
            onClick={submit}
            disabled={!canSubmit}
            className="gap-2"
          >
            <Icon name={submitting ? "loading" : "check"} size={16} className={submitting ? "animate-spin" : ""} />
            {submitLabel ??
              (isFree
                ? "ثبت هزینه"
                : `ثبت ${validCount > 0 ? validCount.toLocaleString("fa-IR") : ""} هزینه`)}
          </Button>
        </div>
      </div>
    </div>
  );
}
