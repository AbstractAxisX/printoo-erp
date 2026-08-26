"use client";

// Printoo24 ERP — Order modals (Phase 3 atomic split)
//
// NoteModal  — edit an order's free-text note
// StatusModal — change status + (optional) design/print module dates
// DeleteDialog — confirm destructive delete
//
// Each is self-contained: owns its local form state, its mutation, and its
// invalidation. The page passes only `order | null` + onClose. No shared
// state up in the parent — keeps the page a thin container.

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ORDER_STATUS, type OrderStatus } from "@/lib/constants";
import { toast } from "sonner";
import { FilterToggle } from "./orders-filters";
import type { Order } from "./types";

// ─── Note Modal ───────────────────────────────────────────────
export function OrderNoteModal({
  order,
  onClose,
}: {
  order: Order | null;
  onClose: () => void;
}) {
  const invalidate = useInvalidate();
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    setNote(order?.note || "");
  }, [order]);

  const saveMut = useMutation({
    mutationFn: (n: string) =>
      api(`/api/orders/${order?.id}`, {
        method: "PUT",
        body: JSON.stringify({ note: n }),
      }),
    onSuccess: () => {
      invalidate(["orders"]);
      toast.success("یادداشت ذخیره شد");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!order) return null;

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="info" size={18} className="text-primary" /> یادداشت سفارش #
            {order.number}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>متن یادداشت</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={5}
            placeholder="یادداشت خود را وارد کنید..."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            انصراف
          </Button>
          <Button
            onClick={() => saveMut.mutate(note)}
            disabled={saveMut.isPending}
            className="gap-2"
          >
            {saveMut.isPending ? (
              <Icon name="loading" size={16} className="animate-spin" />
            ) : (
              <Icon name="check" size={16} />
            )}
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Status Modal ──────────────────────────────────────────────
export function OrderStatusModal({
  order,
  onClose,
}: {
  order: Order | null;
  onClose: () => void;
}) {
  const invalidate = useInvalidate();
  const [status, setStatus] = React.useState<OrderStatus>("pending_design");
  const [designStart, setDesignStart] = React.useState<Date | null>(null);
  const [designEnd, setDesignEnd] = React.useState<Date | null>(null);
  const [printStart, setPrintStart] = React.useState<Date | null>(null);
  const [printEnd, setPrintEnd] = React.useState<Date | null>(null);

  React.useEffect(() => {
    if (order) {
      setStatus(order.status);
      setDesignStart(null);
      setDesignEnd(null);
      setPrintStart(null);
      setPrintEnd(null);
    }
  }, [order]);

  const showDesignDates = status === "pending_design";
  const showPrintDates = status === "pending_design" || status === "in_printing";

  const saveMut = useMutation({
    mutationFn: () =>
      api(`/api/orders/${order?.id}/status`, {
        method: "PUT",
        body: JSON.stringify({
          status,
          designStart: designStart ? designStart.toISOString() : null,
          designEnd: designEnd ? designEnd.toISOString() : null,
          printStart: printStart ? printStart.toISOString() : null,
          printEnd: printEnd ? printEnd.toISOString() : null,
        }),
      }),
    onSuccess: () => {
      invalidate(["orders"]);
      toast.success("وضعیت به‌روزرسانی شد");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!order) return null;

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="route" size={18} className="text-primary" /> تغییر وضعیت
            سفارش #{order.number}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>وضعیت جدید</Label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(ORDER_STATUS).map(([k, v]) => (
                <FilterToggle
                  key={k}
                  active={status === k}
                  onClick={() => setStatus(k as OrderStatus)}
                  label={v.label}
                  activeColor="primary"
                />
              ))}
            </div>
          </div>

          {(showDesignDates || showPrintDates) && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Icon name="calendar" size={14} /> تعیین زمان ماژول‌ها (اختیاری)
              </div>
              {showDesignDates && (
                <div className="space-y-2">
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    <Icon name="design" size={13} className="text-violet-500" />{" "}
                    ماژول طراحی
                  </div>
                  <div className="flex items-center gap-2">
                    <DatePicker
                      value={designStart}
                      onChange={setDesignStart}
                      placeholder="شروع طراحی"
                    />
                    <Icon
                      name="arrowLeft"
                      size={14}
                      className="text-muted-foreground"
                    />
                    <DatePicker
                      value={designEnd}
                      onChange={setDesignEnd}
                      placeholder="پایان طراحی"
                    />
                  </div>
                </div>
              )}
              {showPrintDates && (
                <div className="space-y-2">
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    <Icon name="print" size={13} className="text-amber-500" /> ماژول
                    چاپ
                  </div>
                  <div className="flex items-center gap-2">
                    <DatePicker
                      value={printStart}
                      onChange={setPrintStart}
                      placeholder="شروع چاپ"
                    />
                    <Icon
                      name="arrowLeft"
                      size={14}
                      className="text-muted-foreground"
                    />
                    <DatePicker
                      value={printEnd}
                      onChange={setPrintEnd}
                      placeholder="پایان چاپ"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            انصراف
          </Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="gap-2"
          >
            {saveMut.isPending ? (
              <Icon name="loading" size={16} className="animate-spin" />
            ) : (
              <Icon name="check" size={16} />
            )}
            ثبت تغییرات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Confirmation ───────────────────────────────────────
export function OrderDeleteDialog({
  order,
  onClose,
}: {
  order: Order | null;
  onClose: () => void;
}) {
  const invalidate = useInvalidate();
  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/orders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["orders"]);
      toast.success("سفارش حذف شد");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>حذف سفارش</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          آیا از حذف سفارش #{order?.number} مطمئن هستید؟ این عمل قابل بازگشت
          نیست.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            انصراف
          </Button>
          <Button
            variant="destructive"
            onClick={() => order && deleteMut.mutate(order.id)}
            disabled={deleteMut.isPending}
            className="gap-2"
          >
            {deleteMut.isPending ? (
              <Icon name="loading" size={16} className="animate-spin" />
            ) : (
              <Icon name="trash" size={16} />
            )}
            حذف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
