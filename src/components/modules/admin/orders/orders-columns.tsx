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

export type OrderColumnActions = {
  onOpenDetail: (o: Order) => void; // row click → detail modal
  onOpenNote: (o: Order) => void; // status cell → note modal
  onOpenStatus: (o: Order) => void; // status cell → status modal
  onOpenDelete: (o: Order) => void; // trash → delete confirm
  onEdit: (o: Order) => void; // pencil → edit wizard
};

export function getOrderColumns(a: OrderColumnActions): ColumnDef<Order>[] {
  return [
    {
      accessorKey: "number",
      header: "شماره",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold">
          #{row.original.number}
        </span>
      ),
      enableSorting: true,
      size: 72,
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
        return (
          <div className="flex flex-wrap gap-1 max-w-[220px]">
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
          </div>
        );
      },
      size: 220,
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
        />
      ),
      enableSorting: false,
      size: 200,
      meta: { align: "center", hideable: false },
    },
  ];
}
