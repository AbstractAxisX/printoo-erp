"use client";

// ─── Phase 16: تحلیل حقوق — مالی (اسکلت — زیراینت محتوای کامل را می‌نویسد) ──

import { PageHeader, EmptyState } from "@/components/shared";

export function PayrollAnalyticsPage() {
  return (
    <div>
      <PageHeader
        title="تحلیل حقوق"
        icon="chartColumn"
        description="روند ماهانه، تفکیک ماژول و مقایسهٔ کارمندان"
      />
      <EmptyState
        icon="chartColumn"
        title="در حال ساخت"
        description="این صفحه در دست توسعه است."
      />
    </div>
  );
}
