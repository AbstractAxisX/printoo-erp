"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { useAppStore } from "@/stores/app-store";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type ItemDraft = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  pricePerUnit: number;
  note: string;
  description: string;
  stage: "design" | "print" | "warehouse" | "completed" | "archive";
  needsMaterial: boolean;
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
  preInvoices: { id: string; paidAmount: number; items: string | null }[];
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
  const [designStart, setDesignStart] = React.useState("");
  const [designEnd, setDesignEnd] = React.useState("");
  const [printStart, setPrintStart] = React.useState("");
  const [printEnd, setPrintEnd] = React.useState("");

  const [preInvoiceEnabled, setPreInvoiceEnabled] = React.useState(false);
  const [preInvoicePaid, setPreInvoicePaid] = React.useState<Record<string, string>>({});
  const [existingPreInvoiceId, setExistingPreInvoiceId] = React.useState<string | null>(null);
  const [invoiceEnabled, setInvoiceEnabled] = React.useState(false);

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

    // Step 2: items
    const items: ItemDraft[] = (order.items ?? []).map((it) => ({
      id: crypto.randomUUID(),
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
    }));
    setItemsByCustomer({ [order.customerId]: items });

    // Step 3: timing
    setSplitMode((order.splitMode as "grouped" | "separated") ?? "grouped");
    setPriority((order.priority as "normal" | "urgent") ?? "normal");
    setEndDate(order.endDate ? order.endDate.slice(0, 10) : "");
    setNoEndDate(!!order.noEndDate);
    setNote(order.note ?? "");

    // Module dates from first item
    const firstItem = order.items?.[0];
    if (firstItem) {
      setDesignStart(firstItem.designStartDate ? firstItem.designStartDate.slice(0, 10) : "");
      setDesignEnd(firstItem.designEndDate ? firstItem.designEndDate.slice(0, 10) : "");
      setPrintStart(firstItem.printStartDate ? firstItem.printStartDate.slice(0, 10) : "");
      setPrintEnd(firstItem.printEndDate ? firstItem.printEndDate.slice(0, 10) : "");
    }

    // Step 4: review — R2: hydrate preInvoice paid amounts from existing preInvoice
    const existingPI = order.preInvoices?.[0];
    setExistingPreInvoiceId(existingPI?.id ?? null);
    setPreInvoiceEnabled(!!existingPI);
    setInvoiceEnabled(!!order.invoice);
    if (existingPI) {
      // Restore per-item paid amounts by matching product name (preInvoice items are
      // a snapshot with { name, quantity, total, paid } — match by name to order items)
      try {
        const piItems: { name?: string; paid?: number }[] = existingPI.items
          ? JSON.parse(existingPI.items)
          : [];
        const restored: Record<string, string> = {};
        for (const it of items) {
          const match = piItems.find((p) => p.name === it.productName);
          if (match && Number(match.paid) > 0) {
            restored[it.id] = String(match.paid);
          }
        }
        setPreInvoicePaid(restored);
      } catch {
        // JSON parse failure — leave preInvoicePaid empty (user re-enters)
      }
    }

    setLoadedOrderId(param);
  }, [param, editData, loadedOrderId]);

  const showEditLoading = isEditing && loadedOrderId !== param && !editError;

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

  const createMut = useMutation({
    mutationFn: () => {
      // Build items payload (shared by create & edit)
      const cid = customers[0] ?? "";
      const items = (itemsByCustomer[cid] ?? []).map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        pricePerUnit: i.pricePerUnit,
        totalAmount: i.quantity * i.pricePerUnit,
        note: i.note || null,
        description: i.description || null,
        stage: i.stage,
        needsMaterial: i.needsMaterial,
      }));
      const moduleDates = {
        design: needsDesign ? { start: designStart || null, end: designEnd || null } : undefined,
        print: { start: printStart || null, end: printEnd || null },
      };

      if (isEditing && param) {
        // Edit mode: PUT to /api/orders/[id]
        const body = {
          customerId: cid,
          items,
          splitMode,
          priority,
          endDate: noEndDate ? null : endDate || null,
          noEndDate,
          note: note || null,
          moduleDates,
        };
        return api(`/api/orders/${param}`, { method: "PUT", body: JSON.stringify(body) });
      }

      // Create mode: POST to /api/orders
      const body: Record<string, unknown> = {
        customers,
        itemsByCustomer: Object.fromEntries(
          Object.entries(itemsByCustomer).map(([c, list]) => [
            c,
            list.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              pricePerUnit: i.pricePerUnit,
              totalAmount: i.quantity * i.pricePerUnit,
              note: i.note || null,
              description: i.description || null,
              stage: i.stage,
              needsMaterial: i.needsMaterial,
            })),
          ])
        ),
        splitMode,
        priority,
        endDate: noEndDate ? null : endDate || null,
        noEndDate,
        note: note || null,
        moduleDates,
        markCompleted: anyCompleted,
      };
      // pre-invoice — R1: was hardcoded { items:[], totalAmount:0, paidAmount:0 } so
      // per-item paid amounts entered in PreInvoiceTable were SILENTLY DROPPED on submit.
      // Now built from the first customer's items + the preInvoicePaid map.
      if (preInvoiceEnabled) {
        const piItems = (itemsByCustomer[cid] ?? []).map((i) => ({
          name: i.productName,
          quantity: i.quantity,
          total: i.quantity * i.pricePerUnit,
          paid: Number(preInvoicePaid[i.id] ?? 0) || 0,
        }));
        const piTotal = piItems.reduce((s, i) => s + i.total, 0);
        const piPaid = piItems.reduce((s, i) => s + i.paid, 0);
        body.preInvoice = {
          items: piItems,
          totalAmount: piTotal,
          paidAmount: piPaid,
        };
      }
      if (invoiceEnabled && anyCompleted) {
        body.invoice = { items: [], totalAmount: 0, paidAmount: 0, discountAmount: 0 };
      }
      return api("/api/orders", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: async (data: { count?: number; order?: { id: string } }) => {
      invalidate(["orders"]);
      invalidate(["dashboard"]);
      invalidate(["notifications"]);
      invalidate(["order"]);

      // R2: edit-mode preInvoice tri-state — was completely missing before (PUT /api/orders/[id]
      // does NOT accept preInvoice per §5.1; must call /api/pre-invoices separately).
      //   had-PI + still enabled → PUT /api/pre-invoices/[id] (update items + paid)
      //   had-PI + disabled      → DELETE /api/pre-invoices/[id]
      //   no-PI  + enabled        → POST /api/pre-invoices (create new)
      //   no-PI  + disabled       → no-op
      if (isEditing && param) {
        const cidEdit = customers[0] ?? "";
        const piItems = (itemsByCustomer[cidEdit] ?? []).map((i) => ({
          name: i.productName,
          quantity: i.quantity,
          total: i.quantity * i.pricePerUnit,
          paid: Number(preInvoicePaid[i.id] ?? 0) || 0,
        }));
        const piPaid = piItems.reduce((s, i) => s + i.paid, 0);
        try {
          if (preInvoiceEnabled && existingPreInvoiceId) {
            await api(`/api/pre-invoices/${existingPreInvoiceId}`, {
              method: "PUT",
              body: JSON.stringify({ items: piItems, paidAmount: piPaid }),
            });
          } else if (!preInvoiceEnabled && existingPreInvoiceId) {
            await api(`/api/pre-invoices/${existingPreInvoiceId}`, { method: "DELETE" });
            setExistingPreInvoiceId(null);
          } else if (preInvoiceEnabled && !existingPreInvoiceId && param) {
            const res = await api<{ preInvoice: { id: string } }>("/api/pre-invoices", {
              method: "POST",
              body: JSON.stringify({ orderId: param, customerId: cidEdit, items: piItems, paidAmount: piPaid }),
            });
            setExistingPreInvoiceId(res.preInvoice.id);
          }
        } catch {
          // preInvoice mutation failed but order saved — toast warning, don't block
          toast.error(" سفارش ذخیره شد ولی خطا در ثبت/به‌روزرسانی پیش‌فاکتور");
        }
      }

      if (isEditing) {
        toast.success("تغییرات سفارش ذخیره شد");
      } else {
        toast.success(`${data.count ?? 1} سفارش با موفقیت ایجاد شد`);
      }
      navigate("admin", "orders");
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
          needsDesign={needsDesign}
          designStart={designStart}
          setDesignStart={setDesignStart}
          designEnd={designEnd}
          setDesignEnd={setDesignEnd}
          printStart={printStart}
          setPrintStart={setPrintStart}
          printEnd={printEnd}
          setPrintEnd={setPrintEnd}
          itemsByCustomer={itemsByCustomer}
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
          needsDesign={needsDesign}
          anyCompleted={anyCompleted}
          preInvoiceEnabled={preInvoiceEnabled}
          setPreInvoiceEnabled={setPreInvoiceEnabled}
          preInvoicePaid={preInvoicePaid}
          setPreInvoicePaid={setPreInvoicePaid}
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
            <div className="flex-1">
              <SearchSelect
                value={null}
                onChange={(v) => v && addCustomer(v)}
                placeholder={customers.length ? "افزودن مشتری دیگر..." : "انتخاب مشتری..."}
                searchPlaceholder="جستجوی نام یا تلفن..."
                options={customerOptions.filter((o) => !customers.includes(o.value))}
                allowClear={false}
                className="w-full"
              />
            </div>
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
          <div className="space-y-1.5"><Label>نام مشتری *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus /></div>
          <div className="space-y-1.5"><Label>شماره تلفن *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required dir="ltr" placeholder="0912..." /></div>
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
            <div className="space-y-1.5"><Label>نام محصول *</Label><Input value={newProduct} onChange={(e) => setNewProduct(e.target.value)} required autoFocus /></div>
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
    <div className="rounded-lg border bg-card p-2.5 hover:shadow-sm transition">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="size-7 rounded-md bg-muted text-muted-foreground grid place-items-center text-xs font-bold shrink-0">{index + 1}</div>

        {/* Product */}
        <div className="w-40 shrink-0">
          <SearchSelect
            value={item.productId}
            onChange={(v) => {
              const p = productOptions.find((x) => x.id === v);
              onUpdate({ productId: v ?? "", productName: p?.name ?? "", pricePerUnit: p?.basePrice ?? item.pricePerUnit });
            }}
            placeholder="انتخاب محصول"
            searchPlaceholder="جستجوی محصول..."
            options={productOptions.map((p) => ({ value: p.id, label: p.name }))}
            className="w-full py-1.5"
            allowClear={false}
          />
        </div>

        {/* Quantity */}
        <div className="w-20 shrink-0">
          <Input type="number" min={1} value={item.quantity} onChange={(e) => onUpdate({ quantity: Math.max(1, Number(e.target.value)) })} className="text-center py-1.5" placeholder="تعداد" dir="ltr" />
        </div>

        {/* Price per unit */}
        <div className="w-28 shrink-0">
          <Input type="number" min={0} value={item.pricePerUnit} onChange={(e) => onUpdate({ pricePerUnit: Number(e.target.value) })} className="text-center py-1.5" placeholder="قیمت واحد" dir="ltr" />
        </div>

        {/* Total (auto) */}
        <div className="w-28 shrink-0 text-center">
          <div className="text-sm font-semibold py-1.5" dir="ltr">{formatCurrency(total)}</div>
        </div>

        {/* Stage */}
        <div className="w-32 shrink-0">
          <Select value={item.stage} onValueChange={(v) => onUpdate({ stage: v as ItemDraft["stage"] })}>
            <SelectTrigger className="py-1.5 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Description */}
        <div className="w-32 shrink-0">
          <Input value={item.description} onChange={(e) => onUpdate({ description: e.target.value })} className="py-1.5 text-xs" placeholder="توضیح" />
        </div>

        {/* Note button */}
        <button onClick={onNote} className={cn("size-9 rounded-lg grid place-items-center shrink-0 border transition", item.note ? "bg-primary/10 text-primary border-primary/30" : "hover:bg-accent")} title="یادداشت">
          <Icon name="info" size={16} />
        </button>

        {/* Needs material */}
        <label className="flex items-center gap-1.5 shrink-0 cursor-pointer px-2 py-1.5 rounded-lg border">
          <Checkbox checked={item.needsMaterial} onCheckedChange={(v) => onUpdate({ needsMaterial: !!v })} />
          <span className="text-[11px]">نیازمند متریال</span>
        </label>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0 mr-auto">
          <Button variant="ghost" size="icon" className="size-8" onClick={onCopy} title="کپی"><Icon name="copy" size={15} /></Button>
          <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={onDelete} title="حذف"><Icon name="trash" size={15} /></Button>
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
        <Textarea value={val} onChange={(e) => setVal(e.target.value)} rows={4} placeholder="یادداشت اختصاصی برای این ردیف..." autoFocus />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={() => onSave(val)} className="gap-2"><Icon name="check" size={16} /> ذخیره</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── STEP 3: Timing & priority ────────────────────────────────
function Step3(props: {
  splitMode: "grouped" | "separated"; setSplitMode: (v: "grouped" | "separated") => void;
  priority: "normal" | "urgent"; setPriority: (v: "normal" | "urgent") => void;
  endDate: string; setEndDate: (v: string) => void;
  noEndDate: boolean; setNoEndDate: (v: boolean) => void;
  note: string; setNote: (v: string) => void;
  needsDesign: boolean;
  designStart: string; setDesignStart: (v: string) => void;
  designEnd: string; setDesignEnd: (v: string) => void;
  printStart: string; setPrintStart: (v: string) => void;
  printEnd: string; setPrintEnd: (v: string) => void;
  itemsByCustomer: Record<string, ItemDraft[]>;
}) {
  const { splitMode, setSplitMode, priority, setPriority, endDate, setEndDate, noEndDate, setNoEndDate, note, setNote, needsDesign, designStart, setDesignStart, designEnd, setDesignEnd, printStart, setPrintStart, printEnd, setPrintEnd, itemsByCustomer } = props;
  const allItems = Object.values(itemsByCustomer).flat();

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="size-9 rounded-xl bg-primary/10 text-primary grid place-items-center"><Icon name="calendar" size={20} /></div>
        <div><h2 className="font-semibold">زمان‌دهی و اولویت</h2><p className="text-xs text-muted-foreground">این مرحله اختیاری است</p></div>
      </div>

      {/* Split mode */}
      <div className="space-y-2">
        <Label>نوع ثبت سفارش</Label>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setSplitMode("grouped")} className={cn("rounded-lg border p-3 text-right transition", splitMode === "grouped" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "hover:bg-accent")}>
            <div className="flex items-center justify-between"><span className="font-medium text-sm">گروهی</span><Icon name={splitMode === "grouped" ? "checkCircle" : "orders"} size={18} className={splitMode === "grouped" ? "text-primary" : "text-muted-foreground"} /></div>
            <p className="text-xs text-muted-foreground mt-1">همه آیتم‌ها در یک سفارش</p>
          </button>
          <button onClick={() => setSplitMode("separated")} className={cn("rounded-lg border p-3 text-right transition", splitMode === "separated" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "hover:bg-accent")}>
            <div className="flex items-center justify-between"><span className="font-medium text-sm">تفکیک شده</span><Icon name={splitMode === "separated" ? "checkCircle" : "layers"} size={18} className={splitMode === "separated" ? "text-primary" : "text-muted-foreground"} /></div>
            <p className="text-xs text-muted-foreground mt-1">هر آیتم یک سفارش مجزا</p>
          </button>
        </div>
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

      {/* Module dates */}
      <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="calendarAdd" size={18} className="text-primary" />
          <h3 className="font-medium text-sm">زمان‌دهی به ماژول‌ها (اختیاری)</h3>
        </div>
        <p className="text-[11px] text-muted-foreground">این تاریخ‌ها صرفاً برای زمان‌بندی در تقویم ماژول‌هاست و مستقل از تاریخ پایان سفارش است.</p>

        {needsDesign && (
          <div className="rounded-lg border bg-background p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium"><Icon name="design" size={16} className="text-violet-500" /> ماژول طراحی</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">شروع</Label><DatePicker value={designStart || null} onChange={(d) => setDesignStart(d ? format(d, "yyyy-MM-dd") : "")} placeholder="شروع" /></div>
              <div className="space-y-1"><Label className="text-xs">پایان</Label><DatePicker value={designEnd || null} onChange={(d) => setDesignEnd(d ? format(d, "yyyy-MM-dd") : "")} placeholder="پایان" /></div>
            </div>
          </div>
        )}

        <div className="rounded-lg border bg-background p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium"><Icon name="print" size={16} className="text-amber-500" /> ماژول چاپ</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-xs">شروع</Label><DatePicker value={printStart || null} onChange={(d) => setPrintStart(d ? format(d, "yyyy-MM-dd") : "")} placeholder="شروع" /></div>
            <div className="space-y-1"><Label className="text-xs">پایان</Label><DatePicker value={printEnd || null} onChange={(d) => setPrintEnd(d ? format(d, "yyyy-MM-dd") : "")} placeholder="پایان" /></div>
          </div>
        </div>

        {!needsDesign && (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Icon name="info" size={13} /> هیچ آیتمی نیاز به طراحی ندارد، بنابراین فقط زمان چاپ تعیین می‌شود.</div>
        )}
      </div>

      {/* End date */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Icon name="clock" size={18} className="text-primary" /><h3 className="font-medium text-sm">تاریخ پایان سفارش</h3></div>
          <ToggleButton checked={noEndDate} onChange={setNoEndDate} id="noend" label="سفارش بدون زمان پایان" size="sm" />
        </div>
        {!noEndDate && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-xs">تاریخ پایان</Label><DatePicker value={endDate || null} onChange={(d) => setEndDate(d ? format(d, "yyyy-MM-dd") : "")} placeholder="تاریخ پایان" /></div>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">تاریخ پایان، موعد تحویل کل سفارش است و مستقل از زمان‌بندی طراحی و چاپ می‌باشد.</p>
      </div>

      {/* Note */}
      <div className="space-y-1.5">
        <Label>یادداشت سفارش (اختیاری)</Label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="یادداشت کلی سفارش..." />
      </div>
    </Card>
  );
}

// ─── STEP 4: Review ───────────────────────────────────────────
function Step4(props: {
  customers: string[];
  itemsByCustomer: Record<string, ItemDraft[]>;
  allCustomers: Customer[];
  splitMode: "grouped" | "separated";
  priority: "normal" | "urgent";
  endDate: string;
  noEndDate: boolean;
  needsDesign: boolean;
  anyCompleted: boolean;
  preInvoiceEnabled: boolean;
  setPreInvoiceEnabled: (v: boolean) => void;
  preInvoicePaid: Record<string, string>;
  setPreInvoicePaid: (v: Record<string, string>) => void;
  invoiceEnabled: boolean;
  setInvoiceEnabled: (v: boolean) => void;
}) {
  const { customers, itemsByCustomer, allCustomers, splitMode, priority, endDate, noEndDate, needsDesign, anyCompleted, preInvoiceEnabled, setPreInvoiceEnabled, preInvoicePaid, setPreInvoicePaid, invoiceEnabled, setInvoiceEnabled } = props;
  const [tab, setTab] = React.useState(customers[0] ?? "");

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="size-9 rounded-xl bg-primary/10 text-primary grid place-items-center"><Icon name="checkCircle" size={20} /></div>
        <div><h2 className="font-semibold">بازنگری و ثبت</h2><p className="text-xs text-muted-foreground">بررسی نهایی و صدور پیش‌فاکتور</p></div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Chip icon="customers" label={`${customers.length} مشتری`} />
        <Chip icon="orders" label={`${Object.values(itemsByCustomer).flat().length} آیتم`} />
        <Chip icon="layers" label={splitMode === "grouped" ? "گروهی" : "تفکیک شده"} />
        <Chip icon={priority === "urgent" ? "alertTriangle" : "tag"} label={priority === "urgent" ? "فوری" : "معمولی"} />
        {!noEndDate && endDate && <Chip icon="clock" label={`پایان: ${endDate}`} />}
        {needsDesign && <Chip icon="design" label="نیاز به طراحی" />}
      </div>

      {/* Customer tabs */}
      {customers.length > 1 && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto">
            {customers.map((c) => {
              const cust = allCustomers.find((x) => x.id === c);
              return <TabsTrigger key={c} value={c}>{cust?.name}</TabsTrigger>;
            })}
          </TabsList>
        </Tabs>
      )}

      {/* Items table for active customer */}
      <CustomerReviewTable cid={tab || customers[0]} items={itemsByCustomer[tab || customers[0]] ?? []} />

      {/* Pre-invoice */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <ToggleButton checked={preInvoiceEnabled} onChange={setPreInvoiceEnabled} id="pi" label="صدور پیش‌فاکتور" activeColor="emerald" />
        </div>

        {preInvoiceEnabled && (
          <PreInvoiceTable
            cid={tab || customers[0]}
            items={itemsByCustomer[tab || customers[0]] ?? []}
            preInvoicePaid={preInvoicePaid}
            setPreInvoicePaid={setPreInvoicePaid}
          />
        )}
      </div>

      {/* Invoice (only if completed) */}
      {anyCompleted && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3">
          <ToggleButton checked={invoiceEnabled} onChange={setInvoiceEnabled} id="inv" label="صدور فاکتور" activeColor="emerald" description="سفارش تکمیل شده است" />
          {invoiceEnabled && (
            <p className="text-xs text-muted-foreground">فاکتور رسمی پس از تکمیل سفارش صادر خواهد شد.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function Chip({ icon, label }: { icon: "customers" | "orders" | "layers" | "alertTriangle" | "tag" | "clock" | "design"; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
      <Icon name={icon} size={12} className="text-muted-foreground" />
      {label}
    </span>
  );
}

function CustomerReviewTable({ cid, items }: { cid: string; items: ItemDraft[] }) {
  const total = items.reduce((s, i) => s + i.quantity * i.pricePerUnit, 0);
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="text-right font-medium px-3 py-2">محصول</th>
            <th className="text-right font-medium px-3 py-2">تعداد</th>
            <th className="text-right font-medium px-3 py-2">قیمت واحد</th>
            <th className="text-right font-medium px-3 py-2">مبلغ کل</th>
            <th className="text-right font-medium px-3 py-2">مرحله</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((it) => (
            <tr key={it.id}>
              <td className="px-3 py-2 font-medium">{it.productName || "—"}</td>
              <td className="px-3 py-2" dir="ltr">{it.quantity}</td>
              <td className="px-3 py-2" dir="ltr">{formatCurrency(it.pricePerUnit)}</td>
              <td className="px-3 py-2 font-semibold" dir="ltr">{formatCurrency(it.quantity * it.pricePerUnit)}</td>
              <td className="px-3 py-2"><span className="text-xs rounded bg-muted px-1.5 py-0.5">{STAGES.find((s) => s.value === it.stage)?.label}</span></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/30 font-semibold">
            <td colSpan={3} className="px-3 py-2 text-left">مجموع کل:</td>
            <td className="px-3 py-2" dir="ltr">{formatCurrency(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function PreInvoiceTable({
  cid, items, preInvoicePaid, setPreInvoicePaid,
}: {
  cid: string;
  items: ItemDraft[];
  preInvoicePaid: Record<string, string>;
  setPreInvoicePaid: (v: Record<string, string>) => void;
}) {
  const total = items.reduce((s, i) => s + i.quantity * i.pricePerUnit, 0);
  const paid = items.reduce((s, i) => s + (Number(preInvoicePaid[i.id] ?? 0) || 0), 0);
  const unpaid = total - paid;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-right font-medium px-3 py-2">آیتم</th>
              <th className="text-right font-medium px-3 py-2">تعداد</th>
              <th className="text-right font-medium px-3 py-2">مبلغ کل</th>
              <th className="text-right font-medium px-3 py-2">پرداختی مشتری (اختیاری)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((it) => (
              <tr key={it.id}>
                <td className="px-3 py-2 font-medium">{it.productName || "—"}</td>
                <td className="px-3 py-2" dir="ltr">{it.quantity}</td>
                <td className="px-3 py-2" dir="ltr">{formatCurrency(it.quantity * it.pricePerUnit)}</td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min={0}
                    value={preInvoicePaid[it.id] ?? ""}
                    onChange={(e) => setPreInvoicePaid({ ...preInvoicePaid, [it.id]: e.target.value })}
                    className="h-8 w-32"
                    dir="ltr"
                    placeholder="0"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 gap-2 max-w-xs mr-auto">
        <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">مبلغ کل</div><div className="font-bold mt-0.5" dir="ltr">{formatCurrency(total)}</div></div>
        <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 p-3"><div className="text-xs text-rose-600">پرداخت نشده</div><div className="font-bold mt-0.5 text-rose-700 dark:text-rose-300" dir="ltr">{formatCurrency(unpaid)}</div></div>
      </div>
    </div>
  );
}
