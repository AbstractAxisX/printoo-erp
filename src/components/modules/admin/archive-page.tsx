"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, EmptyState, StatusBadge } from "@/components/shared";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";

type Order = {
  id: string; number: number; status: string; endDate: string | null; totalAmount: number;
  createdAt: string; customer: { name: string; phone: string };
  items: { id: string; product: { name: string } }[];
};

export function ArchivePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["archive"],
    queryFn: () => api<{ orders: Order[] }>("/api/orders?status=archived"),
  });
  const orders = data?.orders ?? [];

  const columns = React.useMemo<ColumnDef<Order>[]>(() => [
    {
      accessorKey: "number",
      header: "شماره",
      cell: ({ row }) => <span className="font-mono text-xs font-semibold">#{row.original.number}</span>,
      enableSorting: true,
    },
    {
      id: "customer",
      accessorFn: (r) => r.customer.name,
      header: "مشتری",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.customer.name}</div>
          <div className="text-xs text-muted-foreground" dir="ltr">{row.original.customer.phone}</div>
        </div>
      ),
    },
    {
      id: "items",
      accessorFn: (r) => r.items.length,
      header: "آیتم‌ها",
      cell: ({ row }) => <span className="text-muted-foreground tabular-nums">{row.original.items.length} آیتم</span>,
      enableSorting: true,
    },
    {
      id: "status",
      accessorKey: "status",
      header: "وضعیت",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "totalAmount",
      header: "مبلغ",
      cell: ({ row }) => <span className="tabular-nums" dir="ltr">{formatCurrency(row.original.totalAmount)}</span>,
      enableSorting: true,
    },
    {
      accessorKey: "createdAt",
      header: "تاریخ ثبت",
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{formatDate(row.original.createdAt)}</span>,
      enableSorting: true,
    },
  ], []);

  return (
    <div className="space-y-5">
      <PageHeader title="آرشیو سفارشات" description="سفارش‌های آرشیو شده (نیمه‌کاره یا غیرفعال)" icon="archive" />

      <Card className="p-4">
        <DataTable
          columns={columns}
          data={orders}
          isLoading={isLoading}
          pageSize={10}
          emptyState={
            <EmptyState
              icon="archive"
              title="سفارش آرشیو شده‌ای وجود ندارد"
              description="سفارش‌های آرشیو شده در اینجا نمایش داده می‌شوند."
            />
          }
        />
      </Card>
    </div>
  );
}
