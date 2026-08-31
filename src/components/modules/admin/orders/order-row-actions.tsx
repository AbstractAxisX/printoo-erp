"use client";

// Printoo24 ERP — Order row actions (Phase 3 atomic split → Phase 9 wiring)
//
// Actions: note · edit · pre-invoice · invoice · delete.
// فاز ۹: دکمهٔ پیش‌فاکتور/فاکتور واقعی شدند — مودال جزئیات سفارش را
// مستقیم روی همان تب باز می‌کنند (نه toast «به‌زودی»):
//   پیش‌فاکتور → openOrder(id, "preInvoice")  (صدور/ویرایش/چاپ)
//   فاکتور     → openOrder(id, "invoice")     (گیت انبار/لجستیک)

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Icon } from "@/lib/icons";
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
  const invoiceEligible =
    order.status === "warehouse_logistics" || order.status === "completed";

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
            className="size-7 hover:text-cyan-600"
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
          {invoiceEligible ? "فاکتور نهایی" : "فاکتور (پس از انبار/لجستیک)"}
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
