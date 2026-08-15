"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, EmptyState } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatDateTime, relativeTime } from "@/lib/format";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  type Activity,
  type ActivityType,
  type Deal,
  ACTIVITY_TYPES,
  ACTIVITY_META,
} from "./crm-types";
import { ActivityFormDialog } from "./activity-form-dialog";

type CustomerOption = { id: string; name: string };

export function CRMActivities() {
  const invalidate = useInvalidate();
  const [typeFilter, setTypeFilter] = React.useState<ActivityType | "all">("all");
  const [customerFilter, setCustomerFilter] = React.useState<string>("all");
  const [fromDate, setFromDate] = React.useState<Date | null>(null);
  const [toDate, setToDate] = React.useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Activity | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["activities", "list", typeFilter, customerFilter, fromDate, toDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (customerFilter !== "all") params.set("customerId", customerFilter);
      if (fromDate) params.set("from", fromDate.toISOString());
      if (toDate) params.set("to", toDate.toISOString());
      params.set("limit", "100");
      const q = params.toString();
      return api<{ activities: Activity[] }>(`/api/activities${q ? `?${q}` : ""}`);
    },
    refetchInterval: 30000,
  });

  const { data: customersData } = useQuery({
    queryKey: ["customers", "crm-activities"],
    queryFn: () => api<{ customers: CustomerOption[] }>("/api/customers"),
    refetchInterval: 60000,
  });
  const { data: dealsData } = useQuery({
    queryKey: ["deals", "crm-activities"],
    queryFn: () => api<{ deals: Deal[] }>("/api/deals"),
    refetchInterval: 60000,
  });

  const activities = data?.activities ?? [];
  const customers = customersData?.customers ?? [];
  const deals = (dealsData?.deals ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    customerId: d.customerId,
  }));

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/activities/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate(["activities", "crm-dashboard", "customers"]);
      toast.success("فعالیت حذف شد");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Group activities by date
  const grouped = React.useMemo(() => {
    const m = new Map<string, Activity[]>();
    for (const a of activities) {
      const key = new Date(a.date).toISOString().slice(0, 10);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(a);
    }
    return Array.from(m.entries());
  }, [activities]);

  const hasFilters =
    typeFilter !== "all" ||
    customerFilter !== "all" ||
    fromDate !== null ||
    toDate !== null;

  function clearFilters() {
    setTypeFilter("all");
    setCustomerFilter("all");
    setFromDate(null);
    setToDate(null);
  }

  // Stats by type
  const statsByType = React.useMemo(() => {
    const m: Record<ActivityType, number> = { call: 0, email: 0, meeting: 0, note: 0, visit: 0 };
    for (const a of activities) m[a.type] = (m[a.type] || 0) + 1;
    return m;
  }, [activities]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="فعالیت‌ها"
        description="تماس‌ها، جلسات و تعاملات با مشتریان"
        icon="task"
        actions={
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Icon name="plus" size={16} /> ثبت فعالیت
          </Button>
        }
      />

      {/* Quick stats by type */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {ACTIVITY_TYPES.map((t) => {
          const meta = ACTIVITY_META[t];
          const count = statsByType[t] || 0;
          const active = typeFilter === t;
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(active ? "all" : t)}
              className={cn(
                "rounded-lg border p-3 text-center transition hover:shadow-sm",
                active ? "border-primary bg-primary/5" : "bg-card hover:bg-accent/40"
              )}
            >
              <div className={cn("size-8 rounded-lg grid place-items-center mx-auto mb-1.5", meta.bg)}>
                <Icon name={meta.icon} size={14} className={meta.color} />
              </div>
              <div className="text-lg font-bold tabular-nums">{count}</div>
              <div className="text-[10px] text-muted-foreground">{meta.label}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={customerFilter}
            onValueChange={(v) => setCustomerFilter(v)}
          >
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="همه مشتریان" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه مشتریان</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DateRangePicker
            start={fromDate}
            end={toDate}
            onStartChange={setFromDate}
            onEndChange={setToDate}
          />

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <Icon name="cancel" size={13} /> پاک فیلترها
            </Button>
          )}

          <div className="text-xs text-muted-foreground mr-auto">
            {activities.length} فعالیت
          </div>
        </div>
      </Card>

      {/* Timeline */}
      {isLoading ? (
        <Card className="p-0">
          <div className="py-20 flex flex-col items-center gap-2">
            <Icon name="loading" size={28} className="animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">در حال بارگذاری...</span>
          </div>
        </Card>
      ) : activities.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon="task"
            title="فعالیتی یافت نشد"
            description={hasFilters ? "فیلترها را تغییر دهید" : "اولین فعالیت خود را ثبت کنید"}
            action={
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <Icon name="plus" size={16} /> ثبت فعالیت
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([dateKey, items]) => (
            <Card key={dateKey} className="p-0 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-2.5 border-b bg-muted/40">
                <Icon name="calendar" size={14} className="text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">
                  {formatDateTime(dateKey).split(" ")[0]}
                </span>
                <span className="text-[10px] text-muted-foreground">({items.length} فعالیت)</span>
              </div>
              <div className="relative">
                <div className="absolute right-[31px] top-3 bottom-3 w-px bg-border" />
                <div className="divide-y">
                  {items.map((a) => {
                    const meta = ACTIVITY_META[a.type];
                    return (
                      <div
                        key={a.id}
                        className="flex items-start gap-3 px-5 py-3 hover:bg-accent/40 transition group"
                      >
                        <div
                          className={cn(
                            "size-9 rounded-full grid place-items-center shrink-0 z-10 border-2 border-background",
                            meta.bg
                          )}
                        >
                          <Icon name={meta.icon} size={15} className={meta.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{a.title}</div>
                              {a.description && (
                                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {a.description}
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                                <span className={cn("px-1.5 py-0.5 rounded-full", meta.bg, meta.color)}>
                                  {meta.label}
                                </span>
                                {a.customer && (
                                  <span className="flex items-center gap-0.5">
                                    <Icon name="customers" size={10} />
                                    {a.customer.name}
                                  </span>
                                )}
                                {a.deal && (
                                  <span className="flex items-center gap-0.5">
                                    <Icon name="orders" size={10} />
                                    {a.deal.title}
                                  </span>
                                )}
                                <span>•</span>
                                <span title={formatDateTime(a.date)}>{relativeTime(a.date)}</span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 opacity-0 group-hover:opacity-100 hover:text-rose-600 transition"
                              onClick={() => setDeleteTarget(a)}
                              title="حذف"
                            >
                              <Icon name="trash" size={14} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ActivityFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customers={customers}
        deals={deals}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف فعالیت</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف فعالیت «{deleteTarget?.title}» مطمئن هستید؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 justify-center pt-1">
        <Icon name="refresh" size={11} />
        به‌روزرسانی خودکار هر ۳۰ ثانیه
      </div>
    </div>
  );
}
