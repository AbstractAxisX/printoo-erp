"use client";

// ─── Phase 16: بسته‌بندی و ارسال (اسکلت — زیراینت محتوای کامل را می‌نویسد) ──

import { PageHeader, EmptyState } from "@/components/shared";

export function PackagesPage() {
  return (
    <div>
      <PageHeader
        title="بسته‌بندی و ارسال"
        icon="package"
        description="ساخت بسته، بج QR، ارسال و تحویل"
      />
      <EmptyState icon="package" title="در حال ساخت" description="این صفحه در دست توسعه است." />
    </div>
  );
}
