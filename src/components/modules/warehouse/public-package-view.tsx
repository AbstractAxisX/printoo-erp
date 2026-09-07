"use client";

// ─── Phase 16: صفحهٔ عمومی بسته — ?pkg=CODE (بدون لاگین) ──
// اسکلت — زیراینت محتوای کامل را می‌نویسد. QR روی بج به همین صفحه می‌رسد.

import { PageHeader, EmptyState } from "@/components/shared";

export function PublicPackageView({ code }: { code: string }) {
  return (
    <div>
      <PageHeader title={`بسته ${code}`} icon="package" description="پیگیری بسته" />
      <EmptyState icon="package" title="در حال ساخت" description="این صفحه در دست توسعه است." />
    </div>
  );
}
