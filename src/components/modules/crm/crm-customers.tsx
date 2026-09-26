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
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Customer360Drawer } from "@/components/shared/customer-360-drawer";
import { t } from "@/lib/i18n";

type Customer = {
  id: string;
  name: string;
  phone: string;
  isFavorite: boolean;
  /** فاز 20: ستون مرده — فقط برای سازگاری؛ نمایش از unsettled */
  balanceDue?: number;
  /** بدهی زندهٔ مشتری (lib/customer-debt) — از همان /api/customers */
  unsettled?: number;
  note: string | null;
  createdAt: string;
  _count?: { orders: number; deals: number; activities: number };
};

type Order = {
  id: string;
  number: number;
  status: string;
  totalAmount: number;
  paidAmount?: number;
  endDate: string | null;
  createdAt: string;
  customer: { id: string; name: string };
  items?: { id: string; product?: { name: string } | null }[];
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
  // Phase 17-D: quick endpoint — آدرس در ساخت سریع CRM الزامی نیست
  const createMut = useMutation({
    mutationFn: (body: typeof form) =>
      api("/api/customers/quick", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate(["customers", "crm-dashboard", "deals"]);
      toast.success(t("مشتری ایجاد شد"));
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: (body: typeof form) =>
      api(`/api/customers/${editing?.id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate(["customers", "crm-dashboard", "deals"]);
      toast.success(t("مشتری ویرایش شد"));
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  // فاز 20: حذف مشتری از ردیف‌ها حذف شد — فقط از «منطقه خطر» انتهای نمای 360

  async function toggleFavorite(c: Customer) {
    try {
      await api(`/api/customers/${c.id}`, {
        method: "PUT",
        body: JSON.stringify({ isFavorite: !c.isFavorite }),
      });
      invalidate(["customers"]);
      toast.success(c.isFavorite ? t("از ویژه‌ها حذف شد") : t("به ویژه‌ها اضافه شد"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("خطا در تغییر وضعیت"));
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
      header: () => <div className="text-center">{t("ویژه")}</div>,
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
      header: t("نام مشتری"),
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
      header: t("تلفن"),
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
      header: t("سفارش‌ها"),
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
      header: t("معاملات"),
      cell: ({ row }) => (
        <span className={cn("tabular-nums", (row.original._count?.deals ?? 0) === 0 && "text-muted-foreground")}>
          {row.original._count?.deals ?? 0}
        </span>
      ),
      enableSorting: true,
    },
    {
      // فاز 20 (باگ 7): unsettled زنده به‌جای balanceDue مردهٔ همیشه‌صفر
      accessorKey: "unsettled",
      header: t("مانده حساب"),
      cell: ({ row }) => {
        const due = row.original.unsettled ?? 0;
        return (
          <span
            className={cn(
              "tabular-nums font-medium",
              due > 0 ? "text-rose-600" : "text-emerald-600"
            )}
            dir="ltr"
          >
            {formatCurrency(due)}
          </span>
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: "createdAt",
      header: t("تاریخ ثبت"),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">{formatDate(row.original.createdAt)}</span>
      ),
      enableSorting: true,
    },
    {
      id: "actions",
      header: () => <div className="text-center">{t("عملیات")}</div>,
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
            title={t("مشاهده جزئیات")}
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
            title={t("ویرایش")}
          >
            <Icon name="edit" size={16} />
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
        title={t("مشتریان")}
        description={t("نمای 360 درجه مشتریان، سفارش‌ها و فعالیت‌ها")}
        icon="customers"
        actions={
          <Button onClick={openNew} className="gap-2">
            <Icon name="plus" size={16} /> {t("مشتری جدید")}
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
          searchPlaceholder={t("جستجوی نام یا تلفن...")}
          pageSize={10}
          onRowClick={(c) => setSelectedId(c.id)}
          // 20-E — نمای کارتی موبایل (کلیک = نمای 360)
          renderCard={(c) => <CustomerMobileCard customer={c} />}
          toolbar={
            <Select
              value={filter}
              onValueChange={(v) => setFilter(v as FilterValue)}
            >
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("همه مشتریان")}</SelectItem>
                <SelectItem value="favorite">{t("فقط ویژه‌ها")}</SelectItem>
                <SelectItem value="has-orders">{t("دارای سفارش")}</SelectItem>
                <SelectItem value="no-orders">{t("بدون سفارش")}</SelectItem>
              </SelectContent>
            </Select>
          }
          emptyState={
            <EmptyState
              icon="customers"
              title={t("مشتری‌ای یافت نشد")}
              description={t("اولین مشتری خود را اضافه کنید یا فیلترها را تغییر دهید.")}
              action={
                <Button onClick={openNew} className="gap-2">
                  <Icon name="plus" size={16} /> {t("افزودن مشتری")}
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
            <DialogTitle>{editing ? t("ویرایش مشتری") : t("مشتری جدید")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Field label={t("نام مشتری")} required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label={t("شماره تلفن")} required>
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
              label={t("مشتری ویژه")}
              activeIcon="star"
              activeColor="amber"
            />
            <Field label={t("یادداشت")}>
              <Textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("انصراف")}
              </Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="gap-2">
                {(createMut.isPending || updateMut.isPending) ? (
                  <Icon name="loading" size={16} className="animate-spin" />
                ) : (
                  <Icon name="check" size={16} />
                )}
                {editing ? t("ذخیره تغییرات") : t("ذخیره")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* فاز ۲۴: نمای ۳۶۰ مشترک — همان دراور در CRM و مدیریت مشتریان ادمین */}
      <Customer360Drawer
        customerId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

// ─── Phase 20-E: کارت موبایل مشتری (نمای کارتی <768px) ───────────────
// آواتار حرف اول + نام (+ستارهٔ ویژه) + تلفن ltr + تعداد سفارش‌ها +
// چیپ مانده حساب (رز اگر بدهی، وگرنه زمرد «تسویه»).
function CustomerMobileCard({ customer: c }: { customer: Customer }) {
  const due = c.unsettled ?? 0;
  return (
    <div className="flex items-center gap-3">
      <div className="size-10 rounded-full bg-primary/10 text-primary grid place-items-center text-sm font-bold shrink-0">
        {c.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        {/* ردیف 1: نام + وضعیت مالی */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold truncate flex items-center gap-1 min-w-0">
            {c.name}
            {c.isFavorite && <Icon name="star" size={13} className="text-amber-500 shrink-0" />}
          </span>
          {due > 0 ? (
            <span
              dir="ltr"
              className="text-[10px] font-semibold tabular-nums rounded-full bg-rose-100 px-2 py-0.5 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 shrink-0"
            >
              {formatCurrency(due)}
            </span>
          ) : (
            <span className="text-[10px] font-medium rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0">
              {t("تسویه")}
            </span>
          )}
        </div>
        {/* ردیف 2: تلفن + تعداد سفارش */}
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-xs text-muted-foreground tabular-nums truncate" dir="ltr">
            {c.phone}
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
            {t("{p0} سفارش", { p0: (c._count?.orders ?? 0).toLocaleString("en-US") })}
          </span>
        </div>
      </div>
    </div>
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
      title={isFavorite ? t("حذف از ویژه‌ها") : t("افزودن به ویژه‌ها")}
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
