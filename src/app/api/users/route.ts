import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

// GET /api/users — active users for assignment UIs (task assignee pickers).
//
// Phase 4 (cross-panel assignment): the admin Tasks page and the order-detail
// TasksTab both need a searchable list of assignable people. This route is the
// single source of truth for it.
//
// - Auth-gated (R26 baseline): requires a valid session.
// - Returns ACTIVE users only (status = "active") — assigning to an inactive
//   employee is a data-quality bug the server refuses at the source.
// - Password field is NEVER selected (defense-in-depth, not just trust).
// - Optional ?role=DESIGNER filter for future module-scoped pickers.
//
// Response shape: { users: { id, name, email, role, phone, avatar }[] }

const ASSIGNABLE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  avatar: true,
} as const;

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role");

    const users = await db.user.findMany({
      where: {
        status: "active",
        ...(role ? { role } : {}),
      },
      select: ASSIGNABLE_SELECT,
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ users });
  } catch {
    return NextResponse.json(
      { error: "خطا در دریافت فهرست کاربران" },
      { status: 500 }
    );
  }
}
