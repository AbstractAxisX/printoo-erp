"use client";

// Printoo24 ERP — All-Orders table column definitions (Phase 3)
//
// Pure presentational column factory: receives action callbacks, returns
// ColumnDef<Order>[]. Cells are intentionally tiny.
//
// Cognitive-UX change vs. legacy: no inline expand row. The All-Orders view
// is a high-density scannable list; the detail modal (rebuilt in Phase 2)
// is where item-level lives. This lowers cognitive load on the admin's
// primary surface.

import type { ColumnDef } from "@tanstack/react-table";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, daysRemaining } from "@/lib/format";
import {
  ITEM_STAGE,
  type OrderStatus,
} from "@/lib/constants";
import { StatusBadge, PriorityBadge } from "@/components/shared";
import { OrderRowActions } from "./order-row-actions";
import type { Order } from "./types";

/** اعداد فارسی برای چیپ‌های ردیف */
function toFa(n: number) {
  return n.toLocaleString("fa-IR");
}

export type OrderColumnActions = {
  onOpenDetail: (o: Order) => void; // row click → detail modal
  onOpenNote: (o: Order) => void; // status cell → note modal
  onOpenStatus: (o: Order) => void; // status cell → status modal
  onOpenDelete: (o: Order) => void; // trash → delete confirm
  onEdit: (o: Order) => void; // pencil → edit wizard
  /** Phase 9 — دکمهٔ ردیف → مودال جزئیات روی تب پیش‌فاکتور */
  onOpenPreInvoice: (o: Order) => void;
  /** Phase 9 — دکمهٔ ردیف → مودال جزئیات روی تب فاکتور */
  onOpenInvoice: (o: Order) => void;
};

export function getOrderColumns(a: OrderColumnActions): ColumnDef<Order>[] {
  return [
    {
      accessorKey: "number",
      header: "شماره",
      cell: ({ row }) => {
        // Phase 9: سفارش گروهی چندآیتمی → شورون باز/بستهٔ آیتم‌ها.
        // کلیک روی شورون فقط expand می‌کند؛ کلیک روی ردیف → مودال جزئیات.
        const canExpand = (row.original.items?.length ?? 0) > 1;
        const isGrouped = row.original.splitMode === "grouped";
        return (
          <div className="flex items-center gap-1.5">
            {canExpand ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  row.toggleExpanded();
                }}
                aria-label={row.getIsExpanded() ? "بستن آیتم‌ها" : "باز کردن آیتم‌ها"}
                className={cn(
                  "size-6 rounded-md border grid place-items-center shrink-0 transition",
                  row.getIsExpanded()
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "hover:bg-accent text-muted-foreground"
                )}
              >
                <Icon
                  name={row.getIsExpanded() ? "chevronDown" : "chevronLeft"}
                  size={13}
                />
              </button>
            ) : (
              <span className="w-6 shrink-0" />
            )}
            <div className="flex flex-col items-start">
              <span className="font-mono text-xs font-bold">
                #{row.original.number}
              </span>
              {isGrouped && (row.original.items?.length ?? 0) > 1 && (
                <span className="text-[10px] text-primary bg-primary/10 rounded px-1.5 py-0.5 flex items-center gap-0.5 mt-0.5">
                  <Icon name="layers" size={9} />
                  گروهی {toFa(row.original.items.length)} آیتم
                </span>
              )}
            </div>
          </div>
        );
      },
      enableSorting: true,
      size: 110,
    },
    {
      id: "customer",
      accessorFn: (r) => r.customer?.name ?? "",
      header: "مشتری",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium truncate">
            {row.original.customer?.name ?? "—"}
          </div>
          <div
            className="text-xs text-muted-foreground tabular-nums"
            dir="ltr"
          >
            {row.original.customer?.phone ?? "—"}
          </div>
        </div>
      ),
      size: 180,
    },
    {
      id: "items",
      header: "آیتم‌ها",
      cell: ({ row }) => {
        const items = row.original.items ?? [];
        const canExpand = items.length > 1;
        const designCount = items.filter((i) => i.stage === "design").length;
        return (
          <div className="flex flex-wrap items-center gap-1 max-w-[240px]">
            {items.slice(0, 2).map((it) => (
              <span
                key={it.id}
                className="text-xs bg-muted rounded px-1.5 py-0.5 truncate max-w-[140px]"
              >
                {it.product?.name ?? "—"}
              </span>
            ))}
            {items.length > 2 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                +{items.length - 2}
              </span>
            )}
            {items.length === 0 && (
              <span className="text-xs text-muted-foreground">—</span>
            )}
            {/* گیت طراحی: تا طراحی همهٔ آیتم‌ها تمام نشود سفارش جلو نمی‌رود */}
            {canExpand && designCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 flex items-center gap-0.5">
                <Icon name="design" size={9} />
                {toFa(designCount)} در طراحی
              </span>
            )}
          </div>
        );
      },
      size: 240,
    },
    {
      accessorKey: "status",
      header: "وضعیت",
      cell: ({ row }) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            a.onOpenStatus(row.original);
          }}
          className="hover:opacity-80 transition"
        >
          <StatusBadge status={row.original.status as OrderStatus} />
        </button>
      ),
      size: 120,
    },
    {
      id: "endDate",
      accessorFn: (r) => (r.endDate ? new Date(r.endDate).getTime() : 0),
      header: "تاریخ پایان",
      cell: ({ row }) => {
        const o = row.original;
        if (o.noEndDate)
          return (
            <span className="text-xs text-muted-foreground">بدون زمان پایان</span>
          );
        if (!o.endDate)
          return <span className="text-xs text-muted-foreground">—</span>;
        const dr = daysRemaining(o.endDate);
        return (
          <div>
            <div className="text-xs tabular-nums">{formatDate(o.endDate)}</div>
            {dr.status !== "none" && (
              <div
                className={cn(
                  "text-[11px] mt-0.5 flex items-center gap-1",
                  dr.status === "remaining" && "text-emerald-600",
                  dr.status === "overdue" && "text-rose-600",
                  dr.status === "today" && "text-amber-600"
                )}
              >
                <Icon
                  name={dr.status === "overdue" ? "alertTriangle" : "clock"}
                  size={11}
                />
                {dr.text}
              </div>
            )}
          </div>
        );
      },
      size: 140,
    },
    {
      accessorKey: "totalAmount",
      header: "مبلغ کل",
      cell: ({ row }) => (
        <span className="font-semibold tabular-nums" dir="ltr">
          {formatCurrency(row.original.totalAmount)}
        </span>
      ),
      enableSorting: true,
      size: 130,
      meta: { align: "end" },
    },
    {
      id: "priority",
      accessorFn: (r) => r.priority,
      header: "اولویت",
      cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      enableSorting: true,
      size: 90,
    },
    {
      id: "createdAt",
      accessorFn: (r) => new Date(r.createdAt).getTime(),
      header: "تاریخ ساخت",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDate(row.original.createdAt)}
        </span>
      ),
      enableSorting: true,
      size: 120,
    },
    {
      id: "stage",
      // Hidden by default — surfaced via column toggle if admin wants it.
      accessorFn: (r) => r.items?.[0]?.stage ?? "",
      header: "مرحله",
      cell: ({ row }) => {
        const s = row.original.items?.[0]?.stage ?? "";
        const label =
          ITEM_STAGE[s as keyof typeof ITEM_STAGE]?.label ?? s ?? "—";
        return (
          <span className="text-xs rounded bg-muted px-1.5 py-0.5">{label}</span>
        );
      },
      size: 100,
    },
    {
      id: "actions",
      header: () => <div className="text-center">عملیات</div>,
      cell: ({ row }) => (
        <OrderRowActions
          order={row.original}
          onNote={() => a.onOpenNote(row.original)}
          onDelete={() => a.onOpenDelete(row.original)}
          onEdit={() => a.onEdit(row.original)}
          onPreInvoice={() => a.onOpenPreInvoice(row.original)}
          onInvoice={() => a.onOpenInvoice(row.original)}
        />
      ),
      enableSorting: false,
      size: 200,
      meta: { align: "center", hideable: false },
    },
  ];
}
