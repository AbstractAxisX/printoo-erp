import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const where = status ? { status } : {};
  const reports = await db.qcReport.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      order: {
        include: {
          customer: true,
          items: { include: { product: true } },
        },
      },
    },
  });
  return NextResponse.json({ reports });
}
