import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-error";

// GET /api/qc-reports — Phase 12: auth gate (قبلاً بدون احراز هویت بود)
// + نام گزارش‌دهنده/بررسی‌گر (آمار کارمندان).
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const where = status ? { status } : {};
    const reports = await db.qcReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        order: {
          include: {
            customer: true,
            items: { include: { product: true } },
          },
        },
        reportedByUser: { select: { id: true, name: true } },
        reviewedByUser: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ reports });
  } catch (e) {
    return jsonError(e, "خطا در دریافت گزارش‌های کنترل کیفی");
  }
}
