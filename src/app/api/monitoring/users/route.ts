import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isManager } from "@/lib/access";
import { monitorUsersList } from "@/lib/monitoring";
import { jsonError } from "@/lib/api-error";

// ─── GET /api/monitoring/users — مانیتورینگ کاربران (فهرست) ──────
//
// دسترسی: مستر (مدیر سیستم) یا مدیر داخلی (ماژول admin) — «ادمین داخلی
// هم متناسب با وظایفش مانیتورینگ می‌شود». پاسخ: همهٔ کاربران + حضور
// (آنلاین/آخرین بازدید) + آمار per-item ریز (باز/تاخیر/تکمیل) + مرخصی.
export async function GET(_req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  if (!isManager(user)) {
    return NextResponse.json(
      { error: "مانیتورینگ کاربران مخصوص مدیر سیستم / مدیر داخلی است" },
      { status: 403 }
    );
  }

  try {
    const report = await monitorUsersList();
    return NextResponse.json(report);
  } catch (e) {
    return jsonError(e, "خطا در مانیتورینگ کاربران");
  }
}
