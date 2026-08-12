"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, LoadingState, EmptyState, StatusBadge } from "@/components/shared";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { useAppStore } from "@/stores/app-store";

type Order = {
  id: string; number: number; status: string; endDate: string | null; totalAmount: number;
  createdAt: string; customer: { name: string; phone: string };
  items: { id: string; product: { name: string } }[];
};

export function ArchivePage() {
  const navigate = useAppStore((s) => s.navigate);
  const { data, isLoading } = useQuery({
    queryKey: ["archive"],
    queryFn: () => api<{ orders: Order[] }>("/api/orders?status=archived"),
  });
  const orders = data?.orders ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title="آرشیو سفارشات" description="سفارش‌های آرشیو شده (نیمه‌کاره یا غیرفعال)" icon="archive" />

      <Card className="p-0 overflow-hidden">
        {isLoading ? <LoadingState /> : orders.length === 0 ? (
          <EmptyState icon="archive" title="سفارش آرشیو شده‌ای وجود ندارد" description="سفارش‌های آرشیو شده در اینجا نمایش داده می‌شوند." />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-right font-medium px-4 py-3">شماره</th>
                  <th className="text-right font-medium px-4 py-3">مشتری</th>
                  <th className="text-right font-medium px-4 py-3">آیتم‌ها</th>
                  <th className="text-right font-medium px-4 py-3">مبلغ</th>
                  <th className="text-right font-medium px-4 py-3">تاریخ ثبت</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-accent/40 transition">
                    <td className="px-4 py-3"><span className="font-mono text-xs">#{o.number}</span></td>
                    <td className="px-4 py-3"><div className="font-medium">{o.customer.name}</div><div className="text-xs text-muted-foreground" dir="ltr">{o.customer.phone}</div></td>
                    <td className="px-4 py-3 text-muted-foreground">{o.items.length} آیتم</td>
                    <td className="px-4 py-3" dir="ltr">{formatCurrency(o.totalAmount)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
