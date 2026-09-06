import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, touchLastSeen } from "@/lib/auth";
import { isOnline } from "@/lib/access";

// POST /api/auth/heartbeat — Phase 12 presence pulse.
//
// کلاینت هر ۴۵ ثانیه (فقط وقتی tab مرئی است) زنگ می‌زند؛ سرور
// lastSeenAt را لمس می‌کند (throttle داخلی ۴۵s) و وضعیت آنلاینِ
// خودِ کاربر را برمی‌گرداند. نیازی به بدنه ندارد.
export async function POST() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  await touchLastSeen(user.id);
  const fresh = await db.user.findUnique({
    where: { id: user.id },
    select: { lastSeenAt: true },
  });
  return NextResponse.json({
    ok: true,
    online: isOnline(fresh?.lastSeenAt ?? null),
    lastSeenAt: fresh?.lastSeenAt ?? null,
  });
}
