"use client";

// Printoo24 ERP — Order row actions (Phase 3 atomic split → Phase 11 wiring)
//
// Actions: note · edit · pre-invoice · invoice · delete.
// فاز ۱۱: دکمه‌های پیش‌فاکتور/فاکتور به مودال‌های «مستقل» متصل شدند —
// مدیریت کامل (ویرایش/چاپ/چرخهٔ وضعیت/صدور) همان‌جا از جدول:
//   پیش‌فاکتور → PreInvoiceModal (لیست سندها)
//   فاکتور     → InvoiceModal (قفل تاییدی → فرم صدور → سند)
// فاکتور آزاد است — هر زمان کارفرما بخواهد صادر می‌شود.

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { Order } from "./types";

export type OrderRowActionsProps = {
  order: Order;
  onNote: () => void;
  onDelete: () => void;
  onEdit: () => void;
  /** Phase 9 — باز کردن تب پیش‌فاکتور در مودال جزئیات */
  onPreInvoice: () => void;
  /** Phase 9 — باز کردن تب فاکتور در مودال جزئیات */
  onInvoice: () => void;
};

export function OrderRowActions({
  order,
  onNote,
  onDelete,
  onEdit,
  onPreInvoice,
  onInvoice,
}: OrderRowActionsProps) {
  const isGrouped = order.splitMode === "grouped" && (order.items?.length ?? 0) > 1;
  const hasInvoice = !!(order as { invoice?: unknown }).invoice;

  return (
    <div className="flex items-center justify-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="یادداشت"
            onClick={(e) => {
              e.stopPropagation();
              onNote();
            }}
          >
            <Icon name="info" size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>یادداشت</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="ویرایش"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Icon name="edit" size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>ویرایش</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 hover:text-emerald-600 relative"
            aria-label="پیش‌فاکتور"
            onClick={(e) => {
              e.stopPropagation();
              onPreInvoice();
            }}
          >
            <Icon name="receipt" size={14} />
            {(order as { preInvoices?: unknown[] }).preInvoices?.length ? (
              <span className="absolute -top-0.5 -left-0.5 size-1.5 rounded-full bg-emerald-500" />
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isGrouped ? "پیش‌فاکتور (سفارش گروهی)" : "پیش‌فاکتور"}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-7 hover:text-cyan-600", hasInvoice && "text-emerald-600")}
            aria-label="فاکتور"
            onClick={(e) => {
              e.stopPropagation();
              onInvoice();
            }}
          >
            <Icon name="invoice" size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {hasInvoice ? "فاکتور نهایی (ویرایش/چاپ)" : "صدور فاکتور نهایی"}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 hover:text-rose-600"
            aria-label="حذف"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Icon name="trash" size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>حذف</TooltipContent>
      </Tooltip>
    </div>
  );
}
