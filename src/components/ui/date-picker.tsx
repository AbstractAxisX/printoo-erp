"use client";

import * as React from "react";
import { format, isValid } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  value?: Date | string | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  className?: string;
  clearable?: boolean;
  disabled?: boolean;
};

/**
 * Beautiful date picker with popover calendar.
 * Gregorian dates, English numerals.
 */
export function DatePicker({
  value, onChange, placeholder = "انتخاب تاریخ", className, clearable = true, disabled,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const date = React.useMemo(() => {
    if (!value) return undefined;
    if (value instanceof Date) return isValid(value) ? value : undefined;
    const d = new Date(value);
    return isValid(d) ? d : undefined;
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "justify-start text-right font-normal h-9",
            !date && "text-muted-foreground",
            className
          )}
        >
          <Icon name="calendar" size={15} className="text-muted-foreground shrink-0" />
          {date ? <span className="tabular-nums">{format(date, "yyyy/MM/dd")}</span> : <span>{placeholder}</span>}
          {clearable && date && (
            <span
              role="button"
              tabIndex={0}
              className="ml-auto mr-auto p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onChange?.(null); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onChange?.(null); } }}
            >
              <Icon name="cancel" size={13} />
            </span>
          )}
          {(!clearable || !date) && <span className="ml-auto" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => { onChange?.(d ?? null); setOpen(false); }}
          initialFocus
          className="rounded-lg border-0"
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Date range picker (start - end)
 */
export function DateRangePicker({
  start, end, onStartChange, onEndChange, className,
}: {
  start?: Date | string | null;
  end?: Date | string | null;
  onStartChange?: (d: Date | null) => void;
  onEndChange?: (d: Date | null) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DatePicker value={start} onChange={onStartChange} placeholder="از تاریخ" />
      <Icon name="arrowLeft" size={14} className="text-muted-foreground" />
      <DatePicker value={end} onChange={onEndChange} placeholder="تا تاریخ" />
    </div>
  );
}
