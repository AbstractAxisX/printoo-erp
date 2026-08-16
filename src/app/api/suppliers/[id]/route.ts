import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET a single supplier by id (with subcategory.category + services + materialCosts + _count)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supplier = await db.supplier.findUnique({
      where: { id },
      include: {
        subcategory: { include: { category: true } },
        services: {
          orderBy: { name: "asc" },
          include: {
            subcategory: { include: { category: true } },
            priceLists: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
        materialCosts: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            expenseType: true,
            order: { include: { customer: true } },
          },
        },
        _count: { select: { services: true, materialCosts: true } },
      },
    });
    if (!supplier) {
      return NextResponse.json(
        { error: "تامین‌کننده یافت نشد" },
        { status: 404 }
      );
    }
    return NextResponse.json({ supplier });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "خطا در دریافت تامین‌کننده" },
      { status: 500 }
    );
  }
}

// PUT (partial update) — supports name, phone, contactPerson, address, note, subcategoryId, balanceDue
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, phone, contactPerson, address, note, subcategoryId, balanceDue } = body;

    // Partial update: only fields explicitly provided
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone || null;
    if (contactPerson !== undefined) data.contactPerson = contactPerson || null;
    if (address !== undefined) data.address = address || null;
    if (note !== undefined) data.note = note || null;
    if (subcategoryId !== undefined) data.subcategoryId = subcategoryId || null;
    if (balanceDue !== undefined) data.balanceDue = Number(balanceDue) || 0;

    if (name !== undefined && !name) {
      return NextResponse.json(
        { error: "نام تامین‌کننده نمی‌تواند خالی باشد" },
        { status: 400 }
      );
    }

    const supplier = await db.supplier.update({
      where: { id },
      data,
      include: {
        subcategory: { include: { category: true } },
        _count: { select: { services: true, materialCosts: true } },
      },
    });
    return NextResponse.json({ supplier });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ویرایش تامین‌کننده" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.supplier.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "حذف ناموفق" }, { status: 500 });
  }
}
