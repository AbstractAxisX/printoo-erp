"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COMPANY } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type PreInvoiceItem = {
  name: string;
  quantity: number;
  total: number;
  paid: number;
};

type PreInvoiceModalProps = {
  orderId: string | null;
  customerName?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function PreInvoiceModal({ orderId, customerName, open, onOpenChange }: PreInvoiceModalProps) {
  const invalidate = useInvalidate();
  const [items, setItems] = React.useState<PreInvoiceItem[]>([]);
  const [showPreview, setShowPreview] = React.useState(false);

  // Fetch order items when modal opens
  const { data: orderData } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api<{ order: { items: { id: string; product: { name: string }; quantity: number; totalAmount: number }[]; preInvoices: { id: string; number: number; items: string; paidAmount: number; totalAmount: number }[] } }>(`/api/orders/${orderId}`),
    enabled: !!orderId && open,
  });

  // Check for existing pre-invoice
  const existingPreInvoice = orderData?.order?.preInvoices?.[0];

  React.useEffect(() => {
    if (open && orderData?.order) {
      if (existingPreInvoice) {
        // Load existing items
        try {
          const parsed = JSON.parse(existingPreInvoice.items) as PreInvoiceItem[];
          setItems(parsed);
        } catch {
          setItems(orderData.order.items.map((it) => ({ name: it.product.name, quantity: it.quantity, total: it.totalAmount, paid: 0 })));
        }
      } else {
        // New pre-invoice from order items
        setItems(orderData.order.items.map((it) => ({ name: it.product.name, quantity: it.quantity, total: it.totalAmount, paid: 0 })));
      }
    }
  }, [open, orderData, existingPreInvoice]);

  const totalAmount = items.reduce((s, i) => s + i.total, 0);
  const paidAmount = items.reduce((s, i) => s + (Number(i.paid) || 0), 0);
  const unpaid = totalAmount - paidAmount;

  const saveMut = useMutation({
    mutationFn: () => {
      if (existingPreInvoice) {
        return api(`/api/pre-invoices/${existingPreInvoice.id}`, { method: "PUT", body: JSON.stringify({ items, paidAmount }) });
      }
      return api("/api/pre-invoices", { method: "POST", body: JSON.stringify({ orderId, customerId: orderData?.order?.customerId ?? "", items, paidAmount }) });
    },
    onSuccess: () => {
      invalidate(["orders", "order", "dashboard"]);
      toast.success(existingPreInvoice ? "پیش‌فاکتور ویرایش شد" : "پیش‌فاکتور صادر شد");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function updateItem(idx: number, patch: Partial<PreInvoiceItem>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function setAllPaid() {
    setItems((arr) => arr.map((it) => ({ ...it, paid: it.total })));
  }

  function printPDF() {
    const printArea = document.getElementById("pre-invoice-print");
    if (!printArea) return;
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>پیش‌فاکتور</title>
      <style>
        * { font-family: Tahoma, Arial, sans-serif; box-sizing: border-box; }
        body { padding: 40px; color: #1a1a1a; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #10b981; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 28px; font-weight: bold; color: #10b981; }
        .title { font-size: 22px; font-weight: bold; }
        .info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .info-box { background: #f8fafc; padding: 15px; border-radius: 8px; }
        .info-label { font-size: 12px; color: #64748b; margin-bottom: 4px; }
        .info-value { font-size: 16px; font-weight: 500; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th { background: #10b981; color: white; padding: 12px; text-align: right; font-size: 14px; }
        td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
        .totals { margin-right: auto; width: 300px; }
        .total-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
        .total-row.bold { font-weight: bold; font-size: 18px; border-bottom: 2px solid #10b981; }
        .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 20px; }
      </style></head><body>${printArea.innerHTML}</body></html>
    `);
    win.document.close();
    win.print();
  }

  return (
    <>
      <Dialog open={open && !showPreview} onOpenChange={(v) => { onOpenChange(v); if (!v) setShowPreview(false); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden p-0 gap-0">
          <div className="px-6 pt-5 pb-3 border-b">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-600 grid place-items-center shrink-0">
                <Icon name="receipt" size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">{existingPreInvoice ? "ویرایش پیش‌فاکتور" : "صدور پیش‌فاکتور"}</DialogTitle>
                <p className="text-xs text-muted-foreground">{customerName}</p>
              </div>
            </div>
          </div>

          <div className="overflow-y-auto scrollbar-thin px-6 py-4" style={{ maxHeight: "60vh" }}>
            {/* Items table */}
            <div className="rounded-lg border overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-right font-medium px-3 py-2">آیتم</th>
                    <th className="text-right font-medium px-3 py-2">تعداد</th>
                    <th className="text-right font-medium px-3 py-2">مبلغ کل</th>
                    <th className="text-right font-medium px-3 py-2">پرداختی</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium">{it.name}</td>
                      <td className="px-3 py-2 tabular-nums" dir="ltr">{it.quantity}</td>
                      <td className="px-3 py-2 tabular-nums" dir="ltr">{formatCurrency(it.total)}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          value={it.paid || ""}
                          onChange={(e) => updateItem(i, { paid: Number(e.target.value) || 0 })}
                          className="h-8 w-24 tabular-nums"
                          dir="ltr"
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Set all paid button */}
            <button onClick={setAllPaid} className="text-xs text-primary hover:underline flex items-center gap-1 mb-3">
              <Icon name="check" size={12} /> تنظیم همه پرداخت‌ها برابر مبلغ کل
            </button>

            {/* Totals */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">مبلغ کل</div>
                <div className="font-bold mt-0.5 tabular-nums" dir="ltr">{formatCurrency(totalAmount)}</div>
              </div>
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3">
                <div className="text-xs text-emerald-600">پرداخت‌شده</div>
                <div className="font-bold mt-0.5 text-emerald-700 dark:text-emerald-300 tabular-nums" dir="ltr">{formatCurrency(paidAmount)}</div>
              </div>
              <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 p-3">
                <div className="text-xs text-rose-600">پرداخت‌نشده</div>
                <div className="font-bold mt-0.5 text-rose-700 dark:text-rose-300 tabular-nums" dir="ltr">{formatCurrency(unpaid)}</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t bg-muted/30 flex items-center gap-2">
            <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-1.5">
              {saveMut.isPending ? <Icon name="loading" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
              {existingPreInvoice ? "ذخیره تغییرات" : "صدور پیش‌فاکتور"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowPreview(true)} className="gap-1.5 mr-auto">
              <Icon name="print" size={14} /> پیش‌نمایش و PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview modal */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin p-0">
          <DialogTitle className="sr-only">پیش‌نمایش پیش‌فاکتور</DialogTitle>
          <div id="pre-invoice-print" className="p-8">
            {/* Header */}
            <div className="flex justify-between items-center border-b-2 border-primary pb-4 mb-6">
              <div>
                <div className="text-2xl font-bold text-primary">{COMPANY.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{COMPANY.tagline}</div>
              </div>
              <div className="text-left">
                <div className="text-lg font-bold">پیش‌فاکتور</div>
                {existingPreInvoice && <div className="text-xs text-muted-foreground">شماره: #{existingPreInvoice.number}</div>}
                <div className="text-xs text-muted-foreground">{formatDate(new Date())}</div>
              </div>
            </div>
            {/* Customer info */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="text-xs text-muted-foreground">مشتری</div>
                <div className="font-medium mt-0.5">{customerName}</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="text-xs text-muted-foreground">تاریخ صدور</div>
                <div className="font-medium mt-0.5">{formatDate(new Date())}</div>
              </div>
            </div>
            {/* Items table */}
            <table className="w-full border-collapse mb-6">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="text-right p-2 text-sm">آیتم</th>
                  <th className="text-right p-2 text-sm">تعداد</th>
                  <th className="text-right p-2 text-sm">مبلغ کل</th>
                  <th className="text-right p-2 text-sm">پرداختی</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2 text-sm">{it.name}</td>
                    <td className="p-2 text-sm tabular-nums" dir="ltr">{it.quantity}</td>
                    <td className="p-2 text-sm tabular-nums" dir="ltr">{formatCurrency(it.total)}</td>
                    <td className="p-2 text-sm tabular-nums" dir="ltr">{formatCurrency(it.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Totals */}
            <div className="flex justify-end mb-6">
              <div className="w-64 space-y-1">
                <div className="flex justify-between py-1 border-b text-sm">
                  <span className="text-muted-foreground">مبلغ کل:</span>
                  <span className="font-medium tabular-nums" dir="ltr">{formatCurrency(totalAmount)}</span>
                </div>
                <div className="flex justify-between py-1 border-b text-sm">
                  <span className="text-emerald-600">پرداخت‌شده:</span>
                  <span className="font-medium text-emerald-600 tabular-nums" dir="ltr">{formatCurrency(paidAmount)}</span>
                </div>
                <div className="flex justify-between py-2 border-b-2 border-primary text-base font-bold">
                  <span>باقی‌مانده:</span>
                  <span className="text-rose-600 tabular-nums" dir="ltr">{formatCurrency(unpaid)}</span>
                </div>
              </div>
            </div>
            {/* Footer */}
            <div className="text-center text-xs text-muted-foreground border-t pt-4">
              {COMPANY.name} — {COMPANY.phone}
            </div>
          </div>
          <div className="border-t px-6 py-3 flex items-center gap-2 bg-muted/30">
            <Button size="sm" onClick={printPDF} className="gap-1.5">
              <Icon name="download" size={14} /> دانلود PDF
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowPreview(false)} className="mr-auto">بستن</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
