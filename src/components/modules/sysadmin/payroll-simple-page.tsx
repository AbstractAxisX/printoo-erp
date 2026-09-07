"use client";

// ─── Phase 16: حقوق کارمندان — مدیر سیستم (ساده: حقوق بده و برو) ──
// اسکلت — زیراینت محتوای کامل را می‌نویسد.

import { PageHeader, EmptyState } from "@/components/shared";

export function PayrollSimplePage() {
  return (
    <div>
      <PageHeader title="حقوق کارمندان" icon="wallet" description="پرداخت حقوق دورهٔ جاری" />
      <EmptyState icon="wallet" title="در حال ساخت" description="این صفحه در دست توسعه است." />
    </div>
  );
}
