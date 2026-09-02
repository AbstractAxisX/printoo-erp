import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, clearSession } from "@/lib/auth";

// POST /api/auth/logout — Phase 12: خروج هم ثبت حضور می‌شود
// (UserActivityLog("logout") + lastSeenAt) تا «آخرین ساعت کاری» روزِ
// کارمند در گزارش مدیریت کارمندان قابل استنتاج باشد.
export async function POST() {
  const user = await getSession();
  if (user) {
    try {
      await db.$transaction([
        db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }),
        db.userActivityLog.create({ data: { userId: user.id, action: "logout" } }),
      ]);
    } catch {
      // even if tracking fails, logout must succeed
    }
  }
  await clearSession();
  return NextResponse.json({ ok: true });
}
