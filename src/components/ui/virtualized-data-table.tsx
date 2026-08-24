"use client";

// Printoo24 ERP — Virtualized Data Table (Phase 3)
//
// Renders thousands of rows without performance loss by virtualizing the
// body via @tanstack/react-virtual. Keeps the same ColumnDef model as the
// existing DataTable so column definitions stay portable between the two.
//
// Design:
// - Sticky <thead>, scrollable <tbody> with absolutely-positioned virtual rows.
// - useVirtualizer measures the scroll container and renders only visible rows
//   + an overscan buffer. Row height is uniform by default (estimateSize) but
//   can be overridden per-row via `measureElement` for variable heights.
// - RTL-aware: the app is Persian; the scroll container inherits dir="rtl".
// - No pagination — virtual scroll is the scaling primitive. For multi-page
//   server fetches, feed a windowed `data` slice and re-trigger on end-reached
//   via `onRangeEnd` (optional). For client-side thousands of rows, just pass
//   the full array.
//
// Cognitive-UX: dense, scannable, no whitespace waste — admin's primary surface.

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  type Row,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

// Re-export ColumnDef so consumers import from one place.
export type { ColumnDef, Row };

// Extend column meta (merged with DataTable's module augmentation).
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    hideable?: boolean;
    className?: string;
    align?: "start" | "center" | "end";
  }
}

export type VirtualizedDataTableProps<TData, TValue = unknown> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  onRowClick?: (row: TData) => void;
  onRowDoubleClick?: (row: TData) => void;
  emptyState?: React.ReactNode;
  loadingRowCount?: number; // skeleton rows while loading (default 8)
  estimateRowHeight?: number; // px (default 44 — dense admin rows)
  overscan?: number; // virtual buffer (default 12)
  className?: string;
  bodyClassName?: string;
  ariaLabel?: string;
};

export function VirtualizedDataTable<TData, TValue = unknown>({
  columns,
  data,
  isLoading = false,
  onRowClick,
  onRowDoubleClick,
  emptyState,
  loadingRowCount = 8,
  estimateRowHeight = 44,
  overscan = 12,
  className,
  bodyClassName,
  ariaLabel,
}: VirtualizedDataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: false,
  });

  const rows = table.getRowModel().rows;

  // Scroll container ref drives the virtualizer.
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: isLoading ? loadingRowCount : rows.length,
    estimateSize: () => estimateRowHeight,
    overscan,
    getScrollElement: () => scrollRef.current,
    measureElement:
      typeof window !== "undefined" && navigator.userAgent.includes("Firefox")
        ? (el) => el?.getBoundingClientRect().height ?? estimateRowHeight
        : undefined,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  // Header <-> body sync: column widths. The header shares the same column
  // model; we render flexRender in both. Table-layout: fixed keeps widths
  // stable during scroll (avoids header/body misalignment).
  const colWidths = React.useMemo(() => {
    return columns.map((c) => {
      const size = (c as { size?: number }).size;
      return size ? `${size}px` : undefined;
    });
  }, [columns]);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card overflow-hidden flex flex-col",
        className
      )}
    >
      {/* Scrollable region: contains sticky header + virtualized body. */}
      <div
        ref={scrollRef}
        className="overflow-auto scrollbar-thin"
        style={{ maxHeight: "calc(100vh - 240px)" }}
        aria-label={ariaLabel}
        role="region"
      >
        <Table style={{ width: "100%", tableLayout: "fixed" }}>
          {/* Sticky header — stays pinned while body scrolls. */}
          <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-muted/60 border-b">
                {hg.headers.map((header, idx) => {
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  const align = header.column.columnDef.meta?.align ?? "start";
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: colWidths[idx] }}
                      className={cn(
                        "h-10 text-xs font-semibold text-muted-foreground select-none",
                        align === "center" && "text-center",
                        align === "end" && "text-end",
                        header.column.columnDef.meta?.className
                      )}
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          className={cn(
                            "flex items-center gap-1 w-full",
                            align === "center" && "justify-center",
                            align === "end" && "justify-end",
                            canSort && "cursor-pointer hover:text-foreground transition"
                          )}
                          onClick={
                            canSort
                              ? () =>
                                  header.column.toggleSorting(
                                    header.column.getIsSorted() === "asc"
                                  )
                              : undefined
                          }
                          tabIndex={canSort ? 0 : -1}
                        >
                          <span className="truncate">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                          </span>
                          {canSort && <SortIcon dir={sortDir} />}
                        </button>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody
            className={bodyClassName}
            style={{ position: "relative", height: `${totalHeight}px` }}
          >
            {isLoading ? (
              <SkeletonRows count={loadingRowCount} colCount={columns.length} rowHeight={estimateRowHeight} />
            ) : virtualItems.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ height: "200px" }}>
                  {emptyState ?? <DefaultEmpty />}
                </td>
              </tr>
            ) : (
              virtualItems.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                return (
                  <VirtualRow
                    key={row.id}
                    row={row}
                    virtualRow={virtualRow}
                    rowHeight={virtualRow.size}
                    onRowClick={onRowClick}
                    onRowDoubleClick={onRowDoubleClick}
                  />
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer: count + visible range — high data-density affordance. */}
      {!isLoading && rows.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/30 text-[11px] text-muted-foreground">
          <span>
            مجموع{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {rows.length.toLocaleString("fa-IR")}
            </span>{" "}
            رکورد
          </span>
          {virtualItems.length > 0 && (
            <span className="tabular-nums">
              نمایش{" "}
              {Math.min(virtualItems[0].index + 1, rows.length).toLocaleString("fa-IR")}{" "}
              تا{" "}
              {Math.min(
                virtualItems[virtualItems.length - 1].index + 1,
                rows.length
              ).toLocaleString("fa-IR")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Virtual row (rendered only for visible indices by the virtualizer) ──
function VirtualRow<TData>({
  row,
  virtualRow,
  rowHeight,
  onRowClick,
  onRowDoubleClick,
}: {
  row: Row<TData>;
  virtualRow: { start: number };
  rowHeight: number;
  onRowClick?: (row: TData) => void;
  onRowDoubleClick?: (row: TData) => void;
}) {
  return (
    <TableRow
      data-index={virtualRow.start}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${virtualRow.start}px)`,
        height: `${rowHeight}px`,
      }}
      className={cn(
        "group transition-colors",
        onRowClick && "cursor-pointer hover:bg-accent/50"
      )}
      onClick={() => onRowClick?.(row.original)}
      onDoubleClick={() => onRowDoubleClick?.(row.original)}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell
          key={cell.id}
          className={cn(
            "py-2 px-3 text-sm align-middle",
            cell.column.columnDef.meta?.className
          )}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );
}

function SortIcon({ dir }: { dir: false | "asc" | "desc" }) {
  if (!dir) return <Icon name="arrowUpDown" size={12} className="text-muted-foreground/40" />;
  return <Icon name={dir === "asc" ? "sortUp" : "sortDown"} size={12} className="text-primary" />;
}

function DefaultEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground h-full">
      <Icon name="inbox" size={28} className="opacity-40" />
      <span className="text-sm">موردی یافت نشد</span>
    </div>
  );
}

function SkeletonRows({
  count,
  colCount,
  rowHeight,
}: {
  count: number;
  colCount: number;
  rowHeight: number;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} style={{ height: `${rowHeight}px` }}>
          {Array.from({ length: colCount }).map((__, j) => (
            <td key={j} className="py-2 px-3">
              <div className="h-3.5 rounded bg-muted/60 animate-pulse" style={{ width: `${30 + ((i + j) % 50)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
