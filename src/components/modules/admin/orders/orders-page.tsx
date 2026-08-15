"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, StatusBadge, PriorityBadge, EmptyState } from "@/components/shared";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DatePicker } from "@/components/ui/date-picker";
import { formatCurrency, formatDate, daysRemaining } from "@/lib/format";
import { useAppStore } from "@/stores/app-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ORDER_STATUS, PRIORITY, ITEM_STAGE, type OrderStatus } from "@/lib/constants";

type Order = {
  id: string; number: number; status: OrderStatus; endDate: string | null; noEndDate: boolean;
  totalAmount: number; priority: string; splitMode: string; note: string | null; createdAt: string;
  customer: { id: string; name: string; phone: string };
  items: { id: string; productId: string; product: { name: string }; quantity: number; totalAmount: number; note: string | null; stage: string }[];
};

export function OrdersPage() {
  const invalidate = useInvalidate();
  const navigate = useAppStore((s) => s.navigate);

  // Filters state
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [productSearch, setProductSearch] = React.useState("");
  const [customerFilter, setCustomerFilter] = React.useState<string | null>(null);
  const [productFilter, setProductFilter] = React.useState<string | null>(null);
  const [statusFilters, setStatusFilters] = React.useState<Set<string>>(new Set());
  const [priorityFilters, setPriorityFilters] = React.useState<Set<string>>(new Set());
  const [stageFilters, setStageFilters] = React.useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = React.useState<Date | null>(null);
  const [dateTo, setDateTo] = React.useState<Date | null>(null);
  const [showFilters, setShowFilters] = React.useState(false);

  const [noteModal, setNoteModal] = React.useState<Order | null>(null);
  const [statusModal, setStatusModal] = React.useState<Order | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ["orders", customerFilter, productFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (customerFilter) params.set("customerId", customerFilter);
      if (productFilter) params.set("productId", productFilter);
      return api<{ orders: Order[] }>(`/api/orders${params.size ? `?${params}` : ""}`);
    },
  });

  const { data: customersData } = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => api<{ customers: { id: string; name: string; phone: string }[] }>("/api/customers"),
  });
  const { data: productsData } = useQuery({
    queryKey: ["products-list"],
    queryFn: () => api<{ products: { id: string; name: string }[] }>("/api/products"),
  });

  const customers = customersData?.customers ?? [];
  const products = productsData?.products ?? [];
  const allOrders = ordersData?.orders ?? [];

  // Apply client-side filters (status, priority, stage, date range)
  const orders = React.useMemo(() => {
    return allOrders.filter((o) => {
      if (statusFilters.size > 0 && !statusFilters.has(o.status)) return false;
      if (priorityFilters.size > 0 && !priorityFilters.has(o.priority)) return false;
      if (stageFilters.size > 0 && !o.items.some((it) => stageFilters.has(it.stage))) return false;
      if (dateFrom && o.createdAt && new Date(o.createdAt) < dateFrom) return false;
      if (dateTo && o.createdAt && new Date(o.createdAt) > dateTo) return false;
      return true;
    });
  }, [allOrders, statusFilters, priorityFilters, stageFilters, dateFrom, dateTo]);

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/orders/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(["orders"]); toast.success("سفارش حذف شد"); setDeleteId(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = React.useMemo<ColumnDef<Order>[]>(() => [
    {
      id: "expand",
      header: () => null,
      cell: ({ row }) => {
        const canExpand = row.original.items.length > 1;
        return canExpand ? (
          <button className="size-7 grid place-items-center rounded hover:bg-accent" onClick={(e) => { e.stopPropagation(); row.toggleExpanded(); }}>
            <Icon name={row.getIsExpanded() ? "chevronDown" : "chevronLeft"} size={14} />
          </button>
        ) : null;
      },
      size: 32,
      meta: { hideable: false },
    },
    {
      accessorKey: "number",
      header: "شماره",
      cell: ({ row }) => <span className="font-mono text-xs font-bold">#{row.original.number}</span>,
      enableSorting: true,
    },
    {
      id: "customer",
      accessorFn: (r) => r.customer.name,
      header: "مشتری",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.customer.name}</div>
          <div className="text-xs text-muted-foreground tabular-nums" dir="ltr">{row.original.customer.phone}</div>
        </div>
      ),
    },
    {
      id: "items",
      header: "آیتم‌ها",
      cell: ({ row }) => {
        const items = row.original.items;
        return (
          <div className="flex flex-wrap gap-1 max-w-[200px]">
            {items.slice(0, 2).map((it) => (
              <span key={it.id} className="text-xs bg-muted rounded px-1.5 py-0.5 truncate">{it.product.name}</span>
            ))}
            {items.length > 2 && <span className="text-xs text-muted-foreground">+{items.length - 2}</span>}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "وضعیت",
      cell: ({ row }) => (
        <button onClick={(e) => { e.stopPropagation(); setStatusModal(row.original); }} className="hover:opacity-80 transition">
          <StatusBadge status={row.original.status} />
        </button>
      ),
    },
    {
      id: "endDate",
      accessorFn: (r) => (r.endDate ? new Date(r.endDate).getTime() : 0),
      header: "تاریخ پایان",
      cell: ({ row }) => {
        const o = row.original;
        if (o.noEndDate) return <span className="text-xs text-muted-foreground">بدون زمان پایان</span>;
        if (!o.endDate) return <span className="text-xs text-muted-foreground">—</span>;
        const dr = daysRemaining(o.endDate);
        return (
          <div>
            <div className="text-xs tabular-nums">{formatDate(o.endDate)}</div>
            {dr.status !== "none" && (
              <div className={cn("text-[11px] mt-0.5 flex items-center gap-1",
                dr.status === "remaining" && "text-emerald-600",
                dr.status === "overdue" && "text-rose-600",
                dr.status === "today" && "text-amber-600")}>
                <Icon name={dr.status === "overdue" ? "alertTriangle" : "clock"} size={11} />
                {dr.text}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "totalAmount",
      header: "مبلغ کل",
      cell: ({ row }) => <span className="font-semibold tabular-nums" dir="ltr">{formatCurrency(row.original.totalAmount)}</span>,
      enableSorting: true,
    },
    {
      id: "priority",
      accessorFn: (r) => r.priority,
      header: "اولویت",
      cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      enableSorting: true,
    },
    {
      id: "createdAt",
      accessorFn: (r) => new Date(r.createdAt).getTime(),
      header: "تاریخ ساخت",
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{formatDate(row.original.createdAt)}</span>,
      enableSorting: true,
    },
    {
      id: "actions",
      header: () => <div className="text-center">عملیات</div>,
      cell: ({ row }) => <RowActions order={row.original} onNote={() => setNoteModal(row.original)} onDelete={() => setDeleteId(row.original.id)} onEdit={() => navigate("admin", "orders-new", row.original.id)} />,
      enableSorting: false,
      meta: { hideable: false },
    },
  ], [navigate]);

  const activeFilterCount =
    (customerFilter ? 1 : 0) +
    (productFilter ? 1 : 0) +
    statusFilters.size +
    priorityFilters.size +
    stageFilters.size +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  function clearAll() {
    setCustomerFilter(null); setProductFilter(null);
    setStatusFilters(new Set()); setPriorityFilters(new Set()); setStageFilters(new Set());
    setDateFrom(null); setDateTo(null);
    setCustomerSearch(""); setProductSearch("");
  }

  function toggleSet(s: Set<string>, v: string, setter: (s: Set<string>) => void) {
    const n = new Set(s);
    if (n.has(v)) n.delete(v); else n.add(v);
    setter(n);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        <PageHeader
          title="همه سفارشات"
          description="مدیریت کامل سفارش‌های چاپ با فیلترهای پیشرفته"
          icon="orders"
          actions={<Button onClick={() => navigate("admin", "orders-new")} className="gap-2"><Icon name="plus" size={16} /> سفارش جدید</Button>}
        />

        {/* Search + filters bar */}
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Customer search dropdown */}
            <SearchCombobox
              value={customerFilter}
              onChange={setCustomerFilter}
              search={customerSearch}
              onSearchChange={setCustomerSearch}
              placeholder="جستجوی مشتری (نام یا شماره)..."
              emptyText="مشتری‌ای یافت نشد"
              options={customers.map((c) => ({ value: c.id, label: c.name, sub: c.phone }))}
              icon="customers"
              className="w-64"
            />

            {/* Product search dropdown */}
            <SearchCombobox
              value={productFilter}
              onChange={setProductFilter}
              search={productSearch}
              onSearchChange={setProductSearch}
              placeholder="جستجوی آیتم سفارش..."
              emptyText="محصولی یافت نشد"
              options={products.map((p) => ({ value: p.id, label: p.name }))}
              icon="package"
              className="w-56"
            />

            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Icon name="filter" size={14} />
              فیلترها
              {activeFilterCount > 0 && (
                <span className="size-5 rounded-full bg-primary-foreground/20 grid place-items-center text-[10px] font-bold">{activeFilterCount}</span>
              )}
            </Button>

            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={clearAll}>
                <Icon name="cancel" size={14} /> پاک کردن همه ({activeFilterCount})
              </Button>
            )}

            <div className="mr-auto text-xs text-muted-foreground">
              {orders.length} سفارش
            </div>
          </div>

          {/* Advanced filters panel */}
          {showFilters && (
            <div className="border-t pt-3 space-y-3">
              {/* Status filter — toggle buttons */}
              <FilterGroup label="وضعیت سفارش" icon="route">
                {Object.entries(ORDER_STATUS).map(([k, v]) => (
                  <FilterToggle
                    key={k}
                    active={statusFilters.has(k)}
                    onClick={() => toggleSet(statusFilters, k, setStatusFilters)}
                    label={v.label}
                  />
                ))}
              </FilterGroup>

              {/* Priority filter */}
              <FilterGroup label="اولویت" icon="alertTriangle">
                {Object.entries(PRIORITY).map(([k, v]) => (
                  <FilterToggle
                    key={k}
                    active={priorityFilters.has(k)}
                    onClick={() => toggleSet(priorityFilters, k, setPriorityFilters)}
                    label={v.label}
                    activeColor={k === "urgent" ? "rose" : "primary"}
                  />
                ))}
              </FilterGroup>

              {/* Stage filter */}
              <FilterGroup label="مرحله آیتم" icon="layers">
                {Object.entries(ITEM_STAGE).map(([k, v]) => (
                  <FilterToggle
                    key={k}
                    active={stageFilters.has(k)}
                    onClick={() => toggleSet(stageFilters, k, setStageFilters)}
                    label={v.label}
                  />
                ))}
              </FilterGroup>

              {/* Date range */}
              <FilterGroup label="بازه تاریخ ساخت" icon="calendar">
                <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="از تاریخ" />
                <Icon name="arrowLeft" size={14} className="text-muted-foreground" />
                <DatePicker value={dateTo} onChange={setDateTo} placeholder="تا تاریخ" />
              </FilterGroup>
            </div>
          )}
        </Card>

        {/* Table */}
        <Card className="p-4">
          <DataTable
            columns={columns}
            data={orders}
            isLoading={isLoading}
            pageSize={10}
            showColumnToggle
            emptyState={
              <EmptyState
                icon="orders"
                title="سفارشی یافت نشد"
                description="با فیلترهای فعلی سفارشی وجود ندارد."
                action={<Button onClick={() => navigate("admin", "orders-new")} className="gap-2"><Icon name="plus" size={16} /> ایجاد سفارش</Button>}
              />
            }
            getRowCanExpand={(o) => o.items.length > 1}
            renderExpandedRow={(o) => (
              <div className="p-3 bg-muted/10">
                <div className="rounded-lg border bg-background overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="text-right font-medium px-3 py-2">محصول</th>
                        <th className="text-right font-medium px-3 py-2">تعداد</th>
                        <th className="text-right font-medium px-3 py-2">مرحله</th>
                        <th className="text-right font-medium px-3 py-2">مبلغ</th>
                        <th className="text-right font-medium px-3 py-2">یادداشت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {o.items.map((it) => (
                        <tr key={it.id}>
                          <td className="px-3 py-2 font-medium">{it.product.name}</td>
                          <td className="px-3 py-2 tabular-nums" dir="ltr">{it.quantity}</td>
                          <td className="px-3 py-2"><span className="rounded bg-muted px-1.5 py-0.5">{ITEM_STAGE[it.stage as keyof typeof ITEM_STAGE]?.label ?? it.stage}</span></td>
                          <td className="px-3 py-2 tabular-nums" dir="ltr">{formatCurrency(it.totalAmount)}</td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{it.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          />
        </Card>

        <NoteModal order={noteModal} onClose={() => setNoteModal(null)} />
        <StatusModal order={statusModal} onClose={() => setStatusModal(null)} />

        <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>حذف سفارش</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">آیا از حذف این سفارش مطمئن هستید؟ این عمل قابل بازگشت نیست.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteId(null)}>انصراف</Button>
              <Button variant="destructive" onClick={() => deleteId && deleteMut.mutate(deleteId)} className="gap-2">
                <Icon name="trash" size={16} /> حذف
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

// ─── Search Combobox (dropdown + search) ────────────────────
function SearchCombobox({
  value, onChange, search, onSearchChange, placeholder, emptyText, options, icon, className,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  search: string;
  onSearchChange: (v: string) => void;
  placeholder: string;
  emptyText: string;
  options: { value: string; label: string; sub?: string }[];
  icon: "customers" | "package";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);
  const filtered = options.filter((o) =>
    !search ||
    o.label.includes(search) ||
    (o.sub?.includes(search) ?? false)
  );

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) onSearchChange(""); }}>
      <PopoverTrigger asChild>
        <button
          role="combobox"
          aria-expanded={open}
          aria-controls="search-combobox-list"
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm hover:bg-accent/50 transition min-w-0",
            className
          )}
        >
          <Icon name={icon} size={16} className="text-muted-foreground shrink-0" />
          <span className={cn("truncate flex-1 text-right", !selected && "text-muted-foreground")}>
            {selected ? (
              <span className="flex items-center gap-2">
                <span>{selected.label}</span>
                {selected.sub && <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">{selected.sub}</span>}
              </span>
            ) : placeholder}
          </span>
          <Icon name="chevronDown" size={14} className="text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Icon name="search" size={14} className="text-muted-foreground" />
            <CommandInput
              placeholder={placeholder}
              value={search}
              onValueChange={onSearchChange}
              className="border-0 focus:ring-0 h-9"
            />
          </div>
          <CommandList className="max-h-60 scrollbar-thin" id="search-combobox-list">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filtered.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.sub ?? ""}`}
                  onSelect={() => { onChange(o.value === value ? null : o.value); setOpen(false); onSearchChange(""); }}
                  className="gap-2"
                >
                  <Icon name={value === o.value ? "check" : icon} size={14} className={value === o.value ? "text-primary" : "text-muted-foreground opacity-0"} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{o.label}</div>
                    {o.sub && <div className="text-xs text-muted-foreground tabular-nums" dir="ltr">{o.sub}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {value && (
          <div className="border-t p-1">
            <button onClick={() => { onChange(null); setOpen(false); }} className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 flex items-center justify-center gap-1">
              <Icon name="cancel" size={12} /> پاک کردن انتخاب
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Filter group (label + toggle buttons) ──────────────────
function FilterGroup({ label, icon, children }: { label: string; icon: "route" | "alertTriangle" | "layers" | "calendar"; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground min-w-[110px]">
        <Icon name={icon} size={13} />
        {label}:
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

// ─── Filter Toggle Button (check/cross style) ───────────────
function FilterToggle({
  active, onClick, label, activeColor = "primary",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  activeColor?: "primary" | "rose" | "emerald" | "amber";
}) {
  const activeCls = {
    primary: "bg-primary text-primary-foreground border-primary",
    rose: "bg-rose-500 text-white border-rose-500",
    emerald: "bg-emerald-500 text-white border-emerald-500",
    amber: "bg-amber-500 text-white border-amber-500",
  }[activeColor];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
        active
          ? cn(activeCls, "shadow-sm")
          : "bg-background text-muted-foreground border-input hover:border-foreground/30 hover:text-foreground"
      )}
    >
      <Icon name={active ? "check" : "plus"} size={12} strokeWidth={2.5} />
      {label}
    </button>
  );
}

function stageLabel(s: string) {
  return ITEM_STAGE[s as keyof typeof ITEM_STAGE]?.label ?? s;
}

function RowActions({ order, onNote, onDelete, onEdit }: { order: Order; onNote: () => void; onDelete: () => void; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" onClick={(e) => { e.stopPropagation(); onNote(); }}>
            <Icon name="info" size={15} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>یادداشت</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Icon name="edit" size={15} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>ویرایش</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 hover:text-emerald-600" onClick={(e) => { e.stopPropagation(); toast.info("پیش‌فاکتور به‌زودی"); }}>
            <Icon name="receipt" size={15} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>پیش‌فاکتور</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 hover:text-blue-600" onClick={(e) => { e.stopPropagation(); toast.info(order.status === "completed" ? "فاکتور" : "سفارش تکمیل نشده"); }}>
            <Icon name="invoice" size={15} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>فاکتور</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 hover:text-rose-600" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Icon name="trash" size={15} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>حذف</TooltipContent>
      </Tooltip>
    </div>
  );
}

function NoteModal({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [note, setNote] = React.useState("");
  React.useEffect(() => { setNote(order?.note || ""); }, [order]);
  const saveMut = useMutation({
    mutationFn: (n: string) => api(`/api/orders/${order?.id}`, { method: "PUT", body: JSON.stringify({ note: n }) }),
    onSuccess: () => { invalidate(["orders"]); toast.success("یادداشت ذخیره شد"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!order) return null;
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="info" size={18} className="text-primary" /> یادداشت سفارش #{order.number}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>متن یادداشت</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} placeholder="یادداشت خود را وارد کنید..." />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={() => saveMut.mutate(note)} disabled={saveMut.isPending} className="gap-2">
            {saveMut.isPending ? <Icon name="loading" size={16} className="animate-spin" /> : <Icon name="check" size={16} />}
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusModal({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [status, setStatus] = React.useState<OrderStatus>("pending_design");
  const [designStart, setDesignStart] = React.useState<Date | null>(null);
  const [designEnd, setDesignEnd] = React.useState<Date | null>(null);
  const [printStart, setPrintStart] = React.useState<Date | null>(null);
  const [printEnd, setPrintEnd] = React.useState<Date | null>(null);
  React.useEffect(() => {
    if (order) {
      setStatus(order.status);
      setDesignStart(null); setDesignEnd(null); setPrintStart(null); setPrintEnd(null);
    }
  }, [order]);

  const showDesignDates = status === "pending_design";
  const showPrintDates = status === "pending_design" || status === "in_printing";

  const saveMut = useMutation({
    mutationFn: () => api(`/api/orders/${order?.id}/status`, {
      method: "PUT",
      body: JSON.stringify({
        status,
        designStart: designStart ? designStart.toISOString() : null,
        designEnd: designEnd ? designEnd.toISOString() : null,
        printStart: printStart ? printStart.toISOString() : null,
        printEnd: printEnd ? printEnd.toISOString() : null,
      }),
    }),
    onSuccess: () => { invalidate(["orders"]); toast.success("وضعیت به‌روزرسانی شد"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!order) return null;
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="route" size={18} className="text-primary" /> تغییر وضعیت سفارش #{order.number}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>وضعیت جدید</Label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(ORDER_STATUS).map(([k, v]) => (
                <FilterToggle
                  key={k}
                  active={status === k}
                  onClick={() => setStatus(k as OrderStatus)}
                  label={v.label}
                  activeColor="primary"
                />
              ))}
            </div>
          </div>

          {(showDesignDates || showPrintDates) && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Icon name="calendar" size={14} /> تعیین زمان ماژول‌ها (اختیاری)
              </div>
              {showDesignDates && (
                <div className="space-y-2">
                  <div className="text-xs font-medium flex items-center gap-1.5"><Icon name="design" size={13} className="text-violet-500" /> ماژول طراحی</div>
                  <div className="flex items-center gap-2">
                    <DatePicker value={designStart} onChange={setDesignStart} placeholder="شروع طراحی" />
                    <Icon name="arrowLeft" size={14} className="text-muted-foreground" />
                    <DatePicker value={designEnd} onChange={setDesignEnd} placeholder="پایان طراحی" />
                  </div>
                </div>
              )}
              {showPrintDates && (
                <div className="space-y-2">
                  <div className="text-xs font-medium flex items-center gap-1.5"><Icon name="print" size={13} className="text-amber-500" /> ماژول چاپ</div>
                  <div className="flex items-center gap-2">
                    <DatePicker value={printStart} onChange={setPrintStart} placeholder="شروع چاپ" />
                    <Icon name="arrowLeft" size={14} className="text-muted-foreground" />
                    <DatePicker value={printEnd} onChange={setPrintEnd} placeholder="پایان چاپ" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-2">
            {saveMut.isPending ? <Icon name="loading" size={16} className="animate-spin" /> : <Icon name="check" size={16} />}
            ثبت تغییرات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
