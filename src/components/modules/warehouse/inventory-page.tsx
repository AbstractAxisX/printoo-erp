"use client";

// ─── Phase 16: موجودی و مواد اولیهٔ انبار (اسکلت — زیراینت محتوای کامل را می‌نویسد) ──

import { PageHeader, EmptyState } from "@/components/shared";

export function InventoryPage() {
  return (
    <div>
      <PageHeader
        title="موجودی و مواد"
        icon="boxes"
        description="موجودی مواد اولیه و گردش انبار"
      />
      <EmptyState icon="boxes" title="در حال ساخت" description="این صفحه در دست توسعه است." />
    </div>
  );
}
