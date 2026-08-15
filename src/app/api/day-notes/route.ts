import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/day-notes — list all day notes
export async function GET() {
  const notes = await db.dayNote.findMany({
    orderBy: { date: "asc" },
  });
  return NextResponse.json({ notes });
}

// POST /api/day-notes — upsert a note for a given date (yyyy-MM-dd)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, content, color } = body as {
      date: string;
      content: string;
      color?: string;
    };

    if (!date || typeof date !== "string") {
      return NextResponse.json(
        { error: "تاریخ الزامی است" },
        { status: 400 }
      );
    }

    // Validate date format yyyy-MM-dd
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "فرمت تاریخ نامعتبر است (yyyy-MM-dd)" },
        { status: 400 }
      );
    }

    const allowedColors = ["default", "rose", "amber", "emerald", "blue"];
    const safeColor =
      color && allowedColors.includes(color) ? color : "default";

    const note = await db.dayNote.upsert({
      where: { date },
      update: {
        content: typeof content === "string" ? content : "",
        color: safeColor,
      },
      create: {
        date,
        content: typeof content === "string" ? content : "",
        color: safeColor,
      },
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ذخیره یادداشت" }, { status: 500 });
  }
}
