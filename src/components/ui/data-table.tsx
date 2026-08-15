"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  SortingState,
  Table as TableType,
  VisibilityState,
  useReactTable,
  Row,
} from "@tanstack/react-table";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type DataTableMeta<TData> = {
  onRowClick?: (row: TData) => void;
  hideable?: boolean;
};

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    hideable?: boolean;
    className?: string;
  }
}

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  searchKey?: string;
  searchPlaceholder?: string;
  globalFilter?: string;
  onGlobalFilterChange?: (v: string) => void;
  toolbar?: React.ReactNode;
  pageSize?: number;
  pageSizeOptions?: number[];
  showColumnToggle?: boolean;
  showPagination?: boolean;
  emptyState?: React.ReactNode;
  getRowCanExpand?: (row: TData) => boolean;
  renderExpandedRow?: (row: TData) => React.ReactNode;
  onRowClick?: (row: TData) => void;
  className?: string;
  dense?: boolean;
  totalCount?: number; // for server-side pagination
};

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading,
  searchKey,
  searchPlaceholder = "جستجو...",
  globalFilter,
  onGlobalFilterChange,
  toolbar,
  pageSize = 10,
  pageSizeOptions = [10, 20, 30, 50, 100],
  showColumnToggle = true,
  showPagination = true,
  emptyState,
  getRowCanExpand,
  renderExpandedRow,
  onRowClick,
  className,
  dense = false,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter: globalFilter ?? "" },
    enableSorting: true,
    enableColumnFilters: true,
    enableGlobalFilter: !!onGlobalFilterChange,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: onGlobalFilterChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: getRowCanExpand ? () => true : undefined,
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className={cn("space-y-3", className)}>
      {/* Toolbar */}
      {(searchKey || onGlobalFilterChange || toolbar || showColumnToggle) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchKey ? (
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Icon name="search" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
                onChange={(e) => table.getColumn(searchKey)?.setFilterValue(e.target.value)}
                className="pr-9"
              />
            </div>
          ) : onGlobalFilterChange ? (
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Icon name="search" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={globalFilter ?? ""}
                onChange={(e) => onGlobalFilterChange?.(e.target.value)}
                className="pr-9"
              />
            </div>
          ) : null}

          {toolbar}

          {showColumnToggle && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 mr-auto">
                  <Icon name="sliders" size={14} /> ستون‌ها
                  <Icon name="chevronDown" size={12} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>نمایش ستون‌ها</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table
                  .getAllColumns()
                  .filter((col) => typeof col.accessorFn !== "undefined" || col.id !== "select")
                  .filter((col) => !col.columnDef.meta?.hideable)
                  .map((col) => (
                    <DropdownMenuCheckboxItem
                      key={col.id}
                      checked={col.getIsVisible()}
                      onCheckedChange={(v) => col.toggleVisibility(!!v)}
                      className="capitalize text-xs"
                    >
                      {typeof col.columnDef.header === "string" ? col.columnDef.header : col.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                {hg.headers.map((header) => (
                  <TableHead key={header.id} className="h-10 text-xs font-semibold text-muted-foreground">
                    {header.isPlaceholder ? null : (
                      <div
                        className={cn("flex items-center gap-1", header.column.getCanSort() && "cursor-pointer select-none hover:text-foreground transition")}
                        onClick={header.column.getCanSort() ? () => header.column.toggleSorting(header.column.getIsSorted() === "asc") : undefined}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <SortIcon dir={header.column.getIsSorted()} />
                        )}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Icon name="loading" size={24} className="animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">در حال بارگذاری...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <React.Fragment key={row.id}>
                  <TableRow
                    data-state={row.getIsSelected() && "selected"}
                    className={cn(
                      "group transition-colors",
                      onRowClick && "cursor-pointer",
                      row.getIsExpanded() && "bg-muted/30"
                    )}
                    onClick={() => {
                      if (getRowCanExpand && getRowCanExpand(row.original)) {
                        row.toggleExpanded();
                      }
                      onRowClick?.(row.original);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={cn(dense ? "py-1.5" : "py-2.5")}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() && renderExpandedRow && (
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={row.getVisibleCells().length} className="p-0">
                        {renderExpandedRow(row.original)}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32">
                  {emptyState ?? (
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Icon name="inbox" size={28} className="opacity-40" />
                      <span className="text-sm">موردی یافت نشد</span>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {showPagination && (
        <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} totalCount={data.length} />
      )}
    </div>
  );
}

function SortIcon({ dir }: { dir: false | "asc" | "desc" }) {
  if (!dir) return <Icon name="arrowUpDown" size={13} className="text-muted-foreground/50" />;
  return <Icon name={dir === "asc" ? "sortUp" : "sortDown"} size={13} className="text-primary" />;
}

function DataTablePagination<TData>({
  table, pageSizeOptions, totalCount,
}: {
  table: TableType<TData>;
  pageSizeOptions: number[];
  totalCount: number;
}) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const from = pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, totalCount);

  return (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 px-1">
      <div className="text-xs text-muted-foreground">
        {totalCount > 0 ? (
          <>نمایش <span className="font-medium text-foreground">{from}</span> تا <span className="font-medium text-foreground">{to}</span> از <span className="font-medium text-foreground">{totalCount}</span> مورد</>
        ) : "موردی وجود ندارد"}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">ردیف در صفحه:</span>
          <Select value={String(pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
            <Icon name="chevronRight" size={14} />
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <Icon name="arrowRight" size={14} />
          </Button>
          <span className="text-xs px-2">
            صفحه <span className="font-medium">{pageIndex + 1}</span> از <span className="font-medium">{table.getPageCount() || 1}</span>
          </span>
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <Icon name="arrowLeft" size={14} />
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
            <Icon name="chevronLeft" size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Re-export Row type for convenience
export type { Row, ColumnDef };
