import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, touchLastSeen, setSession, safeParsePages } from "@/lib/auth";
import { isOnline } from "@/lib/access";
import { isModuleLevel } from "@/lib/module-pages";

// POST /api/auth/heartbeat — Phase 12 presence pulse.
//
// کلاینت هر 45 ثانیه (فقط وقتی tab مرئی است) زنگ می‌زند؛ سرور
// lastSeenAt را لمس می‌کند (throttle داخلی 45s) و وضعیت آنلاینِ
// خودِ کاربر را برمی‌گرداند. نیازی به بدنه ندارد.
//
// Phase 24: این پالس «همچنین» کوکی نشست را با ماژول‌ها/صفحات/سطح‌های
// تازه دوباره prime می‌کند — گیت proxy در edge با تغییر سطح دسترسی
// (مشاهده/ادیت/حذف) حداکثر ۴۵ ثانیه بعد همگام می‌شود، بی‌آنکه کاربر
// لازم باشد خارج و دوباره وارد شود.
export async function POST() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  await touchLastSeen(user.id);

  // Phase 24: re-prime — سطح‌های دسترسی تازه از DB داخل کوکی
  try {
    const fresh = await db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        isDemo: true,
        modules: { select: { module: true, pages: true, level: true } },
      },
    });
    if (fresh && fresh.status === "active") {
      const modulePages: Record<string, string[] | null> = {};
      const moduleLevels: Record<string, string> = {};
      for (const m of fresh.modules) {
        modulePages[m.module] = m.pages ? safeParsePages(m.pages) : null;
        moduleLevels[m.module] = isModuleLevel(m.level) ? m.level : "delete";
      }
      await setSession({
        id: fresh.id,
        name: fresh.name,
        email: fresh.email,
        role: fresh.role,
        isDemo: fresh.isDemo,
        modules: fresh.role === "master" ? [] : fresh.modules.map((m) => m.module),
        modulePages,
        moduleLevels,
      });
    }
  } catch {
    // re-prime بهترین-تلاش است — پالس اصلی نباید شکسته شود
  }

  const fresh = await db.user.findUnique({
    where: { id: user.id },
    select: { lastSeenAt: true },
  });
  return NextResponse.json({
    ok: true,
    online: isOnline(fresh?.lastSeenAt ?? null),
    lastSeenAt: fresh?.lastSeenAt ?? null,
  });
}
