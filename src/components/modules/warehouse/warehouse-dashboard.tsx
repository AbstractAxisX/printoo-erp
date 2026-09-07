"use client";

// ─── Phase 16: داشبورد انبار و لجستیک (اسکلت — زیراینت محتوای کامل را می‌نویسد) ──

import { PageHeader, EmptyState } from "@/components/shared";

export function WarehouseDashboard() {
  return (
    <div>
      <PageHeader title="داشبورد انبار" icon="warehouse" description="نمای عملیاتی انبار و لجستیک" />
      <EmptyState icon="warehouse" title="در حال ساخت" description="این صفحه در دست توسعه است." />
    </div>
  );
}
