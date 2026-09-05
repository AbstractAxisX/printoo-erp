import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isManager, isModuleKey } from "@/lib/access";
import { clampRange, monitorModuleBoard } from "@/lib/monitoring";
import { jsonError } from "@/lib/api-error";

// ─── GET /api/monitoring/modules?module=designer&from=&to= ──────────
//
// برد یک ماژول: هر کارمندِ همان ماژول — ظرف کار فعلی (openItems)،
// «تا کی کار دارد» (busyUntil)، تاخیرها، عملکرد بازه + روند تکمیل.
// هدف: «ادمین میخواد ببینه به کی سفارش رو بده — تو یک نگاه».
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  if (!isManager(user)) {
    return NextResponse.json(
      { error: "مانیتورینگ ماژول مخصوص مدیر سیستم / مدیر داخلی است" },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const moduleKey = searchParams.get("module") ?? "designer";
    if (!isModuleKey(moduleKey)) {
      return NextResponse.json({ error: "ماژول نامعتبر است" }, { status: 400 });
    }
    const range = clampRange({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });
    const report = await monitorModuleBoard(moduleKey, range);
    return NextResponse.json(report);
  } catch (e) {
    return jsonError(e, "خطا در مانیتورینگ ماژول");
  }
}
