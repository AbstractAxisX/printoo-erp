// تست پروداکشن — ساخت دمو مستقیم در DB (بدون نیاز به رمز ادمین)،
// سپس ورود/بلاک/اکسپایر از بیرون با curl-معادل fetch.
// Run ON SERVER: cd /opt/printoo24-admin && node scripts/server/prod-verify-phase23.mjs
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const BASE = "http://127.0.0.1:3000";
const EMAIL = "demo.probe@printoo24.demo";
const PASSWORD = "ProbeTest123456";

let pass = 0, fail = 0;
const ok = (c, name) => { c ? pass++ : fail++; console.log(`  ${c ? "✅" : "❌"} ${name}`); };

async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, setCookie: res.headers.get("set-cookie") };
}
const cookieOf = (sc) => sc ? (/printoo24_session=[^;]+/.exec(sc)?.[0] ?? null) : null;

async function main() {
  console.log("── Phase 23 production verification ──\n");

  // 0) صفحه اصلی بالا است
  const home = await fetch(BASE);
  ok(home.status === 200, `app serves / (${home.status})`);

  // 1) ساخت دمو مستقیم در DB
  await db.user.deleteMany({ where: { email: EMAIL } });
  const demo = await db.user.create({
    data: {
      name: "دموی تست پروداکشن",
      email: EMAIL,
      password: await bcrypt.hash(PASSWORD, 10),
      role: "master",
      isDemo: true,
      guideTooltips: true,
    },
  });
  ok(!!demo.id, "demo user created in DB");

  // 2) ورود دمو
  const login = await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
  ok(login.status === 200 && login.data?.user?.isDemo === true, `demo login (${login.status})`);
  const cookie = cookieOf(login.setCookie);
  ok(!!cookie, "demo session cookie");

  // 3) خواندن مجاز
  const me = await api("/api/auth/me", { cookie });
  ok(me.status === 200 && me.data?.user?.isDemo === true && me.data?.user?.guideTooltips === true, `demo me + flags (${me.status})`);
  const orders = await api("/api/orders", { cookie });
  ok(orders.status === 200, `demo GET orders (${orders.status})`);

  // 4) نوشتن ممنوع (proxy)
  const w1 = await api("/api/orders", { method: "POST", body: {}, cookie });
  ok(w1.status === 403, `demo POST orders blocked (${w1.status})`);
  const w2 = await api("/api/auth/preferences", { method: "PUT", body: { guideTooltips: false }, cookie });
  ok(w2.status === 403, `demo PUT preferences blocked (${w2.status})`);
  const w3 = await api("/api/tasks/xx", { method: "DELETE", cookie });
  ok(w3.status === 403, `demo DELETE blocked (${w3.status})`);

  // 5) خروج مجاز
  const lo = await api("/api/auth/logout", { method: "POST", cookie });
  ok(lo.status === 200, `demo logout allowed (${lo.status})`);

  // 6) اکسپایر مستقیم در DB → فراخوانی بعدی 401
  const relogin = await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
  ok(relogin.status === 200, "demo re-login for in-flight expiry test");
  const c2 = cookieOf(relogin.setCookie);
  await db.user.update({ where: { id: demo.id }, data: { demoExpiresAt: new Date() } });
  const after = await api("/api/auth/me", { cookie: c2 });
  ok(after.status === 401, `expired demo kicked (${after.status})`);
  const relogin2 = await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
  ok(relogin2.status === 403, `expired demo login blocked (${relogin2.status})`);

  // 7) پاک‌سازی
  await db.user.deleteMany({ where: { email: EMAIL } });
  const left = await db.user.count({ where: { isDemo: true } });
  ok(left === 0, `cleanup done (remaining demos: ${left})`);

  console.log(`\n── result: ${pass} passed, ${fail} failed ──`);
  await db.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error("crashed:", e); await db.$disconnect(); process.exit(1); });
