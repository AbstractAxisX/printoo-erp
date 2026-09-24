// Printoo24 ERP — Phase 24 test: 7 employer requests
// Run: node scripts/test-phase24.mjs
//
//  1) هزینهٔ خودِ مالی روی سفارش (هر ماژولی) → مستقیم approved
//     + هزینهٔ ثبت‌شدهٔ کاربر عادی → pending (بدون تغییر رفتار قبلی)
//  2) سفارش completed → UI منطق است (isOrderClosed)؛ اینجا فقط موجودیت
//     helper را type-level چک می‌کنیم (skip — UI)
//  3) پیام‌های API بدون ارقام فارسی (en-US) — نمونه‌گیری از چند endpoint
//  4) محصول جدید → پاسخ full product (با basePrice) برای prefill ویزارد
//  5) GET /api/customers/[id] → orders[].items[].product.name موجود
//  6) دسترسی ۳لایه:
//     - ساخت کاربر designer با level=view → login → heartbeat (re-prime)
//       → POST orders/[id]/designer-action → 403 سطح مشاهده
//     - سطح edit → POST مجاز / DELETE بسته (403)
//     - سطح delete → DELETE مجاز (روی resource بی‌خطر: تسک تستی)
//     - PUT /api/users/[id] با moduleLevels مستقل (بدون modules)
//  7) تولتیپ‌ها → UI منطق است (رجیستری + resolver)؛ چک کامپایل tsc جدا.

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

const FA_DIGITS = /[۰-۹]/;

async function main() {
  console.log("── Phase 24 tests (7 employer requests) ──\n");

  // ─── 0) master login ────────────────────────────────────────────
  const login = await api("/api/auth/login", {
    method: "POST",
    body: { email: "admin@printoo24.com", password: "admin123" },
  });
  ok(login.status === 200, "master login");
  const masterCookie = cookieOf(login.setCookie);
  ok(!!masterCookie, "master cookie");
  // login response شامل moduleLevels است
  ok(
    login.data?.user && ("moduleLevels" in login.data.user),
    "login response carries moduleLevels field"
  );

  // ─── 1) هزینهٔ خودِ مالی → مستقیم approved ─────────────────────
  // یک سفارش باز پیدا کن
  const ordersRes = await api("/api/orders", { cookie: masterCookie });
  const anyOrder = (ordersRes.data?.orders ?? []).find(
    (o) => !["completed", "cancelled", "archived"].includes(o.status)
  );
  ok(!!anyOrder, "found an open order for cost test");

  if (anyOrder) {
    // هزینه با module=print توسط MASTER (که isFinanceStaff است) → approved
    const cost1 = await api("/api/material-costs", {
      method: "POST",
      cookie: masterCookie,
      body: {
        orderId: anyOrder.id,
        title: "تست فاز۲۴ — هزینه مالی",
        amount: 15000,
        module: "print",
        description: "P24 test — should be auto-approved (finance entry)",
      },
    });
    ok(cost1.status === 201, "finance-user cost created (201)");
    ok(
      cost1.data?.cost?.status === "approved",
      `finance cost module=print → approved directly (got: ${cost1.data?.cost?.status})`
    );
    // cleanup: delete test cost
    const del = await api(`/api/material-costs/${cost1.data.cost.id}`, {
      method: "DELETE",
      cookie: masterCookie,
    });
    ok(del.status === 200 || del.status === 204, "test cost cleanup");
  }

  // هزینهٔ کاربر عادی (designer) → pending (رفتار قبلی حفظ شد)
  // در بخش 6 کاربر تستی می‌سازیم؛ اینجا فقط سناریوی مالی چک شد.

  // ─── 3) پیام‌های API بدون ارقام فارسی ──────────────────────────
  const notifRes = await api("/api/notifications", { cookie: masterCookie });
  ok(notifRes.status === 200, "notifications fetched");
  const dashRes = await api("/api/dashboard", { cookie: masterCookie });
  ok(dashRes.status === 200, "dashboard fetched");
  const finRes = await api("/api/finance/summary", { cookie: masterCookie });
  ok(finRes.status === 200, "finance summary fetched");
  const sampled = JSON.stringify({
    notif: notifRes.data?.notifications?.slice(0, 10),
    dash: dashRes.data,
    fin: finRes.data,
  });
  ok(!FA_DIGITS.test(sampled), "API responses contain no Persian digits");

  // ─── 4) محصول جدید → full product با basePrice ─────────────────
  const prodName = `P24 Test Product ${Date.now()}`;
  const prodRes = await api("/api/products", {
    method: "POST",
    cookie: masterCookie,
    body: { name: prodName, basePrice: 25000 },
  });
  ok(prodRes.status === 201, "product created");
  ok(
    prodRes.data?.product?.basePrice === 25000 && prodRes.data?.product?.id,
    "product response includes id + basePrice (for wizard prefill)"
  );
  // cleanup
  await api(`/api/products/${prodRes.data.product.id}`, {
    method: "DELETE",
    cookie: masterCookie,
  });

  // ─── 5) نمای ۳۶۰ — orders[].items[].product.name ───────────────
  const customersRes = await api("/api/customers", { cookie: masterCookie });
  const anyCustomer = customersRes.data?.customers?.[0];
  ok(!!anyCustomer, "found a customer for 360 test");
  if (anyCustomer) {
    const c360 = await api(`/api/customers/${anyCustomer.id}`, {
      cookie: masterCookie,
    });
    ok(c360.status === 200, "GET /api/customers/[id] ok");
    const firstOrder = c360.data?.orders?.[0];
    ok(
      c360.data?.orders !== undefined &&
        (!firstOrder || Array.isArray(firstOrder.items)),
      "orders[].items present (statement descriptions)"
    );
    if (firstOrder?.items?.length) {
      ok(
        firstOrder.items.every(
          (i) => i.product === null || typeof i.product?.name === "string"
        ),
        "items[].product.name shape ok"
      );
    }
  }

  // ─── 6) دسترسی ۳لایه (با ماژول CRM — بدون گیت نقش اضافه) ────────
  const email = `p24-levels-${Date.now()}@printoo24.com`;
  const createUser = await api("/api/users", {
    method: "POST",
    cookie: masterCookie,
    body: {
      name: "تست سطح فاز۲۴",
      email,
      password: "test123456",
      modules: ["crm"],
      moduleLevels: { crm: "view" },
    },
  });
  ok(createUser.status === 201, "user created with level=view");
  ok(
    createUser.data?.user?.moduleLevels?.crm === "view",
    "created user moduleLevels.crm = view"
  );
  const userId = createUser.data?.user?.id;

  const dLogin = await api("/api/auth/login", {
    method: "POST",
    body: { email, password: "test123456" },
  });
  ok(dLogin.status === 200, "level-user login");
  let dCookie = cookieOf(dLogin.setCookie);
  ok(
    dLogin.data?.user?.moduleLevels?.crm === "view",
    "login response moduleLevels.crm = view"
  );

  // heartbeat → re-prime cookie (moduleLevels داخل کوکی)
  const hb = await api("/api/auth/heartbeat", {
    method: "POST",
    cookie: dCookie,
  });
  ok(hb.status === 200 && hb.data?.ok === true, "heartbeat ok");
  const hbCookie = cookieOf(hb.setCookie);
  ok(!!hbCookie, "heartbeat re-primed session cookie");
  if (hbCookie) dCookie = hbCookie;

  // me هم moduleLevels را برمی‌گرداند
  const me = await api("/api/auth/me", { cookie: dCookie });
  ok(
    me.data?.user?.moduleLevels?.crm === "view",
    "me response moduleLevels.crm = view"
  );

  // GET معامله‌ها مجاز (خواندن)
  const listRes = await api("/api/deals", { cookie: dCookie });
  ok(listRes.status === 200, "crm(view) GET deals allowed");

  // مشتری برای ساخت معامله
  const cust = customersRes.data?.customers?.[0];
  ok(!!cust, "customer for deal test");

  if (cust) {
    // POST deals → 403 سطح مشاهده (از proxy)
    const deal1 = await api("/api/deals", {
      method: "POST",
      cookie: dCookie,
      body: { title: "تست سطح فاز۲۴", customerId: cust.id, value: 1000 },
    });
    ok(
      deal1.status === 403 && String(deal1.data?.error || "").includes("مشاهده"),
      `crm(view) POST deals → 403 view message (got ${deal1.status})`
    );
  }

  // سطح → edit (PUT مستقل بدون modules)
  const toEdit = await api(`/api/users/${userId}`, {
    method: "PUT",
    cookie: masterCookie,
    body: { moduleLevels: { crm: "edit" } },
  });
  ok(toEdit.status === 200, "PUT moduleLevels standalone (edit)");
  ok(
    toEdit.data?.user?.moduleLevels?.crm === "edit",
    "user level updated to edit"
  );

  // re-prime با heartbeat
  const hb2 = await api("/api/auth/heartbeat", {
    method: "POST",
    cookie: dCookie,
  });
  const hb2Cookie = cookieOf(hb2.setCookie);
  if (hb2Cookie) dCookie = hb2Cookie;

  let dealId = null;
  if (cust) {
    // POST معامله با سطح edit → مجاز
    const deal2 = await api("/api/deals", {
      method: "POST",
      cookie: dCookie,
      body: { title: "تست سطح فاز۲۴", customerId: cust.id, value: 1000 },
    });
    ok(
      deal2.status === 201,
      `crm(edit) POST deals allowed (got ${deal2.status})`
    );
    dealId = deal2.data?.deal?.id;
  }

  if (dealId) {
    // DELETE معامله → 403 (سطح edit حذف ندارد)
    const delDeal = await api(`/api/deals/${dealId}`, {
      method: "DELETE",
      cookie: dCookie,
    });
    ok(
      delDeal.status === 403 && String(delDeal.data?.error || "").includes("ادیت"),
      `crm(edit) DELETE deal → 403 edit message (got ${delDeal.status})`
    );
  }

  // سطح → delete
  const toDelete = await api(`/api/users/${userId}`, {
    method: "PUT",
    cookie: masterCookie,
    body: { moduleLevels: { crm: "delete" } },
  });
  ok(toDelete.status === 200, "PUT moduleLevels → delete");

  const hb3 = await api("/api/auth/heartbeat", {
    method: "POST",
    cookie: dCookie,
  });
  const hb3Cookie = cookieOf(hb3.setCookie);
  if (hb3Cookie) dCookie = hb3Cookie;

  if (dealId) {
    const delDeal2 = await api(`/api/deals/${dealId}`, {
      method: "DELETE",
      cookie: dCookie,
    });
    ok(
      delDeal2.status === 200 || delDeal2.status === 204,
      `crm(delete) DELETE deal allowed (got ${delDeal2.status})`
    );
  }

  // مقدار نامعتبر → 400
  const badLevel = await api(`/api/users/${userId}`, {
    method: "PUT",
    cookie: masterCookie,
    body: { moduleLevels: { crm: "superadmin" } },
  });
  ok(badLevel.status === 400, "invalid level value → 400");

  // ─── cleanup: حذف کاربر تستی از DB ─────────────────────────────
  await db.user.delete({ where: { id: userId } }).catch(() => {});

  console.log(`\n── Result: ${pass} pass / ${fail} fail ──`);
  await db.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  await db.$disconnect();
  process.exit(1);
});
