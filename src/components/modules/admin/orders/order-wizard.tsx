"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleButton } from "@/components/ui/toggle-button";
import { DatePicker } from "@/components/ui/date-picker";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect } from "@/components/shared/search-select";
import { PreInvoiceModal } from "@/components/shared/pre-invoice-modal";
import { useAppStore } from "@/stores/app-store";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type ItemDraft = {
  id: string;
  // Phase 10: شناسهٔ واقعی DB — برای merge هوشمند در ویرایش (حفظ تاریخ‌ها/مهرها)
  dbId?: string;
  productId: string;
  productName: string;
  quantity: number;
  pricePerUnit: number;
  note: string;
  description: string;
  stage: "design" | "print" | "warehouse" | "completed" | "archive";
  needsMaterial: boolean;
  // Phase 10: زمان‌بندی per-item (خواستهٔ ۳: «تاریخ طراحی و چاپ برای هر
  // ایتم مجزا ثبت شه») — yyyy-MM-dd
  designStart: string;
  designEnd: string;
  printStart: string;
  printEnd: string;
};

type Customer = { id: string; name: string; phone: string };

type OrderEditData = {
  id: string;
  number: number;
  customerId: string;
  status: string;
  splitMode: string;
  priority: string;
  endDate: string | null;
  noEndDate: boolean;
  note: string | null;
  items: {
    id: string;
    productId: string;
    product: { name: string };
    quantity: number;
    pricePerUnit: number;
    note: string | null;
    description: string | null;
    stage: string;
    needsMaterial: boolean;
    designStartDate: string | null;
    designEndDate: string | null;
    printStartDate: string | null;
    printEndDate: string | null;
  }[];
  preInvoices: {
    id: string;
    number: number;
    status?: string;
    paidAmount: number;
    discountAmount?: number;
    taxRate?: number;
    totalAmount?: number;
    validUntil?: string | null;
    notes?: string | null;
    items: string | null;
  }[];
  invoice: { id: string } | null;
};

const STAGES: { value: ItemDraft["stage"]; label: string }[] = [
  { value: "design", label: "طراح" },
  { value: "print", label: "چاپ" },
  { value: "warehouse", label: "انبار و لجستیک" },
  { value: "completed", label: "تکمیل شده" },
  { value: "archive", label: "آرشیو" },
];

const STEPS = [
  { n: 1, label: "انتخاب مشتری", icon: "customers" as const },
  { n: 2, label: "آیتم‌های سفارش", icon: "orders" as const },
  { n: 3, label: "زمان‌دهی و اولویت", icon: "calendar" as const },
  { n: 4, label: "بازنگری و ثبت", icon: "checkCircle" as const },
];

export function OrderWizardPage() {
  const navigate = useAppStore((s) => s.navigate);
  const invalidate = useInvalidate();

  const [step, setStep] = React.useState(1);
  const [multiMode, setMultiMode] = React.useState(false);
  const [customers, setCustomers] = React.useState<string[]>([]);
  const [activeCustomer, setActiveCustomer] = React.useState<string>("");
  const [itemsByCustomer, setItemsByCustomer] = React.useState<Record<string, ItemDraft[]>>({});

  const [splitMode, setSplitMode] = React.useState<"grouped" | "separated">("grouped");
  const [priority, setPriority] = React.useState<"normal" | "urgent">("normal");
  const [endDate, setEndDate] = React.useState("");
  const [noEndDate, setNoEndDate] = React.useState(false);
  const [note, setNote] = React.useState("");
  // Phase 10: تاریخ‌های طراحی/چاپ per-item شدند (در ItemDraft هر آیتم) —
  // این‌ها فقط ابزار «اعمال روی همه» در مرحلهٔ ۳ هستند.

  const [preInvoiceEnabled, setPreInvoiceEnabled] = React.useState(false);
  // Phase 7 — فرم پیش‌فاکتور حرفه‌ای (جایگزین نقشهٔ per-item paid تستی)
  const [piDiscount, setPiDiscount] = React.useState("");
  const [piTaxRate, setPiTaxRate] = React.useState("");
  const [piPrepaid, setPiPrepaid] = React.useState("");
  const [piValidDays, setPiValidDays] = React.useState("15");
  const [piNotes, setPiNotes] = React.useState("");
  // Phase 10 — در ویرایش، پیش‌فاکتورها فقط خلاصهٔ فقط-خواندنی هستند؛
  // مدیریت کامل (صدور/وضعیت/چاپ) از تب «پیش‌فاکتور» مودال جزئیات انجام می‌شود.
  const [editPreInvoices, setEditPreInvoices] = React.useState<{
    id: string; number: number; status: string; totalAmount: number;
  }[]>([]);
  const [invoiceEnabled, setInvoiceEnabled] = React.useState(false);

  // Phase 8 — حالت موفقیت پس از ثبت + چاپ پیش‌فاکتور بلافاصله
  const [success, setSuccess] = React.useState<{
    orderNumbers: number[];
    orderId: string | null;
    preInvoice: { id: string; number: number } | null;
    preInvoiceCount: number;
  } | null>(null);
  const [piModalOpen, setPiModalOpen] = React.useState(false);

  // Edit mode: read param from store, fetch existing order
  const param = useAppStore((s) => s.param);
  const isEditing = !!param;
  const [loadedOrderId, setLoadedOrderId] = React.useState<string | null>(null);

  const { data: editData, error: editError } = useQuery({
    queryKey: ["order", param],
    queryFn: () => api<{ order: OrderEditData }>(`/api/orders/${param}`),
    enabled: !!param,
  });

  // Populate wizard state from fetched order (edit mode)
  React.useEffect(() => {
    if (!param) {
      setLoadedOrderId(null);
      return;
    }
    if (!editData?.order) return;
    if (loadedOrderId === param) return;

    const order = editData.order;
    // Step 1: customers (single customer for edit)
    setCustomers([order.customerId]);
    setActiveCustomer(order.customerId);
    setMultiMode(false);

    // Step 2: items — Phase 10: dbId برای merge هوشمند + تاریخ‌های per-item
    const items: ItemDraft[] = (order.items ?? []).map((it) => ({
      id: crypto.randomUUID(),
      dbId: it.id,
      productId: it.productId,
      productName: it.product?.name ?? "",
      quantity: it.quantity,
      pricePerUnit: it.pricePerUnit,
      note: it.note ?? "",
      description: it.description ?? "",
      stage: (["design", "print", "warehouse", "completed", "archive"].includes(it.stage)
        ? it.stage
        : "design") as ItemDraft["stage"],
      needsMaterial: !!it.needsMaterial,
      designStart: it.designStartDate ? it.designStartDate.slice(0, 10) : "",
      designEnd: it.designEndDate ? it.designEndDate.slice(0, 10) : "",
      printStart: it.printStartDate ? it.printStartDate.slice(0, 10) : "",
      printEnd: it.printEndDate ? it.printEndDate.slice(0, 10) : "",
    }));
    setItemsByCustomer({ [order.customerId]: items });

    // Step 3: timing
    setSplitMode((order.splitMode as "grouped" | "separated") ?? "grouped");
    setPriority((order.priority as "normal" | "urgent") ?? "normal");
    setEndDate(order.endDate ? order.endDate.slice(0, 10) : "");
    setNoEndDate(!!order.noEndDate);
    setNote(order.note ?? "");

    // Phase 10 — ویرایش: خلاصهٔ فقط-خواندنی پیش‌فاکتورها (مدیریت کامل از
    // مودال جزئیات). فرم PI فقط در حالت «ایجاد» فعال است.
    setEditPreInvoices(
      (order.preInvoices ?? []).map((p) => ({
        id: p.id,
        number: p.number ?? 0,
        status: p.status ?? "draft",
        totalAmount: p.totalAmount ?? 0,
      }))
    );
    setPreInvoiceEnabled(false);
    setInvoiceEnabled(!!order.invoice);

    setLoadedOrderId(param);
  }, [param, editData, loadedOrderId]);

  const showEditLoading = isEditing && loadedOrderId !== param && !editError;

  // ریست کامل ویزارد برای «ثبت سفارش جدید» پس از موفقیت
  function resetWizard() {
    setStep(1);
    setMultiMode(false);
    setCustomers([]);
    setActiveCustomer("");
    setItemsByCustomer({});
    setSplitMode("grouped");
    setPriority("normal");
    setEndDate("");
    setNoEndDate(false);
    setNote("");
    setPreInvoiceEnabled(false);
    setPiDiscount("");
    setPiTaxRate("");
    setPiPrepaid("");
    setPiValidDays("15");
    setPiNotes("");
    setEditPreInvoices([]);
    setInvoiceEnabled(false);
    setSuccess(null);
  }

  const { data: customersData } = useQuery({
    queryKey: ["customers-wizard"],
    queryFn: () => api<{ customers: Customer[] }>("/api/customers"),
  });
  const { data: productsData } = useQuery({
    queryKey: ["products-wizard"],
    queryFn: () => api<{ products: { id: string; name: string; basePrice: number | null }[] }>("/api/products"),
  });

  const allCustomers = customersData?.customers ?? [];
  const allProducts = productsData?.products ?? [];
  const customerOptions = allCustomers.map((c) => ({ value: c.id, label: c.name, sub: c.phone }));

  function addCustomer(id: string) {
    if (!id || customers.includes(id)) return;
    const next = [...customers, id];
    setCustomers(next);
    setActiveCustomer(id);
    setItemsByCustomer((s) => ({ ...s, [id]: s[id] ?? [] }));
  }
  function removeCustomer(id: string) {
    setCustomers((s) => s.filter((c) => c !== id));
    setItemsByCustomer((s) => {
      const n = { ...s };
      delete n[id];
      return n;
    });
    if (activeCustomer === id) setActiveCustomer(customers[0] ?? "");
  }

  function newItem(productId = "", productName = ""): ItemDraft {
    return {
      id: crypto.randomUUID(),
      productId,
      productName,
      quantity: 1,
      pricePerUnit: 0,
      note: "",
      description: "",
      stage: "design",
      needsMaterial: false,
      designStart: "",
      designEnd: "",
      printStart: "",
      printEnd: "",
    };
  }

  function updateItem(cid: string, itemId: string, patch: Partial<ItemDraft>) {
    setItemsByCustomer((s) => ({
      ...s,
      [cid]: (s[cid] ?? []).map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
    }));
  }
  function addItem(cid: string) {
    setItemsByCustomer((s) => ({ ...s, [cid]: [...(s[cid] ?? []), newItem()] }));
  }
  function copyItem(cid: string, itemId: string) {
    setItemsByCustomer((s) => {
      const arr = s[cid] ?? [];
      const idx = arr.findIndex((i) => i.id === itemId);
      if (idx === -1) return s;
      const copy = { ...arr[idx], id: crypto.randomUUID() };
      const next = [...arr];
      next.splice(idx + 1, 0, copy);
      return { ...s, [cid]: next };
    });
  }
  function deleteItem(cid: string, itemId: string) {
    setItemsByCustomer((s) => ({ ...s, [cid]: (s[cid] ?? []).filter((i) => i.id !== itemId) }));
  }

  // determine if any item across customers needs design (R20: useMemo — was recomputed every render)
  const allItemsFlat = React.useMemo(() => Object.values(itemsByCustomer).flat(), [itemsByCustomer]);
  const needsDesign = React.useMemo(() => allItemsFlat.some((i) => i.stage === "design"), [allItemsFlat]);
  const anyCompleted = React.useMemo(() => allItemsFlat.some((i) => i.stage === "completed"), [allItemsFlat]);

  function canGoNext(): boolean {
    if (step === 1) return customers.length > 0;
    if (step === 2) {
      return customers.every((c) => (itemsByCustomer[c]?.length ?? 0) > 0);
    }
    return true;
  }

  // ابزار «اعمال روی همه» مرحلهٔ ۳ — تاریخ‌ها را روی تمام آیتم‌ها می‌نویسد
  function applyDatesToAll(patch: Partial<Pick<ItemDraft, "designStart" | "designEnd" | "printStart" | "printEnd">>) {
    setItemsByCustomer((s) => {
      const next: Record<string, ItemDraft[]> = {};
      for (const [cid, arr] of Object.entries(s)) {
        next[cid] = arr.map((it) => ({ ...it, ...patch }));
      }
      return next;
    });
  }

  const createMut = useMutation<unknown, Error, void>({
    mutationFn: async (): Promise<unknown> => {
      // Build items payload (shared by create & edit) — Phase 10: per-item
      // dates + dbId (merge هوشمند سرور: آیتم موجود درجا آپدیت می‌شود و
      // مهرها/تاریخ‌های تکمیل هرگز نمی‌پرند).
      const cid = customers[0] ?? "";
      const mapDraft = (i: ItemDraft) => ({
        ...(i.dbId ? { id: i.dbId } : {}),
        productId: i.productId,
        quantity: i.quantity,
        pricePerUnit: i.pricePerUnit,
        totalAmount: i.quantity * i.pricePerUnit,
        note: i.note || null,
        description: i.description || null,
        stage: i.stage,
        needsMaterial: i.needsMaterial,
        designStartDate: i.designStart || null,
        designEndDate: i.designEnd || null,
        printStartDate: i.printStart || null,
        printEndDate: i.printEnd || null,
      });
      const items = (itemsByCustomer[cid] ?? []).map(mapDraft);

      if (isEditing && param) {
        // Edit mode: PUT to /api/orders/[id] — آیتم‌ها با id واقعی merge می‌شوند
        const body = {
          customerId: cid,
          items,
          splitMode,
          priority,
          endDate: noEndDate ? null : endDate || null,
          noEndDate,
          note: note || null,
        };
        return api(`/api/orders/${param}`, { method: "PUT", body: JSON.stringify(body) });
      }

      // Create mode: POST to /api/orders
      const body: Record<string, unknown> = {
        customers,
        itemsByCustomer: Object.fromEntries(
          Object.entries(itemsByCustomer).map(([c, list]) => [c, list.map(mapDraft)])
        ),
        splitMode,
        priority,
        endDate: noEndDate ? null : endDate || null,
        noEndDate,
        note: note || null,
        markCompleted: anyCompleted,
      };
      // ─── Phase 10: پیش‌فاکتور — اقلام در «سرور» از خود آیتم‌های واقعی
      // سفارش ساخته می‌شوند (طبق حالت):
      //   مجزا یا چند-مشتری → پیش‌فاکتور per-item (هر آیتم سند خودش)
      //   گروهیِ تک-مشتری → یک سند برای کل گروه
      if (preInvoiceEnabled) {
        body.preInvoice = {
          discountAmount: Number(piDiscount) || 0,
          taxRate: Number(piTaxRate) || 0,
          paidAmount: Number(piPrepaid) || 0,
          validDays: Number(piValidDays) || 15,
          notes: piNotes || null,
        };
      }
      if (invoiceEnabled && anyCompleted) {
        body.invoice = { items: [], totalAmount: 0, paidAmount: 0, discountAmount: 0 };
      }
      return api("/api/orders", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: async (data: unknown) => {
      const res = (data ?? {}) as {
        count?: number;
        created?: { id: string; number: number }[];
        preInvoice?: { id: string; number: number } | null;
        preInvoiceCount?: number;
      };
      invalidate(["orders"]);
      invalidate(["dashboard"]);
      invalidate(["notifications"]);
      invalidate(["order"]);

      if (isEditing) {
        toast.success("تغییرات سفارش ذخیره شد");
        navigate("admin", "orders");
      } else {
        // Phase 8 — به‌جای پرش فوری، صفحهٔ موفقیت با چاپ پیش‌فاکتور
        setSuccess({
          orderNumbers: (res.created ?? []).map((o) => o.number),
          orderId: res.created?.[0]?.id ?? null,
          preInvoice: res.preInvoice ?? null,
          preInvoiceCount: res.preInvoiceCount ?? (res.preInvoice ? 1 : 0),
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isEditing && editError) {
    return (
      <div className="max-w-6xl mx-auto py-20 flex flex-col items-center gap-3">
        <Icon name="alertTriangle" size={32} className="text-rose-500" />
        <p className="text-sm text-muted-foreground">خطا در بارگذاری سفارش</p>
        <Button variant="outline" size="sm" onClick={() => navigate("admin", "orders")} className="gap-2">
          <Icon name="arrowRight" size={14} /> بازگشت به سفارشات
        </Button>
      </div>
    );
  }

  if (showEditLoading) {
    return (
      <div className="max-w-6xl mx-auto py-20 flex flex-col items-center gap-3">
        <Icon name="loading" size={32} className="animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">در حال بارگذاری سفارش...</p>
      </div>
    );
  }

  // ─── Phase 8: صفحهٔ موفقیت پس از ثبت — چاپ پیش‌فاکتور بلافاصله ────────
  if (success) {
    const nums = success.orderNumbers;
    const numsFa = nums.length
      ? nums.length === 1
        ? `#${toFa(nums[0])}`
        : `${toFa(nums.length)} سفارش (#${nums.map((n) => toFa(n)).join("، #")})`
      : "سفارش";
    return (
      <div className="max-w-2xl mx-auto py-6">
        <Card className="p-8 text-center space-y-5">
          <div className="size-16 rounded-full bg-emerald-500/15 text-emerald-600 grid place-items-center mx-auto">
            <Icon name="checkCircle" size={36} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold">
              {nums.length > 1 ? `${numsFa} با موفقیت ثبت شدند` : `سفارش ${numsFa} با موفقیت ثبت شد`}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {success.preInvoice ? (
                success.preInvoiceCount > 1 ? (
                  <>
                    <span className="font-bold text-foreground">{toFa(success.preInvoiceCount)} پیش‌فاکتور</span> به‌ازای
                    آیتم‌ها صادر شد — می‌توانید سند اول را چاپ کنید و بقیه را از تب
                    «پیش‌فاکتور» جزئیات سفارش مدیریت کنید.
                  </>
                ) : (
                  <>
                    پیش‌فاکتور <span className="font-bold text-foreground">#{toFa(success.preInvoice.number)}</span> نیز صادر شد —
                    می‌توانید همین حالا سند رسمی آن را چاپ کنید یا به‌صورت PDF ذخیره کنید.
                  </>
                )
              ) : (
                "از دکمه‌های زیر برای ادامه استفاده کنید."
              )}
            </p>
          </div>

          {success.preInvoice && (
            <Button size="lg" onClick={() => setPiModalOpen(true)} className="gap-2 w-full sm:w-auto">
              <Icon name="print" size={17} /> چاپ پیش‌فاکتور / ذخیره PDF
            </Button>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
            <Button variant="outline" onClick={resetWizard} className="gap-2 w-full sm:w-auto">
              <Icon name="plus" size={15} /> ثبت سفارش جدید
            </Button>
            <Button variant="ghost" onClick={() => navigate("admin", "orders")} className="gap-2 w-full sm:w-auto">
              بازگشت به سفارشات <Icon name="arrowLeft" size={15} />
            </Button>
          </div>
        </Card>

        {/* مودال پیش‌فاکتور — مستقیم روی سند چاپی باز می‌شود */}
        <PreInvoiceModal
          orderId={success.orderId}
          open={piModalOpen}
          onOpenChange={setPiModalOpen}
          initialDocId={success.preInvoice?.id ?? null}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("admin", "orders")} className="size-9 rounded-lg border grid place-items-center hover:bg-accent">
            <Icon name="arrowRight" size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {isEditing && editData?.order ? `ویرایش سفارش #${editData.order.number}` : "سفارش جدید"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isEditing ? "ویرایش سفارش چاپ در ۴ مرحله" : "ایجاد سفارش چاپ در ۴ مرحله"}
            </p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          {STEPS.map((s, i) => {
            const done = step > s.n;
            const active = step === s.n;
            return (
              <React.Fragment key={s.n}>
                <button
                  onClick={() => (s.n < step ? setStep(s.n) : null)}
                  className={cn("flex items-center gap-2.5 transition", s.n < step ? "cursor-pointer" : "cursor-default")}
                >
                  <div className={cn(
                    "size-9 rounded-full grid place-items-center text-sm font-bold transition shrink-0",
                    done && "bg-emerald-500 text-white",
                    active && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                    !done && !active && "bg-muted text-muted-foreground"
                  )}>
                    {done ? <Icon name="check" size={18} /> : s.n}
                  </div>
                  <div className="hidden sm:block text-right">
                    <div className={cn("text-xs text-muted-foreground", active && "text-primary")}>مرحله {s.n}</div>
                    <div className={cn("text-sm font-medium", active && "text-primary")}>{s.label}</div>
                  </div>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={cn("flex-1 h-0.5 rounded-full transition", step > s.n ? "bg-emerald-500" : "bg-border")} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </Card>

      {/* Step content */}
      {step === 1 && (
        <Step1
          multiMode={multiMode}
          setMultiMode={setMultiMode}
          customers={customers}
          addCustomer={addCustomer}
          removeCustomer={removeCustomer}
          customerOptions={customerOptions}
          allCustomers={allCustomers}
        />
      )}

      {step === 2 && (
        <Step2
          customers={customers}
          activeCustomer={activeCustomer}
          setActiveCustomer={setActiveCustomer}
          itemsByCustomer={itemsByCustomer}
          addItem={addItem}
          updateItem={updateItem}
          copyItem={copyItem}
          deleteItem={deleteItem}
          productOptions={allProducts}
          allCustomers={allCustomers}
        />
      )}

      {step === 3 && (
        <Step3
          splitMode={splitMode}
          setSplitMode={setSplitMode}
          priority={priority}
          setPriority={setPriority}
          endDate={endDate}
          setEndDate={setEndDate}
          noEndDate={noEndDate}
          setNoEndDate={setNoEndDate}
          note={note}
          setNote={setNote}
          customers={customers}
          allCustomers={allCustomers}
          itemsByCustomer={itemsByCustomer}
          updateItem={updateItem}
          applyDatesToAll={applyDatesToAll}
          customerCount={customers.length}
        />
      )}

      {step === 4 && (
        <Step4
          customers={customers}
          itemsByCustomer={itemsByCustomer}
          allCustomers={allCustomers}
          splitMode={splitMode}
          priority={priority}
          endDate={endDate}
          noEndDate={noEndDate}
          note={note}
          needsDesign={needsDesign}
          anyCompleted={anyCompleted}
          isEditing={isEditing}
          editPreInvoices={editPreInvoices}
          preInvoiceEnabled={preInvoiceEnabled}
          setPreInvoiceEnabled={setPreInvoiceEnabled}
          piDiscount={piDiscount}
          setPiDiscount={setPiDiscount}
          piTaxRate={piTaxRate}
          setPiTaxRate={setPiTaxRate}
          piPrepaid={piPrepaid}
          setPiPrepaid={setPiPrepaid}
          piValidDays={piValidDays}
          setPiValidDays={setPiValidDays}
          piNotes={piNotes}
          setPiNotes={setPiNotes}
          invoiceEnabled={invoiceEnabled}
          setInvoiceEnabled={setInvoiceEnabled}
        />
      )}

      {/* Footer nav */}
      <div className="flex items-center justify-between gap-2 pt-2">
        <Button variant="outline" onClick={() => (step === 1 ? navigate("admin", "orders") : setStep(step - 1))} className="gap-2">
          <Icon name="arrowRight" size={16} /> {step === 1 ? "انصراف" : "قبلی"}
        </Button>
        {step < 4 ? (
          <Button
            onClick={() => {
              if (!canGoNext()) {
                if (step === 1) toast.error("حداقل یک مشتری انتخاب کنید");
                if (step === 2) toast.error("هر مشتری باید حداقل یک آیتم داشته باشد");
                return;
              }
              setStep(step + 1);
            }}
            className="gap-2"
          >
            مرحله بعد <Icon name="arrowLeft" size={16} />
          </Button>
        ) : (
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} className="gap-2">
            {createMut.isPending ? <Icon name="loading" size={16} className="animate-spin" /> : <Icon name="check" size={16} />}
            {isEditing ? "ذخیره تغییرات" : "ساخت سفارش"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── STEP 1: Customer selection ───────────────────────────────
function Step1({
  multiMode, setMultiMode, customers, addCustomer, removeCustomer, customerOptions, allCustomers,
}: {
  multiMode: boolean;
  setMultiMode: (v: boolean) => void;
  customers: string[];
  addCustomer: (id: string) => void;
  removeCustomer: (id: string) => void;
  customerOptions: { value: string; label: string; sub?: string }[];
  allCustomers: Customer[];
}) {
  const [newCust, setNewCust] = React.useState({ name: "", phone: "" });
  const [createOpen, setCreateOpen] = React.useState(false);
  const invalidate = useInvalidate();

  const createCust = useMutation({
    mutationFn: (body: { name: string; phone: string }) => api<{ customer: Customer }>("/api/customers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      invalidate(["customers"]);
      invalidate(["customers-wizard"]);
      // R7: orders-page + open-orders use ["customers-list"] — was missing, so newly
      // created customer didn't appear in those dropdowns without a manual refetch.
      invalidate(["customers-list"]);
      addCustomer(data.customer.id);
      toast.success("مشتری ایجاد و انتخاب شد");
      setNewCust({ name: "", phone: "" });
      setCreateOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-primary/10 text-primary grid place-items-center"><Icon name="customers" size={20} /></div>
          <div><h2 className="font-semibold">انتخاب مشتری</h2><p className="text-xs text-muted-foreground">مشتری سفارش را انتخاب کنید</p></div>
        </div>
        {/* New customer button: only available in multi mode OR when no customer selected yet */}
        {(multiMode || customers.length === 0) && (
          <button onClick={() => setCreateOpen(true)} className="text-xs text-primary hover:underline flex items-center gap-1">
            <Icon name="plus" size={14} /> مشتری جدید
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
        <ToggleButton checked={multiMode} onChange={(v) => {
          setMultiMode(v);
          // When turning OFF multi mode, keep only the first customer (if any)
          if (!v && customers.length > 1) {
            const first = customers[0];
            // remove all but first — call removeCustomer for each extra
            customers.slice(1).forEach((c) => removeCustomer(c));
            void first;
          }
        }} id="multi" label="ساخت سفارش برای چند مشتری" />
        <span className="text-xs text-muted-foreground">{multiMode ? "حالت چندمشتری فعال" : "تک مشتری — برای افزودن بیش از یک مشتری، این گزینه را فعال کنید"}</span>
      </div>

      {/* Customer selectors */}
      <div className="space-y-3">
        {customers.map((cid, idx) => {
          const c = allCustomers.find((x) => x.id === cid);
          return (
            <div key={cid} className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-muted text-muted-foreground grid place-items-center text-xs font-bold shrink-0">{idx + 1}</div>
              <div className="flex-1 min-w-0 flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{c?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{c?.phone ?? "—"}</div>
                </div>
                <StatusPill />
              </div>
              <Button variant="ghost" size="icon" className="size-9 text-rose-600 hover:text-rose-700" onClick={() => removeCustomer(cid)} title="حذف مشتری">
                <Icon name="trash" size={16} />
              </Button>
            </div>
          );
        })}

        {/* Add customer dropdown — only show when: no customers yet OR multi mode is ON */}
        {(customers.length === 0 || multiMode) && (
          <div className="flex items-center gap-2">
            <div className="size-8 shrink-0" />
            <Field label={customers.length ? "افزودن مشتری دیگر" : "انتخاب مشتری"} className="flex-1">
              <SearchSelect
                value={null}
                onChange={(v) => v && addCustomer(v)}
                placeholder="جستجو بر اساس نام یا شماره تلفن…"
                searchPlaceholder="جستجوی نام یا تلفن..."
                options={customerOptions.filter((o) => !customers.includes(o.value))}
                allowClear={false}
                className="w-full"
              />
            </Field>
          </div>
        )}

        {/* Hint when single mode and already has a customer */}
        {!multiMode && customers.length === 1 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pl-2">
            <Icon name="info" size={13} />
            برای افزودن مشتری دیگر، حالت «چند مشتری» را فعال کنید.
          </div>
        )}
      </div>

      <CreateCustomerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        form={newCust}
        setForm={setNewCust}
        onSubmit={() => createCust.mutate(newCust)}
        loading={createCust.isPending}
      />
    </Card>
  );

  function StatusPill() {
    return <span className="text-[11px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">انتخاب شده</span>;
  }
}

function CreateCustomerDialog({
  open, onOpenChange, form, setForm, onSubmit, loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: { name: string; phone: string };
  setForm: (f: { name: string; phone: string }) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Icon name="userAdd" size={18} className="text-primary" /> ایجاد مشتری جدید</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="نام مشتری" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
            </Field>
            <Field label="شماره تلفن" required>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required dir="ltr" placeholder="0912…" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? <Icon name="loading" size={16} className="animate-spin" /> : <Icon name="check" size={16} />}
              ایجاد و انتخاب
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── STEP 2: Order items ──────────────────────────────────────
function Step2({
  customers, activeCustomer, setActiveCustomer, itemsByCustomer, addItem, updateItem, copyItem, deleteItem, productOptions, allCustomers,
}: {
  customers: string[];
  activeCustomer: string;
  setActiveCustomer: (v: string) => void;
  itemsByCustomer: Record<string, ItemDraft[]>;
  addItem: (cid: string) => void;
  updateItem: (cid: string, itemId: string, patch: Partial<ItemDraft>) => void;
  copyItem: (cid: string, itemId: string) => void;
  deleteItem: (cid: string, itemId: string) => void;
  productOptions: { id: string; name: string; basePrice: number | null }[];
  allCustomers: Customer[];
}) {
  const cid = activeCustomer || customers[0] || "";
  const customer = allCustomers.find((c) => c.id === cid);
  const items = itemsByCustomer[cid] ?? [];
  const [noteModal, setNoteModal] = React.useState<{ itemId: string } | null>(null);
  const [productModal, setProductModal] = React.useState(false);
  const [newProduct, setNewProduct] = React.useState("");
  const invalidate = useInvalidate();

  const createProduct = useMutation({
    mutationFn: (name: string) => api<{ product: { id: string; name: string } }>("/api/products", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: (data) => {
      invalidate(["products"]);
      invalidate(["products-wizard"]);
      // R7: orders-page + open-orders use ["products-list"] — was missing.
      invalidate(["products-list"]);
      toast.success("محصول ایجاد شد");
      setProductModal(false);
      setNewProduct("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = items.reduce((s, i) => s + i.quantity * i.pricePerUnit, 0);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-primary/10 text-primary grid place-items-center"><Icon name="orders" size={20} /></div>
          <div><h2 className="font-semibold">آیتم‌های سفارش</h2><p className="text-xs text-muted-foreground">محصولات و جزئیات هر آیتم</p></div>
        </div>
        <button onClick={() => setProductModal(true)} className="text-xs text-primary hover:underline flex items-center gap-1">
          <Icon name="plus" size={14} /> محصول جدید
        </button>
      </div>

      {customers.length > 1 && (
        <Tabs value={cid} onValueChange={setActiveCustomer}>
          <TabsList className="flex-wrap h-auto">
            {customers.map((c) => {
              const cust = allCustomers.find((x) => x.id === c);
              const cnt = itemsByCustomer[c]?.length ?? 0;
              return (
                <TabsTrigger key={c} value={c} className="gap-1.5">
                  {cust?.name}
                  <span className={cn("text-[10px] rounded-full px-1.5", cnt > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300")}>{cnt}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      )}

      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Icon name="info" size={13} /> سفارش برای: <span className="font-medium text-foreground">{customer?.name}</span>
      </div>

      {/* Items list */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed py-10 text-center">
            <Icon name="orders" size={32} className="mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground mt-2">آیتمی اضافه نشده</p>
            <Button size="sm" className="mt-3 gap-1.5" onClick={() => addItem(cid)}><Icon name="plus" size={14} /> افزودن اولین آیتم</Button>
          </div>
        ) : (
          items.map((it, idx) => (
            <ItemRow
              key={it.id}
              index={idx}
              item={it}
              productOptions={productOptions}
              onUpdate={(patch) => updateItem(cid, it.id, patch)}
              onCopy={() => copyItem(cid, it.id)}
              onDelete={() => deleteItem(cid, it.id)}
              onNote={() => setNoteModal({ itemId: it.id })}
            />
          ))
        )}
      </div>

      {items.length > 0 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addItem(cid)}><Icon name="plus" size={14} /> افزودن آیتم جدید</Button>
          <div className="text-sm"><span className="text-muted-foreground">مجموع: </span><span className="font-bold" dir="ltr">{formatCurrency(total)}</span></div>
        </div>
      )}

      {/* Note modal */}
      <NoteItemModal
        open={!!noteModal}
        onOpenChange={(o) => !o && setNoteModal(null)}
        note={noteModal ? items.find((i) => i.id === noteModal.itemId)?.note ?? "" : ""}
        onSave={(n) => { if (noteModal) updateItem(cid, noteModal.itemId, { note: n }); setNoteModal(null); }}
      />

      {/* Product create modal */}
      <Dialog open={productModal} onOpenChange={setProductModal}>
        <DialogContent aria-describedby={undefined} className="max-w-sm">
          <DialogHeader><DialogTitle>محصول جدید</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (newProduct.trim()) createProduct.mutate(newProduct.trim()); }} className="space-y-4">
            <Field label="نام محصول" required>
              <Input value={newProduct} onChange={(e) => setNewProduct(e.target.value)} required autoFocus />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProductModal(false)}>انصراف</Button>
              <Button type="submit" disabled={createProduct.isPending} className="gap-2">
                {createProduct.isPending ? <Icon name="loading" size={16} className="animate-spin" /> : <Icon name="check" size={16} />}
                ایجاد
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ItemRow({
  index, item, productOptions, onUpdate, onCopy, onDelete, onNote,
}: {
  index: number;
  item: ItemDraft;
  productOptions: { id: string; name: string; basePrice: number | null }[];
  onUpdate: (patch: Partial<ItemDraft>) => void;
  onCopy: () => void;
  onDelete: () => void;
  onNote: () => void;
}) {
  const total = item.quantity * item.pricePerUnit;
  return (
    <div className="rounded-xl border bg-card p-3 space-y-3 hover:shadow-sm transition">
      {/* هدر آیتم: نام + جمع + عملیات */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-7 rounded-md bg-primary/10 text-primary grid place-items-center text-xs font-bold shrink-0">{index + 1}</div>
          <span className="text-sm font-semibold truncate">{item.productName || "آیتم جدید"}</span>
          {item.needsMaterial && (
            <span className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full shrink-0">نیازمند متریال</span>
          )}
          {item.note && (
            <button onClick={onNote} className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0 hover:bg-primary/20 transition" title="مشاهدهٔ یادداشت">
              یادداشت دارد
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-sm font-bold tabular-nums" dir="ltr">{formatCurrency(total)}</span>
          <Button variant="ghost" size="icon" className="size-8" onClick={onNote} title="یادداشت آیتم"><Icon name="info" size={15} /></Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={onCopy} title="کپی آیتم"><Icon name="copy" size={15} /></Button>
          <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={onDelete} title="حذف آیتم"><Icon name="trash" size={15} /></Button>
        </div>
      </div>

      {/* فیلدهای آیتم — همه با برچسب روی حاشیه */}
      <div className="grid grid-cols-2 md:grid-cols-12 gap-x-3 gap-y-2.5">
        <Field label="محصول" required className="col-span-2 md:col-span-4">
          <SearchSelect
            value={item.productId}
            onChange={(v) => {
              const p = productOptions.find((x) => x.id === v);
              onUpdate({ productId: v ?? "", productName: p?.name ?? "", pricePerUnit: p?.basePrice ?? item.pricePerUnit });
            }}
            placeholder="جستجو و انتخاب محصول…"
            searchPlaceholder="نام محصول…"
            options={productOptions.map((p) => ({ value: p.id, label: p.name }))}
            className="w-full"
            allowClear={false}
          />
        </Field>

        <Field label="تعداد" required className="col-span-1 md:col-span-2">
          <Input type="number" min={1} value={item.quantity} onChange={(e) => onUpdate({ quantity: Math.max(1, Number(e.target.value)) })} className="text-center" dir="ltr" />
        </Field>

        <Field label="قیمت واحد (IQD)" required className="col-span-1 md:col-span-3">
          <Input type="number" min={0} value={item.pricePerUnit} onChange={(e) => onUpdate({ pricePerUnit: Number(e.target.value) })} className="text-center" dir="ltr" />
        </Field>

        <Field label="مرحله" className="col-span-2 md:col-span-3">
          <Select value={item.stage} onValueChange={(v) => onUpdate({ stage: v as ItemDraft["stage"] })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>

        <Field label="توضیح آیتم" className="col-span-2 md:col-span-5">
          <Input value={item.description} onChange={(e) => onUpdate({ description: e.target.value })} placeholder="مثلاً: کوت گلاسه ۱۳۵ گرمی" />
        </Field>

        <Field label="جمع کل" className="col-span-2 md:col-span-3">
          <Input readOnly tabIndex={-1} value={formatCurrency(total)} dir="ltr"
            className="text-center font-bold bg-transparent cursor-default focus-visible:ring-0" />
        </Field>

        {/* متریال */}
        <div className="col-span-2 md:col-span-4 flex items-center">
          <label className="flex items-center gap-2 h-9 w-full px-3 rounded-md border cursor-pointer hover:bg-accent/50 transition text-xs">
            <Checkbox checked={item.needsMaterial} onCheckedChange={(v) => onUpdate({ needsMaterial: !!v })} />
            <span className="text-muted-foreground">این آیتم نیازمند متریال است</span>
          </label>
        </div>
      </div>
    </div>
  );
}

function NoteItemModal({ open, onOpenChange, note, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; note: string; onSave: (n: string) => void }) {
  const [val, setVal] = React.useState(note);
  React.useEffect(() => setVal(note), [note, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Icon name="info" size={18} className="text-primary" /> یادداشت آیتم</DialogTitle></DialogHeader>
        <Field label="یادداشت اختصاصی این ردیف" hint="فقط برای تیم داخلی — روی پیش‌فاکتور چاپ نمی‌شود">
          <Textarea value={val} onChange={(e) => setVal(e.target.value)} rows={4} autoFocus />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={() => onSave(val)} className="gap-2"><Icon name="check" size={16} /> ذخیره</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── STEP 3: Timing & priority ────────────────────────────────
// Phase 10: زمان‌بندی per-item — هر آیتم ۴ تاریخ خودش را دارد
// (شروع/پایان طراحی + شروع/پایان چاپ). ابزار «اعمال روی همه» برای
// تسریع کار؛ اگر چند مشتری هست، آیتم‌ها به تفکیک مشتری گروه می‌شوند.
function Step3(props: {
  splitMode: "grouped" | "separated"; setSplitMode: (v: "grouped" | "separated") => void;
  priority: "normal" | "urgent"; setPriority: (v: "normal" | "urgent") => void;
  endDate: string; setEndDate: (v: string) => void;
  noEndDate: boolean; setNoEndDate: (v: boolean) => void;
  note: string; setNote: (v: string) => void;
  customers: string[];
  allCustomers: Customer[];
  itemsByCustomer: Record<string, ItemDraft[]>;
  updateItem: (cid: string, itemId: string, patch: Partial<ItemDraft>) => void;
  applyDatesToAll: (patch: Partial<Pick<ItemDraft, "designStart" | "designEnd" | "printStart" | "printEnd">>) => void;
  customerCount: number;
}) {
  const { splitMode, setSplitMode, priority, setPriority, endDate, setEndDate, noEndDate, setNoEndDate, note, setNote, customers, allCustomers, itemsByCustomer, updateItem, applyDatesToAll, customerCount } = props;
  const allItems = Object.values(itemsByCustomer).flat();
  // ابزار اعمال-روی-همه (وضعیت محلی، جدا از آیتم‌ها)
  const [bulkDesign, setBulkDesign] = React.useState<{ start: string; end: string }>({ start: "", end: "" });
  const [bulkPrint, setBulkPrint] = React.useState<{ start: string; end: string }>({ start: "", end: "" });
  const scheduledCount = allItems.filter((i) => i.designStart || i.designEnd || i.printStart || i.printEnd).length;

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="size-9 rounded-xl bg-primary/10 text-primary grid place-items-center"><Icon name="calendar" size={20} /></div>
        <div><h2 className="font-semibold">زمان‌دهی و اولویت</h2><p className="text-xs text-muted-foreground">زمان‌بندی هر آیتم جداگانه است — این مرحله اختیاری است</p></div>
      </div>

      {/* Split mode */}
      <div className="space-y-2">
        <Label>نوع ثبت سفارش</Label>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setSplitMode("grouped")} className={cn("rounded-lg border p-3 text-right transition", splitMode === "grouped" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "hover:bg-accent")}>
            <div className="flex items-center justify-between"><span className="font-medium text-sm">گروهی</span><Icon name={splitMode === "grouped" ? "checkCircle" : "orders"} size={18} className={splitMode === "grouped" ? "text-primary" : "text-muted-foreground"} /></div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              همهٔ آیتم‌ها در یک سفارش — آیتم‌ها «با هم» پیش می‌روند: تا طراحی
              همهٔ آیتم‌های نیازمند طراحی تمام نشود، سفارش به چاپ نمی‌رود.
            </p>
          </button>
          <button onClick={() => setSplitMode("separated")} className={cn("rounded-lg border p-3 text-right transition", splitMode === "separated" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "hover:bg-accent")}>
            <div className="flex items-center justify-between"><span className="font-medium text-sm">تفکیک شده</span><Icon name={splitMode === "separated" ? "checkCircle" : "layers"} size={18} className={splitMode === "separated" ? "text-primary" : "text-muted-foreground"} /></div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              هر آیتم یک سفارش کاملاً مجزا با گردش کار مستقل.
            </p>
          </button>
        </div>
        {customerCount > 1 && (
          <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-[11px] leading-relaxed flex items-start gap-1.5">
            <Icon name="info" size={13} className="text-primary mt-0.5 shrink-0" />
            <span>
              {splitMode === "grouped" ? (
                <>
                  <b>حالت چند-مشتری + گروهی:</b> آیتم‌های هر مشتری در یک سفارش
                  گروهی مخصوص همان مشتری ثبت می‌شوند — یعنی{" "}
                  <b>{customerCount.toLocaleString("fa-IR")} سفارش گروهی</b>{" "}
                  (هر مشتری، سفارش جداگانهٔ خودش) و به‌ازای هر آیتم یک پیش‌فاکتور جدا.
                </>
              ) : (
                <>
                  <b>حالت چند-مشتری + تفکیک‌شده:</b> هر آیتم هر مشتری، یک سفارش
                  کاملاً مجزا با پیش‌فاکتور خودش می‌شود.
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Priority */}
      <div className="space-y-2">
        <Label>اولویت پروژه</Label>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setPriority("normal")} className={cn("rounded-lg border p-3 text-right transition", priority === "normal" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "hover:bg-accent")}>
            <span className="font-medium text-sm">معمولی</span>
          </button>
          <button onClick={() => setPriority("urgent")} className={cn("rounded-lg border p-3 text-right transition", priority === "urgent" ? "border-rose-500 bg-rose-50 dark:bg-rose-950/20 ring-2 ring-rose-500/20" : "hover:bg-accent")}>
            <span className="font-medium text-sm flex items-center gap-1.5"><Icon name="alertTriangle" size={15} className="text-rose-500" /> فوری</span>
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">اولویت برای کل سفارش اعمال می‌شود (طراح و چاپ).</p>
      </div>

      {/* ═══ Per-item scheduling ═══ */}
      <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Icon name="calendarAdd" size={18} className="text-primary" />
            <h3 className="font-medium text-sm">زمان‌بندی آیتم‌ها (هر آیتم مجزا)</h3>
          </div>
          <span className="text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground">
            {toFa(scheduledCount)} از {toFa(allItems.length)} آیتم زمان‌بندی شده
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          تاریخ طراحی و چاپ برای هر آیتم جداگانه ثبت می‌شود؛ طراح/چاپ همین تاریخ‌ها را
          در کار خود می‌بینند و روی پیش‌فاکتور هر آیتم هم درج می‌شود.
        </p>

        {/* ابزار اعمال-روی-همه */}
        <div className="rounded-lg border bg-card p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <Icon name="layers" size={14} /> اعمال سریع روی همهٔ آیتم‌ها
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border bg-muted/30 p-2 space-y-2">
              <div className="text-[11px] font-medium flex items-center gap-1"><Icon name="design" size={12} className="text-violet-500" /> طراحی</div>
              <DatePicker value={bulkDesign.start || null} onChange={(d) => setBulkDesign((b) => ({ ...b, start: d ? format(d, "yyyy-MM-dd") : "" }))} placeholder="شروع" className="w-full bg-transparent" />
              <DatePicker value={bulkDesign.end || null} onChange={(d) => setBulkDesign((b) => ({ ...b, end: d ? format(d, "yyyy-MM-dd") : "" }))} placeholder="پایان" className="w-full bg-transparent" />
              <Button size="sm" variant="outline" className="w-full h-7 text-[11px]" disabled={!bulkDesign.start && !bulkDesign.end}
                onClick={() => applyDatesToAll({ designStart: bulkDesign.start, designEnd: bulkDesign.end })}>
                اعمال طراحی روی همه
              </Button>
            </div>
            <div className="rounded-md border bg-muted/30 p-2 space-y-2">
              <div className="text-[11px] font-medium flex items-center gap-1"><Icon name="print" size={12} className="text-amber-500" /> چاپ</div>
              <DatePicker value={bulkPrint.start || null} onChange={(d) => setBulkPrint((b) => ({ ...b, start: d ? format(d, "yyyy-MM-dd") : "" }))} placeholder="شروع" className="w-full bg-transparent" />
              <DatePicker value={bulkPrint.end || null} onChange={(d) => setBulkPrint((b) => ({ ...b, end: d ? format(d, "yyyy-MM-dd") : "" }))} placeholder="پایان" className="w-full bg-transparent" />
              <Button size="sm" variant="outline" className="w-full h-7 text-[11px]" disabled={!bulkPrint.start && !bulkPrint.end}
                onClick={() => applyDatesToAll({ printStart: bulkPrint.start, printEnd: bulkPrint.end })}>
                اعمال چاپ روی همه
              </Button>
            </div>
          </div>
        </div>

        {/* کارت زمان‌بندی هر آیتم — به تفکیک مشتری */}
        {customers.map((cid) => {
          const cust = allCustomers.find((c) => c.id === cid);
          const items = itemsByCustomer[cid] ?? [];
          if (!items.length) return null;
          return (
            <div key={cid} className="space-y-2">
              {customers.length > 1 && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary pt-1">
                  <Icon name="customers" size={13} /> {cust?.name ?? "—"}
                </div>
              )}
              {items.map((it, idx) => (
                <div key={it.id} className="rounded-lg border bg-card p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="size-6 rounded-md bg-muted text-muted-foreground grid place-items-center text-[11px] font-bold shrink-0">{idx + 1}</span>
                      <span className="text-sm font-medium truncate">{it.productName || "آیتم"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] rounded bg-muted px-1.5 py-0.5">{STAGES.find((s) => s.value === it.stage)?.label}</span>
                      {(it.designStart || it.designEnd || it.printStart || it.printEnd) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">زمان‌بندی شده</span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                    <Field label="شروع طراحی">
                      <DatePicker value={it.designStart || null} onChange={(d) => updateItem(cid, it.id, { designStart: d ? format(d, "yyyy-MM-dd") : "" })} placeholder="—" className="w-full bg-transparent" />
                    </Field>
                    <Field label="پایان طراحی">
                      <DatePicker value={it.designEnd || null} onChange={(d) => updateItem(cid, it.id, { designEnd: d ? format(d, "yyyy-MM-dd") : "" })} placeholder="—" className="w-full bg-transparent" />
                    </Field>
                    <Field label="شروع چاپ">
                      <DatePicker value={it.printStart || null} onChange={(d) => updateItem(cid, it.id, { printStart: d ? format(d, "yyyy-MM-dd") : "" })} placeholder="—" className="w-full bg-transparent" />
                    </Field>
                    <Field label="پایان چاپ">
                      <DatePicker value={it.printEnd || null} onChange={(d) => updateItem(cid, it.id, { printEnd: d ? format(d, "yyyy-MM-dd") : "" })} placeholder="—" className="w-full bg-transparent" />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* End date */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Icon name="clock" size={18} className="text-primary" /><h3 className="font-medium text-sm">تاریخ پایان سفارش</h3></div>
          <ToggleButton checked={noEndDate} onChange={setNoEndDate} id="noend" label="سفارش بدون زمان پایان" size="sm" />
        </div>
        {!noEndDate && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="تاریخ پایان">
              <DatePicker value={endDate || null} onChange={(d) => setEndDate(d ? format(d, "yyyy-MM-dd") : "")} placeholder="انتخاب تاریخ" className="w-full bg-transparent" />
            </Field>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">تاریخ پایان، موعد تحویل کل سفارش است و مستقل از زمان‌بندی طراحی و چاپ هر آیتم می‌باشد.</p>
      </div>

      {/* Note */}
      <Field label="یادداشت سفارش" hint="اختیاری — در پیش‌فاکتور چاپ نمی‌شود">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="مثلاً: تحویل حضوری در دفتر مرکزی" />
      </Field>
    </Card>
  );
}

// ─── STEP 4: Review ───────────────────────────────────────────
// Phase 10: بازنگری با زمان‌بندی per-item + قرارداد پیش‌فاکتور جدید:
//   مجزا یا چند-مشتری → پیش‌فاکتور به‌ازای هر آیتم؛ گروهیِ تک-مشتری →
//   یک سند برای کل گروه. در ویرایش، پیش‌فاکتورها فقط-خواندنی هستند.
function Step4(props: {
  customers: string[];
  itemsByCustomer: Record<string, ItemDraft[]>;
  allCustomers: Customer[];
  splitMode: "grouped" | "separated";
  priority: "normal" | "urgent";
  endDate: string;
  noEndDate: boolean;
  note: string;
  needsDesign: boolean;
  anyCompleted: boolean;
  isEditing: boolean;
  editPreInvoices: { id: string; number: number; status: string; totalAmount: number }[];
  preInvoiceEnabled: boolean;
  setPreInvoiceEnabled: (v: boolean) => void;
  piDiscount: string;
  setPiDiscount: (v: string) => void;
  piTaxRate: string;
  setPiTaxRate: (v: string) => void;
  piPrepaid: string;
  setPiPrepaid: (v: string) => void;
  piValidDays: string;
  setPiValidDays: (v: string) => void;
  piNotes: string;
  setPiNotes: (v: string) => void;
  invoiceEnabled: boolean;
  setInvoiceEnabled: (v: boolean) => void;
}) {
  const {
    customers, itemsByCustomer, allCustomers, splitMode, priority, endDate, noEndDate,
    note, needsDesign, anyCompleted, isEditing, editPreInvoices,
    preInvoiceEnabled, setPreInvoiceEnabled,
    piDiscount, setPiDiscount, piTaxRate, setPiTaxRate, piPrepaid, setPiPrepaid,
    piValidDays, setPiValidDays, piNotes, setPiNotes,
    invoiceEnabled, setInvoiceEnabled,
  } = props;
  const [tab, setTab] = React.useState(customers[0] ?? "");
  const activeCid = tab || customers[0] || "";
  const activeItems = itemsByCustomer[activeCid] ?? [];
  const allItems = Object.values(itemsByCustomer).flat();
  const activeCustomer = allCustomers.find((c) => c.id === activeCid);

  // قرارداد Phase 10 — per-item یا گروهی؟
  const perItemPI = splitMode === "separated" || customers.length > 1;
  const piDocCount = perItemPI ? allItems.length : customers.length;

  // ─── محاسبهٔ زندهٔ پیش‌فاکتور (همان فرمول سرور — lib/pre-invoice) ──
  // حالت گروهیِ تک-مشتری: کل سفارش یک سند. حالت per-item: هر آیتم سندی
  // با مالیات درصدی خودش (تخفیف/پیش‌پرداخت فقط روی اولین سند اعمال می‌شود).
  const rate = Math.min(Math.max(0, Number(piTaxRate) || 0), 100);
  const calcDoc = (subtotal: number, applyExtras: boolean) => {
    const disc = applyExtras ? Math.min(Math.max(0, Number(piDiscount) || 0), subtotal) : 0;
    const tax = Math.round((subtotal - disc) * (rate / 100));
    return { subtotal, disc, tax, payable: Math.round(subtotal - disc + tax) };
  };
  const grandSubtotal = allItems.reduce((s, i) => s + i.quantity * i.pricePerUnit, 0);
  const grand = calcDoc(grandSubtotal, true);
  const prepaid = Math.min(Math.max(0, Number(piPrepaid) || 0), grand.payable);
  const remaining = grand.payable - prepaid;

  // خلاصهٔ زمان‌بندی گروه (برای پیش‌فاکتور گروهی و کارت‌های بازنگری)
  const groupSchedule = (() => {
    const ds = allItems.map((i) => i.designStart).filter(Boolean).sort();
    const de = allItems.map((i) => i.designEnd).filter(Boolean).sort();
    const ps = allItems.map((i) => i.printStart).filter(Boolean).sort();
    const pe = allItems.map((i) => i.printEnd).filter(Boolean).sort();
    return {
      designFrom: ds[0] || "", designTo: de[de.length - 1] || "",
      printFrom: ps[0] || "", printTo: pe[pe.length - 1] || "",
    };
  })();

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="size-9 rounded-xl bg-primary/10 text-primary grid place-items-center"><Icon name="checkCircle" size={20} /></div>
        <div><h2 className="font-semibold">بازنگری و ثبت نهایی</h2><p className="text-xs text-muted-foreground">مرور کامل جزئیات و صدور پیش‌فاکتور در صورت نیاز</p></div>
      </div>

      {/* ═══ ۱. خلاصهٔ سفارش ═══ */}
      <section className="rounded-xl border overflow-hidden">
        <SectionTitle icon="orders" title="خلاصهٔ سفارش" />
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <InfoCell icon="customers" label="مشتری اصلی" value={allCustomers.find((c) => c.id === customers[0])?.name ?? "—"}
            sub={customers.length > 1 ? `+${customers.length - 1} مشتری دیگر (سفارش تفکیکی)` : undefined} />
          <InfoCell icon="layers" label="نوع ثبت" value={splitMode === "grouped" ? "گروهی (یک سفارش)" : "تفکیک‌شده (هر آیتم یک سفارش)"} />
          <InfoCell icon={priority === "urgent" ? "alertTriangle" : "tag"} label="اولویت"
            value={priority === "urgent" ? "فوری" : "معمولی"}
            tone={priority === "urgent" ? "text-rose-600" : undefined} />
          <InfoCell icon="clock" label="موعد تحویل"
            value={noEndDate ? "بدون موعد مشخص" : (endDate ? fmtDate(endDate) : "—")}
            tone={!noEndDate ? "text-primary font-bold" : undefined} />
        </div>
      </section>

      {/* ═══ ۲. زمان‌بندی — خلاصهٔ گروه + جزئیات per-item ═══ */}
      <section className="rounded-xl border overflow-hidden">
        <SectionTitle icon="calendar" title="زمان‌بندی مراحل (هر آیتم مجزا)" />
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DateRangeCard
              icon="design" label="مرحلهٔ طراحی (کل گروه)" from={groupSchedule.designFrom} to={groupSchedule.designTo}
              applicable={needsDesign} />
            <DateRangeCard
              icon="print" label="مرحلهٔ چاپ (کل گروه)" from={groupSchedule.printFrom} to={groupSchedule.printTo}
              applicable />
          </div>
          {customers.length > 1 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {customers.map((c) => {
                const cust = allCustomers.find((x) => x.id === c);
                return (
                  <button key={c} onClick={() => setTab(c)}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition",
                      activeCid === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>
                    {cust?.name ?? c}
                  </button>
                );
              })}
            </div>
          )}
          {/* جدول زمان‌بندی per-item مشتری فعال */}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-right font-medium px-3 py-2">آیتم{customers.length > 1 ? ` (${activeCustomer?.name ?? ""})` : ""}</th>
                  <th className="text-center font-medium px-2 py-2">طراحی</th>
                  <th className="text-center font-medium px-2 py-2">چاپ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {activeItems.map((it) => {
                  const dHas = !!(it.designStart || it.designEnd);
                  const pHas = !!(it.printStart || it.printEnd);
                  return (
                    <tr key={it.id}>
                      <td className="px-3 py-2 font-medium">{it.productName || "—"}</td>
                      <td className="px-2 py-2 text-center">
                        {dHas ? (
                          <span className="tabular-nums" dir="ltr">
                            {it.designStart ? fmtShort(it.designStart) : "…"} → {it.designEnd ? fmtShort(it.designEnd) : "بدون پایان"}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {pHas ? (
                          <span className="tabular-nums" dir="ltr">
                            {it.printStart ? fmtShort(it.printStart) : "…"} → {it.printEnd ? fmtShort(it.printEnd) : "بدون پایان"}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ═══ ۳. اقلام سفارش ═══ */}
      <section className="rounded-xl border overflow-hidden">
        <SectionTitle icon="checkList" title={`اقلام سفارش (${toFa(allItems.length)} قلم)`} />
        <div className="p-4 space-y-4">
          {customers.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {customers.map((c) => {
                const cust = allCustomers.find((x) => x.id === c);
                return (
                  <button key={c} onClick={() => setTab(c)}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition",
                      activeCid === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>
                    {cust?.name ?? c}
                  </button>
                );
              })}
            </div>
          )}
          <CustomerReviewTable cid={activeCid} items={activeItems} />
        </div>
      </section>

      {/* ═══ ۴. یادداشت سفارش ═══ */}
      {note && (
        <section className="rounded-xl border overflow-hidden">
          <SectionTitle icon="checkList" title="یادداشت سفارش" />
          <div className="p-4 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{note}</div>
        </section>
      )}

      {/* ═══ ۵. پیش‌فاکتور ═══ */}
      {isEditing ? (
        // Phase 10 — ویرایش: خلاصهٔ فقط-خواندنی؛ مدیریت کامل از مودال جزئیات
        <section className="rounded-xl border overflow-hidden">
          <div className="px-4 py-3 bg-muted/30 border-b flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-muted text-muted-foreground grid place-items-center">
              <Icon name="receipt" size={17} />
            </div>
            <div>
              <div className="font-semibold text-sm">پیش‌فاکتورهای این سفارش</div>
              <div className="text-[11px] text-muted-foreground">
                برای صدور/ویرایش/چاپ، از تب «پیش‌فاکتور» در جزئیات سفارش استفاده کنید
              </div>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {editPreInvoices.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2">
                برای این سفارش پیش‌فاکتوری صادر نشده است — پس از ذخیره، از جزئیات سفارش صدور کنید.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {editPreInvoices.map((p) => (
                  <div key={p.id} className="rounded-lg border px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">پیش‌فاکتور #{toFa(p.number)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">{formatCurrency(p.totalAmount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className={cn("rounded-xl border overflow-hidden transition-colors", preInvoiceEnabled && "border-emerald-300 dark:border-emerald-800")}>
          <div className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className={cn("size-8 rounded-lg grid place-items-center", preInvoiceEnabled ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground")}>
                <Icon name="receipt" size={17} />
              </div>
              <div>
                <div className="font-semibold text-sm">
                  صدور پیش‌فاکتور {perItemPI ? `(به‌ازای هر آیتم — ${toFa(piDocCount)} سند)` : "(یک سند برای کل گروه)"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {perItemPI
                    ? "هر آیتم پیش‌فاکتور مجزای خودش را می‌گیرد؛ زمان طراحی/چاپ همان آیتم روی سندش درج می‌شود"
                    : "زمان‌بندی طراحی/چاپ کل گروه روی سند درج می‌شود"}
                </div>
              </div>
            </div>
            <ToggleButton checked={preInvoiceEnabled} onChange={setPreInvoiceEnabled} id="pi" activeColor="emerald" />
          </div>

          {preInvoiceEnabled && (
            <div className="p-4 space-y-4">
              {/* شرایط مالی */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="تخفیف (IQD)" hint={perItemPI ? "فقط روی اولین سند" : undefined}>
                  <Input type="number" min={0} dir="ltr" value={piDiscount} placeholder="0"
                    onChange={(e) => setPiDiscount(e.target.value)} />
                </Field>
                <Field label="مالیات (٪)">
                  <Input type="number" min={0} max={100} dir="ltr" value={piTaxRate} placeholder="0"
                    onChange={(e) => setPiTaxRate(e.target.value)} />
                </Field>
                <Field label="پیش‌پرداخت دریافتی" hint={perItemPI ? "فقط روی اولین سند" : undefined}>
                  <Input type="number" min={0} dir="ltr" value={piPrepaid} placeholder="0"
                    onChange={(e) => setPiPrepaid(e.target.value)} />
                </Field>
                <Field label="اعتبار پیش‌فاکتور (روز)">
                  <Input type="number" min={1} max={365} dir="ltr" value={piValidDays}
                    onChange={(e) => setPiValidDays(e.target.value)} />
                </Field>
              </div>

              <Field label="توضیحات پیش‌فاکتور" hint="روی سند چاپی نمایش داده می‌شود">
                <Textarea rows={2} value={piNotes} onChange={(e) => setPiNotes(e.target.value)}
                  placeholder="مثلاً: تحویل ۵ روز کاری پس از تایید طرح" />
              </Field>

              {/* محاسبهٔ زنده — کل */}
              <div className="rounded-xl border bg-muted/20 p-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                <SumCell label="جمع کل اقلام" value={grand.subtotal} />
                <SumCell label="تخفیف" value={grand.disc} tone="text-amber-600" />
                <SumCell label={`مالیات${rate ? ` (${toFa(rate)}٪)` : ""}`} value={grand.tax} />
                <SumCell label="قابل پرداخت (مجموع)" value={grand.payable} tone="text-primary" bold />
                <SumCell label="باقیمانده" value={remaining} tone={remaining > 0 ? "text-rose-600" : "text-emerald-600"} />
              </div>
              {perItemPI && (
                <div className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                  <Icon name="info" size={13} className="mt-0.5 shrink-0" />
                  <span>
                    {toFa(piDocCount)} سند مجزا صادر می‌شود؛ مالیات {toFa(rate)}٪ روی هر سند جداگانه
                    اعمال می‌شود و تخفیف/پیش‌پرداخت فقط روی «اولین» سند تا مجموع مبالغ
                    با جمع سفارش همخوان بماند.
                  </span>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ═══ ۶. فاکتور نهایی (سفارش تکمیل‌شده) ═══ */}
      {anyCompleted && !isEditing && (
        <section className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-blue-500/15 text-blue-600 grid place-items-center">
                <Icon name="invoice" size={17} />
              </div>
              <div>
                <div className="font-semibold text-sm">صدور فاکتور نهایی</div>
                <div className="text-[11px] text-muted-foreground">برخی آیتم‌ها تکمیل‌شده‌اند — فاکتور رسمی پس از ثبت صادر می‌شود</div>
              </div>
            </div>
            <ToggleButton checked={invoiceEnabled} onChange={setInvoiceEnabled} id="inv" activeColor="emerald" />
          </div>
        </section>
      )}
    </Card>
  );
}

// ─── اجزای کمکی Step4 ─────────────────────────────────────────────

function SectionTitle({ icon, title }: { icon: Parameters<typeof Icon>[0]["name"]; title: string }) {
  return (
    <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-2">
      <Icon name={icon} size={14} className="text-primary" />
      <span className="text-xs font-bold">{title}</span>
    </div>
  );
}

function InfoCell({ icon, label, value, sub, tone }: {
  icon: Parameters<typeof Icon>[0]["name"]; label: string; value: string; sub?: string; tone?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/25 px-3 py-2.5">
      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
        <Icon name={icon} size={11} /> {label}
      </div>
      <div className={cn("text-sm font-bold mt-1", tone)}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

/** کارت بازهٔ زمانی ماژول — «از X تا Y» یا «مشخص نشده» */
function DateRangeCard({ icon, label, from, to, applicable }: {
  icon: Parameters<typeof Icon>[0]["name"]; label: string; from: string; to: string; applicable?: boolean;
}) {
  const has = !!(from || to);
  return (
    <div className={cn("rounded-xl border p-3.5 flex items-start gap-3",
      has ? "border-primary/25 bg-primary/5" : "bg-muted/20")}>
      <div className={cn("size-9 rounded-lg grid place-items-center shrink-0",
        has ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
        <Icon name={icon} size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold">{label}</div>
        {applicable === false ? (
          <div className="text-[11px] text-muted-foreground mt-1">در این سفارش نیازی به طراحی نیست</div>
        ) : has ? (
          <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[11px]">
            <span className="tabular-nums bg-card border px-2 py-0.5 rounded-md font-medium">{from ? fmtDate(from) : "…"}</span>
            <Icon name="arrowLeft" size={11} className="text-muted-foreground" />
            <span className="tabular-nums bg-card border px-2 py-0.5 rounded-md font-medium">{to ? fmtDate(to) : "بدون پایان"}</span>
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground mt-1">زمان‌بندی مشخص نشده</div>
        )}
      </div>
      {applicable !== false && (
        <span className={cn("text-[10px] px-2 py-1 rounded-full shrink-0 font-medium",
          has ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
          {has ? "زمان‌بندی شده" : "مشخص نشده"}
        </span>
      )}
    </div>
  );
}

function SumCell({ label, value, tone, bold }: { label: string; value: number; tone?: string; bold?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn("text-sm mt-0.5 tabular-nums", bold ? "font-black text-lg" : "font-bold", tone)} dir="ltr">
        {formatCurrency(value)}
      </div>
    </div>
  );
}

const faDateFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "long", day: "numeric" });
const faDateShort = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "2-digit", month: "2-digit", day: "2-digit" });
function fmtDate(iso: string) {
  try { return faDateFmt.format(new Date(iso)); } catch { return iso; }
}
function fmtShort(iso: string) {
  try { return faDateShort.format(new Date(iso)); } catch { return iso; }
}
function toFa(n: number) { return n.toLocaleString("fa-IR"); }

function CustomerReviewTable({ cid, items }: { cid: string; items: ItemDraft[] }) {
  const total = items.reduce((s, i) => s + i.quantity * i.pricePerUnit, 0);
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="text-right font-medium px-3 py-2">محصول</th>
            <th className="text-center font-medium px-2 py-2">تعداد</th>
            <th className="text-center font-medium px-2 py-2">قیمت واحد</th>
            <th className="text-center font-medium px-2 py-2">مبلغ کل</th>
            <th className="text-center font-medium px-2 py-2">مرحله</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((it) => (
            <tr key={it.id}>
              <td className="px-3 py-2 font-medium">{it.productName || "—"}
                {it.needsMaterial && <span className="mr-1.5 text-[10px] text-amber-600">(نیازمند متریال)</span>}
              </td>
              <td className="px-2 py-2 text-center tabular-nums" dir="ltr">{it.quantity}</td>
              <td className="px-2 py-2 text-center tabular-nums" dir="ltr">{formatCurrency(it.pricePerUnit)}</td>
              <td className="px-2 py-2 text-center font-semibold tabular-nums" dir="ltr">{formatCurrency(it.quantity * it.pricePerUnit)}</td>
              <td className="px-2 py-2 text-center"><span className="text-xs rounded bg-muted px-1.5 py-0.5">{STAGES.find((s) => s.value === it.stage)?.label}</span></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/30 font-semibold">
            <td colSpan={3} className="px-3 py-2 text-left">مجموع کل {items.length > 1 ? `(${toFa(items.length)} قلم)` : ""}:</td>
            <td className="px-2 py-2 text-center tabular-nums" dir="ltr">{formatCurrency(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
