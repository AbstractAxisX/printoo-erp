import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { isUserRole } from "@/lib/user-validation";

// PUT /api/users/[id] — update a user (master only).
//
// Body (all optional, only provided fields are applied):
//   { name?, role?, phone?, status?, password? }
//
// - role validated against USER_ROLE keys (typo fence).
// - status: "active" | "inactive" — deactivating REMOVES the user from
//   assignee pickers everywhere (GET /api/users filters active) without
//   destroying their history (tasks keep the FK).
// - password (optional) re-hashed with bcrypt.
// - A master cannot demote/deactivate THEMSELVES (lockout guard).
//
// Response: { user } — same public shape as GET /api/users (no password).

const PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  avatar: true,
  status: true,
  createdAt: true,
} as const;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireUser();
  if (session instanceof NextResponse) return session;

  if (session.role !== "master") {
    return NextResponse.json(
      { error: "فقط مدیر ارشد می‌تواند کاربران را ویرایش کند" },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, role, phone, status, password } = body ?? {};

    const target = await db.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json(
        { error: "کاربر یافت نشد" },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "نام نمی‌تواند خالی باشد" }, { status: 400 });
      }
      data.name = name.trim();
    }

    if (role !== undefined) {
      if (!isUserRole(role)) {
        return NextResponse.json(
          { error: `نقش نامعتبر: ${role}` },
          { status: 400 }
        );
      }
      // Lockout guard: a master cannot strip their own master role.
      if (target.id === session.id && role !== "master") {
        return NextResponse.json(
          { error: "نمی‌توانید نقش مدیر ارشد خودتان را تغییر دهید" },
          { status: 400 }
        );
      }
      data.role = role;
    }

    if (phone !== undefined) {
      data.phone = phone ? String(phone).trim() : null;
    }

    if (status !== undefined) {
      if (status !== "active" && status !== "inactive") {
        return NextResponse.json(
          { error: `وضعیت نامعتبر: ${status}` },
          { status: 400 }
        );
      }
      if (target.id === session.id && status === "inactive") {
        return NextResponse.json(
          { error: "نمی‌توانید حساب خودتان را غیرفعال کنید" },
          { status: 400 }
        );
      }
      data.status = status;
    }

    if (password !== undefined && password !== null && password !== "") {
      if (typeof password !== "string" || password.length < 6) {
        return NextResponse.json(
          { error: "رمز عبور باید حداقل ۶ کاراکتر باشد" },
          { status: 400 }
        );
      }
      data.password = await hashPassword(password);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "هیچ فیلدی برای به‌روزرسانی ارسال نشده است" },
        { status: 400 }
      );
    }

    const user = await db.user.update({
      where: { id },
      data,
      select: PUBLIC_SELECT,
    });

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json(
      { error: "خطا در به‌روزرسانی کاربر" },
      { status: 500 }
    );
  }
}
