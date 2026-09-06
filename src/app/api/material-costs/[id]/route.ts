import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isManager } from "@/lib/access";

// GET a single material cost by id (with relations + attachments)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cost = await db.materialCost.findUnique({
    where: { id },
    include: {
      supplier: true,
      expenseType: true,
      attachments: true,
      order: { include: { customer: true } },
    },
  });
  if (!cost) return NextResponse.json({ error: "هزینه یافت نشد" }, { status: 404 });
  return NextResponse.json({ cost });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status } = body;
    if (!["pending", "approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "وضعیت نامعتبر است" }, { status: 400 });
    }
    const cost = await db.materialCost.update({ where: { id }, data: { status } });
    return NextResponse.json({ cost });
  } catch (e) {
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    if (user instanceof NextResponse) return user;
    // فقط مدیر یا ثبت‌کنندهٔ هزینه می‌تواند حذف کند
    const cost = await db.materialCost.findUnique({ where: { id }, select: { createdBy: true, status: true } });
    if (!cost) return NextResponse.json({ error: "هزینه یافت نشد" }, { status: 404 });
    if (!isManager(user) && cost.createdBy !== user.id) {
      return NextResponse.json({ error: "حذف این هزینه مجاز نیست" }, { status: 403 });
    }
    if (cost.status === "approved") {
      return NextResponse.json(
        { error: "هزینهٔ تأییدشده قابل حذف نیست — از مالی بخواهید ابتدا رد کند" },
        { status: 409 }
      );
    }
    await db.materialCost.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "حذف ناموفق" }, { status: 500 });
  }
}
