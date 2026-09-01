"use client";

// Printoo24 ERP — InvoiceModal (Phase 11)
//
// مودال مستقل مدیریت فاکتور — به آیکون فاکتورِ ردیف جدول سفارشات
// متصل است (خواستهٔ ۳: «فاکتور رو به اون دکمه ایکون فاکتور تو جدول
// سفارشات توی سطر سفارش وصل کن»):
//   • فاکتور ندارد → قفل تاییدی «بله، فاکتور را می‌خواهم بسازم» → فرم
//   • فاکتور دارد   → سند چاپی A4 (تم P24) + ویرایش + چرخهٔ وضعیت + چاپ
//
// داده: GET /api/orders/[id] (سفارش + فاکتور + مشتری + اقلام) —

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InvoiceLockCard,
  InvoiceIssueForm,
  InvoiceDocPanel,
  InvoiceEditForm,
  type InvoiceFull,
  type OrderForInvoice,
} from "./invoice-views";
import { Icon } from "@/lib/icons";

type View = "lock" | "issue" | "doc" | "edit";

export function InvoiceModal({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const invalidate = useInvalidate();
  const [view, setView] = React.useState<View>("lock");

  // سفارش + فاکتور + اقلام
  const { data, isLoading } = useQuery({
    queryKey: ["order", orderId, "invoice-modal"],
    queryFn: () => api<{ order: OrderForInvoice }>(`/api/orders/${orderId}`),
    enabled: !!orderId && open,
  });

  // ریست نما با هر باز شدن
  React.useEffect(() => {
    if (open) setView("lock");
  }, [open, orderId]);

  const order = data?.order;

  // وقتی سفارش آمد: اگر فاکتور دارد مستقیم سند، وگرنه قفل
  React.useEffect(() => {
    if (open && order) {
      setView(order.invoice ? "doc" : "lock");
    }
  }, [open, order?.id, order?.invoice?.id]);

  const refresh = React.useCallback(() => {
    invalidate(["order", "orders", "open-orders", "dashboard", "pre-invoices"]);
  }, [invalidate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="sm:max-w-4xl w-[calc(100%-1.5rem)] max-h-[92vh] overflow-y-auto scrollbar-thin p-0 gap-0 rounded-xl"
      >
        <DialogTitle className="sr-only">فاکتور نهایی</DialogTitle>

        {isLoading || !order ? (
          <div className="py-14 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
            <Icon name="loading" size={26} className="animate-spin text-primary" />
            در حال بارگذاری فاکتور…
          </div>
        ) : (
          <>
            {view === "lock" && (
              <div className="p-5">
                <InvoiceLockCard order={order} onConfirm={() => setView("issue")} />
              </div>
            )}

            {view === "issue" && (
              <div className="p-5">
                <InvoiceIssueForm
                  order={order}
                  onIssued={() => {
                    refresh();
                    setView("doc");
                  }}
                  onCancel={() => setView("lock")}
                />
              </div>
            )}

            {view === "edit" && !order.invoice && (
              <div className="py-14 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
                <Icon name="loading" size={26} className="animate-spin text-primary" />
                در حال بارگذاری فاکتور…
              </div>
            )}

            {view === "edit" && order.invoice && (
              <div className="p-5">
                <InvoiceEditForm
                  order={order}
                  invoice={order.invoice}
                  onSaved={() => {
                    refresh();
                    setView("doc");
                  }}
                  onCancel={() => setView("doc")}
                />
              </div>
            )}

            {view === "doc" && !order.invoice && (
              <div className="py-14 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
                <Icon name="loading" size={26} className="animate-spin text-primary" />
                در حال بارگذاری سند فاکتور…
              </div>
            )}

            {view === "doc" && order.invoice && (
              <div className="p-5">
                <InvoiceDocPanel
                  order={order}
                  invoice={order.invoice}
                  onEdit={() => setView("edit")}
                />
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
