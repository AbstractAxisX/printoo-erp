"use client";

// Printoo24 ERP — Settings module › Users & Roles (master-only)
//
// «کاربران و نقش‌ها» از پنل ادمین داخلی به ماژول «تنظیمات سیستم» منتقل شد:
// ساخت/حذف کاربر و تغییر نقش، اختیار «ادمین سراسری» (master) است، نه ادمین
// داخلی. سایدبار و پالت فرمان این ماژول را فقط برای master رندر می‌کنند
// (visibleModules)؛ این guard لایهٔ دوم است — اگر کاربر غیر-master از طریق
// tab بازِ قبلی وارد شد، پیام دسترسی می‌بیند نه صفحهٔ خام.
// لایهٔ سوم همان گاردهای requireMaster داخل API است.

import * as React from "react";
import { PageHeader, EmptyState } from "@/components/shared";
import { useAppStore } from "@/stores/app-store";
import { UsersPage } from "@/components/modules/admin/users-page";

export function SettingsUsersGuard() {
  const role = useAppStore((s) => s.user?.role);

  if (role !== "master") {
    return (
      <div>
        <PageHeader
          title="کاربران و نقش‌ها"
          description="تنظیمات سیستم"
          icon="user"
        />
        <EmptyState
          icon="shield"
          title="دسترسی محدود"
          description="این بخش مخصوص ادمین سراسری (master) است. برای مدیریت کاربران و نقش‌ها با مدیر سیستم تماس بگیرید."
        />
      </div>
    );
  }

  return <UsersPage />;
}
