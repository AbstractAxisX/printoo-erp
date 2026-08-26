import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/day-notes/[date] — fetch note by date (yyyy-MM-dd)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "فرمت تاریخ نامعتبر است (yyyy-MM-dd)" },
      { status: 400 }
    );
  }
  const note = await db.dayNote.findUnique({ where: { date } });
  return NextResponse.json({ note });
}

// DELETE /api/day-notes/[date] — remove note by date
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  const { date } = await params;
  try {
    await db.dayNote.delete({ where: { date } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "حذف ناموفق؛ یادداشت یافت نشد" },
      { status: 404 }
    );
  }
}
