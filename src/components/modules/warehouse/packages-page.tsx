"use client";

// ─── Phase 16: بسته‌بندی و ارسال — بسته‌ها، بج QR، ارسال و تحویل ────
// ساختار صفحه:
//   ۱) «بسته جدید» — فرم اینلاین (بدون دیالوگ، عین ثبت هزینهٔ فاز ۱۵):
//      انتخاب اقلام انبار از سفارش‌های packable + مشخصات مقصد + جمع زنده
//      → POST /api/packages → مودال جزئیات بستهٔ تازه (تب بج) باز می‌شود.
//   ۲) فیلتر وضعیت (چیپ‌های زنده) + جستجوی سرور (q) + شمارنده
//   ۳) جدول بسته‌ها (کد، سفارش‌ها، مشتری، آدرس، اقلام، پیک، COD، وضعیت)
//   ۴) مودال عریض ۳-تبی: جزئیات (تایم‌لاین + اقدام وضعیت) / محتویات /
//      بج و QR (پیش‌نمایش + دانلود PDF/PNG + کپی لینک عمومی)

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { useAppStore } from "@/stores/app-store";
import { PageHeader, EmptyState, StatusBadge } from "@/components/shared";
import { DataTable } from "@/components/ui/data-table";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  makePackageQr,
  downloadBadgePdf,
  downloadBadgePng,
  packagePublicUrl,
  type BadgePackage,
} from "@/lib/package-badge";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────

type PkgStatus = "packing" | "ready" | "sent" | "delivered" | "cancelled";

type PkgOrder = {
  id: string;
  number: number;
  status: string;
  totalAmount: number;
  paidAmount: number;
  address: string | null;
  customer: { id: string; name: string; phone: string; address: string | null };
};

type Pkg = {
  id: string;
  code: string;
  seq: number;
  address: string;
  receiverName: string | null;
  receiverPhone: string | null;
  contentsNote: string | null;
  courier: string | null;
  trackingNo: string | null;
  status: PkgStatus;
  codAmount: number;
  codCollected: boolean;
  note: string | null;
  packedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  createdByName: string | null;
  orders: PkgOrder[];
  items: {
    id: string;
    orderId: string;
    orderNumber: number;
    orderItemId: string | null;
    productName: string;
    quantity: number;
  }[];
  itemsCount: number;
};

type PkgDetail = Omit<Pkg, "orders" | "items" | "itemsCount"> & {
  orders: (PkgOrder & {
    // Phase 17: گیت خروج از انبار — وضعیت فاکتور برای دیالوگ ارسال
    invoiceWithPackage: boolean;
    invoice: { totalAmount: number; paidAmount: number; status: string } | null;
    allItems: { id: string; productName: string; stage: string; quantity: number }[];
    itemsInPackage: { productName: string; quantity: number }[];
  })[];
};

type PackableOrder = {
  id: string;
  number: number;
  status: string;
  totalAmount: number;
  paidAmount: number;
  address: string | null;
  customer: { id: string; name: string; phone: string; address: string | null };
  items: {
    id: string;
    productName: string;
    quantity: number;
    note: string | null;
    packedIn: { code: string; status: string } | null;
  }[];
};

// ─── Status meta ───────────────────────────────────────────────────────

const PKG_STATUS_META: Record<
  PkgStatus,
  { label: string; chip: string; icon: IconName; step: number }
> = {
  packing: {
    label: "در حال بسته‌بندی",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    icon: "package",
    step: 0,
  },
  ready: {
    label: "آمادهٔ ارسال",
    chip: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
    icon: "packageAdd",
    step: 1,
  },
  sent: {
    label: "در راه",
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
    icon: "truckDelivery",
    step: 2,
  },
  delivered: {
    label: "تحویل‌شده",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    icon: "packageDelivered",
    step: 3,
  },
  cancelled: {
    label: "لغوشده",
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    icon: "cancel",
    step: -1,
  },
};

const STATUS_FILTERS: { value: "all" | PkgStatus; label: string }[] = [
  { value: "all", label: "همه" },
  { value: "packing", label: "بسته‌بندی" },
  { value: "ready", label: "آمادهٔ ارسال" },
  { value: "sent", label: "در راه" },
  { value: "delivered", label: "تحویل‌شده" },
  { value: "cancelled", label: "لغوشده" },
];

const STAGE_CHIP: Record<string, { label: string; cls: string }> = {
  design: { label: "طراح", cls: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" },
  print: { label: "چاپ", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  warehouse: { label: "انبار", cls: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300" },
  completed: { label: "تکمیل", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  archive: { label: "آرشیو", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

const fa = (n: number) => n.toLocaleString("fa-IR");

function PkgStatusChip({ status, className }: { status: string; className?: string }) {
  const m = PKG_STATUS_META[status as PkgStatus];
  if (!m) return <StatusBadge status={status} className={className} />;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        m.chip,
        className
      )}
    >
      <Icon name={m.icon} size={12} />
      {m.label}
    </span>
  );
}

/** جستجوی سرور با تأخیر کوتاه (q → API) */
function useDebounced(value: string, delay = 400): string {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

// ─── Page ──────────────────────────────────────────────────────────────

type DestForm = {
  address: string;
  receiverName: string;
  receiverPhone: string;
  contentsNote: string;
  courier: string;
  trackingNo: string;
  cod: string;
  note: string;
};

const EMPTY_FORM: DestForm = {
  address: "",
  receiverName: "",
  receiverPhone: "",
  contentsNote: "",
  courier: "",
  trackingNo: "",
  cod: "",
  note: "",
};

export function PackagesPage() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const boardFilter = useAppStore((s) => s.boardFilter);
  const setBoardFilter = useAppStore((s) => s.setBoardFilter);

  // فیلترها
  const [status, setStatus] = React.useState<"all" | PkgStatus>("all");
  const [q, setQ] = React.useState("");
  const debouncedQ = useDebounced(q);

  // مودال
  const [modalId, setModalId] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalTab, setModalTab] = React.useState<"details" | "contents" | "badge">("details");
  const openPkg = React.useCallback(
    (id: string, tab: "details" | "contents" | "badge" = "details") => {
      setModalId(id);
      setModalTab(tab);
      setModalOpen(true);
    },
    []
  );

  // فرم «بسته جدید»
  const [createOpen, setCreateOpen] = React.useState(
    () => typeof window !== "undefined" && window.innerWidth >= 1024
  );
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [form, setForm] = React.useState<DestForm>(EMPTY_FORM);
  const [touched, setTouched] = React.useState({ address: false, contentsNote: false });

  // ── فیلتر انتقالی از داشبورد (کارت‌های کلیک‌شون) ──
  React.useEffect(() => {
    if (boardFilter && boardFilter.module === "warehouse") {
      const v = boardFilter.value;
      if (v === "all" || v in PKG_STATUS_META) setStatus(v as "all" | PkgStatus);
      setBoardFilter("warehouse", null); // مصرف شد
    }
  }, [boardFilter, setBoardFilter]);

  // ── Queries ──
  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ["packages", "list", status, debouncedQ],
    queryFn: () =>
      api<{ packages: Pkg[] }>(
        `/api/packages?${status !== "all" ? `status=${status}&` : ""}${
          debouncedQ ? `q=${encodeURIComponent(debouncedQ)}` : ""
        }`
      ),
    refetchInterval: 30_000,
  });

  // شمارنده‌های زندهٔ چیپ‌ها — کوئری جدا بدون فیلتر
  const { data: allData } = useQuery({
    queryKey: ["packages", "all"],
    queryFn: () => api<{ packages: Pkg[] }>("/api/packages"),
    refetchInterval: 60_000,
  });

  // سفارش‌های آمادهٔ بسته‌بندی (فرم بسته جدید)
  const { data: packableData, isLoading: packableLoading } = useQuery({
    queryKey: ["packages", "packable"],
    queryFn: () => api<{ orders: PackableOrder[] }>("/api/packages?packable=1"),
    refetchInterval: 60_000,
  });

  const packages = listData?.packages ?? [];
  const allPackages = allData?.packages ?? [];
  const packableOrders = packableData?.orders ?? [];

  const statusCounts = React.useMemo(() => {
    const c: Record<string, number> = { all: 0, packing: 0, ready: 0, sent: 0, delivered: 0, cancelled: 0 };
    for (const p of allPackages) {
      c.all += 1;
      if (c[p.status] !== undefined) c[p.status] += 1;
    }
    return c;
  }, [allPackages]);

  // ── انتخاب اقلام ──
  const selectedItems = React.useMemo(() => {
    const out: { orderId: string; itemId: string; quantity: number; productName: string }[] = [];
    for (const o of packableOrders) {
      for (const it of o.items) {
        if (selected.has(it.id)) {
          out.push({ orderId: o.id, itemId: it.id, quantity: it.quantity, productName: it.productName });
        }
      }
    }
    return out;
  }, [packableOrders, selected]);

  const selectedCount = selectedItems.length;
  const selectedOrderCount = new Set(selectedItems.map((s) => s.orderId)).size;
  const packableFreeCount = packableOrders.reduce(
    (s, o) => s + o.items.filter((it) => !it.packedIn).length,
    0
  );

  // امضای انتخاب — برای خودکارکردن آدرس/شرح (فقط وقتی کاربر دست نزده)
  const selectionSig = selectedItems.map((s) => s.itemId).sort().join(",");
  React.useEffect(() => {
    if (touched.address && touched.contentsNote) return;
    const firstOrder = packableOrders.find((o) => o.items.some((it) => selected.has(it.id))) ?? null;
    // شرح پیشنهادی: «۲× کارت ویزیت + ۱× تراکت»
    const byName = new Map<string, number>();
    for (const it of selectedItems) byName.set(it.productName, (byName.get(it.productName) ?? 0) + it.quantity);
    const suggestion = [...byName.entries()].map(([name, qty]) => `${fa(qty)}× ${name}`).join(" + ");
    setForm((f) => ({
      ...f,
      address: touched.address ? f.address : firstOrder?.address ?? "",
      contentsNote: touched.contentsNote ? f.contentsNote : suggestion,
    }));
  }, [selectionSig]);

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const codNum = form.cod.trim() === "" ? 0 : Number(form.cod);
  const codValid = form.cod.trim() === "" || (Number.isFinite(codNum) && codNum >= 0);
  const canCreate = selectedCount > 0 && form.address.trim().length > 0 && codValid;

  // ── ساخت بسته ──
  const createMut = useMutation({
    mutationFn: () =>
      api<{ package: { id: string; code: string; seq: number }; message: string }>(
        "/api/packages",
        {
          method: "POST",
          body: JSON.stringify({
            items: selectedItems.map((s) => ({
              orderId: s.orderId,
              orderItemId: s.itemId,
              quantity: s.quantity,
            })),
            address: form.address.trim(),
            receiverName: form.receiverName.trim(),
            receiverPhone: form.receiverPhone.trim(),
            contentsNote: form.contentsNote.trim(),
            courier: form.courier.trim(),
            trackingNo: form.trackingNo.trim(),
            codAmount: codValid ? codNum : 0,
            note: form.note.trim(),
          }),
        }
      ),
    onSuccess: (res) => {
      toast.success(`بستهٔ ${res.package.code} ساخته شد — بج QR آماده است`);
      invalidate(["packages", "warehouse", "orders"]);
      qc.invalidateQueries({ queryKey: ["packages", "packable"] });
      setSelected(new Set());
      setForm(EMPTY_FORM);
      setTouched({ address: false, contentsNote: false });
      openPkg(res.package.id, "badge");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Columns ──
  const columns = React.useMemo<ColumnDef<Pkg>[]>(
    () => [
      {
        id: "code",
        accessorFn: (r) => r.seq,
        header: "بسته",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span
              className="font-mono text-xs font-bold bg-foreground/5 border rounded-md px-1.5 py-0.5"
              dir="ltr"
            >
              {row.original.code}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium">
              #{row.original.seq}
            </span>
          </div>
        ),
        enableSorting: true,
      },
      {
        id: "orders",
        accessorFn: (r) => r.orders[0]?.number ?? 0,
        header: "سفارش‌ها",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.orders.slice(0, 3).map((o) => (
              <span
                key={o.id}
                className="text-[10px] font-mono font-bold bg-muted rounded px-1.5 py-0.5"
              >
                #{o.number}
              </span>
            ))}
            {row.original.orders.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{fa(row.original.orders.length - 3)}
              </span>
            )}
            {row.original.orders.length === 0 && (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
        ),
      },
      {
        id: "customer",
        accessorFn: (r) => r.orders[0]?.customer.name ?? "",
        header: "مشتری",
        cell: ({ row }) => (
          <span className="font-medium text-sm">
            {row.original.orders[0]?.customer.name ?? "—"}
          </span>
        ),
      },
      {
        id: "address",
        accessorFn: (r) => r.address,
        header: "آدرس",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground block truncate max-w-[180px]">
            {row.original.address || "—"}
          </span>
        ),
      },
      {
        id: "items",
        accessorFn: (r) => r.itemsCount,
        header: "اقلام",
        cell: ({ row }) => {
          const names = row.original.items.map((i) => i.productName);
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs font-semibold tabular-nums bg-muted rounded-md px-2 py-0.5 cursor-help">
                  {fa(row.original.itemsCount)} قلم
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px]">
                <div className="text-xs space-y-0.5">
                  {names.slice(0, 8).map((n, i) => (
                    <div key={i}>• {n}</div>
                  ))}
                  {names.length > 8 && (
                    <div className="text-muted-foreground">+{fa(names.length - 8)} مورد دیگر</div>
                  )}
                  {names.length === 0 && <div className="text-muted-foreground">—</div>}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        },
        enableSorting: true,
      },
      {
        id: "courier",
        accessorFn: (r) => r.courier ?? "",
        header: "پیک / پیگیری",
        cell: ({ row }) => (
          <div className="text-xs min-w-0">
            <div className="truncate max-w-[120px]">
              {row.original.courier || <span className="text-muted-foreground">—</span>}
            </div>
            {row.original.trackingNo && (
              <div className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
                {row.original.trackingNo}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "cod",
        accessorFn: (r) => r.codAmount,
        header: "COD",
        meta: { align: "end" },
        cell: ({ row }) => {
          if (row.original.codAmount <= 0)
            return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <div className="flex items-center gap-1 justify-end">
              <span
                className="text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 rounded-full px-2 py-0.5 tabular-nums"
                dir="ltr"
              >
                {formatCurrency(row.original.codAmount)}
              </span>
              {row.original.codCollected && (
                <Icon name="checkCircle" size={13} className="text-emerald-500 shrink-0" />
              )}
            </div>
          );
        },
        enableSorting: true,
      },
      {
        id: "status",
        accessorFn: (r) => PKG_STATUS_META[r.status]?.step ?? 0,
        header: "وضعیت",
        cell: ({ row }) => <PkgStatusChip status={row.original.status} />,
        enableSorting: true,
      },
      {
        id: "packedAt",
        accessorFn: (r) => new Date(r.packedAt).getTime(),
        header: "تاریخ",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDate(row.original.packedAt)}
          </span>
        ),
        enableSorting: true,
      },
      {
        id: "actions",
        header: "",
        meta: { align: "center", hideable: false },
        cell: ({ row }) => (
          <div className="flex items-center justify-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1"
              onClick={(e) => {
                e.stopPropagation();
                openPkg(row.original.id, "details");
              }}
            >
              <Icon name="view" size={13} /> مشاهده
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 gap-1"
              onClick={(e) => {
                e.stopPropagation();
                openPkg(row.original.id, "badge");
              }}
            >
              <Icon name="print" size={13} /> بج
            </Button>
          </div>
        ),
      },
    ],
    [openPkg]
  );

  const activeFilter = STATUS_FILTERS.find((f) => f.value === status);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        <PageHeader
          title="بسته‌بندی و ارسال"
          icon="package"
          description="دریافت کالا از چاپ → بسته‌بندی و بج QR → ارسال → تحویل و پول در محل"
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCreateOpen(true);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="gap-1.5"
            >
              <Icon name="packageAdd" size={14} />
              بسته جدید
            </Button>
          }
        />

        {/* ─── ۱) بسته جدید — فرم اینلاین (بدون دیالوگ) ─── */}
        <Card className="p-0 overflow-hidden">
          <Collapsible open={createOpen} onOpenChange={setCreateOpen}>
            <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
                  <Icon name="packageAdd" size={17} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">بسته جدید</h3>
                  <p className="text-[11px] text-muted-foreground">
                    اقلام آمادهٔ انبار را انتخاب کنید، مقصد را مشخص کنید و بج QR بگیرید
                  </p>
                </div>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <Icon name={createOpen ? "chevronUp" : "chevronDown"} size={14} />
                  {createOpen ? "بستن" : "باز کردن"}
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <div className="p-4 space-y-4">
                {/* ۱-۱) انتخاب اقلام */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <span className="size-5 rounded-md bg-primary/10 text-primary grid place-items-center text-[10px] font-bold shrink-0">
                        ۱
                      </span>
                      انتخاب اقلام (دریافت‌شده از چاپ)
                    </div>
                    <span
                      className={cn(
                        "text-[11px] font-medium rounded-full px-2.5 py-1 tabular-nums",
                        selectedCount > 0
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {fa(selectedCount)} قلم انتخاب‌شده از {fa(packableFreeCount)} قلم آماده
                    </span>
                  </div>

                  {packableLoading ? (
                    <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                      <Icon name="loading" size={16} className="animate-spin" />
                      در حال بارگذاری اقلام انبار...
                    </div>
                  ) : packableOrders.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                      <Icon name="checkCircle" size={18} className="text-emerald-500" />
                      قلم آمادهٔ بسته‌بندی نیست — اقلام بعد از تکمیل چاپ به انبار می‌رسند
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {packableOrders.map((o) => (
                        <PackableOrderCard
                          key={o.id}
                          order={o}
                          selected={selected}
                          onToggle={toggleItem}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* ۱-۲) مشخصات مقصد و ارسال */}
                <div className="space-y-2.5">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <span className="size-5 rounded-md bg-primary/10 text-primary grid place-items-center text-[10px] font-bold shrink-0">
                      ۲
                    </span>
                    مشخصات مقصد و ارسال
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="آدرس تحویل" required className="md:col-span-2">
                      <Textarea
                        rows={2}
                        value={form.address}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, address: e.target.value }));
                          setTouched((t) => ({ ...t, address: true }));
                        }}
                        placeholder="نشانی گیرنده — از سفارش اول انتخاب‌شده پیشنهاد می‌شود…"
                      />
                    </Field>
                    <Field label="نام گیرنده">
                      <Input
                        value={form.receiverName}
                        onChange={(e) => setForm((f) => ({ ...f, receiverName: e.target.value }))}
                        placeholder="اختیاری — مثلاً خانم احمدی"
                      />
                    </Field>
                    <Field label="تلفن گیرنده">
                      <Input
                        dir="ltr"
                        value={form.receiverPhone}
                        onChange={(e) => setForm((f) => ({ ...f, receiverPhone: e.target.value }))}
                        placeholder="07xx xxx xxxx"
                      />
                    </Field>
                    <Field
                      label="شرح محتویات"
                      className="md:col-span-2"
                      hint={touched.contentsNote ? undefined : "از اقلام انتخابی پیشنهاد شده — قابل ویرایش"}
                    >
                      <Input
                        value={form.contentsNote}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, contentsNote: e.target.value }));
                          setTouched((t) => ({ ...t, contentsNote: true }));
                        }}
                        placeholder="۲× کارت ویزیت + ۱× تراکت"
                      />
                    </Field>
                    <Field label="شرکت پیک">
                      <Input
                        value={form.courier}
                        onChange={(e) => setForm((f) => ({ ...f, courier: e.target.value }))}
                        placeholder="اختیاری — بعداً هم قابل ثبت است"
                      />
                    </Field>
                    <Field label="شماره پیگیری">
                      <Input
                        dir="ltr"
                        value={form.trackingNo}
                        onChange={(e) => setForm((f) => ({ ...f, trackingNo: e.target.value }))}
                        placeholder="اختیاری…"
                      />
                    </Field>
                    <Field label="پول در محل (COD)">
                      <Input
                        type="number"
                        min={0}
                        dir="ltr"
                        className="text-center"
                        value={form.cod}
                        onChange={(e) => setForm((f) => ({ ...f, cod: e.target.value }))}
                        placeholder="0"
                      />
                    </Field>
                    <Field label="یادداشت">
                      <Input
                        value={form.note}
                        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                        placeholder="اختیاری…"
                      />
                    </Field>
                    {!codValid && (
                      <p className="md:col-span-2 text-[11px] text-rose-600">
                        مبلغ پول در محل نامعتبر است
                      </p>
                    )}
                  </div>
                </div>

                {/* ۱-۳) جمع و ثبت */}
                <div className="rounded-xl border bg-primary/[0.04] p-3.5 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5 flex-wrap text-xs">
                    <span className="font-medium">
                      <b className="tabular-nums">{fa(selectedOrderCount)}</b> سفارش
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-medium">
                      <b className="tabular-nums">{fa(selectedCount)}</b> قلم
                    </span>
                    {codValid && codNum > 0 && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-amber-700 dark:text-amber-300 font-bold" dir="ltr">
                          COD: {formatCurrency(codNum)}
                        </span>
                      </>
                    )}
                    {selectedCount === 0 && (
                      <span className="text-muted-foreground">
                        برای ساخت بسته حداقل یک قلم انتخاب کنید
                      </span>
                    )}
                  </div>
                  <Button
                    size="lg"
                    className="gap-2"
                    disabled={!canCreate || createMut.isPending}
                    onClick={() => createMut.mutate()}
                  >
                    <Icon
                      name={createMut.isPending ? "loading" : "packageAdd"}
                      size={18}
                      className={createMut.isPending ? "animate-spin" : ""}
                    />
                    ساخت بسته
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* ─── ۲) فیلترها ─── */}
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
              <Icon name="filter" size={13} /> وضعیت:
            </span>
            <div
              role="radiogroup"
              aria-label="فیلتر وضعیت بسته"
              className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-1"
            >
              {STATUS_FILTERS.map((f) => {
                const active = status === f.value;
                const count = statusCounts[f.value] ?? 0;
                const meta = f.value !== "all" ? PKG_STATUS_META[f.value] : null;
                return (
                  <button
                    key={f.value}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setStatus(f.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                      active
                        ? "bg-background text-foreground shadow-sm border"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                    )}
                  >
                    {meta && <Icon name={meta.icon} size={13} />}
                    {f.label}
                    <span
                      className={cn(
                        "text-[10px] tabular-nums rounded-full px-1.5 py-0.5",
                        active ? "bg-muted text-foreground" : "bg-muted/60 text-muted-foreground"
                      )}
                    >
                      {fa(count)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Icon
                name="search"
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="جستجو: کد بسته، آدرس، پیک، مشتری…"
                className="w-full h-9 rounded-md border bg-background pr-9 pl-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <span className="mr-auto text-xs text-muted-foreground tabular-nums">
              {fa(packages.length)} بسته
              {status !== "all" && activeFilter ? ` در «${activeFilter.label}»` : ""}
              {debouncedQ !== q && " — در حال جستجو…"}
            </span>
          </div>
        </Card>

        {/* ─── ۳) جدول بسته‌ها ─── */}
        <Card className="p-4">
          <DataTable
            columns={columns}
            data={packages}
            isLoading={listLoading}
            onRowClick={(p) => openPkg(p.id, "details")}
            showColumnToggle={false}
            pageSize={15}
            emptyState={
              q.trim() || status !== "all" ? (
                <EmptyState
                  icon="search"
                  title="بسته‌ای یافت نشد"
                  description="فیلتر وضعیت یا عبارت جستجو را تغییر دهید"
                />
              ) : (
                <EmptyState
                  icon="package"
                  title="هنوز بسته‌ای ساخته نشده"
                  description="از فرم «بسته جدید» بالای صفحه، اقلام انبار را بسته‌بندی کنید"
                />
              )
            }
          />
        </Card>

        {/* ─── ۴) مودال جزئیات بسته ─── */}
        <PackageDetailModal
          pkgId={modalId}
          open={modalOpen}
          onOpenChange={setModalOpen}
          tab={modalTab}
          onTabChange={setModalTab}
        />
      </div>
    </TooltipProvider>
  );
}

// ─── Packable order card (فرم بسته جدید) ──────────────────────────────

function PackableOrderCard({
  order,
  selected,
  onToggle,
}: {
  order: PackableOrder;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const allPacked = order.items.length > 0 && order.items.every((it) => it.packedIn);
  return (
    <div className={cn("rounded-xl border overflow-hidden", allPacked && "opacity-70")}>
      <div className="px-3.5 py-2.5 border-b bg-muted/30 flex items-center gap-2 flex-wrap">
        <span className="font-mono text-sm font-bold">#{order.number}</span>
        <span className="text-sm font-medium truncate">{order.customer?.name ?? "—"}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
          {order.customer?.phone}
        </span>
        <StatusBadge status={order.status} />
        {order.address && (
          <span
            className="mr-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-background border rounded-full px-2 py-0.5 max-w-[260px]"
            title={order.address}
          >
            <Icon name="mapPin" size={11} className="shrink-0" />
            <span className="truncate">{order.address}</span>
          </span>
        )}
      </div>
      <div className="divide-y">
        {order.items.map((it) => {
          const checked = selected.has(it.id);
          return (
            <label
              key={it.id}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5 transition",
                it.packedIn ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-accent/40"
              )}
            >
              <Checkbox
                checked={checked}
                disabled={!!it.packedIn}
                onCheckedChange={() => onToggle(it.id)}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{it.productName}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {fa(it.quantity)} عدد{it.note ? ` — ${it.note}` : ""}
                </div>
              </div>
              {it.packedIn && (
                <span className="text-[10px] font-medium text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-950/60 rounded-full px-2 py-0.5 shrink-0 font-mono">
                  در بستهٔ {it.packedIn.code}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ─── Modal: جزئیات بسته (عریض + ۳ تب) ─────────────────────────────────

function PackageDetailModal({
  pkgId,
  open,
  onOpenChange,
  tab,
  onTabChange,
}: {
  pkgId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tab: "details" | "contents" | "badge";
  onTabChange: (t: "details" | "contents" | "badge") => void;
}) {
  const invalidate = useInvalidate();
  const qc = useQueryClient();

  // دیالوگ‌های فرعی
  const [sendOpen, setSendOpen] = React.useState(false);
  const [sendCourier, setSendCourier] = React.useState("");
  const [sendTracking, setSendTracking] = React.useState("");

  const [deliverOpen, setDeliverOpen] = React.useState(false);
  const [deliverReceiver, setDeliverReceiver] = React.useState("");
  const [collectCod, setCollectCod] = React.useState(true);

  const [cancelOpen, setCancelOpen] = React.useState(false);

  // بج
  const [qrSrc, setQrSrc] = React.useState<string | null>(null);
  const [badgeBusy, setBadgeBusy] = React.useState<"pdf" | "png" | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["packages", "detail", pkgId],
    queryFn: () => api<{ package: PkgDetail }>(`/api/packages/${pkgId}`),
    enabled: !!pkgId && open,
  });
  const pkg = data?.package ?? null;

  // ── PATCH وضعیت/فیلد ──
  const patchMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ message?: string; completedOrders?: number; codTotal?: number }>(
        `/api/packages/${pkgId}`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),
    onSuccess: (res) => {
      toast.success(res.message ?? "بسته به‌روزرسانی شد");
      setSendOpen(false);
      setDeliverOpen(false);
      setCancelOpen(false);
      invalidate(["packages", "warehouse", "orders", "revenues", "finance"]);
      if (pkgId) qc.invalidateQueries({ queryKey: ["packages", "detail", pkgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // پیش‌نمایش QR — فقط وقتی تب بج باز است
  React.useEffect(() => {
    if (tab !== "badge" || !pkg) return;
    let alive = true;
    setQrSrc(null);
    makePackageQr(pkg.code)
      .then((url) => {
        if (alive) setQrSrc(url);
      })
      .catch(() => {
        if (alive) setQrSrc(null);
      });
    return () => {
      alive = false;
    };
  }, [tab, pkg?.code]);

  // ── اکشن‌های بج ──
  const runBadge = async (kind: "pdf" | "png") => {
    if (!pkg) return;
    setBadgeBusy(kind);
    try {
      if (kind === "pdf") await downloadBadgePdf(pkg as BadgePackage);
      else await downloadBadgePng(pkg as BadgePackage);
      toast.success(kind === "pdf" ? "فایل PDF بج دانلود شد" : "تصویر PNG بج دانلود شد");
    } catch {
      toast.error("ساخت فایل بج ناموفق بود");
    } finally {
      setBadgeBusy(null);
    }
  };

  const copyLink = async () => {
    if (!pkg) return;
    try {
      await navigator.clipboard.writeText(packagePublicUrl(pkg.code));
      toast.success("لینک عمومی بسته کپی شد");
    } catch {
      toast.error("کپی لینک ناموفق بود");
    }
  };

  const openSend = () => {
    if (!pkg) return;
    setSendCourier(pkg.courier ?? "");
    setSendTracking(pkg.trackingNo ?? "");
    setSendOpen(true);
  };

  const openDeliver = () => {
    if (!pkg) return;
    setDeliverReceiver(pkg.receiverName ?? pkg.orders[0]?.customer.name ?? "");
    setCollectCod(pkg.codAmount > 0);
    setDeliverOpen(true);
  };

  const sendBody: Record<string, unknown> = {
    status: "sent",
    ...(sendCourier.trim() ? { courier: sendCourier.trim() } : {}),
    ...(sendTracking.trim() ? { trackingNo: sendTracking.trim() } : {}),
  };

  const deliverBody: Record<string, unknown> = {
    status: "delivered",
    ...(deliverReceiver.trim() ? { receiverName: deliverReceiver.trim() } : {}),
    collectCod,
  };

  const pkgItemCount = pkg?.orders.reduce((s, o) => s + o.itemsInPackage.length, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-5xl w-[96vw] sm:w-[92vw] p-0 gap-0 overflow-hidden rounded-xl"
      >
        {!pkg ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <DialogTitle className="sr-only">جزئیات بسته</DialogTitle>
            {isLoading ? (
              <>
                <Icon name="loading" size={28} className="animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">در حال بارگذاری بسته…</span>
              </>
            ) : isError ? (
              <>
                <Icon name="alertTriangle" size={26} className="text-rose-500" />
                <span className="text-sm text-muted-foreground">خطا در دریافت جزئیات بسته</span>
              </>
            ) : null}
          </div>
        ) : (
          <>
            {/* ── سربرگ ── */}
            <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-l from-cyan-500/10 via-cyan-500/[0.04] to-transparent">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-12 rounded-xl bg-gradient-to-br from-cyan-500/15 to-cyan-500/5 text-cyan-600 dark:text-cyan-400 grid place-items-center shrink-0 border border-cyan-500/10">
                    <Icon name="package" size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <DialogTitle className="text-lg font-bold font-mono" dir="ltr">
                        {pkg.code}
                      </DialogTitle>
                      <span className="text-[11px] font-semibold border px-2 py-0.5 rounded-full">
                        بستهٔ #{pkg.seq}
                      </span>
                      <PkgStatusChip status={pkg.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Icon name="user" size={12} />
                        {pkg.createdByName ?? "—"}
                      </span>
                      <span>•</span>
                      <span className="tabular-nums">{formatDateTime(pkg.packedAt)}</span>
                      <span>•</span>
                      <span className="tabular-nums">
                        {fa(pkg.orders.length)} سفارش · {fa(pkgItemCount)} قلم
                      </span>
                    </div>
                  </div>
                </div>
                {pkg.codAmount > 0 && (
                  <div
                    className={cn(
                      "rounded-xl border px-3 py-2 text-[11px] font-bold tabular-nums shrink-0",
                      pkg.codCollected
                        ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300"
                        : "border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300"
                    )}
                    dir="ltr"
                  >
                    COD: {formatCurrency(pkg.codAmount)}
                    {pkg.codCollected ? " ✓" : ""}
                  </div>
                )}
              </div>
            </div>

            {/* ── تب‌ها ── */}
            <Tabs
              value={tab}
              onValueChange={(v) => onTabChange(v as "details" | "contents" | "badge")}
              dir="rtl"
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="px-6 pt-3 pb-0 border-b bg-muted/20">
                <TabsList className="bg-transparent p-0 h-auto gap-1">
                  <TabsTrigger
                    value="details"
                    className="px-4 py-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-cyan-500 data-[state=active]:shadow-none rounded-t-lg text-sm gap-1.5"
                  >
                    <Icon name="info" size={15} />
                    جزئیات
                  </TabsTrigger>
                  <TabsTrigger
                    value="contents"
                    className="px-4 py-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-cyan-500 data-[state=active]:shadow-none rounded-t-lg text-sm gap-1.5"
                  >
                    <Icon name="layers" size={15} />
                    محتویات
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      ({fa(pkgItemCount)})
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="badge"
                    className="px-4 py-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-cyan-500 data-[state=active]:shadow-none rounded-t-lg text-sm gap-1.5"
                  >
                    <Icon name="grid" size={15} />
                    بج و QR
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ── تب جزئیات ── */}
              <TabsContent
                value="details"
                className="mt-0 flex-1 min-h-0 data-[state=inactive]:hidden"
              >
                <div
                  className="overflow-y-auto scrollbar-thin px-6 py-4 space-y-4"
                  style={{ maxHeight: "64vh" }}
                >
                  {/* تایم‌لاین وضعیت */}
                  <PkgTimeline pkg={pkg} />

                  {/* نوار اقدام وضعیت */}
                  {pkg.status !== "delivered" && pkg.status !== "cancelled" && (
                    <div className="rounded-xl border bg-muted/20 p-3.5 flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Icon name="route" size={14} /> اقدام بعدی:
                      </span>
                      {pkg.status === "packing" && (
                        <Button
                          size="sm"
                          className="gap-2"
                          disabled={patchMut.isPending}
                          onClick={() => patchMut.mutate({ status: "ready" })}
                        >
                          <Icon
                            name={patchMut.isPending ? "loading" : "packageAdd"}
                            size={15}
                            className={patchMut.isPending ? "animate-spin" : ""}
                          />
                          آمادهٔ ارسال
                        </Button>
                      )}
                      {pkg.status === "ready" && (
                        <>
                          <Button size="sm" className="gap-2" onClick={openSend}>
                            <Icon name="truckDelivery" size={15} /> ارسال شد
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            onClick={() => setCancelOpen(true)}
                          >
                            <Icon name="cancel" size={15} /> لغو
                          </Button>
                        </>
                      )}
                      {pkg.status === "sent" && (
                        <>
                          <Button
                            size="sm"
                            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                            onClick={openDeliver}
                          >
                            <Icon name="packageDelivered" size={15} /> تحویل شد
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            onClick={() => setCancelOpen(true)}
                          >
                            <Icon name="cancel" size={15} /> مرجوعی
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  {pkg.status === "delivered" && (
                    <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-3.5 text-xs flex items-center gap-2 flex-wrap">
                      <Icon name="checkCircle" size={15} className="text-emerald-600 shrink-0" />
                      <span>
                        تحویل‌شده در{" "}
                        <b className="tabular-nums">{formatDateTime(pkg.deliveredAt)}</b>
                        {pkg.receiverName ? (
                          <>
                            {" "}
                            به <b>{pkg.receiverName}</b>
                          </>
                        ) : null}
                        {pkg.codAmount > 0 &&
                          (pkg.codCollected ? (
                            <>
                              {" "}
                              — پول در محل{" "}
                              <b dir="ltr" className="tabular-nums">
                                {formatCurrency(pkg.codAmount)}
                              </b>{" "}
                              دریافت شد
                            </>
                          ) : (
                            " — پول در محل دریافت نشد"
                          ))}
                      </span>
                    </div>
                  )}

                  {/* سفارش‌های داخل بسته */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Icon name="orders" size={13} /> سفارش‌های این بسته
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {pkg.orders.map((o) => (
                        <span
                          key={o.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-xs"
                        >
                          <span className="font-mono font-bold">#{o.number}</span>
                          <span className="text-muted-foreground">•</span>
                          <span className="truncate max-w-[100px]">{o.customer.name}</span>
                          <StatusBadge status={o.status} />
                        </span>
                      ))}
                      {pkg.orders.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>

                  {/* شبکهٔ اطلاعات */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <InfoTile icon="mapPin" label="آدرس تحویل" value={pkg.address} className="sm:col-span-2" />
                    <InfoTile icon="user" label="گیرنده" value={pkg.receiverName} sub={pkg.receiverPhone} ltrSub />
                    <InfoTile icon="layers" label="شرح محتویات" value={pkg.contentsNote} />
                    <InfoTile icon="truck" label="پیک" value={pkg.courier} sub={pkg.trackingNo} ltrSub />
                    <CodTile pkg={pkg} />
                    <InfoTile icon="edit" label="یادداشت" value={pkg.note} className="sm:col-span-2" />
                  </div>
                </div>
              </TabsContent>

              {/* ── تب محتویات ── */}
              <TabsContent
                value="contents"
                className="mt-0 flex-1 min-h-0 data-[state=inactive]:hidden"
              >
                <div
                  className="overflow-y-auto scrollbar-thin px-6 py-4 space-y-3"
                  style={{ maxHeight: "64vh" }}
                >
                  {pkg.orders.length === 0 ? (
                    <EmptyState icon="layers" title="قلمی در این بسته نیست" />
                  ) : (
                    pkg.orders.map((o) => <OrderContentsCard key={o.id} order={o} />)
                  )}
                </div>
              </TabsContent>

              {/* ── تب بج و QR ── */}
              <TabsContent
                value="badge"
                className="mt-0 flex-1 min-h-0 data-[state=inactive]:hidden"
              >
                <div
                  className="overflow-y-auto scrollbar-thin px-6 py-4"
                  style={{ maxHeight: "64vh" }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5 items-start">
                    {/* پیش‌نمایش QR */}
                    <div className="mx-auto sm:mx-0 rounded-xl border bg-white p-3 shadow-sm">
                      {qrSrc ? (
                        <img src={qrSrc} alt={`QR ${pkg.code}`} className="size-[180px] block" />
                      ) : (
                        <div className="size-[180px] grid place-items-center">
                          <Icon name="loading" size={24} className="animate-spin text-muted-foreground" />
                        </div>
                      )}
                      <div className="text-center text-[10px] text-muted-foreground mt-2 font-mono" dir="ltr">
                        {pkg.code}
                      </div>
                    </div>

                    <div className="space-y-3 min-w-0">
                      {/* لینک عمومی */}
                      <div className="rounded-xl border bg-muted/20 p-3">
                        <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                          <Icon name="globe" size={13} />
                          لینک عمومی پیگیری (بدون لاگین — برای مشتری/پیک)
                        </div>
                        <div className="flex items-center gap-2">
                          <code
                            className="flex-1 min-w-0 truncate text-xs bg-background border rounded-lg px-2.5 py-1.5"
                            dir="ltr"
                          >
                            {packagePublicUrl(pkg.code)}
                          </code>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 shrink-0"
                            onClick={copyLink}
                          >
                            <Icon name="copy" size={13} /> کپی
                          </Button>
                        </div>
                      </div>

                      {/* دانلود بج */}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="gap-2"
                          disabled={badgeBusy !== null}
                          onClick={() => void runBadge("pdf")}
                        >
                          <Icon
                            name={badgeBusy === "pdf" ? "loading" : "download"}
                            size={16}
                            className={badgeBusy === "pdf" ? "animate-spin" : ""}
                          />
                          دانلود PDF بج
                        </Button>
                        <Button
                          variant="outline"
                          className="gap-2"
                          disabled={badgeBusy !== null}
                          onClick={() => void runBadge("png")}
                        >
                          <Icon
                            name={badgeBusy === "png" ? "loading" : "print"}
                            size={16}
                            className={badgeBusy === "png" ? "animate-spin" : ""}
                          />
                          دانلود PNG
                        </Button>
                      </div>

                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <Icon name="info" size={13} className="shrink-0" />
                        سایز بج: ۱۰۰×۵۰ میلی‌متر — مناسب چاپ استیکر
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* ── دیالوگ: ارسال ── */}
            <Dialog open={sendOpen} onOpenChange={setSendOpen}>
              <DialogContent aria-describedby={undefined} className="max-w-md p-0 gap-0">
                <div className="px-5 pt-4 pb-3 border-b flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 grid place-items-center shrink-0">
                    <Icon name="truckDelivery" size={18} />
                  </div>
                  <div>
                    <DialogTitle className="text-base font-bold font-mono" dir="ltr">
                      ارسال {pkg.code}
                    </DialogTitle>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      پیک و شماره پیگیری را ثبت کنید
                    </p>
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  {/* Phase 17: گیت خروج از انبار — وضعیت تسویهٔ فاکتور هر سفارش */}
                  <div className="rounded-xl border bg-muted/40 p-3 space-y-1.5">
                    <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Icon name="lock" size={12} className="shrink-0" />
                      تسویهٔ فاکتور سفارش‌ها (گیت خروج از انبار)
                    </div>
                    {pkg.orders.map((o) => {
                      const settled =
                        o.invoice !== null &&
                        o.invoice.totalAmount > 0 &&
                        o.invoice.paidAmount >= o.invoice.totalAmount;
                      const withPkg = o.invoiceWithPackage === true;
                      const locked = !settled && !withPkg;
                      return (
                        <div
                          key={o.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="truncate min-w-0">
                            <span dir="ltr" className="font-mono">#{o.number}</span>{" "}
                            {o.customer.name}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                              locked
                                ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                            )}
                          >
                            {locked
                              ? "قفل — تسویه نشده"
                              : withPkg
                                ? "فاکتور همراه بسته ✓"
                                : "تسویه ✓"}
                          </span>
                        </div>
                      );
                    })}
                    {pkg.orders.some(
                      (o) =>
                        o.invoiceWithPackage !== true &&
                        !(
                          o.invoice !== null &&
                          o.invoice.totalAmount > 0 &&
                          o.invoice.paidAmount >= o.invoice.totalAmount
                        )
                    ) && (
                      <p className="text-[10px] text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        <Icon name="info" size={11} className="shrink-0" />
                        تا تسویه یا علامت «فاکتور همراه بسته» توسط واحد مالی، ثبت ارسال
                        با خطا رد می‌شود.
                      </p>
                    )}
                  </div>
                  <Field label="شرکت پیک">
                    <Input
                      value={sendCourier}
                      onChange={(e) => setSendCourier(e.target.value)}
                      placeholder="مثلاً پیک اربیل / باربری…"
                    />
                  </Field>
                  <Field label="شماره پیگیری">
                    <Input
                      dir="ltr"
                      value={sendTracking}
                      onChange={(e) => setSendTracking(e.target.value)}
                      placeholder="اختیاری…"
                    />
                  </Field>
                </div>
                <div className="px-5 pb-4 flex items-center justify-end gap-2 border-t pt-3">
                  <Button variant="outline" size="sm" onClick={() => setSendOpen(false)}>
                    انصراف
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={patchMut.isPending}
                    onClick={() => patchMut.mutate(sendBody)}
                  >
                    <Icon
                      name={patchMut.isPending ? "loading" : "truckDelivery"}
                      size={14}
                      className={patchMut.isPending ? "animate-spin" : ""}
                    />
                    ثبت ارسال
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* ── دیالوگ: تحویل ── */}
            <Dialog open={deliverOpen} onOpenChange={setDeliverOpen}>
              <DialogContent aria-describedby={undefined} className="max-w-md p-0 gap-0">
                <div className="px-5 pt-4 pb-3 border-b flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 grid place-items-center shrink-0">
                    <Icon name="packageDelivered" size={18} />
                  </div>
                  <div>
                    <DialogTitle className="text-base font-bold font-mono" dir="ltr">
                      تحویل {pkg.code}
                    </DialogTitle>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      نام گیرنده و وضعیت پول در محل را ثبت کنید
                    </p>
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  <Field label="نام گیرنده">
                    <Input
                      value={deliverReceiver}
                      onChange={(e) => setDeliverReceiver(e.target.value)}
                      placeholder="گیرندهٔ واقعی بسته…"
                    />
                  </Field>
                  {pkg.codAmount > 0 && (
                    <div className="rounded-xl border bg-amber-500/[0.04] p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium flex items-center gap-1.5">
                            <Icon name="money" size={14} className="text-amber-600" />
                            پول در محل دریافت شد؟
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            مبلغ:{" "}
                            <b dir="ltr" className="tabular-nums text-amber-700 dark:text-amber-300">
                              {formatCurrency(pkg.codAmount)}
                            </b>
                          </div>
                        </div>
                        <Switch checked={collectCod} onCheckedChange={setCollectCod} />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        با فعال‌بودن، مبلغ به پرداختی سفارش‌های این بسته اضافه می‌شود و واحد مالی
                        آن را می‌بیند
                      </p>
                    </div>
                  )}
                </div>
                <div className="px-5 pb-4 flex items-center justify-end gap-2 border-t pt-3">
                  <Button variant="outline" size="sm" onClick={() => setDeliverOpen(false)}>
                    انصراف
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                    disabled={patchMut.isPending}
                    onClick={() => patchMut.mutate(deliverBody)}
                  >
                    <Icon
                      name={patchMut.isPending ? "loading" : "packageDelivered"}
                      size={14}
                      className={patchMut.isPending ? "animate-spin" : ""}
                    />
                    ثبت تحویل
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* ── تأیید لغو/مرجوعی ── */}
            <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
              <AlertDialogContent aria-describedby={undefined}>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <Icon name="alertTriangle" size={18} className="text-rose-500" />
                    لغو بستهٔ {pkg.code}؟
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {pkg.status === "sent"
                      ? "مرجوعی — بسته از پیک برگشته و اقلام آن به انبار برمی‌گردند؛ می‌توانید بستهٔ جدید بسازید."
                      : "اقلام این بسته آزاد می‌شوند و به فهرست بسته‌بندی برمی‌گردند."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>انصراف</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-rose-600 hover:bg-rose-700"
                    disabled={patchMut.isPending}
                    onClick={() => patchMut.mutate({ status: "cancelled" })}
                  >
                    بله، لغو کن
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Timeline (جزئیات) ────────────────────────────────────────────────

function PkgTimeline({ pkg }: { pkg: PkgDetail }) {
  const steps: { label: string; icon: IconName; date: string | null }[] = [
    { label: "بسته‌بندی", icon: "package", date: pkg.packedAt },
    { label: "آمادهٔ ارسال", icon: "packageAdd", date: null },
    { label: "ارسال", icon: "truckDelivery", date: pkg.sentAt },
    { label: "تحویل", icon: "packageDelivered", date: pkg.deliveredAt },
  ];
  const current = PKG_STATUS_META[pkg.status]?.step ?? -1;
  const isDone = (i: number) => current >= i;

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-start">
        {steps.map((s, i) => (
          <React.Fragment key={s.label}>
            <div className="flex flex-col items-center gap-1.5 min-w-[72px]">
              <div
                className={cn(
                  "size-8 rounded-full grid place-items-center border-2 transition",
                  isDone(i) && i === current && "border-primary bg-primary/10 text-primary",
                  isDone(i) && i !== current &&
                    "border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                  !isDone(i) && "border-muted bg-muted/30 text-muted-foreground"
                )}
              >
                <Icon name={isDone(i) ? "check" : s.icon} size={15} />
              </div>
              <span
                className={cn(
                  "text-[11px] font-medium text-center",
                  i === current ? "text-foreground" : isDone(i) ? "text-foreground/80" : "text-muted-foreground"
                )}
              >
                {s.label}
              </span>
              <span className="text-[9px] text-muted-foreground tabular-nums text-center">
                {s.date ? formatDate(s.date) : isDone(i) ? "انجام شد" : "—"}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mt-4 rounded-full min-w-3",
                  isDone(i) && isDone(i + 1) ? "bg-emerald-500/50" : "bg-muted"
                )}
              />
            )}
          </React.Fragment>
        ))}
      </div>
      {pkg.status === "cancelled" && (
        <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 px-3 py-2 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
          <Icon name="cancel" size={13} className="shrink-0" />
          این بسته لغو شده است — اقلام آن به انبار برگشته‌اند
        </div>
      )}
    </div>
  );
}

// ─── Info tiles (جزئیات) ──────────────────────────────────────────────

function InfoTile({
  icon,
  label,
  value,
  sub,
  ltrSub,
  className,
}: {
  icon: IconName;
  label: string;
  value: string | null | undefined;
  sub?: string | null;
  ltrSub?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-muted/20 p-3 flex items-start gap-2.5", className)}>
      <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
        <Icon name={icon} size={15} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className="text-sm font-medium mt-0.5 break-words">{value?.trim() || "—"}</div>
        {sub && sub.trim() && (
          <div
            className="text-[11px] text-muted-foreground mt-0.5 tabular-nums"
            dir={ltrSub ? "ltr" : undefined}
          >
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function CodTile({ pkg }: { pkg: PkgDetail }) {
  if (pkg.codAmount <= 0) {
    return <InfoTile icon="money" label="پول در محل" value="ندارد" />;
  }
  return (
    <div
      className={cn(
        "rounded-xl border p-3 flex items-start gap-2.5",
        pkg.codCollected
          ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/15"
          : "border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/15"
      )}
    >
      <div
        className={cn(
          "size-8 rounded-lg grid place-items-center shrink-0",
          pkg.codCollected
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        )}
      >
        <Icon name={pkg.codCollected ? "checkCircle" : "money"} size={15} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground">پول در محل (COD)</div>
        <div className="text-sm font-bold mt-0.5 tabular-nums" dir="ltr">
          {formatCurrency(pkg.codAmount)}
        </div>
        <div
          className={cn(
            "text-[11px] mt-0.5",
            pkg.codCollected
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-700 dark:text-amber-300"
          )}
        >
          {pkg.codCollected ? "دریافت شد" : "هنگام تحویل دریافت می‌شود"}
        </div>
      </div>
    </div>
  );
}

// ─── Order contents card (تب محتویات) ─────────────────────────────────

function OrderContentsCard({
  order,
}: {
  order: PkgDetail["orders"][number];
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2 flex-wrap">
        <span className="font-mono text-sm font-bold">#{order.number}</span>
        <span className="text-sm font-medium truncate">{order.customer?.name ?? "—"}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
          {order.customer?.phone}
        </span>
        <StatusBadge status={order.status} />
        {order.address && (
          <span
            className="mr-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-background border rounded-full px-2 py-0.5 max-w-[240px]"
            title={order.address}
          >
            <Icon name="mapPin" size={11} className="shrink-0" />
            <span className="truncate">{order.address}</span>
          </span>
        )}
      </div>
      <div className="p-4 space-y-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Icon name="package" size={12} /> در این بسته
          </div>
          <div className="space-y-1">
            {order.itemsInPackage.map((it, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm bg-primary/5 border border-primary/15 rounded-lg px-3 py-1.5"
              >
                <span className="truncate">{it.productName}</span>
                <span className="font-bold tabular-nums shrink-0">{fa(it.quantity)}×</span>
              </div>
            ))}
            {order.itemsInPackage.length === 0 && (
              <div className="text-xs text-muted-foreground">—</div>
            )}
          </div>
        </div>

        <Collapsible>
          <CollapsibleTrigger className="text-xs text-primary hover:underline flex items-center gap-1 group">
            <Icon
              name="chevronDown"
              size={12}
              className="transition-transform group-data-[state=open]:rotate-180"
            />
            همهٔ اقلام سفارش ({fa(order.allItems.length)})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 rounded-lg border divide-y">
              {order.allItems.map((it) => {
                const stage = STAGE_CHIP[it.stage];
                return (
                  <div key={it.id} className="flex items-center justify-between px-3 py-1.5 text-xs gap-2">
                    <span className="truncate">{it.productName}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="tabular-nums text-muted-foreground">{fa(it.quantity)}×</span>
                      {stage ? (
                        <span className={cn("text-[10px] font-medium rounded-full px-1.5 py-0.5", stage.cls)}>
                          {stage.label}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{it.stage}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </Card>
  );
}
