import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const notifications = await db.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const unread = await db.notification.count({ where: { read: false } });
  return NextResponse.json({ notifications, unread });
}

// Create a notification
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, message, type, link } = body;
  if (!title) return NextResponse.json({ error: "عنوان الزامی است" }, { status: 400 });
  const n = await db.notification.create({
    data: { title, message: message || "", type: type || "info", link: link || null },
  });
  return NextResponse.json({ notification: n }, { status: 201 });
}
