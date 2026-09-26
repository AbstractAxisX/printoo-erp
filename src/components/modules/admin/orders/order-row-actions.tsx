"use client";

// Printoo24 ERP — Order row actions (Phase 3 atomic split → Phase 11 wiring)
//
// Actions: note · edit · pre-invoice · invoice · delete.
// فاز 11: دکمه‌های پیش‌فاکتور/فاکتور به مودال‌های «مستقل» متصل شدند —
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
import { t } from "@/lib/i18n";

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
            aria-label={t("یادداشت")}
            onClick={(e) => {
              e.stopPropagation();
              onNote();
            }}
          >
            <Icon name="info" size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("یادداشت")}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t("ویرایش")}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Icon name="edit" size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("ویرایش")}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 hover:text-emerald-600 relative"
            aria-label={t("پیش‌فاکتور")}
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
          {isGrouped ? t("پیش‌فاکتور (سفارش گروهی)") : t("پیش‌فاکتور")}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-7 hover:text-cyan-600", hasInvoice && "text-emerald-600")}
            aria-label={t("فاکتور")}
            onClick={(e) => {
              e.stopPropagation();
              onInvoice();
            }}
          >
            <Icon name="invoice" size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {hasInvoice ? t("فاکتور نهایی (ویرایش/چاپ)") : t("صدور فاکتور نهایی")}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 hover:text-rose-600"
            aria-label={t("حذف")}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Icon name="trash" size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("حذف")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
