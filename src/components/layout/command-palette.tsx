"use client";

import * as React from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Icon } from "@/lib/icons";
import { NAV } from "@/lib/nav";
import { useAppStore } from "@/stores/app-store";

export function CommandPalette() {
  const open = useAppStore((s) => s.commandOpen);
  const setOpen = useAppStore((s) => s.setCommandOpen);
  const navigate = useAppStore((s) => s.navigate);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 max-w-xl" showCloseButton={false}>
        <Command className="rounded-lg">
          <CommandInput placeholder="جستجوی صفحه یا ماژول..." />
          <CommandList className="max-h-[400px] scrollbar-thin">
            <CommandEmpty>نتیجه‌ای یافت نشد.</CommandEmpty>
            {NAV.map((mod) => (
              <CommandGroup key={mod.key} heading={mod.faLabel}>
                {mod.groups.map((g) =>
                  g.items.map((item) => (
                    <CommandItem
                      key={`${mod.key}-${item.id}`}
                      value={`${mod.faLabel} ${g.label} ${item.label}`}
                      onSelect={() => {
                        navigate(mod.key, item.page);
                        setOpen(false);
                      }}
                      className="gap-2"
                    >
                      <Icon name={item.icon} size={16} className="text-muted-foreground" />
                      <span>{item.label}</span>
                      <span className="text-xs text-muted-foreground mr-auto">{g.label}</span>
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            ))}
            <CommandSeparator />
            <CommandGroup heading="سفارش جدید">
              <CommandItem
                onSelect={() => { navigate("admin", "orders-new"); setOpen(false); }}
                className="gap-2"
              >
                <Icon name="plusCircle" size={16} className="text-primary" />
                <span>ایجاد سفارش جدید</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
