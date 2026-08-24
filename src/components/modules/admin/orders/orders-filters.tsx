"use client";

// Printoo24 ERP — Orders filter bar + primitives (Phase 3 atomic split)
//
// Three presentational primitives (SearchCombobox, FilterGroup, FilterToggle)
// + one composite (OrdersFilterBar) + one stateful hook (useOrdersFilters).
//
// The hook owns ALL filter state + the predicate; the page is left a thin
// container. Server-side params (customerId/productId) are derived here so
// the data hook (use-orders-query) only consumes a stable key.

import * as React from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  ORDER_STATUS,
  PRIORITY,
  ITEM_STAGE,
} from "@/lib/constants";
import {
  type OrdersFilterState,
  emptyFilters,
  activeFilterCount,
} from "./types";

// ─── Hook: owns filter state + helpers ─────────────────────────
export function useOrdersFilters() {
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [productSearch, setProductSearch] = React.useState("");
  const [filters, setFilters] = React.useState<OrdersFilterState>(emptyFilters);
  const [showFilters, setShowFilters] = React.useState(false);

  const setCustomer = React.useCallback(
    (v: string | null) => setFilters((f) => ({ ...f, customerFilter: v })),
    []
  );
  const setProduct = React.useCallback(
    (v: string | null) => setFilters((f) => ({ ...f, productFilter: v })),
    []
  );
  const setStatusFilters = React.useCallback(
    (s: Set<string>) => setFilters((f) => ({ ...f, statusFilters: s })),
    []
  );
  const setPriorityFilters = React.useCallback(
    (s: Set<string>) => setFilters((f) => ({ ...f, priorityFilters: s })),
    []
  );
  const setStageFilters = React.useCallback(
    (s: Set<string>) => setFilters((f) => ({ ...f, stageFilters: s })),
    []
  );
  const setDateFrom = React.useCallback(
    (d: Date | null) => setFilters((f) => ({ ...f, dateFrom: d })),
    []
  );
  const setDateTo = React.useCallback(
    (d: Date | null) => setFilters((f) => ({ ...f, dateTo: d })),
    []
  );

  const toggleSet = React.useCallback(
    (set: Set<string>, value: string, setter: (s: Set<string>) => void) => {
      const next = new Set(set);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      setter(next);
    },
    []
  );

  const clear = React.useCallback(() => {
    setFilters(emptyFilters);
    setCustomerSearch("");
    setProductSearch("");
  }, []);

  const count = activeFilterCount(filters);

  return {
    filters,
    customerSearch,
    productSearch,
    showFilters,
    setCustomerSearch,
    setProductSearch,
    setShowFilters,
    setCustomer,
    setProduct,
    setStatusFilters,
    setPriorityFilters,
    setStageFilters,
    setDateFrom,
    setDateTo,
    toggleSet,
    clear,
    count,
  };
}

// ─── Search Combobox ───────────────────────────────────────────
type SearchOption = { value: string; label: string; sub?: string };

export function SearchCombobox({
  value,
  onChange,
  search,
  onSearchChange,
  placeholder,
  emptyText,
  options,
  icon,
  className,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  search: string;
  onSearchChange: (v: string) => void;
  placeholder: string;
  emptyText: string;
  options: SearchOption[];
  icon: "customers" | "package";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);
  const filtered = options.filter(
    (o) =>
      !search ||
      o.label.includes(search) ||
      (o.sub?.includes(search) ?? false)
  );

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) onSearchChange("");
      }}
    >
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
          <span
            className={cn(
              "truncate flex-1 text-right",
              !selected && "text-muted-foreground"
            )}
          >
            {selected ? (
              <span className="flex items-center gap-2">
                <span>{selected.label}</span>
                {selected.sub && (
                  <span
                    className="text-xs text-muted-foreground tabular-nums"
                    dir="ltr"
                  >
                    {selected.sub}
                  </span>
                )}
              </span>
            ) : (
              placeholder
            )}
          </span>
          <Icon
            name="chevronDown"
            size={14}
            className="text-muted-foreground shrink-0"
          />
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
                  onSelect={() => {
                    onChange(o.value === value ? null : o.value);
                    setOpen(false);
                    onSearchChange("");
                  }}
                  className="gap-2"
                >
                  <Icon
                    name={value === o.value ? "check" : icon}
                    size={14}
                    className={
                      value === o.value
                        ? "text-primary"
                        : "text-muted-foreground opacity-0"
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{o.label}</div>
                    {o.sub && (
                      <div
                        className="text-xs text-muted-foreground tabular-nums"
                        dir="ltr"
                      >
                        {o.sub}
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {value && (
          <div className="border-t p-1">
            <button
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 flex items-center justify-center gap-1"
            >
              <Icon name="cancel" size={12} /> پاک کردن انتخاب
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Filter group (label + toggle buttons) ────────────────────
export function FilterGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon: "route" | "alertTriangle" | "layers" | "calendar";
  children: React.ReactNode;
}) {
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

// ─── Filter Toggle Button ─────────────────────────────────────
export function FilterToggle({
  active,
  onClick,
  label,
  activeColor = "primary",
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

// ─── Composite: the whole filter card ──────────────────────────
export function OrdersFilterBar({
  state,
  customers,
  products,
  resultCount,
}: {
  state: ReturnType<typeof useOrdersFilters>;
  customers: { id: string; name: string; phone: string }[];
  products: { id: string; name: string }[];
  resultCount: number;
}) {
  const {
    filters,
    customerSearch,
    productSearch,
    showFilters,
    setCustomerSearch,
    setProductSearch,
    setShowFilters,
    setCustomer,
    setProduct,
    setStatusFilters,
    setPriorityFilters,
    setStageFilters,
    setDateFrom,
    setDateTo,
    toggleSet,
    clear,
    count,
  } = state;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchCombobox
          value={filters.customerFilter}
          onChange={setCustomer}
          search={customerSearch}
          onSearchChange={setCustomerSearch}
          placeholder="جستجوی مشتری (نام یا شماره)..."
          emptyText="مشتری‌ای یافت نشد"
          options={customers.map((c) => ({
            value: c.id,
            label: c.name,
            sub: c.phone,
          }))}
          icon="customers"
          className="w-64"
        />

        <SearchCombobox
          value={filters.productFilter}
          onChange={setProduct}
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
          {count > 0 && (
            <span className="size-5 rounded-full bg-primary-foreground/20 grid place-items-center text-[10px] font-bold">
              {count}
            </span>
          )}
        </Button>

        {count > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={clear}
          >
            <Icon name="cancel" size={14} /> پاک کردن همه ({count})
          </Button>
        )}

        <div className="mr-auto text-xs text-muted-foreground tabular-nums">
          {resultCount.toLocaleString("fa-IR")} سفارش
        </div>
      </div>

      {showFilters && (
        <div className="border-t pt-3 space-y-3">
          <FilterGroup label="وضعیت سفارش" icon="route">
            {Object.entries(ORDER_STATUS).map(([k, v]) => (
              <FilterToggle
                key={k}
                active={filters.statusFilters.has(k)}
                onClick={() => toggleSet(filters.statusFilters, k, setStatusFilters)}
                label={v.label}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="اولویت" icon="alertTriangle">
            {Object.entries(PRIORITY).map(([k, v]) => (
              <FilterToggle
                key={k}
                active={filters.priorityFilters.has(k)}
                onClick={() =>
                  toggleSet(filters.priorityFilters, k, setPriorityFilters)
                }
                label={v.label}
                activeColor={k === "urgent" ? "rose" : "primary"}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="مرحله آیتم" icon="layers">
            {Object.entries(ITEM_STAGE).map(([k, v]) => (
              <FilterToggle
                key={k}
                active={filters.stageFilters.has(k)}
                onClick={() => toggleSet(filters.stageFilters, k, setStageFilters)}
                label={v.label}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="بازه تاریخ ساخت" icon="calendar">
            <DatePicker value={filters.dateFrom} onChange={setDateFrom} placeholder="از تاریخ" />
            <Icon name="arrowLeft" size={14} className="text-muted-foreground" />
            <DatePicker value={filters.dateTo} onChange={setDateTo} placeholder="تا تاریخ" />
          </FilterGroup>
        </div>
      )}
    </div>
  );
}
