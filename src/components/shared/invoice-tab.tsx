"use client";

// Printoo24 ERP — InvoiceTab (Phase 11 rebuild)
//
// تب «فاکتور» در مودال جزئیات سفارش — همان اجزای مشترک invoice-views:
//   • فاکتور ندارد → قفل تاییدی «بله، فاکتور را می‌خواهم بسازم» → فرم
//     (صدور در هر مرحلهٔ سفارش آزاد است — گیت انبار/لجستیک حذف شد)
//   • فاکتور دارد   → سند چاپی A4 (تم P24) + ویرایش + تسویه/ابطال + چاپ
//
// منطق پول (مدل آینه‌ای): مبلغ پرداختی فاکتور = کل دریافتی — سرور آن را
// روی order.paidAmount می‌نویسد و پیش‌فاکتورهای سفارش را بازتوزیع
// می‌کند (lib/paid-sync) — «اگر مبلغ پرداختی ادیت شود، تو پیش‌فاکتور
// هم سینک بشه».

import * as React from "react";
import {
  InvoiceLockCard,
  InvoiceIssueForm,
  InvoiceDocPanel,
  InvoiceEditForm,
  type InvoiceFull,
  type OrderForInvoice,
} from "./invoice-views";

export type { InvoiceFull, OrderForInvoice };

type View = "lock" | "issue" | "doc" | "edit";

// ═══════════════════════ Entry ═════════════════════════════════════
export function InvoiceTab({ order }: { order: OrderForInvoice }) {
  const [view, setView] = React.useState<View>(order.invoice ? "doc" : "lock");

  // با آمدن فاکتور جدید (مثلاً بعد از صدور) مستقیم سند نمایش داده شود
  React.useEffect(() => {
    setView(order.invoice ? "doc" : "lock");
  }, [order.invoice?.id]);

  if (view === "lock" && !order.invoice) {
    return <InvoiceLockCard order={order} onConfirm={() => setView("issue")} />;
  }

  if (view === "issue" && !order.invoice) {
    return (
      <InvoiceIssueForm
        order={order}
        onIssued={() => setView("doc")}
        onCancel={() => setView("lock")}
      />
    );
  }

  if (!order.invoice) {
    return <InvoiceLockCard order={order} onConfirm={() => setView("issue")} />;
  }

  if (view === "edit") {
    return (
      <InvoiceEditForm
        order={order}
        invoice={order.invoice}
        onSaved={() => setView("doc")}
        onCancel={() => setView("doc")}
      />
    );
  }

  return (
    <InvoiceDocPanel
      order={order}
      invoice={order.invoice}
      onEdit={() => setView("edit")}
    />
  );
}
