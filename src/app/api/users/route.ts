import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { isModuleKey, isOnline } from "@/lib/access";

// GET  /api/users → کاربران فعال برای pickers
//                ?module=designer → فقط کاربرانی که این ماژول را تیک خورده‌اند
//                ?all=1 (master) → شامل غیرفعال‌ها + آمار حضور (صفحهٔ مدیریت)
// POST /api/users → ایجاد کاربر (master) — با «چند ماژول» (Phase 12)
//
// POST body: { name, email, password, phone?, modules: string[] }
//   - modules: حداقل یک ماژول معتبر (designer/print/qc/...) — هر تعداد.
//     نمونهٔ کاربر: هم QC هم چاپ. role ستون اول برای compat نمایش می‌شود.
//   - سازگاری: اگر modules نفرستاد ولی role آمد → تک-ماژول همان role.

const BASE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  avatar: true,
} as const;

function modulesOf(u: { role: string; modules: { module: string }[] }): string[] {
  if (u.role === "master") return [];
  return u.modules.map((m) => m.module);
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  try {
    const { searchParams } = new URL(req.url);
    const moduleFilter = searchParams.get("module") ?? searchParams.get("role");
    // Management mode: masters can list everyone, including inactive accounts.
    const wantAll = searchParams.get("all") === "1" && user.role === "master";

    const users = await db.user.findMany({
      where: {
        ...(wantAll ? {} : { status: "active" }),
        ...(moduleFilter ? { modules: { some: { module: moduleFilter } } } : {}),
      },
      select: {
        ...BASE_SELECT,
        modules: { select: { module: true } },
        ...(wantAll
          ? {
              status: true,
              createdAt: true,
              lastSeenAt: true,
              lastLoginAt: true,
              loginCount: true,
            }
          : {}),
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });

    // master (کاربر سیستمی) در pickerهای تخصیص نمی‌آید — اپراتورها ماژول‌دارند
    const filtered = moduleFilter ? users.filter((u) => u.role !== "master") : users;

    return NextResponse.json({
      users: filtered.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        phone: u.phone,
        avatar: u.avatar,
        modules: modulesOf(u),
        ...(wantAll
          ? {
              status: u.status,
              createdAt: u.createdAt,
              lastSeenAt: u.lastSeenAt,
              lastLoginAt: u.lastLoginAt,
              loginCount: u.loginCount,
              online: isOnline(u.lastSeenAt),
            }
          : {}),
      })),
    });
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
    const { name, email, password, phone, status, modules, role } = body ?? {};

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

    // ─── Phase 12: ماژول‌ها (حداقل یک، همه معتبر) ───────────────────
    // سازگاری: modules آرایه؛ اگر نیامود، role قبلی به‌عنوان تک-ماژول.
    let mods: string[] = [];
    if (Array.isArray(modules)) {
      mods = modules.map((m: unknown) => String(m)).filter(Boolean);
    } else if (typeof role === "string" && role && role !== "master") {
      mods = [role];
    }
    if (mods.length === 0) {
      return NextResponse.json(
        { error: "حداقل یک ماژول (سطح دسترسی) برای کاربر انتخاب کنید" },
        { status: 400 }
      );
    }
    const bad = mods.find((m) => !isModuleKey(m));
    if (bad) {
      return NextResponse.json(
        { error: `ماژول نامعتبر: ${bad}` },
        { status: 400 }
      );
    }
    const uniqueMods = Array.from(new Set(mods));

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
        role: uniqueMods[0], // آینهٔ ماژول اول (compat نمایش/فیلترهای قدیمی)
        phone: phone ? String(phone).trim() : null,
        status: status === "inactive" ? "inactive" : "active",
        modules: {
          create: uniqueMods.map((m) => ({ module: m })),
        },
      },
      select: { ...BASE_SELECT, modules: { select: { module: true } } },
    });

    return NextResponse.json(
      { user: { ...user, modules: modulesOf(user) } },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "خطا در ایجاد کاربر" },
      { status: 500 }
    );
  }
}
