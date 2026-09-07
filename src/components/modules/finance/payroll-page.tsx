"use client";

// ─── Phase 16: حقوق و دستمزد — مالی (اسکلت — زیراینت محتوای کامل را می‌نویسد) ──

import { PageHeader, EmptyState } from "@/components/shared";

export function PayrollPage() {
  return (
    <div>
      <PageHeader
        title="حقوق و دستمزد"
        icon="wallet"
        description="مدیریت دوره‌های حقوق، مساعده و پرداخت — ثبت خودکار به‌عنوان هزینه"
      />
      <EmptyState
        icon="wallet"
        title="در حال ساخت"
        description="این صفحه در دست توسعه است."
      />
    </div>
  );
}
