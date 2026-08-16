import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        _count: {
          select: { orders: true, deals: true, activities: true },
        },
      },
    });
    if (!customer) {
      return NextResponse.json(
        { error: "مشتری یافت نشد" },
        { status: 404 }
      );
    }
    return NextResponse.json({ customer });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "خطا در دریافت مشتری" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, phone, isFavorite, note } = body;

    // Partial update: only update fields that are explicitly provided.
    // This allows PATCH-like behavior (e.g., toggling isFavorite) via PUT.
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone;
    if (isFavorite !== undefined) data.isFavorite = !!isFavorite;
    if (note !== undefined) data.note = note ?? null;

    // If updating name or phone, both must be present and non-empty
    if ((name !== undefined && !name) || (phone !== undefined && !phone)) {
      return NextResponse.json(
        { error: "نام و شماره تلفن نمی‌توانند خالی باشند" },
        { status: 400 }
      );
    }

    const customer = await db.customer.update({
      where: { id },
      data,
    });
    return NextResponse.json({ customer });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ویرایش مشتری" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.customer.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "حذف ناموفق" }, { status: 500 });
  }
}
