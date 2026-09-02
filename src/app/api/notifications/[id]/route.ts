import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isManager } from "@/lib/access";

// PUT /api/notifications/[id] — mark as read.
// Phase 12: auth + مالکیت — کاربر فقط اعلانِ عمومی/خودش را «خوانده» می‌کند.
export async function PUT(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const n = await db.notification.findUnique({ where: { id }, select: { userId: true } });
  if (!n) return NextResponse.json({ error: "اعلان یافت نشد" }, { status: 404 });
  if (!isManager(user) && n.userId && n.userId !== user.id) {
    return NextResponse.json({ error: "این اعلان مال شما نیست" }, { status: 403 });
  }
  await db.notification.update({ where: { id }, data: { read: true } });
  return NextResponse.json({ ok: true });
}
