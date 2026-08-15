import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT /api/tasks/[id] — partial update of a task.
// Accepts: { title?, description?, status?, priority?, dueDate?, module? }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      if (!body.title || !String(body.title).trim()) {
        return NextResponse.json({ error: "عنوان الزامی است" }, { status: 400 });
      }
      data.title = String(body.title).trim();
    }
    if (body.description !== undefined) {
      data.description = body.description ? String(body.description) : null;
    }
    if (body.status !== undefined) data.status = String(body.status);
    if (body.priority !== undefined) data.priority = String(body.priority);
    if (body.module !== undefined) data.module = String(body.module);
    if (body.dueDate !== undefined) {
      data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }

    const task = await db.task.update({
      where: { id },
      data,
      include: { order: { include: { customer: true } } },
    });
    return NextResponse.json({ task });
  } catch {
    return NextResponse.json({ error: "خطا در ویرایش تسک" }, { status: 500 });
  }
}

// DELETE /api/tasks/[id] — remove a task.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "حذف ناموفق" }, { status: 500 });
  }
}
