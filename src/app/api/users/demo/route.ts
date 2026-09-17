import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

// ─── Phase 23: مدیریت کاربران دمو (فقط مشاهده) ────────────────────
//
// GET  /api/users/demo      → فهرست کاربران دمو (master)
// POST /api/users/demo      → ساخت دموی جدید (master) — نام کاربری و رمز
//                             به‌صورت خودکار ساخته می‌شوند و رمز فقط «یک بار»
//                             در پاسخِ همین درخواست برمی‌گردد (هرگز ذخیرهٔ
//                             plaintext ندارد — bcrypt مثل بقیهٔ کاربران).
//
// کاربر دمو: role=master (همهٔ ماژول‌ها حتی ادمین سراسری را می‌بیند) اما
// isDemo=true → proxy.ts تمام متدهای غیر-GET را ۴۰۳ می‌کند → فقط مشاهده.
// انقضا: POST /api/users/[id]/demo-expire (demoExpiresAt = الان) — کاربرِ
// فعال در همان فراخوانی بعدی ۴۰۱ می‌خورد و به صفحهٔ ورود برمی‌گردد.

// الفبای بدون ابهام (بدون 0/O/1/l/I) برای رمز و پسوند ایمیل
const SAFE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => SAFE_ALPHABET[b % SAFE_ALPHABET.length]).join("");
}

/** پسوند ایمیل — فقط حروف کوچک/عدد تا با toLowerCase() لاگین جفت شود
 *  (SQLite case-sensitive است؛ از هم‌نواختی حروف باید مطمئن بود). */
function randomSuffix(length: number): string {
  return randomString(length).toLowerCase();
}

export async function GET() {
  const session = await requireUser();
  if (session instanceof NextResponse) return session;

  if (session.role !== "master") {
    return NextResponse.json(
      { error: "فقط مدیر ارشد به بخش کاربران دمو دسترسی دارد" },
      { status: 403 }
    );
  }

  try {
    const demos = await db.user.findMany({
      where: { isDemo: true },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        demoExpiresAt: true,
        lastLoginAt: true,
        loginCount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const now = Date.now();
    return NextResponse.json({
      demos: demos.map((d) => ({
        ...d,
        expired: !!d.demoExpiresAt && d.demoExpiresAt.getTime() <= now,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "خطا در دریافت فهرست کاربران دمو" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await requireUser();
  if (session instanceof NextResponse) return session;

  if (session.role !== "master") {
    return NextResponse.json(
      { error: "فقط مدیر ارشد می‌تواند کاربر دمو بسازد" },
      { status: 403 }
    );
  }

  // مسترِ خودِ دمو؟ (خیر — دمو اینجا هرگز نمی‌رسد چون proxy بسته است؛
  // ولی defense-in-depth: نشستِ دمو در route نوشتاری جایی نباید برسد)
  if (session.isDemo) {
    return NextResponse.json(
      { error: "حساب دمو فقط مشاهده است" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    // برچسب دلخواه مدیر برای تشخیص دموها (مثلاً «نمایش به مشتری»)
    const label =
      typeof body?.label === "string" && body.label.trim()
        ? body.label.trim().slice(0, 40)
        : null;

    const suffix = randomSuffix(5);
    const email = `demo.${suffix}@printoo24.demo`;
    const password = randomString(12);
    const name = label ? `کاربر دمو — ${label}` : `کاربر دمو ${suffix.toUpperCase()}`;

    const user = await db.user.create({
      data: {
        name,
        email,
        password: await hashPassword(password),
        role: "master", // همهٔ ماژول‌ها + sysadmin را می‌بیند
        isDemo: true,   // اما proxy همهٔ نوشتن‌ها را می‌بندد
        status: "active",
        guideTooltips: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isDemo: true,
        status: true,
        createdAt: true,
      },
    });

    // رمز فقط همین یک بار برمی‌گردد — صفحه از کاربر می‌خواهد کپی کند
    return NextResponse.json({ user, credentials: { email, password } }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "خطا در ساخت کاربر دمو" },
      { status: 500 }
    );
  }
}
