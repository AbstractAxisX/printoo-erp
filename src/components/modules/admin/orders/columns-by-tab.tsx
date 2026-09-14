"use client";

// Printoo24 ERP — per-aspect order columns (Phase 20, خواستهٔ ۵)
//
// کارخانهٔ ستون‌های تب‌های جنبه‌ای جدول سفارش‌ها («آیتم‌ها»/«هزینه‌ها»/
// «پیوست‌ها»/«یادداشت‌ها») — مشترک بین «همه سفارشات» و «سفارشات باز».
//
// Generic روی OrderTabRow است: هر دو Order (orders/types.ts) و OpenOrder
// (open-orders-helpers.ts) این شکل را ارضا می‌کنند — تایپ‌های دو صفحه
// کمی متفاوت‌اند ولی ستون‌ها فقط به این حداقل نیاز دارند.
//
// ستون‌های مشترک ابتدای هر تب: شماره (#N mono) + مشتری (نام+تلفن).
// ردیف‌ها ساده‌اند (بدون expand/اکشن‌ها) و کلیک روی ردیف → مودال جزئیات
// (onRowClick از خود صفحه می‌آید و عوض نمی‌شود).

import type { ColumnDef } from "@tanstack/react-table";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { OrderTableTab } from "./order-table-tabs";

/** حداقل شکل سفارشی که ستون‌های تب‌ها به آن نیاز دارند */
export type OrderTabItem = {
  id: string;
  stage: string;
  product?: { name: string } | null;
  note?: string | null;
};

export type OrderTabRow = {
  id: string;
  number: number;
  totalAmount: number;
  note?: string | null;
  customer?: { name?: string | null; phone?: string | null } | null;
  items?: readonly OrderTabItem[] | null;
  // ─── Phase 20: تجمیع‌های هزینه/پیوست (?withAggregates=1) ──
  costsCount?: number;
  costsTotal?: number;
  costsApproved?: number;
  costsPending?: number;
  attachmentsCount?: number;
};

/** اعداد فارسی برای شمارش‌ها */
function toFa(n: number) {
  return n.toLocaleString("fa-IR");
}

/** مبلغ جمع‌وجور ltr (مثل ستون‌های موجود) */
function Amount({
  value,
  tone,
}: {
  value: number;
  tone?: "emerald" | "rose" | "amber" | "muted";
}) {
  return (
    <span
      className={cn(
        "text-sm font-semibold tabular-nums",
        tone === "emerald" && "text-emerald-600 dark:text-emerald-400",
        tone === "rose" && "text-rose-600 dark:text-rose-400",
        tone === "amber" && "text-amber-600 dark:text-amber-400",
        tone === "muted" && "text-muted-foreground font-medium"
      )}
      dir="ltr"
    >
      {formatCurrency(value)}
    </span>
  );
}

// ─── ستون‌های مشترک (ابتدای هر تب) ─────────────────────────────
function commonColumns<T extends OrderTabRow>(): ColumnDef<T>[] {
  return [
    {
      accessorKey: "number",
      header: "شماره",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold">#{row.original.number}</span>
      ),
      enableSorting: true,
      size: 90,
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
      enableSorting: true,
      size: 170,
    },
  ];
}

// ─── تب آیتم‌ها ────────────────────────────────────────────────
function itemColumns<T extends OrderTabRow>(): ColumnDef<T>[] {
  return [
    {
      id: "itemCount",
      accessorFn: (r) => r.items?.length ?? 0,
      header: "تعداد آیتم",
      cell: ({ row }) => {
        const n = row.original.items?.length ?? 0;
        return n > 0 ? (
          <span className="text-sm font-semibold tabular-nums">
            {toFa(n)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
      enableSorting: true,
      size: 90,
      meta: { align: "center" },
    },
    {
      id: "itemChips",
      header: "آیتم‌ها",
      cell: ({ row }) => {
        const items = row.original.items ?? [];
        return (
          <div className="flex flex-wrap items-center gap-1 max-w-[260px]">
            {items.slice(0, 2).map((it) => (
              <span
                key={it.id}
                className="text-xs bg-muted rounded px-1.5 py-0.5 truncate max-w-[130px]"
              >
                {it.product?.name ?? "—"}
              </span>
            ))}
            {items.length > 2 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                +{toFa(items.length - 2)}
              </span>
            )}
            {items.length === 0 && (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
        );
      },
      enableSorting: false,
      size: 240,
    },
    {
      // گیت طراحی: آیتم‌های مانده در مرحلهٔ طراحی
      id: "designCount",
      accessorFn: (r) =>
        (r.items ?? []).filter((it) => it.stage === "design").length,
      header: "در طراحی",
      cell: ({ row }) => {
        const n =
          (row.original.items ?? []).filter((it) => it.stage === "design")
            .length;
        return n > 0 ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 flex items-center gap-0.5 w-fit">
            <Icon name="design" size={9} />
            {toFa(n)} در طراحی
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
      enableSorting: true,
      size: 100,
    },
    {
      accessorKey: "totalAmount",
      header: "مبلغ کل",
      cell: ({ row }) => <Amount value={row.original.totalAmount} />,
      enableSorting: true,
      size: 130,
      meta: { align: "end" },
    },
  ];
}

// ─── تب هزینه‌ها ───────────────────────────────────────────────
function costColumns<T extends OrderTabRow>(): ColumnDef<T>[] {
  return [
    {
      id: "costsCount",
      accessorFn: (r) => r.costsCount ?? 0,
      header: "تعداد هزینه",
      cell: ({ row }) => {
        const n = row.original.costsCount ?? 0;
        return n > 0 ? (
          <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums">
            <Icon name="coins" size={13} className="text-muted-foreground" />
            {toFa(n)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
      enableSorting: true,
      size: 100,
      meta: { align: "center" },
    },
    {
      id: "costsTotal",
      accessorFn: (r) => r.costsTotal ?? 0,
      header: "جمع هزینه",
      cell: ({ row }) => {
        const v = row.original.costsTotal ?? 0;
        return v > 0 ? <Amount value={v} /> : <Amount value={v} tone="muted" />;
      },
      enableSorting: true,
      size: 130,
      meta: { align: "end" },
    },
    {
      id: "costsApproved",
      accessorFn: (r) => r.costsApproved ?? 0,
      header: "تاییدشده",
      cell: ({ row }) => (
        <Amount
          value={row.original.costsApproved ?? 0}
          tone={(row.original.costsApproved ?? 0) > 0 ? "emerald" : "muted"}
        />
      ),
      enableSorting: true,
      size: 130,
      meta: { align: "end" },
    },
    {
      id: "costsPending",
      accessorFn: (r) => r.costsPending ?? 0,
      header: "در انتظار",
      cell: ({ row }) => (
        <Amount
          value={row.original.costsPending ?? 0}
          tone={(row.original.costsPending ?? 0) > 0 ? "amber" : "muted"}
        />
      ),
      enableSorting: true,
      size: 130,
      meta: { align: "end" },
    },
    {
      // سود برآوردی = مبلغ کل − هزینه‌های تاییدشده
      id: "estimatedProfit",
      accessorFn: (r) => (r.totalAmount ?? 0) - (r.costsApproved ?? 0),
      header: "سود برآوردی",
      cell: ({ row }) => {
        const v = (row.original.totalAmount ?? 0) - (row.original.costsApproved ?? 0);
        return (
          <Amount value={v} tone={v > 0 ? "emerald" : v < 0 ? "rose" : "muted"} />
        );
      },
      enableSorting: true,
      size: 140,
      meta: { align: "end" },
    },
  ];
}

// ─── تب پیوست‌ها ───────────────────────────────────────────────
function attachmentColumns<T extends OrderTabRow>(): ColumnDef<T>[] {
  return [
    {
      id: "attachmentsCount",
      accessorFn: (r) => r.attachmentsCount ?? 0,
      header: "تعداد پیوست",
      cell: ({ row }) => {
        const n = row.original.attachmentsCount ?? 0;
        return n > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums text-primary">
            <Icon name="file" size={14} />
            {toFa(n)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
      enableSorting: true,
      size: 110,
      meta: { align: "center" },
    },
    {
      id: "costsTotal",
      accessorFn: (r) => r.costsTotal ?? 0,
      header: "جمع هزینه",
      cell: ({ row }) => {
        const v = row.original.costsTotal ?? 0;
        return v > 0 ? <Amount value={v} /> : <Amount value={v} tone="muted" />;
      },
      enableSorting: true,
      size: 130,
      meta: { align: "end" },
    },
    {
      accessorKey: "totalAmount",
      header: "مبلغ کل",
      cell: ({ row }) => <Amount value={row.original.totalAmount} />,
      enableSorting: true,
      size: 130,
      meta: { align: "end" },
    },
  ];
}

// ─── تب یادداشت‌ها ─────────────────────────────────────────────
function noteColumns<T extends OrderTabRow>(): ColumnDef<T>[] {
  return [
    {
      id: "orderNote",
      accessorFn: (r) => r.note ?? "",
      header: "یادداشت سفارش",
      cell: ({ row }) => {
        const note = row.original.note;
        return note ? (
          <span className="text-xs text-foreground/90 block truncate max-w-[220px]">
            {note}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
      enableSorting: true,
      size: 240,
    },
    {
      // شمارش آیتم‌های دارای یادداشت + گزیدهٔ اولین
      id: "itemNotes",
      accessorFn: (r) => (r.items ?? []).filter((it) => it.note).length,
      header: "یادداشت آیتم‌ها",
      cell: ({ row }) => {
        const withNotes = (row.original.items ?? []).filter((it) => it.note);
        if (withNotes.length === 0)
          return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div className="min-w-0 max-w-[260px]">
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground tabular-nums">
              <Icon name="info" size={9} />
              {toFa(withNotes.length)} یادداشت
            </span>
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {withNotes[0]?.note}
            </div>
          </div>
        );
      },
      enableSorting: true,
      size: 260,
    },
  ];
}

/**
 * ستون‌های تب‌های جنبه‌ای — «همه» از این کارخانه نمی‌آید (ستون‌های کامل
 * هر صفحه می‌مانند: orders-columns.tsx / ستون‌های محلی open-orders).
 */
export function getOrderTabColumns<T extends OrderTabRow>(
  tab: Exclude<OrderTableTab, "all">
): ColumnDef<T>[] {
  switch (tab) {
    case "items":
      return [...commonColumns<T>(), ...itemColumns<T>()];
    case "costs":
      return [...commonColumns<T>(), ...costColumns<T>()];
    case "attachments":
      return [...commonColumns<T>(), ...attachmentColumns<T>()];
    case "notes":
      return [...commonColumns<T>(), ...noteColumns<T>()];
  }
}
