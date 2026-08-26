"use client";

// Printoo24 ERP — Shared SearchCombobox (Phase 3, fixes R21)
// ─────────────────────────────────────────────────────────────
// Previously this exact component was duplicated inline in BOTH:
//   - src/components/modules/admin/orders/orders-page.tsx (L412-499)
//   - src/components/modules/admin/open-orders.tsx      (L722-845)
// (R21 in ARCHITECTURE-NOTES-MUST-READ.md §6)
//
// This shared version is the single source of truth. Both call-sites now import
// from "@/components/shared". The icon prop is widened to IconName so any icon
// can drive the combobox (not just customers/package).
//
// Behavior is preserved 1:1 (open-on-click, search-on-type, clear-on-close,
// clear-selection footer). The only semantic change: the `id` used for
// aria-controls is derived from a stable `inputId` prop (or auto-generated)
// instead of being hardcoded — required when two comboboxes coexist on a page.

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type SearchComboboxOption = {
  value: string;
  label: string;
  sub?: string;
};

type SearchComboboxProps = {
  value: string | null;
  onChange: (v: string | null) => void;
  search: string;
  onSearchChange: (v: string) => void;
  placeholder: string;
  emptyText: string;
  options: SearchComboboxOption[];
  icon?: IconName;
  className?: string;
  /** Stable id for aria-controls (defaults to a generated one). Pass when two
   * comboboxes live on the same page so their ARIA wiring doesn't collide. */
  inputId?: string;
  /** Popover panel width (defaults to 288px = w-72). */
  panelWidth?: number;
  /** When true, clicking the trigger when open does NOT close it. Default false. */
  keepOpenOnSelect?: boolean;
};

export function SearchCombobox({
  value,
  onChange,
  search,
  onSearchChange,
  placeholder,
  emptyText,
  options,
  icon = "search",
  className,
  inputId,
  panelWidth = 288,
  keepOpenOnSelect = false,
}: SearchComboboxProps) {
  const [open, setOpen] = React.useState(false);
  // Auto-generate a stable id once per instance; override via prop if needed.
  const autoId = React.useId();
  const listId = inputId ? `${inputId}-list` : `search-combobox-${autoId}-list`;

  const selected = options.find((o) => o.value === value);
  // Client-side filter (matches the legacy behavior). Server-side filtering can
  // be added later by lifting the search state up — interface is preserved.
  const filtered = options.filter(
    (o) => !search || o.label.includes(search) || (o.sub?.includes(search) ?? false)
  );

  function handleSelect(v: string) {
    onChange(v === value ? null : v);
    if (!keepOpenOnSelect) setOpen(false);
    onSearchChange("");
  }

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
          aria-controls={listId}
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
                {selected.sub && (
                  <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                    {selected.sub}
                  </span>
                )}
              </span>
            ) : (
              placeholder
            )}
          </span>
          <Icon name="chevronDown" size={14} className="text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start" style={{ width: panelWidth }}>
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
          <CommandList className="max-h-60 scrollbar-thin" id={listId}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filtered.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.sub ?? ""}`}
                  onSelect={() => handleSelect(o.value)}
                  className="gap-2"
                >
                  <Icon
                    name={value === o.value ? "check" : icon}
                    size={14}
                    className={value === o.value ? "text-primary" : "text-muted-foreground opacity-0"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{o.label}</div>
                    {o.sub && (
                      <div className="text-xs text-muted-foreground tabular-nums" dir="ltr">
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
