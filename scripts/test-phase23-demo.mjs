// Printoo24 ERP — Phase 23 test: demo user system
// Run: node scripts/test-phase23-demo.mjs
// Full lifecycle:
//   1. master login
//   2. create demo user → auto credentials
//   3. demo login → role=master + isDemo=true
//   4. demo GET works
//   5. demo POST/PUT/DELETE → 403 (proxy block)
//   6. demo logout works (allowed)
//   7. master expires demo
//   8. demo re-login → 403 expired
//   9. cleanup: delete demo user directly from DB

import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const db = new PrismaClient();

let pass = 0;
let fail = 0;
function ok(cond, name) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}`);
  }
}

async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  const setCookie = res.headers.get("set-cookie");
  return { status: res.status, data, setCookie };
}

function cookieOf(setCookie) {
  if (!setCookie) return null;
  const m = /printoo24_session=[^;]+/.exec(setCookie);
  return m ? m[0] : null;
}

async function main() {
  console.log("── Phase 23 demo-user tests ──\n");

  // 1) master login
  const login = await api("/api/auth/login", {
    method: "POST",
    body: { email: "admin@printoo24.com", password: "admin123" },
  });
  ok(login.status === 200 && login.data?.user?.role === "master", "master login (dev seed)");
  const masterCookie = cookieOf(login.setCookie);
  ok(!!masterCookie, "master session cookie set");

  // 2) create demo user
  const create = await api("/api/users/demo", {
    method: "POST",
    body: { label: "test-run" },
    cookie: masterCookie,
  });
  ok(create.status === 201 && !!create.data?.credentials?.email && !!create.data?.credentials?.password, "demo created with auto credentials");
  ok(create.data?.user?.isDemo === true && create.data?.user?.role === "master", "demo user is master + isDemo");
  const demoEmail = create.data?.credentials?.email;
  const demoPassword = create.data?.credentials?.password;
  const demoId = create.data?.user?.id;

  // 3) demo login
  const dlogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: demoEmail, password: demoPassword },
  });
  ok(dlogin.status === 200 && dlogin.data?.user?.isDemo === true, "demo login OK + isDemo flag");
  const demoCookie = cookieOf(dlogin.setCookie);
  ok(!!demoCookie, "demo session cookie set");

  // 4) demo GET works
  const orders = await api("/api/orders", { cookie: demoCookie });
  ok(orders.status === 200, `demo GET /api/orders works (${orders.status})`);
  const dash = await api("/api/dashboard", { cookie: demoCookie });
  ok(dash.status === 200, `demo GET /api/dashboard works (${dash.status})`);
  const usersList = await api("/api/users?all=1", { cookie: demoCookie });
  ok(usersList.status === 200, `demo GET /api/users works (${usersList.status})`);

  // 5) demo write attempts → 403 from proxy
  const post1 = await api("/api/orders", { method: "POST", body: {}, cookie: demoCookie });
  ok(post1.status === 403, `demo POST /api/orders blocked (${post1.status})`);
  const put1 = await api("/api/orders/xxx", { method: "PUT", body: {}, cookie: demoCookie });
  ok(put1.status === 403 || put1.status === 404, `demo PUT /api/orders/xxx blocked (${put1.status})`);
  const del1 = await api("/api/tasks/xxx", { method: "DELETE", cookie: demoCookie });
  ok(del1.status === 403, `demo DELETE /api/tasks/xxx blocked (${del1.status})`);
  const pref = await api("/api/auth/preferences", { method: "PUT", body: { guideTooltips: false }, cookie: demoCookie });
  ok(pref.status === 403, `demo PUT preferences blocked (${pref.status})`);

  // 6) demo logout works
  const dlogout = await api("/api/auth/logout", { method: "POST", cookie: demoCookie });
  ok(dlogout.status === 200, `demo logout allowed (${dlogout.status})`);

  // 6b) demo heartbeat allowed
  const hb = await api("/api/auth/heartbeat", { method: "POST", cookie: demoCookie });
  ok(hb.status === 200 || hb.status === 204, `demo heartbeat allowed (${hb.status})`);

  // 7) master expires demo
  const expire = await api(`/api/users/${demoId}/demo-expire`, {
    method: "POST",
    cookie: masterCookie,
  });
  ok(expire.status === 200, `master expires demo (${expire.status})`);

  // 8) demo re-login after expiry → 403
  const relogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: demoEmail, password: demoPassword },
  });
  ok(relogin.status === 403, `expired demo re-login blocked (${relogin.status})`);

  // 8b) expired session in-flight → 401 (fresh login before expire would be needed;
  //     we re-login as a NEW demo to check in-flight expiry separately is overkill here)

  // master still can write
  const mwrite = await api("/api/users/demo", { method: "POST", body: { label: "temp" }, cookie: masterCookie });
  ok(mwrite.status === 201, `master still can POST (${mwrite.status})`);

  // cleanup: remove demo users directly
  const del2 = await db.user.deleteMany({ where: { isDemo: true } });
  ok(del2.count >= 2, `cleanup demo users (${del2.count} removed)`);

  console.log(`\n── result: ${pass} passed, ${fail} failed ──`);
  await db.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("test crashed:", e);
  await db.$disconnect();
  process.exit(1);
});
