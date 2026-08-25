"use client";

// Printoo24 ERP — Order row actions (Phase 3 atomic split)
//
// Extracted from orders-page.tsx so the page stays ≤300 lines.
// Pure presentational — receives callbacks, owns no state.
//
// Actions (cognitive-UX): note · edit · pre-invoice · invoice · delete.
// Each is a tooltip-wrapped icon button — admin keeps a scannable, dense row.

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Icon } from "@/lib/icons";
import { toast } from "sonner";
import type { Order } from "./types";

export type OrderRowActionsProps = {
  order: Order;
  onNote: () => void;
  onDelete: () => void;
  onEdit: () => void;
};

export function OrderRowActions({
  order,
  onNote,
  onDelete,
  onEdit,
}: OrderRowActionsProps) {
  return (
    <div className="flex items-center justify-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={(e) => {
              e.stopPropagation();
              onNote();
            }}
          >
            <Icon name="info" size={15} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>یادداشت</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Icon name="edit" size={15} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>ویرایش</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 hover:text-emerald-600"
            onClick={(e) => {
              e.stopPropagation();
              toast.info("پیش‌فاکتور به‌زودی");
            }}
          >
            <Icon name="receipt" size={15} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>پیش‌فاکتور</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 hover:text-blue-600"
            onClick={(e) => {
              e.stopPropagation();
              toast.info(
                order.status === "completed" ? "فاکتور" : "سفارش تکمیل نشده"
              );
            }}
          >
            <Icon name="invoice" size={15} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>فاکتور</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 hover:text-rose-600"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Icon name="trash" size={15} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>حذف</TooltipContent>
      </Tooltip>
    </div>
  );
}
