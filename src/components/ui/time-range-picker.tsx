"use client";

import * as React from "react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { RANGE_PRESETS, type TimeRange, customRange } from "@/lib/time-ranges";
import { DateRange } from "react-day-picker";

type TimeRangePickerProps = {
  value: TimeRange;
  onChange: (r: TimeRange) => void;
  className?: string;
  compact?: boolean;
};

export function TimeRangePicker({ value, onChange, className, compact }: TimeRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"presets" | "custom">("presets");
  const [range, setRange] = React.useState<DateRange | undefined>();

  React.useEffect(() => {
    if (value.preset === "custom") {
      setRange({ from: value.from, to: value.to });
    }
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size={compact ? "sm" : "default"} className={cn("gap-2", className)}>
          <Icon name="calendar" size={15} className="text-muted-foreground" />
          <span>{value.label}</span>
          <Icon name="chevronDown" size={13} className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setTab("presets")}
            className={cn("flex-1 py-2 text-xs font-medium transition", tab === "presets" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground")}
          >
            بازه‌های آماده
          </button>
          <button
            onClick={() => setTab("custom")}
            className={cn("flex-1 py-2 text-xs font-medium transition", tab === "custom" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground")}
          >
            تقویم بازه‌ای
          </button>
        </div>

        {tab === "presets" ? (
          <div className="p-1.5 max-h-72 overflow-y-auto scrollbar-thin">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => { onChange(p.getRange()); setOpen(false); }}
                className={cn(
                  "w-full text-right px-2.5 py-2 rounded-md text-sm transition flex items-center justify-between",
                  value.preset === p.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent"
                )}
              >
                {p.label}
                {value.preset === p.id && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
        ) : (
          <div className="p-2">
            <Calendar
              mode="range"
              selected={range}
              onSelect={(r) => setRange(r)}
              numberOfMonths={1}
              className="rounded-lg"
            />
            <div className="flex items-center gap-2 mt-2 px-1">
              <div className="text-xs text-muted-foreground flex-1">
                {range?.from && (range?.to
                  ? `${format(range.from, "yyyy/MM/dd")} — ${format(range.to, "yyyy/MM/dd")}`
                  : format(range.from, "yyyy/MM/dd"))}
              </div>
              <Button
                size="sm"
                disabled={!range?.from || !range?.to}
                onClick={() => {
                  if (range?.from && range?.to) {
                    onChange(customRange(range.from, range.to));
                    setOpen(false);
                  }
                }}
                className="gap-1.5"
              >
                <Icon name="check" size={14} /> اعمال
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
