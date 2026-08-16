import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { type, title, description, customerId, dealId, date } = body;

    if (!type || !title) {
      return NextResponse.json(
        { error: "نوع و عنوان فعالیت الزامی است" },
        { status: 400 }
      );
    }

    const activity = await db.activity.update({
      where: { id },
      data: {
        type,
        title,
        description: description || null,
        customerId: customerId || null,
        dealId: dealId || null,
        date: date ? new Date(date) : new Date(),
      },
      include: { customer: true, deal: true },
    });
    return NextResponse.json({ activity });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "خطا در ویرایش فعالیت" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.activity.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "حذف ناموفق" }, { status: 500 });
  }
}
