"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, EmptyState } from "@/components/shared";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, daysRemaining } from "@/lib/format";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import {
  type Deal,
  type DealStage,
  type DealSource,
  STAGE_OPTIONS,
  SOURCE_OPTIONS,
  STAGE_LABELS,
  STAGE_COLORS,
} from "./crm-types";
import { DealFormDialog, StageBadge } from "./deal-form-dialog";

type CustomerOption = { id: string; name: string; phone: string };

export function CRMDeals() {
  const invalidate = useInvalidate();
  const [search, setSearch] = React.useState("");
  const [stageFilter, setStageFilter] = React.useState<DealStage | "all">("all");
  const [sourceFilter, setSourceFilter] = React.useState<DealSource | "all">("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingDeal, setEditingDeal] = React.useState<Deal | null>(null);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [bulkStageOpen, setBulkStageOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Deal | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["deals", "list", search, stageFilter, sourceFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (stageFilter !== "all") params.set("stage", stageFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      const q = params.toString();
      return api<{ deals: Deal[] }>(`/api/deals${q ? `?${q}` : ""}`);
    },
    refetchInterval: 30000,
  });
  const { data: customersData } = useQuery({
    queryKey: ["customers", "crm-deals"],
    queryFn: () => api<{ customers: CustomerOption[] }>("/api/customers"),
    refetchInterval: 60000,
  });

  const deals = data?.deals ?? [];
  const customers = customersData?.customers ?? [];

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/deals/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["deals", "crm-dashboard", "customers"]);
      toast.success("معامله حذف شد");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkStageMut = useMutation({
    mutationFn: async ({ ids, stage }: { ids: string[]; stage: DealStage }) => {
      const results = await Promise.all(
        ids.map((id) =>
          api(`/api/deals/${id}`, { method: "PATCH", body: JSON.stringify({ stage }) })
        )
      );
      return results.length;
    },
    onSuccess: (count, vars) => {
      invalidate(["deals", "crm-dashboard", "customers"]);
      toast.success(`${count} معامله به «${STAGE_LABELS[vars.stage]}» منتقل شد`);
      setSelected({});
      setBulkStageOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setEditingDeal(null);
    setDialogOpen(true);
  }
  function openEdit(d: Deal) {
    setEditingDeal(d);
    setDialogOpen(true);
  }

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  const columns: ColumnDef<Deal>[] = [
    {
      id: "select",
      header: () => (
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={deals.length > 0 && deals.every((d) => selected[d.id])}
          onChange={(e) => {
            const v = e.target.checked;
            const next: Record<string, boolean> = {};
            if (v) for (const d of deals) next[d.id] = true;
            setSelected(next);
          }}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={!!selected[row.original.id]}
          onChange={(e) => {
            const v = e.target.checked;
            setSelected((prev) => ({ ...prev, [row.original.id]: v }));
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      meta: { hideable: false },
    },
    {
      accessorKey: "title",
      header: "عنوان معامله",
      cell: ({ row }) => (
        <div className="flex items-start gap-2 max-w-[260px]">
          <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
            <Icon name="orders" size={14} />
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{row.original.title}</div>
            {row.original.description && (
              <div className="text-[11px] text-muted-foreground truncate">
                {row.original.description}
              </div>
            )}
          </div>
        </div>
      ),
      enableSorting: true,
    },
    {
      accessorKey: "customer.name",
      header: "مشتری",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.customer?.name ?? "—"}</span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: "value",
      header: "ارزش",
      cell: ({ row }) => (
        <span className="tabular-nums font-semibold" dir="ltr">
          {formatCurrency(row.original.value)}
        </span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: "stage",
      header: "مرحله",
      cell: ({ row }) => <StageBadge stage={row.original.stage} />,
      enableSorting: true,
    },
    {
      accessorKey: "probability",
      header: "احتمال",
      cell: ({ row }) => {
        const p = row.original.probability;
        const colors = STAGE_COLORS[row.original.stage];
        return (
          <div className="flex items-center gap-2 min-w-[80px]">
            <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full", colors.bar)}
                style={{ width: `${p}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{p}%</span>
          </div>
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: "expectedCloseDate",
      header: "سررسید پیش‌بینی",
      cell: ({ row }) => {
        if (!row.original.expectedCloseDate) return <span className="text-muted-foreground text-xs">—</span>;
        const dr = daysRemaining(row.original.expectedCloseDate);
        return (
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">{formatDate(row.original.expectedCloseDate)}</span>
            <span
              className={cn(
                "text-[10px] font-medium",
                dr.status === "today" && "text-rose-600",
                dr.status === "overdue" && "text-rose-600",
                dr.status === "remaining" && "text-amber-600",
                dr.status === "none" && "text-muted-foreground"
              )}
            >
              {dr.text}
            </span>
          </div>
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: "source",
      header: "منبع",
      cell: ({ row }) => {
        const s = row.original.source as DealSource | null;
        if (!s) return <span className="text-muted-foreground text-xs">—</span>;
        const opt = SOURCE_OPTIONS.find((o) => o.value === s);
        return <span className="text-xs">{opt?.label ?? s}</span>;
      },
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
              setDeleteTarget(row.original);
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

  const totalValue = deals.reduce((s, d) => s + (d.value || 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="معاملات"
        description={`${deals.length} معامله • ${formatCurrency(totalValue)}`}
        icon="orders"
        actions={
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <DropdownMenu open={bulkStageOpen} onOpenChange={setBulkStageOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-1.5">
                    <Icon name="layers" size={15} />
                    تغییر مرحله ({selectedIds.length})
                    <Icon name="chevronDown" size={12} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>انتخاب مرحله جدید</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {STAGE_OPTIONS.map((s) => (
                    <DropdownMenuItem
                      key={s.value}
                      onClick={() =>
                        bulkStageMut.mutate({ ids: selectedIds, stage: s.value })
                      }
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          STAGE_COLORS[s.value].dot
                        )}
                      />
                      {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button onClick={openNew} className="gap-2">
              <Icon name="plus" size={16} /> معامله جدید
            </Button>
          </div>
        }
      />

      <Card className="p-4">
        <DataTable
          columns={columns}
          data={deals}
          isLoading={isLoading}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          searchPlaceholder="جستجوی عنوان یا مشتری..."
          pageSize={10}
          onRowClick={(d) => openEdit(d)}
          toolbar={
            <div className="flex items-center gap-2">
              <Select
                value={stageFilter}
                onValueChange={(v) => setStageFilter(v as DealStage | "all")}
              >
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="مرحله" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه مراحل</SelectItem>
                  {STAGE_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sourceFilter}
                onValueChange={(v) => setSourceFilter(v as DealSource | "all")}
              >
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="منبع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه منابع</SelectItem>
                  {SOURCE_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(stageFilter !== "all" || sourceFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStageFilter("all");
                    setSourceFilter("all");
                  }}
                  className="gap-1"
                >
                  <Icon name="cancel" size={13} /> پاک فیلتر
                </Button>
              )}
            </div>
          }
          emptyState={
            <EmptyState
              icon="orders"
              title="معامله‌ای یافت نشد"
              description="اولین معامله خود را ایجاد کنید یا فیلترها را تغییر دهید."
              action={
                <Button onClick={openNew} className="gap-2">
                  <Icon name="plus" size={16} /> ایجاد معامله
                </Button>
              }
            />
          }
        />
      </Card>

      <DealFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        deal={editingDeal}
        customers={customers}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف معامله</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف «{deleteTarget?.title}» مطمئن هستید؟ این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 justify-center pt-1">
        <Icon name="refresh" size={11} />
        به‌روزرسانی خودکار هر ۳۰ ثانیه
      </div>
    </div>
  );
}
