import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

// ─── Persian, actionable API error responses ─────────────────────────
//
// خطاهای Prisma دو خانوادهٔ پنهان دارند که برای کاربر نهایی «۵۰۰ خاموش»
// هستند، در حالی که علتشان مشخص و قابل رفع است:
//
//  ۱) PrismaClientValidationError («Unknown field/model …») — کلاینتِ
//     تولیدشدهٔ Prisma قدیمی‌تر از schema است (سرور dev از قبل از pull
//     روشن مانده). رفع: ری‌استارت کامل با npm run dev (اسکریپت predev
//     کلاینت و دیتابیس را خودش همگام می‌کند).
//  ۲) P2021/P2022 — جدول/ستون در دیتابیس محلی وجود ندارد. همان رمدی.
//
// jsonError این‌ها را تشخیص می‌دهد، علت واقعی را در کنسول سرور لاگ
// می‌کند و به کلاینت پیام فارسیِ قابل‌اقدام با کد DB_STALE (503) می‌دهد.

export const DB_STALE_MESSAGE =
  "پایگاه‌دادهٔ محلی با نسخهٔ جدید کد همگام نیست. سرور را کاملاً ببندید (Ctrl+C در همهٔ ترمینال‌ها) و دوباره با «npm run dev» اجرا کنید — راه‌انداز خودش همه‌چیز را ترمیم می‌کند. اگر ارور ادامه داشت: git pull و بعد npm install.";

export function jsonError(
  e: unknown,
  fallback: string,
  status = 500
): NextResponse {
  const name = (e as { name?: string } | null)?.name ?? "";

  // کلاینت Prisma کهنه — فیلد/مدل/آرگومان جدید را نمی‌شناسد
  if (name === "PrismaClientValidationError") {
    console.error("[db-stale] کلاینت Prisma قدیمی است:", (e as Error).message);
    return NextResponse.json(
      { error: DB_STALE_MESSAGE, code: "DB_STALE" },
      { status: 503 }
    );
  }

  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    // جدول/ستون غایب در دیتابیس محلی
    if (e.code === "P2021" || e.code === "P2022") {
      console.error(`[db-stale] Prisma ${e.code}:`, e.message);
      return NextResponse.json(
        { error: DB_STALE_MESSAGE, code: "DB_STALE" },
        { status: 503 }
      );
    }
  }

  console.error(e);
  return NextResponse.json({ error: fallback }, { status });
}
