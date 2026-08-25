import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { isUserRole } from "@/lib/user-validation";

// GET  /api/users  → active users for assignment UIs (task assignee pickers).
//                ?all=1 (master only) → includes INACTIVE users + status field,
//                for the Users & Roles management page.
// POST /api/users  → create a user (master only) — the "نمی‌توانم نقش بسازم" fix.
//
// GET contract (unchanged): { users: { id, name, email, role, phone, avatar }[] }
//   - Auth-gated, ACTIVE users only, password never selected.
//   - Optional ?role= filter for module-scoped pickers.
//
// POST body: { name, email, password, role, phone?, status? }
//   - role is validated against USER_ROLE keys (server-side fence — a typoed
//     role would silently break the user's sidebar/module access).
//   - email must be unique (checked before insert, Persian error message).
//   - password hashed with bcrypt before storage.
//   - Master-only: creating operators/roles is an admin-plane action.

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
    // Management mode: masters can list everyone, including inactive accounts.
    const wantAll = searchParams.get("all") === "1" && user.role === "master";

    const users = await db.user.findMany({
      where: {
        ...(wantAll ? {} : { status: "active" }),
        ...(role ? { role } : {}),
      },
      select: {
        ...ASSIGNABLE_SELECT,
        ...(wantAll ? { status: true, createdAt: true } : {}),
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ users });
  } catch {
    return NextResponse.json(
      { error: "خطا در دریافت فهرست کاربران" },
      { status: 500 }
    );
  }
}

// ─── POST — create user (master only) ─────────────────────────────
export async function POST(req: NextRequest) {
  const session = await requireUser();
  if (session instanceof NextResponse) return session;

  if (session.role !== "master") {
    return NextResponse.json(
      { error: "فقط مدیر ارشد می‌تواند کاربر ایجاد کند" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { name, email, password, role, phone, status } = body ?? {};

    // name — required
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "نام الزامی است" },
        { status: 400 }
      );
    }

    // email — required, basic shape check
    const emailNorm = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return NextResponse.json(
        { error: "ایمیل معتبر وارد کنید" },
        { status: 400 }
      );
    }

    // password — required, min 6 chars
    if (typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "رمز عبور باید حداقل ۶ کاراکتر باشد" },
        { status: 400 }
      );
    }

    // role — validated against USER_ROLE (R12-style enum fence)
    if (!isUserRole(role)) {
      return NextResponse.json(
        { error: `نقش نامعتبر: ${role}` },
        { status: 400 }
      );
    }

    // uniqueness — friendly Persian error instead of raw P2002
    const existing = await db.user.findUnique({ where: { email: emailNorm } });
    if (existing) {
      return NextResponse.json(
        { error: "کاربری با این ایمیل قبلاً ثبت شده است" },
        { status: 409 }
      );
    }

    const user = await db.user.create({
      data: {
        name: name.trim(),
        email: emailNorm,
        password: await hashPassword(password),
        role,
        phone: phone ? String(phone).trim() : null,
        status: status === "inactive" ? "inactive" : "active",
      },
      select: ASSIGNABLE_SELECT,
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "خطا در ایجاد کاربر" },
      { status: 500 }
    );
  }
}
