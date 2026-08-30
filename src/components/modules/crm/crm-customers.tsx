"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, EmptyState } from "@/components/shared";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ToggleButton } from "@/components/ui/toggle-button";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, relativeTime } from "@/lib/format";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type Activity,
  type Deal,
  ACTIVITY_META,
  STAGE_LABELS,
  STAGE_COLORS,
} from "./crm-types";
import { ActivityFormDialog } from "./activity-form-dialog";
import { DealFormDialog } from "./deal-form-dialog";

type Customer = {
  id: string;
  name: string;
  phone: string;
  isFavorite: boolean;
  balanceDue: number;
  note: string | null;
  createdAt: string;
  _count?: { orders: number; deals: number; activities: number };
};

type Order = {
  id: string;
  number: number;
  status: string;
  totalAmount: number;
  endDate: string | null;
  createdAt: string;
  customer: { id: string; name: string };
};

type CustomerDetail = {
  customer: Customer;
  orders: Order[];
  deals: Deal[];
  activities: Activity[];
  totalSpent: number;
};

type FilterValue = "all" | "favorite" | "has-orders" | "no-orders";

export function CRMCustomers() {
  const invalidate = useInvalidate();
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<FilterValue>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [form, setForm] = React.useState({ name: "", phone: "", isFavorite: false, note: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["customers", "crm", search],
    queryFn: () =>
      api<{ customers: Customer[] }>(
        `/api/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`
      ),
    refetchInterval: 30000,
  });

  const customersRaw = data?.customers ?? [];

  // Apply client-side filter
  const customers = React.useMemo(() => {
    return customersRaw.filter((c) => {
      if (filter === "favorite") return c.isFavorite;
      if (filter === "has-orders") return (c._count?.orders ?? 0) > 0;
      if (filter === "no-orders") return (c._count?.orders ?? 0) === 0;
      return true;
    });
  }, [customersRaw, filter]);

  // Mutations
  const createMut = useMutation({
    mutationFn: (body: typeof form) =>
      api("/api/customers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate(["customers", "crm-dashboard", "deals"]);
      toast.success("مشتری ایجاد شد");
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: (body: typeof form) =>
      api(`/api/customers/${editing?.id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate(["customers", "crm-dashboard", "deals"]);
      toast.success("مشتری ویرایش شد");
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/customers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["customers", "crm-dashboard", "deals"]);
      toast.success("مشتری حذف شد");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function toggleFavorite(c: Customer) {
    try {
      await api(`/api/customers/${c.id}`, {
        method: "PUT",
        body: JSON.stringify({ isFavorite: !c.isFavorite }),
      });
      invalidate(["customers"]);
      toast.success(c.isFavorite ? "از ویژه‌ها حذف شد" : "به ویژه‌ها اضافه شد");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در تغییر وضعیت");
    }
  }

  function openNew() {
    setEditing(null);
    setForm({ name: "", phone: "", isFavorite: false, note: "" });
    setDialogOpen(true);
  }
  function openEdit(c: Customer) {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone, isFavorite: c.isFavorite, note: c.note || "" });
    setDialogOpen(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) updateMut.mutate(form);
    else createMut.mutate(form);
  }

  const columns: ColumnDef<Customer>[] = [
    {
      id: "fav",
      header: () => <div className="text-center">ویژه</div>,
      cell: ({ row }) => (
        <div className="flex justify-center">
          <FavoriteStarButton
            isFavorite={row.original.isFavorite}
            onClick={() => toggleFavorite(row.original)}
          />
        </div>
      ),
      enableSorting: false,
      meta: { hideable: false },
    },
    {
      accessorKey: "name",
      header: "نام مشتری",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold shrink-0">
            {row.original.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{row.original.name}</div>
            {row.original.note && (
              <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                {row.original.note}
              </div>
            )}
          </div>
        </div>
      ),
      enableSorting: true,
    },
    {
      accessorKey: "phone",
      header: "تلفن",
      cell: ({ row }) => (
        <span className="text-muted-foreground tabular-nums" dir="ltr">
          {row.original.phone}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: "orders",
      accessorFn: (r) => r._count?.orders ?? 0,
      header: "سفارش‌ها",
      cell: ({ row }) => (
        <span className={cn("tabular-nums", (row.original._count?.orders ?? 0) === 0 && "text-muted-foreground")}>
          {row.original._count?.orders ?? 0}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: "deals",
      accessorFn: (r) => r._count?.deals ?? 0,
      header: "معاملات",
      cell: ({ row }) => (
        <span className={cn("tabular-nums", (row.original._count?.deals ?? 0) === 0 && "text-muted-foreground")}>
          {row.original._count?.deals ?? 0}
        </span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: "balanceDue",
      header: "مانده حساب",
      cell: ({ row }) => (
        <span
          className={cn(
            "tabular-nums font-medium",
            row.original.balanceDue > 0 ? "text-rose-600" : "text-emerald-600"
          )}
          dir="ltr"
        >
          {formatCurrency(row.original.balanceDue)}
        </span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: "createdAt",
      header: "تاریخ ثبت",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">{formatDate(row.original.createdAt)}</span>
      ),
      enableSorting: true,
    },
    {
      id: "actions",
      header: () => <div className="text-center">عملیات</div>,
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(row.original.id);
            }}
            title="مشاهده جزئیات"
          >
            <Icon name="eye" size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(row.original);
            }}
            title="ویرایش"
          >
            <Icon name="edit" size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 hover:text-rose-600"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`حذف "${row.original.name}"؟ این عمل قابل بازگشت نیست.`)) {
                deleteMut.mutate(row.original.id);
              }
            }}
            title="حذف"
          >
            <Icon name="trash" size={16} />
          </Button>
        </div>
      ),
      enableSorting: false,
      meta: { hideable: false },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="مشتریان"
        description="نمای ۳۶۰ درجه مشتریان، سفارش‌ها و فعالیت‌ها"
        icon="customers"
        actions={
          <Button onClick={openNew} className="gap-2">
            <Icon name="plus" size={16} /> مشتری جدید
          </Button>
        }
      />

      <Card className="p-4">
        <DataTable
          columns={columns}
          data={customers}
          isLoading={isLoading}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          searchPlaceholder="جستجوی نام یا تلفن..."
          pageSize={10}
          onRowClick={(c) => setSelectedId(c.id)}
          toolbar={
            <Select
              value={filter}
              onValueChange={(v) => setFilter(v as FilterValue)}
            >
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه مشتریان</SelectItem>
                <SelectItem value="favorite">فقط ویژه‌ها</SelectItem>
                <SelectItem value="has-orders">دارای سفارش</SelectItem>
                <SelectItem value="no-orders">بدون سفارش</SelectItem>
              </SelectContent>
            </Select>
          }
          emptyState={
            <EmptyState
              icon="customers"
              title="مشتری‌ای یافت نشد"
              description="اولین مشتری خود را اضافه کنید یا فیلترها را تغییر دهید."
              action={
                <Button onClick={openNew} className="gap-2">
                  <Icon name="plus" size={16} /> افزودن مشتری
                </Button>
              }
            />
          }
        />
      </Card>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editing ? "ویرایش مشتری" : "مشتری جدید"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Field label="نام مشتری" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="شماره تلفن" required>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
                dir="ltr"
                placeholder="0912..."
              />
            </Field>
            <ToggleButton
              checked={form.isFavorite}
              onChange={(v) => setForm({ ...form, isFavorite: v })}
              id="fav"
              label="مشتری ویژه"
              activeIcon="star"
              activeColor="amber"
            />
            <Field label="یادداشت">
              <Textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                انصراف
              </Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="gap-2">
                {(createMut.isPending || updateMut.isPending) ? (
                  <Icon name="loading" size={16} className="animate-spin" />
                ) : (
                  <Icon name="check" size={16} />
                )}
                {editing ? "ذخیره تغییرات" : "ذخیره"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Customer 360 drawer */}
      <CustomerDetailDrawer
        customerId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function CustomerDetailDrawer({
  customerId,
  onClose,
}: {
  customerId: string | null;
  onClose: () => void;
}) {
  const invalidate = useInvalidate();
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [dealOpen, setDealOpen] = React.useState(false);
  const open = !!customerId;

  // Track loading/error/not-found explicitly so the UI doesn't show an infinite
  // spinner when the customer is missing.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["customer-detail", customerId],
    queryFn: async () => {
      if (!customerId) return null;
      const [custRes, ordersRes, dealsRes, actsRes] = await Promise.all([
        api<{ customer: Customer | null }>(`/api/customers/${customerId}`),
        api<{ orders: Order[] }>(`/api/orders?customerId=${customerId}`),
        api<{ deals: Deal[] }>(`/api/deals?customerId=${customerId}`),
        api<{ activities: Activity[] }>(`/api/activities?customerId=${customerId}&limit=50`),
      ]);
      const customer = custRes?.customer ?? null;
      if (!customer) return null;
      const totalSpent = (ordersRes?.orders ?? []).reduce(
        (s, o) => s + (o.totalAmount || 0),
        0
      );
      return {
        customer,
        orders: ordersRes?.orders ?? [],
        deals: dealsRes?.deals ?? [],
        activities: actsRes?.activities ?? [],
        totalSpent,
      } as CustomerDetail;
    },
    enabled: !!customerId,
    refetchInterval: open ? 30000 : false,
  });

  // Reset internal dialogs when closing drawer
  React.useEffect(() => {
    if (!open) {
      setActivityOpen(false);
      setDealOpen(false);
    }
  }, [open]);

  const detail = data;
  const notFound = !isLoading && !isError && !detail;

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="left" className="w-full sm:max-w-xl overflow-y-auto p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Icon name="customers" size={18} className="text-primary" />
              نمای ۳۶۰ درجه مشتری
            </SheetTitle>
            <SheetDescription>اطلاعات کامل، سفارش‌ها، معاملات و فعالیت‌ها</SheetDescription>
          </SheetHeader>

          {isLoading ? (
            <div className="py-20 flex flex-col items-center gap-2">
              <Icon name="loading" size={28} className="animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">در حال بارگذاری...</span>
            </div>
          ) : isError ? (
            <div className="py-20 flex flex-col items-center gap-2">
              <Icon name="alertTriangle" size={28} className="text-rose-500" />
              <span className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "خطا در بارگذاری مشتری"}
              </span>
              <Button variant="outline" size="sm" onClick={onClose} className="mt-2">
                بستن
              </Button>
            </div>
          ) : notFound ? (
            <div className="py-20 flex flex-col items-center gap-2">
              <Icon name="alertTriangle" size={28} className="text-amber-500" />
              <span className="text-sm text-muted-foreground">
                مشتری یافت نشد. ممکن است حذف شده باشد.
              </span>
              <Button variant="outline" size="sm" onClick={onClose} className="mt-2">
                بستن
              </Button>
            </div>
          ) : detail ? (
            <div className="flex flex-col">
              {/* Profile header */}
              <div className="px-5 py-4 border-b bg-muted/30">
                <div className="flex items-start gap-3">
                  <div className="size-14 rounded-2xl bg-primary text-primary-foreground grid place-items-center text-xl font-bold shrink-0">
                    {detail.customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold truncate">{detail.customer.name}</h3>
                      {detail.customer.isFavorite && (
                        <Icon name="star" size={16} className="text-amber-500 shrink-0" />
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1.5" dir="ltr">
                      <Icon name="customers" size={12} />
                      {detail.customer.phone}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      مشتری از {formatDate(detail.customer.createdAt)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4">
                  <div className="rounded-lg bg-card border p-2 text-center">
                    <div className="text-[10px] text-muted-foreground">سفارش‌ها</div>
                    <div className="text-base font-bold tabular-nums">{detail.orders.length}</div>
                  </div>
                  <div className="rounded-lg bg-card border p-2 text-center">
                    <div className="text-[10px] text-muted-foreground">معاملات</div>
                    <div className="text-base font-bold tabular-nums">{detail.deals.length}</div>
                  </div>
                  <div className="rounded-lg bg-card border p-2 text-center">
                    <div className="text-[10px] text-muted-foreground">مجموع خرید</div>
                    <div className="text-xs font-bold tabular-nums" dir="ltr">
                      {formatCurrency(detail.totalSpent)}
                    </div>
                  </div>
                </div>

                {detail.customer.note && (
                  <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2.5 text-xs">
                    <div className="flex items-start gap-1.5">
                      <Icon name="info" size={12} className="text-amber-600 mt-0.5 shrink-0" />
                      <span>{detail.customer.note}</span>
                    </div>
                  </div>
                )}

                {detail.customer.balanceDue > 0 && (
                  <div className="mt-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-rose-700 dark:text-rose-300 flex items-center gap-1">
                        <Icon name="wallet" size={12} /> مانده حساب
                      </span>
                      <span className="font-bold tabular-nums text-rose-700 dark:text-rose-300" dir="ltr">
                        {formatCurrency(detail.customer.balanceDue)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Tabs */}
              <Tabs defaultValue="orders" className="flex-1">
                <div className="px-5 pt-3">
                  <TabsList className="w-full">
                    <TabsTrigger value="orders" className="flex-1 gap-1">
                      <Icon name="orders" size={14} />
                      سفارش‌ها ({detail.orders.length})
                    </TabsTrigger>
                    <TabsTrigger value="deals" className="flex-1 gap-1">
                      <Icon name="orders" size={14} />
                      معاملات ({detail.deals.length})
                    </TabsTrigger>
                    <TabsTrigger value="activities" className="flex-1 gap-1">
                      <Icon name="task" size={14} />
                      فعالیت‌ها
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="orders" className="px-5 py-3 m-0">
                  <div className="flex items-center justify-end mb-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDealOpen(true)}
                      className="gap-1.5"
                    >
                      <Icon name="plus" size={14} /> معامله جدید
                    </Button>
                  </div>
                  {detail.orders.length === 0 ? (
                    <EmptyState icon="orders" title="سفارشی ندارد" />
                  ) : (
                    <div className="space-y-2">
                      {detail.orders.map((o) => (
                        <div
                          key={o.id}
                          className="flex items-center gap-3 rounded-lg border p-2.5 hover:bg-accent/40 transition"
                        >
                          <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center font-bold text-xs shrink-0">
                            #{o.number}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">سفارش #{o.number}</div>
                            <div className="text-xs text-muted-foreground">
                              {relativeTime(o.createdAt)}
                            </div>
                          </div>
                          <div className="text-left shrink-0">
                            <div className="text-sm font-semibold tabular-nums" dir="ltr">
                              {formatCurrency(o.totalAmount)}
                            </div>
                            <div className="text-[10px] text-muted-foreground">{o.status}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="deals" className="px-5 py-3 m-0">
                  <div className="flex items-center justify-end mb-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDealOpen(true)}
                      className="gap-1.5"
                    >
                      <Icon name="plus" size={14} /> معامله جدید
                    </Button>
                  </div>
                  {detail.deals.length === 0 ? (
                    <EmptyState icon="orders" title="معامله‌ای ندارد" />
                  ) : (
                    <div className="space-y-2">
                      {detail.deals.map((d) => {
                        const colors = STAGE_COLORS[d.stage];
                        return (
                          <div
                            key={d.id}
                            className="rounded-lg border p-2.5 hover:bg-accent/40 transition"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{d.title}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span
                                    className={cn(
                                      "text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1",
                                      colors.bg,
                                      colors.text
                                    )}
                                  >
                                    <span className={cn("size-1 rounded-full", colors.dot)} />
                                    {STAGE_LABELS[d.stage]}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {formatDate(d.expectedCloseDate)}
                                  </span>
                                </div>
                              </div>
                              <div className="text-sm font-semibold tabular-nums shrink-0" dir="ltr">
                                {formatCurrency(d.value)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="activities" className="px-5 py-3 m-0">
                  <div className="flex items-center justify-end mb-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActivityOpen(true)}
                      className="gap-1.5"
                    >
                      <Icon name="plus" size={14} /> ثبت فعالیت
                    </Button>
                  </div>
                  {detail.activities.length === 0 ? (
                    <EmptyState icon="task" title="فعالیتی ثبت نشده" />
                  ) : (
                    <div className="relative">
                      <div className="absolute right-[19px] top-2 bottom-2 w-px bg-border" />
                      <div className="space-y-3">
                        {detail.activities.map((a) => {
                          const meta = ACTIVITY_META[a.type];
                          return (
                            <div key={a.id} className="flex items-start gap-3 relative">
                              <div
                                className={cn(
                                  "size-9 rounded-full grid place-items-center shrink-0 z-10 border-2 border-background",
                                  meta.bg
                                )}
                              >
                                <Icon name={meta.icon} size={14} className={meta.color} />
                              </div>
                              <div className="flex-1 min-w-0 pt-1">
                                <div className="text-sm font-medium">{a.title}</div>
                                {a.description && (
                                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                    {a.description}
                                  </div>
                                )}
                                <div className="text-[10px] text-muted-foreground mt-1">
                                  {meta.label} • {relativeTime(a.date)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {detail && (
        <>
          <ActivityFormDialog
            open={activityOpen}
            onOpenChange={setActivityOpen}
            customers={[{ id: detail.customer.id, name: detail.customer.name }]}
            deals={detail.deals.map((d) => ({
              id: d.id,
              title: d.title,
              customerId: d.customerId,
            }))}
            defaultCustomerId={detail.customer.id}
            onSaved={() => invalidate(["customer-detail", "activities", "deals"])}
          />
          <DealFormDialog
            open={dealOpen}
            onOpenChange={setDealOpen}
            customers={[
              { id: detail.customer.id, name: detail.customer.name, phone: detail.customer.phone },
            ]}
            onSaved={() => invalidate(["customer-detail", "deals", "crm-dashboard"])}
          />
        </>
      )}
    </>
  );
}

function FavoriteStarButton({
  isFavorite,
  onClick,
}: {
  isFavorite: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={isFavorite ? "حذف از ویژه‌ها" : "افزودن به ویژه‌ها"}
      className={cn(
        "size-7 rounded-lg grid place-items-center border-2 transition-all",
        isFavorite
          ? "bg-amber-500 border-amber-500 text-white shadow-sm"
          : "bg-background text-muted-foreground border-input hover:border-amber-400 hover:text-amber-500"
      )}
    >
      <Icon name="star" size={13} strokeWidth={2.5} />
    </button>
  );
}
