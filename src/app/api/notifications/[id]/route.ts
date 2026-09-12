import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isManager } from "@/lib/access";

// PUT /api/notifications/[id] — علامت‌گذاری «خوانده» (Phase 17: per-user).
// ردیف NotificationRead برای «کاربر جاری» upsert می‌شود — اعلان عمومی که
// این کاربر خواند برای بقیهٔ کاربران ناخوانده می‌ماند. ستون legacy-read
// سراسری Notification دیگر هرگز بازنویتی نمی‌شود.
// مالکیت: کاربر می‌تواند هر اعلانِ قابل‌مشاهده برای خودش (عمومی یا هدفمندِ
// خودش) را خوانده کند — 403 فقط وقتی اعلان به کاربر «دیگری» هدفمند باشد.
export async function PUT(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const n = await db.notification.findUnique({ where: { id }, select: { userId: true } });
  if (!n) return NextResponse.json({ error: "اعلان یافت نشد" }, { status: 404 });
  if (!isManager(user) && n.userId && n.userId !== user.id) {
    return NextResponse.json({ error: "این اعلان مال شما نیست" }, { status: 403 });
  }

  await db.notificationRead.upsert({
    where: { userId_notificationId: { userId: user.id, notificationId: id } },
    create: { userId: user.id, notificationId: id },
    update: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
