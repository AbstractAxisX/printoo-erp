// Printoo24 ERP — Edge proxy (Phase 1.5 baseline security → Phase 24 RBAC)
// Gates /api/* (except /api/auth/login) by session-cookie presence.
// Full HMAC verification happens server-side in getSession()/requireUser().
// Keeping this edge-safe (cookie presence only) so it stays fast and
// runs without Node crypto bindings.
//
// Next.js 16 convention: the edge entrypoint is `src/proxy.ts` exporting
// `proxy` (the `middleware` filename/export is DEPRECATED in v16 and emits
// a build warning — see nextjs.org/docs/messages/middleware-to-proxy).
//
// ─── Phase 23: کاربر دمو (فقط مشاهده) ─────────────────────────────
// session cookie امضاشده است (HMAC) پس payload آن قابل اعتماد است —
// بدون DB، middleware می‌تواند isDemo را از payload بخواند و «همهٔ»
// متدهای غیر-GET را ببندد. تلاش برای جعل isDemo=false بی‌اثر است چون
// امضا mismatch می‌شود و requireUser سمت سرور 401 می‌دهد (fail-closed).
// استثناهای مجاز برای دمو: خروج از حساب + heartbeat حضور (هر دو فقط
// اثر جانبی سیستمی دارند، نه تغییر دیتای کاربر).
//
// ─── Phase 24: دسترسی ۳لایهٔ ماژول (مشاهده / ادیت / حذف) ──────────
// payload کوکی moduleLevels و role را هم حمل می‌کند (ورود/heartbeat/me
// آن را تازه می‌کنند — حداکثر ۴۵ ثانیه تاخیر برای اعمال تغییر سطح).
// برای متدهای نوشتاری: مالکِ route از ROUTE_MODULES پیدا می‌شود؛
// مؤثرترین سطحِ ماژول‌های مالک تعیین می‌کند:
//   view  → همهٔ متدهای نوشتاری ۴۰۳
//   edit  → فقط DELETE ۴۰۳
//   delete→ آزاد
// master همیشه آزاد است؛ مسیرهای سیستمی (auth/notifications/uploads/
// day-notes/users/monitoring/dashboard/employees/public) سطح نمی‌گیرند.

import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "printoo24_session";
const PUBLIC_API = ["/api/auth/login", "/api/public"];

// متدهای مجاز برای کاربر دمو — فقط خواندن
const DEMO_ALLOWED_METHODS = ["GET", "HEAD", "OPTIONS"];

// مسیرهای غیر-GET که دمو همچنان می‌زند (خروج + حضور آنلاین)
const DEMO_WRITABLE_PATHS = ["/api/auth/logout", "/api/auth/heartbeat"];

// ─── Phase 24: نگاشت مالکیت route → ماژول‌ها ────────────────────────
// «هر» ماژول مالک که کاربر دارد، سطحش در محاسبهٔ max شرکت می‌کند؛ اگر
// هیچ‌کدام را نداشته باشد گیتِ خود route (hasModule) همان ۴۰۳ را
// می‌دهد — اینجا فقط دوبار-بستن نمی‌کنیم.
// تسک‌ها و اعلان‌ها سیستمی/بین-ماژولی‌اند و سطح جدا نمی‌گیرند مگر tasks
// که درگیر همهٔ ماژول‌های کاری است.
const ALL_WORK_MODULES = [
  "admin", "designer", "print", "warehouse", "finance", "qc", "crm", "srm",
];

// الگوهای مالکیت — سگمنت‌به‌سگمنت ({id} = هر سگمنت داینامیک)
const ROUTE_MODULES: Array<{ segs: string[]; modules: string[] }> = [
  // سفارش‌ها — هستهٔ جریان کار
  { segs: ["orders"], modules: ["admin"] },
  { segs: ["orders", "{id}"], modules: ["admin"] },
  { segs: ["orders", "{id}", "designer-action"], modules: ["designer", "admin"] },
  { segs: ["orders", "{id}", "print-action"], modules: ["print", "admin"] },
  { segs: ["orders", "{id}", "payments"], modules: ["finance", "admin", "warehouse"] },
  { segs: ["orders", "{id}", "assignee"], modules: ["admin"] },
  { segs: ["orders", "{id}", "gift"], modules: ["admin", "finance"] },
  { segs: ["orders", "{id}", "invoice-clear"], modules: ["finance", "admin"] },
  { segs: ["orders", "{id}", "item-dates"], modules: ["admin"] },
  { segs: ["orders", "{id}", "status"], modules: ["admin", "warehouse"] },
  // مشتری‌ها / کاتالوگ / جغرافیا — ادمین و CRM
  { segs: ["customers"], modules: ["admin", "crm"] },
  { segs: ["customers", "quick"], modules: ["admin", "crm"] },
  { segs: ["customers", "{id}"], modules: ["admin", "crm"] },
  { segs: ["products"], modules: ["admin"] },
  { segs: ["products", "{id}"], modules: ["admin"] },
  { segs: ["expense-types"], modules: ["admin"] },
  { segs: ["expense-types", "{id}"], modules: ["admin"] },
  { segs: ["locations"], modules: ["admin"] },
  { segs: ["locations", "provinces", "{id}"], modules: ["admin"] },
  { segs: ["locations", "cities", "{id}"], modules: ["admin"] },
  { segs: ["price-lists"], modules: ["admin"] },
  { segs: ["price-lists", "{id}"], modules: ["admin"] },
  // اسناد مالی
  { segs: ["invoices"], modules: ["finance", "admin"] },
  { segs: ["invoices", "{id}"], modules: ["finance", "admin"] },
  { segs: ["pre-invoices"], modules: ["admin", "finance"] },
  { segs: ["pre-invoices", "{id}"], modules: ["admin", "finance"] },
  { segs: ["pre-invoices", "{id}", "convert"], modules: ["admin", "finance"] },
  { segs: ["revenues"], modules: ["finance"] },
  { segs: ["finance"], modules: ["finance"] },
  // هزینه‌ها — چاپ/انبار/مالی ثبت می‌کنند؛ تأیید/حذف کار مالی است
  { segs: ["material-costs"], modules: ["admin", "print", "warehouse", "finance"] },
  { segs: ["material-costs", "{id}"], modules: ["finance", "admin"] },
  // انبار و لجستیک
  { segs: ["materials"], modules: ["warehouse"] },
  { segs: ["materials", "{id}"], modules: ["warehouse"] },
  { segs: ["materials", "{id}", "moves"], modules: ["warehouse"] },
  { segs: ["packages"], modules: ["warehouse"] },
  { segs: ["packages", "{id}"], modules: ["warehouse"] },
  // حقوق — مالی
  { segs: ["payroll"], modules: ["finance"] },
  // کنترل کیفی
  { segs: ["qc-reports"], modules: ["qc", "admin"] },
  { segs: ["qc-reports", "{id}"], modules: ["qc", "admin"] },
  // CRM / SRM
  { segs: ["crm"], modules: ["crm"] },
  { segs: ["deals"], modules: ["crm", "admin"] },
  { segs: ["deals", "{id}"], modules: ["crm", "admin"] },
  { segs: ["activities"], modules: ["crm", "admin"] },
  { segs: ["activities", "{id}"], modules: ["crm", "admin"] },
  { segs: ["srm"], modules: ["srm"] },
  { segs: ["suppliers"], modules: ["srm", "admin"] },
  { segs: ["suppliers", "{id}"], modules: ["srm", "admin"] },
  { segs: ["supplier-categories"], modules: ["srm", "admin"] },
  { segs: ["supplier-categories", "{id}"], modules: ["srm", "admin"] },
  { segs: ["supplier-services"], modules: ["srm", "admin"] },
  { segs: ["supplier-services", "{id}"], modules: ["srm", "admin"] },
  { segs: ["supplier-subcategories"], modules: ["srm", "admin"] },
  { segs: ["supplier-subcategories", "{id}"], modules: ["srm", "admin"] },
  // تسک‌ها — بین‌ماژولی: سطح = بیشینهٔ ماژول‌های کاربر
  { segs: ["tasks"], modules: ALL_WORK_MODULES },
  { segs: ["tasks", "{id}"], modules: ALL_WORK_MODULES },
  // مرخصی — ثبت توسط ادمین
  { segs: ["leaves"], modules: ["admin"] },
  { segs: ["leaves", "{id}"], modules: ["admin"] },
];

/** مالک‌های مسیر داده‌شده (سگمنت‌ها بعد از /api). */
function routeOwners(pathname: string): string[] | null {
  const segs = pathname.split("/").filter(Boolean).slice(1); // حذف "api"
  if (segs.length === 0) return null;
  // بهترین تطابق = بلندترین الگو
  let best: string[] | null = null;
  let bestLen = 0;
  for (const pat of ROUTE_MODULES) {
    if (pat.segs.length !== segs.length) continue;
    const match = pat.segs.every((p, i) => p === "{id}" || p === segs[i]);
    if (match && pat.segs.length > bestLen) {
      best = pat.modules;
      bestLen = pat.segs.length;
    }
  }
  return best;
}

// ─── خواندن امن فیلدهای RBAC از payload کوکی ────────────────────────
type SessionPayload = {
  isDemo?: boolean;
  role?: string;
  moduleLevels?: Record<string, string>;
};

function readSessionPayload(rawCookie: string | undefined): SessionPayload | null {
  if (!rawCookie) return null;
  try {
    const [payloadB64] = rawCookie.split(".");
    if (!payloadB64) return null;
    const json = decodeURIComponent(
      atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json) as SessionPayload;
  } catch {
    return null;
  }
}

const LEVEL_RANK: Record<string, number> = { view: 1, edit: 2, delete: 3 };

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only guard API routes (the app shell is a single SPA route "/" and
  // handles its own auth gate via useAppStore user state + /api/auth/me).
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Public API endpoints (login). /api/auth/me and /api/auth/logout are
  // intentionally NOT public — me returns null when unauthenticated (safe),
  // logout is a no-op without a session.
  // Phase 16: /api/public/* (صفحهٔ عمومی بسته — QR روی بج، بدون لاگین)
  if (PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Coarse presence gate. Real verification in getSession().
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!cookie || cookie.split(".").length !== 2) {
    return NextResponse.json(
      { error: "نشست نامعتبر — ابتدا وارد شوید" },
      { status: 401 }
    );
  }

  const session = readSessionPayload(cookie);

  // ─── Phase 23: دمو = فقط مشاهده ────────────────────────────────
  if (
    session?.isDemo === true &&
    !DEMO_ALLOWED_METHODS.includes(req.method) &&
    !DEMO_WRITABLE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.json(
      { error: "حساب دمو فقط مشاهده است — امکان ثبت یا تغییر داده ندارید" },
      { status: 403 }
    );
  }

  // ─── Phase 24: دسترسی ۳لایهٔ ماژول روی متدهای نوشتاری ──────────
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    const isMaster = session?.role === "master";
    if (!isMaster) {
      const owners = routeOwners(pathname);
      if (owners) {
        const levels = session?.moduleLevels ?? {};
        let rank = 0;
        for (const m of owners) {
          const r = LEVEL_RANK[levels[m]] ?? 0; // ماژول نداشته = 0
          if (r > rank) rank = r;
        }
        // rank=0 → هیچ ماژول مالکی را ندارد؛ گیت خودِ route عهده‌دار ۴۰۳ است
        if (rank > 0) {
          const isDelete = req.method === "DELETE";
          if (rank === 1 || (rank === 2 && isDelete)) {
            return NextResponse.json(
              {
                error:
                  rank === 1
                    ? "سطح دسترسی شما برای این ماژول فقط «مشاهده» است — ثبت یا تغییر مجاز نیست"
                    : "سطح دسترسی شما برای این ماژول «ادیت» است — حذف مجاز نیست",
              },
              { status: 403 }
            );
          }
        }
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
