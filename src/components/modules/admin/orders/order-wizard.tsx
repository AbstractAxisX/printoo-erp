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
  // Phase 13: مجری per-item — «هر ایتم جدا کارمند بهش تنظیم شه»
  designAssignee: string;
  printAssignee: string;
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
  // Phase 12: تخصیص‌های فعلی سفارش (برای پیش‌فرم در ویرایش)
  assignedDesignerId: string | null;
  assignedPrinterId: string | null;
  assignedDesigner?: { id: string; name: string } | null;
  assignedPrinter?: { id: string; name: string } | null;
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
    designAssigneeId: string | null;
    printAssigneeId: string | null;
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
  { n: 3, label: "زمان‌دهی و تخصیص", icon: "calendar" as const },
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

  // ─── Phase 12: تخصیص مسئوِِستان (طراح/چاپ اختصاصی) ───
  // «اگر سیستم بیش از یک نقش طراح داشته باشه بگه این سفارش به کدوم کاربر بره»
  // — بیش از یک کاربر → انتخاب الزامی؛ یک کاربر → پیش‌فرض خودکار؛ صفر → استخر عمومی.
  const { data: designerUsersData } = useQuery({
    queryKey: ["users", "module", "designer"],
    queryFn: () =>
      api<{
        users: {
          id: string;
          name: string;
          email: string;
          onLeaveToday?: boolean;
          leaveNote?: string | null;
        }[];
      }>("/api/users?module=designer"),
  });
  const { data: printerUsersData } = useQuery({
    queryKey: ["users", "module", "print"],
    queryFn: () =>
      api<{
        users: {
          id: string;
          name: string;
          email: string;
          onLeaveToday?: boolean;
          leaveNote?: string | null;
        }[];
      }>("/api/users?module=print"),
  });
  const designerUsers = designerUsersData?.users ?? [];
  const printerUsers = printerUsersData?.users ?? [];

  // ─── Phase 13: per-item auto-select ──
  // Designer/printer assignment is per-item now («هر ایتم جدا کارمند بهش تنظیم شه»).
  // Single user of a module -> auto-select on all items of that stage (admin can change per item).
  React.useEffect(() => {
    if (designerUsers.length === 1) {
      const uid = designerUsers[0].id;
      setItemsByCustomer((s) => {
        let changed = false;
        const next: Record<string, ItemDraft[]> = {};
        for (const [cid, arr] of Object.entries(s)) {
          next[cid] = arr.map((it) => {
            if (it.stage === "design" && !it.designAssignee) {
              changed = true;
              return { ...it, designAssignee: uid };
            }
            return it;
          });
        }
        return changed ? next : s;
      });
    }
  }, [designerUsers]);
  React.useEffect(() => {
    if (printerUsers.length === 1) {
      const uid = printerUsers[0].id;
      setItemsByCustomer((s) => {
        let changed = false;
        const next: Record<string, ItemDraft[]> = {};
        for (const [cid, arr] of Object.entries(s)) {
          next[cid] = arr.map((it) => {
            if ((it.stage === "design" || it.stage === "print") && !it.printAssignee) {
              changed = true;
              return { ...it, printAssignee: uid };
            }
            return it;
          });
        }
        return changed ? next : s;
      });
    }
  }, [printerUsers]);

  // Phase 11 — پیش‌فاکتور دیگر در مرحلهٔ ۴ ویزارد نیست — «همیشگی» است و
  // خودکار با سفارش ساخته می‌شود؛ مدیریت آن دقیقاً پس از ثبت کامل
  // (صفحهٔ موفقیت) انجام می‌شود: ویرایش per-item / چاپ.

  // پاسخ POST /api/orders فاز 11 — همهٔ سندهای پیش‌فاکتور با متادیتا (per-item / کل گروه)
  type SuccessPI = {
    id: string;
    number: number;
    orderId: string;
    orderNumber: number;
    customerId: string;
    customerName: string;
    itemId: string | null;
    itemLabel: string;
    totalAmount: number;
  };
  const [success, setSuccess] = React.useState<{
    orderNumbers: number[];
    preInvoices: SuccessPI[];
  } | null>(null);
  // مقصد مودال پیش‌فاکتور (doc ویا edit)
  const [piModal, setPiModal] = React.useState<{
    orderId: string;
    docId: string;
    view: "doc" | "edit";
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
      // Phase 13: مجری per-item — پیش‌فرم با فال‌بک به تخصیص سفارش
      designAssignee: it.designAssigneeId ?? order.assignedDesignerId ?? "",
      printAssignee: it.printAssigneeId ?? order.assignedPrinterId ?? "",
    }));
    setItemsByCustomer({ [order.customerId]: items });

    // Step 3: timing
    setSplitMode((order.splitMode as "grouped" | "separated") ?? "grouped");
    setPriority((order.priority as "normal" | "urgent") ?? "normal");
    setEndDate(order.endDate ? order.endDate.slice(0, 10) : "");
    setNoEndDate(!!order.noEndDate);
    setNote(order.note ?? "");
    // Phase 13: per-item assignees prefilled in the item mapping above (with order fallback)

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
    setSuccess(null);
    setPiModal(null);
    setPiModalOpen(false);
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
      // Phase 13: مجری per-item (تک‌کاربره → auto-select در useEffect)
      designAssignee: "",
      printAssignee: "",
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
  const needsPrint = React.useMemo(
    () => allItemsFlat.some((i) => i.stage === "design" || i.stage === "print"),
    [allItemsFlat]
  );
  // Phase 13: مجری «سطح سفارش» (derived از آیتم‌ها) — فال‌بک آیتم‌های بی‌مسئول
  const derivedDesignerId =
    allItemsFlat.find((i) => i.stage === "design" && i.designAssignee)?.designAssignee ?? "";
  const derivedPrinterId =
    allItemsFlat.find((i) => (i.stage === "design" || i.stage === "print") && i.printAssignee)
      ?.printAssignee ?? "";
  const anyCompleted = React.useMemo(() => allItemsFlat.some((i) => i.stage === "completed"), [allItemsFlat]);

  function canGoNext(): boolean {
    if (step === 1) return customers.length > 0;
    if (step === 2) {
      // هر مشتری باید حداقل یک آیتم داشته باشد و «هر آیتم» هم باید محصول
      // انتخاب‌شده داشته باشد — productId خالی = خطای FK در سرور (P2003).
      return customers.every((c) => {
        const arr = itemsByCustomer[c] ?? [];
        return arr.length > 0 && arr.every((i) => !!i.productId);
      });
    }
    if (step === 3) {
      // Phase 13: تخصیص الزامی per-item وقتی بیش از یک کاربر همان ماژول
      // موجود است — هر آیتم باید مجری خودش را داشته باشد.
      if (designerUsers.length > 1) {
        const unassigned = allItemsFlat.filter(
          (i) => i.stage === "design" && !i.designAssignee
        );
        if (unassigned.length > 0) return false;
      }
      if (printerUsers.length > 1) {
        const unassigned = allItemsFlat.filter(
          (i) => (i.stage === "design" || i.stage === "print") && !i.printAssignee
        );
        if (unassigned.length > 0) return false;
      }
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
      // FK guard سمت کلاینت: هیچ آیتمی بدون محصول نباشد (خطای 500/P2003)
      const missingProduct = Object.values(itemsByCustomer).some((arr) =>
        arr.some((i) => !i.productId)
      );
      if (missingProduct) {
        throw new Error("برای هر آیتم سفارش یک محصول انتخاب کنید (ردیف‌های قرمز)");
      }
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
        // Phase 13: مجری per-item
        designAssigneeId: i.designAssignee || null,
        printAssigneeId: i.printAssignee || null,
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
          // Phase 12: تخصیص‌ها (PUT صریحاً مقدار می‌دهد — null هم معتبر است)
          assignedDesignerId: derivedDesignerId || null,
          assignedPrinterId: derivedPrinterId || null,
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
        // Phase 12: تخصیص طراح/چاپ اختصاصی
        assignedDesignerId: derivedDesignerId || null,
        assignedPrinterId: derivedPrinterId || null,
      };
      // Phase 11: پیش‌فاکتور در مرحلهٔ ۴ ایجاد نمی‌شود — سرور خودکار
      // با سفارش می‌سازد (مجزا/چند-مشتری → per-item؛ گروهی تک-مشتری →
      // یک سند کل گروه) و پاسخ کامل می‌دهد تا صفحهٔ موفقیت
      // مدیریت (ویرایش/چاپ) همان‌جا انجام شود.
      return api("/api/orders", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: async (data: unknown) => {
      const res = (data ?? {}) as {
        count?: number;
        created?: { id: string; number: number }[];
        preInvoices?: {
          id: string;
          number: number;
          orderId: string;
          orderNumber: number;
          customerId: string;
          customerName: string;
          itemId: string | null;
          itemLabel: string;
          totalAmount: number;
        }[];
      };
      invalidate(["orders"]);
      invalidate(["dashboard"]);
      invalidate(["notifications"]);
      invalidate(["order"]);
      invalidate(["pre-invoices"]);

      if (isEditing) {
        toast.success("تغییرات سفارش ذخیره شد");
        navigate("admin", "orders");
      } else {
        // Phase 11 — صفحهٔ موفقیت = مدیریت کامل پیش‌فاکتورها (به تفکیک
        // آیتم/مشتری یا کل گروه) دقیقاً پس از ساخت کامل سفارش.
        setSuccess({
          orderNumbers: (res.created ?? []).map((o) => o.number),
          preInvoices: res.preInvoices ?? [],
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

  // ─── Phase 11: صفحهٔ موفقیت — مدیریت کامل پیش‌فاکتورها پس از ثبت کامل سفارش ──
  // پیش‌فاکتور «همیشگی» است — خودکار صادر شد و دقیقاً اینجا مدیریت می‌شود:
  //   • سفارش تفکیکی یا چند-مشتری → ردیف جدا به تفکیک مشتری و آیتم
  //   • سفارش گروهی → یک سند برای کل گروه (هر ردیف = آیتم + مبلغ و جمع کل)
  if (success) {
    const nums = success.orderNumbers;
    const numsFa = nums.length
      ? nums.length === 1
        ? `#${toFa(nums[0])}`
        : `${toFa(nums.length)} سفارش (#${nums.map((n) => toFa(n)).join("، #")})`
      : "سفارش";
    const pis = success.preInvoices;

    // گروه‌بندی به تفکیک مشتری (خواستهٔ ۲ فاز ۹۸/۱۱)
    const byCustomer = new Map<string, typeof pis>();
    for (const pi of pis) {
      const arr = byCustomer.get(pi.customerId) ?? [];
      arr.push(pi);
      byCustomer.set(pi.customerId, arr);
    }
    const customerEntries = [...byCustomer.entries()];
    const multiCustomer = customerEntries.length > 1;
    const piTotal = pis.reduce((s, pi) => s + (pi.totalAmount || 0), 0);

    const openPi = (pi: (typeof pis)[number], view: "doc" | "edit") => {
      setPiModal({ orderId: pi.orderId, docId: pi.id, view });
      setPiModalOpen(true);
    };

    return (
      <div className="max-w-3xl mx-auto py-6 space-y-4">
        <Card className="p-7 text-center space-y-4">
          <div className="size-16 rounded-full bg-emerald-500/15 text-emerald-600 grid place-items-center mx-auto">
            <Icon name="checkCircle" size={36} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold">
              {nums.length > 1 ? `${numsFa} با موفقیت ثبت شدند` : `سفارش ${numsFa} با موفقیت ثبت شد`}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {pis.length > 1 ? (
                <>
                  <span className="font-bold text-foreground">{toFa(pis.length)} پیش‌فاکتور</span>{" "}
                  به‌ازای هر آیتم صادر شد — هر سند را می‌توانید ویرایش کنید،
                  پر کنید و هر وقت خواستید چاپ کنید.
                </>
              ) : pis.length === 1 ? (
                <>
                  پیش‌فاکتور{" "}
                  <span className="font-bold text-foreground">#{toFa(pis[0].number)}</span>{" "}
                  به‌صورت خودکار صادر شد — می‌توانید همین اولی را
                  چاپ کنید یا ابتدا ویرایش کنید و سپس چاپ.
                </>
              ) : (
                "از دکمه‌های زیر برای ادامه استفاده کنید."
              )}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
            <Button variant="outline" onClick={resetWizard} className="gap-2 w-full sm:w-auto">
              <Icon name="plus" size={15} /> ثبت سفارش جدید
            </Button>
            <Button variant="ghost" onClick={() => navigate("admin", "orders")} className="gap-2 w-full sm:w-auto">
              بازگشت به سفارشات <Icon name="arrowLeft" size={15} />
            </Button>
          </div>
        </Card>

        {/* مدیریت پیش‌فاکتورها — به تفکیک مشتری/آیتم یا کل گروه */}
        {pis.length > 0 && (
          <Card className="overflow-hidden">
            <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center gap-2.5 flex-wrap">
              <div className="size-9 rounded-xl bg-emerald-500/10 text-emerald-600 grid place-items-center">
                <Icon name="receipt" size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">
                  پیش‌فاکتورهای این ثبت
                  {multiCustomer && " (به تفکیک مشتری)"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {toFa(pis.length)} سند · جمع مبلغ:{" "}
                  <span className="font-bold tabular-nums" dir="ltr">{formatCurrency(piTotal)}</span>
                </div>
              </div>
            </div>

            <div className="divide-y">
              {customerEntries.map(([cid, rows]) => (
                <div key={cid}>
                  {multiCustomer && (
                    <div className="px-5 py-2 bg-muted/20 text-xs font-semibold flex items-center gap-1.5">
                      <Icon name="customers" size={13} className="text-primary" />
                      {rows[0]?.customerName ?? cid}
                    </div>
                  )}
                  {rows.map((pi) => (
                    <div key={pi.id} className="px-5 py-3 flex items-center gap-3 flex-wrap hover:bg-accent/20 transition">
                      <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center font-black text-xs shrink-0">
                        {pi.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {pi.itemLabel}
                          {pi.itemId && (
                            <span className="text-[11px] text-muted-foreground font-normal mr-2">
                              سفارش #{toFa(pi.orderNumber)}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground tabular-nums" dir="ltr">
                          {formatCurrency(pi.totalAmount)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => openPi(pi, "edit")} className="gap-1.5 h-8">
                          <Icon name="edit" size={13} /> ویرایش پیش‌فاکتور
                        </Button>
                        <Button size="sm" onClick={() => openPi(pi, "doc")} className="gap-1.5 h-8">
                          <Icon name="print" size={13} /> چاپ
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* مودال پیش‌فاکتور — مستقیم روی ویرایش یا سند چاپی باز می‌شود */}
        <PreInvoiceModal
          orderId={piModal?.orderId ?? null}
          open={piModalOpen}
          onOpenChange={(v) => {
            setPiModalOpen(v);
            if (!v) setPiModal(null);
          }}
          initialDocId={piModal?.docId ?? null}
          initialView={piModal?.view ?? "doc"}
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
          needsDesign={needsDesign}
          needsPrint={needsPrint}
          designerUsers={designerUsers}
          printerUsers={printerUsers}
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
          isEditing={isEditing}
          designerName={designerUsers.find((u) => u.id === derivedDesignerId)?.name}
          printerName={printerUsers.find((u) => u.id === derivedPrinterId)?.name}
          designerUsers={designerUsers}
          printerUsers={printerUsers}
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
                if (step === 2) {
                  const hasEmptyProduct = customers.some((c) =>
                    (itemsByCustomer[c] ?? []).some((i) => !i.productId)
                  );
                  toast.error(
                    hasEmptyProduct
                      ? "برای هر آیتم یک محصول انتخاب کنید (ردیف‌های قرمز)"
                      : "هر مشتری باید حداقل یک آیتم داشته باشد"
                  );
                }
                if (step === 3) {
                  // Phase 13: تخصیص الزامی per-item — پیام دقیق با شمار آیتم
                  const missingDesign = allItemsFlat.filter(
                    (i) => i.stage === "design" && !i.designAssignee
                  );
                  const missingPrint = allItemsFlat.filter(
                    (i) => (i.stage === "design" || i.stage === "print") && !i.printAssignee
                  );
                  if (designerUsers.length > 1 && missingDesign.length > 0) {
                    toast.error(
                      `برای ${missingDesign.length} آیتم طراحی، طراحِ همان آیتم را انتخاب کنید (${designerUsers.length} طراح در سیستم)`
                    );
                  } else if (printerUsers.length > 1 && missingPrint.length > 0) {
                    toast.error(
                      `برای ${missingPrint.length} آیتم چاپ، چاپ‌کارِ همان آیتم را انتخاب کنید (${printerUsers.length} چاپ‌کار در سیستم)`
                    );
                  }
                }
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
          <span className={cn("text-sm font-semibold truncate", !item.productId && "text-rose-600 dark:text-rose-400")}>{item.productName || "آیتم جدید"}</span>
          {!item.productId && (
            <span className="text-[10px] font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full shrink-0">محصول انتخاب نشده</span>
          )}
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

// ─── Phase 12: انتخاب مسئوِِ مرحله (طراح/چاپ) ───────────────────
// ─── Phase 13: انتخاب مجری «همین آیتم» — فشرده، داخل کارت تاریخ ──────
// «هر ایتم جدا کارمند بهش تنظیم شه! ینی تو همون فرم تاریخ، کارمند هم
// انتخاب شه» — ردیف چیپ‌های رادیویی + هشدار مرخصی + بدون تخصیص.
type PickerUser = { id: string; name: string; email: string; onLeaveToday?: boolean; leaveNote?: string | null };

function ItemAssigneePicker({
  label, icon, accent, users, value, onChange, required,
}: {
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  accent: "violet" | "amber";
  users: PickerUser[];
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const accentCls =
    accent === "violet"
      ? "text-violet-600 bg-violet-500/10"
      : "text-amber-600 bg-amber-500/10";
  const activeUser = users.find((u) => u.id === value);

  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 space-y-1.5",
        required && !value ? "border-rose-400/70 bg-rose-50/40 dark:bg-rose-950/10" : "bg-muted/20"
      )}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold">
          <span className={cn("size-6 rounded-md grid place-items-center", accentCls)}>
            <Icon name={icon} size={12} />
          </span>
          {label}
          {activeUser?.onLeaveToday && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-medium"
              title={activeUser.leaveNote || "امروز در مرخصی است"}
            >
              مرخصی امروز
            </span>
          )}
        </div>
        {required && !value && (
          <span className="text-[9px] text-rose-600 dark:text-rose-400 font-medium">انتخاب کنید</span>
        )}
      </div>
      {users.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">کاربری با این ماژول نیست — استخر عمومی</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {users.map((u) => {
            const active = value === u.id;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => onChange(active ? "" : u.id)}
                title={u.email}
                className={cn(
                  "text-[11px] px-2.5 py-1 rounded-md border transition",
                  active
                    ? "border-primary/60 bg-primary/10 text-primary font-bold"
                    : u.onLeaveToday
                      ? "border-amber-300/60 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                      : "text-muted-foreground hover:bg-accent"
                )}
              >
                {u.name}
              </button>
            );
          })}
          {!required && (
            <button
              type="button"
              onClick={() => onChange("")}
              className={cn(
                "text-[10px] px-2 py-1 rounded-md border border-dashed transition",
                !value ? "border-primary/40 text-primary font-medium" : "text-muted-foreground hover:bg-accent"
              )}
            >
              بدون تخصیص (استخر عمومی)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function missingCountLabel(designN: number, printN: number) {
  const parts: string[] = [];
  if (designN > 0) parts.push(`${designN} آیتم بدون طراح`);
  if (printN > 0) parts.push(`${printN} آیتم بدون چاپ‌کار`);
  if (!parts.length) return null;
  return (
    <span className="text-[10px] px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-medium">
      {parts.join(" + ")}
    </span>
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
  // Phase 13: مجری‌های per-item — «هر ایتم جدا کارمند بهش تنظیم شه»
  needsDesign: boolean;
  needsPrint: boolean;
  designerUsers: { id: string; name: string; email: string; onLeaveToday?: boolean; leaveNote?: string | null }[];
  printerUsers: { id: string; name: string; email: string; onLeaveToday?: boolean; leaveNote?: string | null }[];
}) {
  const {
    splitMode, setSplitMode, priority, setPriority, endDate, setEndDate, noEndDate, setNoEndDate,
    note, setNote, customers, allCustomers, itemsByCustomer, updateItem, applyDatesToAll, customerCount,
    needsDesign, needsPrint, designerUsers, printerUsers,
  } = props;
  const allItems = Object.values(itemsByCustomer).flat();
  // ابزار اعمال-روی-همه (وضعیت محلی، جدا از آیتم‌ها)
  const [bulkDesign, setBulkDesign] = React.useState<{ start: string; end: string }>({ start: "", end: "" });
  const [bulkPrint, setBulkPrint] = React.useState<{ start: string; end: string }>({ start: "", end: "" });
  const scheduledCount = allItems.filter((i) => i.designStart || i.designEnd || i.printStart || i.printEnd).length;

  // آیا انتخاب per-item الزامی است؟ (بیش از یک کاربر همان ماژول)
  const designerRequired = designerUsers.length > 1;
  const printerRequired = printerUsers.length > 1;
  const missingDesign = allItems.filter((i) => i.stage === "design" && !i.designAssignee);
  const missingPrint = allItems.filter(
    (i) => (i.stage === "design" || i.stage === "print") && !i.printAssignee
  );
  // ابزار اعمال مجری روی همه (تسریع چند-آیتمی)
  function applyAssigneeToAll(field: "designAssignee" | "printAssignee", uid: string) {
    for (const cid of customers) {
      for (const it of itemsByCustomer[cid] ?? []) {
        const applicable =
          field === "designAssignee" ? it.stage === "design" : it.stage === "design" || it.stage === "print";
        if (applicable) updateItem(cid, it.id, { [field]: uid });
      }
    }
  }

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="size-9 rounded-xl bg-primary/10 text-primary grid place-items-center"><Icon name="calendar" size={20} /></div>
        <div><h2 className="font-semibold">زمان‌دهی، اولویت و تخصیص</h2><p className="text-xs text-muted-foreground">زمان‌بندی هر آیتم جداگانه است + تعیین مسئول طراحی و چاپ</p></div>
      </div>

      {/* ═══ Phase 13: تخصیص مجری‌ها per-item ═══ */}
      <div className="rounded-xl border border-violet-200/60 dark:border-violet-900/60 bg-violet-50/40 dark:bg-violet-950/15 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Icon name="userMultiple" size={17} className="text-primary" />
            <h3 className="font-medium text-sm">تخصیص مجری‌ها (هر آیتم مجزا)</h3>
          </div>
          {(designerRequired || printerRequired) && missingCountLabel(missingDesign.length, missingPrint.length)}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          طراح و چاپِ هر آیتم در همان کارتِ زمان‌بندی همان آیتم انتخاب می‌شود — سفارش فقط در پنل
          مجریِ همان آیتم ظاهر می‌شود و پس از طراحی، دقیقاً به چاپ‌کارِ انتخابیِ همان آیتم می‌رسد.
          {designerUsers.length <= 1 && printerUsers.length <= 1
            ? " تنها یک کاربر در هر ماژول دارید — به‌صورت خودکار انتخاب می‌شود."
            : ""}
        </p>
        {/* اعمال سریع مجری روی همهٔ آیتم‌ها */}
        {(designerUsers.length > 1 || printerUsers.length > 1) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {designerUsers.length > 1 && (
              <div className="rounded-lg border bg-card p-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Icon name="design" size={11} className="text-violet-500" /> طراح همه:
                </span>
                {designerUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => applyAssigneeToAll("designAssignee", u.id)}
                    className={cn(
                      "text-[10px] px-2 py-1 rounded-md border transition",
                      u.onLeaveToday
                        ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"
                        : "hover:bg-accent"
                    )}
                  >
                    {u.name}
                    {u.onLeaveToday && " (مرخصی)"}
                  </button>
                ))}
              </div>
            )}
            {printerUsers.length > 1 && (
              <div className="rounded-lg border bg-card p-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Icon name="print" size={11} className="text-amber-500" /> چاپ همه:
                </span>
                {printerUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => applyAssigneeToAll("printAssignee", u.id)}
                    className={cn(
                      "text-[10px] px-2 py-1 rounded-md border transition",
                      u.onLeaveToday
                        ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"
                        : "hover:bg-accent"
                    )}
                  >
                    {u.name}
                    {u.onLeaveToday && " (مرخصی)"}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
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
                <div
                  key={it.id}
                  className={cn(
                    "rounded-lg border p-3 space-y-2.5",
                    it.stage === "design" || it.stage === "print" ? "bg-card" : "bg-muted/30"
                  )}
                >
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

                  {it.stage === "warehouse" || it.stage === "completed" || it.stage === "archive" ? (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 py-1">
                      <Icon name="checkCircle" size={13} className="text-emerald-500" />
                      این آیتم از مرحلهٔ چاپ عبور کرده — زمان‌بندی و مجری لازم ندارد.
                    </p>
                  ) : (
                    <>
                      {/* ── تاریخ‌ها: آیتم طراحی → طراحی+چاپ؛ آیتم چاپ → فقط چاپ ── */}
                      {it.stage === "design" ? (
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
                      ) : (
                        <div className="grid grid-cols-2 gap-2.5">
                          <Field label="شروع چاپ">
                            <DatePicker value={it.printStart || null} onChange={(d) => updateItem(cid, it.id, { printStart: d ? format(d, "yyyy-MM-dd") : "" })} placeholder="—" className="w-full bg-transparent" />
                          </Field>
                          <Field label="پایان چاپ">
                            <DatePicker value={it.printEnd || null} onChange={(d) => updateItem(cid, it.id, { printEnd: d ? format(d, "yyyy-MM-dd") : "" })} placeholder="—" className="w-full bg-transparent" />
                          </Field>
                        </div>
                      )}

                      {/* ── Phase 13: مجری همین آیتم — در همان فرم تاریخ ── */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-0.5 border-t border-dashed pt-2.5">
                        {it.stage === "design" && (
                          <ItemAssigneePicker
                            label="طراح این آیتم"
                            icon="design"
                            accent="violet"
                            users={designerUsers}
                            value={it.designAssignee}
                            required={designerRequired}
                            onChange={(v) => updateItem(cid, it.id, { designAssignee: v })}
                          />
                        )}
                        <ItemAssigneePicker
                          label="چاپ‌کار این آیتم"
                          icon="print"
                          accent="amber"
                          users={printerUsers}
                          value={it.printAssignee}
                          required={printerRequired}
                          onChange={(v) => updateItem(cid, it.id, { printAssignee: v })}
                        />
                      </div>
                    </>
                  )}
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
  isEditing: boolean;
  // Phase 13: نام‌های مجری (derived — اولین مجری آیتم‌ها) برای بازنگری
  designerName?: string;
  printerName?: string;
  designerUsers?: PickerUser[];
  printerUsers?: PickerUser[];
}) {
  const {
    customers, itemsByCustomer, allCustomers, splitMode, priority, endDate, noEndDate,
    note, needsDesign, isEditing, designerName, printerName, designerUsers, printerUsers,
  } = props;
  const [tab, setTab] = React.useState(customers[0] ?? "");
  const activeCid = tab || customers[0] || "";
  const activeItems = itemsByCustomer[activeCid] ?? [];
  const allItems = Object.values(itemsByCustomer).flat();
  const activeCustomer = allCustomers.find((c) => c.id === activeCid);

  // Phase 11 — پیش‌فاکتور همیشگی: مرحلهٔ ۴ فقط اطلاع‌رسانی می‌دهد که پس از ثبت،
  // سندها خودکار صادر می‌شوند و در صفحهٔ موفقیت ویرایش/چاپ می‌شوند.
  const perItemPI = splitMode === "separated" || customers.length > 1;
  const piDocCount = perItemPI ? allItems.length : customers.length;

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
        <div><h2 className="font-semibold">بازنگری و ثبت نهایی</h2><p className="text-xs text-muted-foreground">مرور کامل جزئیات — پیش‌فاکتور پس از ثبت خودکار صادر می‌شود</p></div>
      </div>

      {/* ═══ ۱. خلاصهٔ سفارش ═══ */}
      <section className="rounded-xl border overflow-hidden">
        <SectionTitle icon="orders" title="خلاصهٔ سفارش" />
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <InfoCell icon="customers" label="مشتری اصلی" value={allCustomers.find((c) => c.id === customers[0])?.name ?? "—"}
            sub={customers.length > 1 ? `+${customers.length - 1} مشتری دیگر (سفارش تفکیکی)` : undefined} />
          <InfoCell icon="layers" label="نوع ثبت" value={splitMode === "grouped" ? "گروهی (یک سفارش)" : "تفکیک‌شده (هر آیتم یک سفارش)"} />
          {/* Phase 12: تخصیص‌ها در بازنگری نهایی */}
          <InfoCell icon="design" label="مسئول طراحی"
            value={designerName ?? "—"}
            sub={designerName ? "سفارش فقط در پنل او" : needsDesign ? "استخر عمومی طراح‌ها" : "بدون مرحلهٔ طراحی"} />
          <InfoCell icon="print" label="مسئول چاپ"
            value={printerName ?? "—"}
            sub={printerName ? "پس از طراحی به پنل او" : "استخر عمومی چاپ‌کارها"} />
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
                  <th className="text-center font-medium px-2 py-2">مجری‌ها</th>
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
                      <td className="px-2 py-2 text-center">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {it.stage === "design" || it.stage === "print" ? (
                            <>
                              {it.designAssignee && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-300">
                                  طراح: {designerUsers?.find((u) => u.id === it.designAssignee)?.name ?? "—"}
                                </span>
                              )}
                              {it.printAssignee && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-300">
                                  چاپ: {printerUsers?.find((u) => u.id === it.printAssignee)?.name ?? "—"}
                                </span>
                              )}
                              {!it.designAssignee && !it.printAssignee && (
                                <span className="text-[10px] text-muted-foreground">استخر عمومی</span>
                              )}
                            </>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </div>
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

      {/* ═══ ۵. پیش‌فاکتور (Phase 11 — همیشگی) ═══ */}
      <section className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-emerald-500/15 text-emerald-600 grid place-items-center">
            <Icon name="receipt" size={17} />
          </div>
          <div>
            <div className="font-semibold text-sm">
              پیش‌فاکتور {perItemPI ? `(به‌ازای هر آیتم — ${toFa(piDocCount)} سند)` : "(یک سند برای کل گروه)"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              سندها همزمان با ثبت سفارش به‌صورت خودکار صادر می‌شوند — بلافاصله پس از ثبت، همان‌جا ویرایش و چاپ می‌شوند
              {perItemPI ? "؛ زمان طراحی/چاپ هر آیتم روی سند خودش درج می‌شود" : "؛ زمان‌بندی کل گروه روی سند درج می‌شود"}
            </div>
          </div>
        </div>
      </section>
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

// ─── Gregorian date fmt (کل سیستم میلادی است) ────────────────────
// ورودی yyyy-MM-dd (یا ISO کامل) → خروجی yyyy/MM/dd میلادی.
// بدون Date/Intl → بدون ریسک تایم‌زون و بدون تقویم شمسی.
function gregISO(iso: string): string {
  const s = (iso ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.replace(/-/g, "/") : (iso || "—");
}
function fmtDate(iso: string) {
  return gregISO(iso);
}
function fmtShort(iso: string) {
  return gregISO(iso);
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
