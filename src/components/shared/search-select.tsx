"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type SearchOption = { value: string; label: string; sub?: string };

export function SearchSelect({
  value,
  onChange,
  placeholder = "انتخاب کنید...",
  searchPlaceholder = "جستجو...",
  options,
  className,
  allowClear = true,
}: {
  value?: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  options: SearchOption[];
  className?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          role="combobox"
          aria-expanded={open}
          aria-controls="search-select-list"
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm hover:bg-accent/50 transition min-w-0",
            className
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <Icon name="chevronDown" size={14} className="text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-60 scrollbar-thin">
            <CommandEmpty>نتیجه‌ای یافت نشد</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.sub ?? ""}`}
                  onSelect={() => { onChange(o.value === value ? null : o.value); setOpen(false); }}
                  className="gap-2"
                >
                  <Icon name={value === o.value ? "check" : "user"} size={14} className={value === o.value ? "text-primary" : "text-muted-foreground opacity-0"} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{o.label}</div>
                    {o.sub && <div className="text-xs text-muted-foreground truncate" dir="ltr">{o.sub}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {allowClear && value && (
          <div className="border-t p-1">
            <button onClick={() => { onChange(null); setOpen(false); }} className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 flex items-center justify-center gap-1">
              <Icon name="cancel" size={12} /> پاک کردن
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
