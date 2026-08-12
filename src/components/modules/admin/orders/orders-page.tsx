"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, LoadingState, EmptyState, StatusBadge, PriorityBadge } from "@/components/shared";
import { SearchSelect } from "@/components/shared/search-select";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { formatCurrency, formatDate, daysRemaining } from "@/lib/format";
import { useAppStore } from "@/stores/app-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ORDER_STATUS, type OrderStatus } from "@/lib/constants";

type Order = {
  id: string; number: number; status: OrderStatus; endDate: string | null; noEndDate: boolean;
  totalAmount: number; priority: string; splitMode: string; note: string | null; createdAt: string;
  customer: { id: string; name: string; phone: string };
  items: { id: string; productId: string; product: { name: string }; quantity: number; totalAmount: number; note: string | null; stage: string }[];
};

export function OrdersPage() {
  const qc = useQueryClient();
  const navigate = useAppStore((s) => s.navigate);

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [customerFilter, setCustomerFilter] = React.useState<string | null>(null);
  const [productFilter, setProductFilter] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [noteModal, setNoteModal] = React.useState<Order | null>(null);
  const [statusModal, setStatusModal] = React.useState<Order | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ["orders", search, statusFilter, customerFilter, productFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (customerFilter) params.set("customerId", customerFilter);
      if (productFilter) params.set("productId", productFilter);
      return api<{ orders: Order[] }>(`/api/orders${params.size ? `?${params}` : ""}`);
    },
  });

  const { data: customersData } = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => api<{ customers: { id: string; name: string; phone: string }[] }>("/api/customers"),
  });
  const { data: productsData } = useQuery({
    queryKey: ["products-list"],
    queryFn: () => api<{ products: { id: string; name: string }[] }>("/api/products"),
  });

  const orders = ordersData?.orders ?? [];

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/orders/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); toast.success("سفارش حذف شد"); setDeleteId(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        <PageHeader
          title="همه سفارشات"
          description="مدیریت کامل سفارش‌های چاپ"
          icon="orders"
          actions={
            <Button onClick={() => navigate("admin", "orders-new")} className="gap-2">
              <Icon name="plus" size={16} /> سفارش جدید
            </Button>
          }
        />

        {/* Filters */}
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Icon name="search" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجوی نام یا تلفن مشتری..." className="pr-9" />
            </div>
            <SearchSelect
              value={customerFilter}
              onChange={setCustomerFilter}
              placeholder="همه مشتریان"
              searchPlaceholder="جستجوی مشتری..."
              options={(customersData?.customers ?? []).map((c) => ({ value: c.id, label: c.name, sub: c.phone }))}
              className="w-48"
            />
            <SearchSelect
              value={productFilter}
              onChange={setProductFilter}
              placeholder="همه محصولات"
              searchPlaceholder="جستجوی محصول..."
              options={(productsData?.products ?? []).map((p) => ({ value: p.id, label: p.name }))}
              className="w-48"
            />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-44"><SelectValue placeholder="همه وضعیت‌ها" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                {Object.entries(ORDER_STATUS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(statusFilter || customerFilter || productFilter || search) && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter(""); setCustomerFilter(null); setProductFilter(null); }}>
                <Icon name="cancel" size={14} /> پاک کردن فیلترها
              </Button>
            )}
          </div>
        </Card>

        {/* Table */}
        <Card className="p-0 overflow-hidden">
          {isLoading ? (
            <LoadingState />
          ) : orders.length === 0 ? (
            <EmptyState
              icon="orders"
              title="سفارشی یافت نشد"
              description="با فیلترهای فعلی سفارشی وجود ندارد."
              action={<Button onClick={() => navigate("admin", "orders-new")} className="gap-2"><Icon name="plus" size={16} /> ایجاد سفارش</Button>}
            />
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-8 px-2" />
                    <th className="text-right font-medium px-3 py-3">شماره</th>
                    <th className="text-right font-medium px-3 py-3">مشتری</th>
                    <th className="text-right font-medium px-3 py-3">وضعیت</th>
                    <th className="text-right font-medium px-3 py-3">تاریخ پایان</th>
                    <th className="text-right font-medium px-3 py-3">مبلغ کل</th>
                    <th className="text-right font-medium px-3 py-3">تاریخ ساخت</th>
                    <th className="text-center font-medium px-3 py-3">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orders.map((o) => {
                    const dr = daysRemaining(o.endDate);
                    const isGrouped = o.items.length > 1;
                    return (
                      <React.Fragment key={o.id}>
                        <tr className="hover:bg-accent/30 transition group">
                          <td className="px-2">
                            {isGrouped && (
                              <button onClick={() => toggleExpand(o.id)} className="size-7 grid place-items-center rounded hover:bg-accent">
                                <Icon name={expanded.has(o.id) ? "chevronDown" : "chevronLeft"} size={14} />
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-3"><span className="font-mono text-xs font-semibold">#{o.number}</span></td>
                          <td className="px-3 py-3">
                            <div className="font-medium">{o.customer.name}</div>
                            <div className="text-xs text-muted-foreground" dir="ltr">{o.customer.phone}</div>
                          </td>
                          <td className="px-3 py-3">
                            <button onClick={() => setStatusModal(o)} className="hover:opacity-80 transition">
                              <StatusBadge status={o.status} />
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            {o.noEndDate ? (
                              <span className="text-xs text-muted-foreground">بدون زمان پایان</span>
                            ) : o.endDate ? (
                              <div>
                                <div className="text-xs">{formatDate(o.endDate)}</div>
                                {dr.status !== "none" && (
                                  <div className={cn("text-[11px] mt-0.5 flex items-center gap-1",
                                    dr.status === "remaining" && "text-emerald-600",
                                    dr.status === "overdue" && "text-rose-600",
                                    dr.status === "today" && "text-amber-600"
                                  )}>
                                    <Icon name={dr.status === "overdue" ? "alertTriangle" : "clock"} size={11} />
                                    {dr.text}
                                  </div>
                                )}
                              </div>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-3 font-semibold" dir="ltr">{formatCurrency(o.totalAmount)}</td>
                          <td className="px-3 py-3 text-muted-foreground text-xs">{formatDate(o.createdAt)}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-center gap-0.5">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-8" onClick={() => setNoteModal(o)}>
                                    <Icon name="info" size={15} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>یادداشت</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate("admin", "orders-new")}>
                                    <Icon name="edit" size={15} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>ویرایش</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-8 hover:text-emerald-600" onClick={() => toast.info("پیش‌فاکتور به‌زودی")}>
                                    <Icon name="receipt" size={15} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>پیش‌فاکتور</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-8 hover:text-blue-600" onClick={() => toast.info(o.status === "completed" ? "فاکتور" : "سفارش تکمیل نشده")}>
                                    <Icon name="invoice" size={15} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>فاکتور</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-8 hover:text-rose-600" onClick={() => setDeleteId(o.id)}>
                                    <Icon name="trash" size={15} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>حذف</TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                        {isGrouped && expanded.has(o.id) && (
                          <tr className="bg-muted/20">
                            <td />
                            <td colSpan={7} className="px-4 py-3">
                              <div className="rounded-lg border bg-background overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="bg-muted/40 text-muted-foreground">
                                    <tr>
                                      <th className="text-right font-medium px-3 py-2">محصول</th>
                                      <th className="text-right font-medium px-3 py-2">تعداد</th>
                                      <th className="text-right font-medium px-3 py-2">مرحله</th>
                                      <th className="text-right font-medium px-3 py-2">مبلغ</th>
                                      <th className="text-right font-medium px-3 py-2">یادداشت</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {o.items.map((it) => (
                                      <tr key={it.id}>
                                        <td className="px-3 py-2 font-medium">{it.product.name}</td>
                                        <td className="px-3 py-2" dir="ltr">{it.quantity}</td>
                                        <td className="px-3 py-2"><span className="rounded bg-muted px-1.5 py-0.5">{stageLabel(it.stage)}</span></td>
                                        <td className="px-3 py-2" dir="ltr">{formatCurrency(it.totalAmount)}</td>
                                        <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{it.note || "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Note modal */}
        <NoteModal order={noteModal} onClose={() => setNoteModal(null)} />

        {/* Status change modal */}
        <StatusModal order={statusModal} onClose={() => setStatusModal(null)} />

        {/* Delete confirm */}
        <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>حذف سفارش</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">آیا از حذف این سفارش مطمئن هستید؟ این عمل قابل بازگشت نیست.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteId(null)}>انصراف</Button>
              <Button variant="destructive" onClick={() => deleteId && deleteMut.mutate(deleteId)} className="gap-2">
                <Icon name="trash" size={16} /> حذف
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function stageLabel(s: string) {
  const m: Record<string, string> = { design: "طراح", print: "چاپ", warehouse: "انبار", completed: "تکمیل", archive: "آرشیو" };
  return m[s] ?? s;
}

function NoteModal({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = React.useState("");
  React.useEffect(() => { setNote(order?.note || ""); }, [order]);
  const saveMut = useMutation({
    mutationFn: (n: string) => api(`/api/orders/${order?.id}`, { method: "PUT", body: JSON.stringify({ note: n }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); toast.success("یادداشت ذخیره شد"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!order) return null;
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="info" size={18} className="text-primary" /> یادداشت سفارش #{order.number}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>متن یادداشت</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} placeholder="یادداشت خود را وارد کنید..." />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={() => saveMut.mutate(note)} disabled={saveMut.isPending} className="gap-2">
            {saveMut.isPending ? <Icon name="loading" size={16} className="animate-spin" /> : <Icon name="check" size={16} />}
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusModal({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = React.useState<OrderStatus>("pending_design");
  const [designStart, setDesignStart] = React.useState("");
  const [designEnd, setDesignEnd] = React.useState("");
  const [printStart, setPrintStart] = React.useState("");
  const [printEnd, setPrintEnd] = React.useState("");
  React.useEffect(() => {
    if (order) {
      setStatus(order.status);
      setDesignStart(""); setDesignEnd(""); setPrintStart(""); setPrintEnd("");
    }
  }, [order]);

  const showDesignDates = status === "pending_design";
  const showPrintDates = status === "pending_design" || status === "in_printing";

  const saveMut = useMutation({
    mutationFn: () => api(`/api/orders/${order?.id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status, designStart: designStart || null, designEnd: designEnd || null, printStart: printStart || null, printEnd: printEnd || null }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); toast.success("وضعیت به‌روزرسانی شد"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!order) return null;
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="route" size={18} className="text-primary" /> تغییر وضعیت سفارش #{order.number}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>وضعیت جدید</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ORDER_STATUS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(showDesignDates || showPrintDates) && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Icon name="calendar" size={14} /> تعیین زمان ماژول‌ها (اختیاری)
              </div>
              {showDesignDates && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">شروع طراحی</Label><Input type="date" value={designStart} onChange={(e) => setDesignStart(e.target.value)} dir="ltr" /></div>
                  <div className="space-y-1"><Label className="text-xs">پایان طراحی</Label><Input type="date" value={designEnd} onChange={(e) => setDesignEnd(e.target.value)} dir="ltr" /></div>
                </div>
              )}
              {showPrintDates && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">شروع چاپ</Label><Input type="date" value={printStart} onChange={(e) => setPrintStart(e.target.value)} dir="ltr" /></div>
                  <div className="space-y-1"><Label className="text-xs">پایان چاپ</Label><Input type="date" value={printEnd} onChange={(e) => setPrintEnd(e.target.value)} dir="ltr" /></div>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-2">
            {saveMut.isPending ? <Icon name="loading" size={16} className="animate-spin" /> : <Icon name="check" size={16} />}
            ثبت تغییرات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
