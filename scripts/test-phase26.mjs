// Printoo24 ERP — Phase 26 test: تسویه گروهی بدهی مشتری
// Run: node scripts/test-phase26.mjs
//
//  1) FIFO خودکار: مبلغ روی سفارش‌های باز همان ارز، قدیمی‌ترین‌اول
//  2) سینک اسناد: پیش‌فاکتور/فاکتور آینه می‌شوند (مسیر موجود paid-sync)
//  3) RevenueLog + OrderEvent (حساس) برای هر ردیف + ارز درست
//  4) کلمپ سروری: تخصیص > ماندهٔ تازه → کلمپ؛ Σ > مبلغ → ترم از انتها
//  5) مازاد (excess): بیش از بدهی → گزارش و ثبت‌نشدن
//  6) تفکیک ارزی: پرداخت USD فقط سفارش‌های USD را می‌بیند
//  7) اعتبارسنجی: مبلغ/ارز/مشتری نامعتبر + بدهی‌نداشتن در ارز
//  8) بدهی باقی‌ماندهٔ پاسخ (remainingDebtPer) دقیق است
//  9) پاک‌سازی کامل دیتای تستی
//
// سنجهٔ سلامت: هیچ ردیفِ سفارش/مشتری واقعی دست نمی‌خورد — همه‌چیز
// با مشتری تستی ساخته می‌شود و آخر کار cascade حذف می‌شود.

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

const MASTER = { email: "admin@printoo24.com", password: "admin123" };
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

// ─── دیتای تستی ────────────────────────────────────────────────────────

const TEST_TAG = `P26TEST-${now}`;
let cust, oA, oB, oC, oD, oE, oF, piB, invC, custNoDebtIqd, oUsdOnly;

async function cleanupLeftovers() {
  // اجرای قبلی ناقص مانده؟ — اول پاک کن تا تست idempotent باشد
  const oldCusts = await db.customer.findMany({
    where: { phone: { in: ["07700000026", "07700000027"] } },
    select: { id: true },
  });
  if (oldCusts.length) {
    const ids = oldCusts.map((c) => c.id);
    await db.preInvoice.deleteMany({ where: { customerId: { in: ids } } });
    await db.invoice.deleteMany({ where: { customerId: { in: ids } } });
    await db.order.deleteMany({ where: { customerId: { in: ids } } });
    await db.customer.deleteMany({ where: { id: { in: ids } } });
  }
}

async function setup() {
  await cleanupLeftovers();
  const maxNumber = (await db.order.aggregate({ _max: { number: true } }))._max.number ?? 0;
  const maxPi = (await db.preInvoice.aggregate({ _max: { number: true } }))._max.number ?? 0;
  const maxInv = (await db.invoice.aggregate({ _max: { number: true } }))._max.number ?? 0;

  cust = await db.customer.create({
    data: { name: `مشتری تست ${TEST_TAG}`, phone: "07700000026" },
  });
  custNoDebtIqd = await db.customer.create({
    data: { name: `مشتری تست USD ${TEST_TAG}`, phone: "07700000027" },
  });

  const mk = (i, days, total, paid, currency = "IQD", status = "pending_design") =>
    db.order.create({
      data: {
        number: maxNumber + i,
        customerId: cust.id,
        status,
        currency,
        totalAmount: total,
        paidAmount: paid,
        createdAt: new Date(now - days * DAY),
      },
    });

  // A: قدیمی‌ترین — 100k بدهی کامل (IQD)
  oA = await mk(1, 6, 100_000, 0);
  // B: 200k کل / 50k پرداخت → 150k مانده (IQD) + پیش‌فاکتور
  oB = await mk(2, 5, 200_000, 50_000);
  // C: 300k بدهی کامل (IQD) + فاکتور صادرشده
  oC = await mk(3, 4, 300_000, 0, "IQD", "warehouse_logistics");
  // D: 500 USD بدهی (ارز دیگر)
  oD = await mk(4, 3, 500, 0, "USD");
  // E: باطل‌شده — 100k (نباید در تسویه بیاید)
  oE = await mk(5, 2, 100_000, 0, "IQD", "cancelled");
  // F: تازه‌ترین — 80k بدهی (IQD)
  oF = await mk(6, 1, 80_000, 0);

  piB = await db.preInvoice.create({
    data: {
      number: maxPi + 1,
      orderId: oB.id,
      customerId: cust.id,
      currency: "IQD",
      status: "converted",
      items: "[]",
      subtotal: 200_000,
      totalAmount: 200_000,
      paidAmount: 50_000,
    },
  });

  invC = await db.invoice.create({
    data: {
      number: maxInv + 1,
      orderId: oC.id,
      customerId: cust.id,
      currency: "IQD",
      status: "issued",
      items: "[]",
      subtotal: 300_000,
      totalAmount: 300_000,
      paidAmount: 0,
    },
  });

  oUsdOnly = await db.order.create({
    data: {
      number: maxNumber + 7,
      customerId: custNoDebtIqd.id,
      currency: "USD",
      totalAmount: 400,
      paidAmount: 0,
    },
  });
}

async function teardown() {
  const ids = [oA?.id, oB?.id, oC?.id, oD?.id, oE?.id, oF?.id, oUsdOnly?.id].filter(Boolean);
  const custIds = [cust?.id, custNoDebtIqd?.id].filter(Boolean);
  // اسناد (پیش‌فاکتور/فاکتور) FK بدون cascade دارند → اول آن‌ها
  if (custIds.length) {
    await db.preInvoice.deleteMany({ where: { customerId: { in: custIds } } });
    await db.invoice.deleteMany({ where: { customerId: { in: custIds } } });
  }
  // رویدادها/لاگ‌های درآمد با cascade سفارش حذف می‌شوند
  if (ids.length) await db.order.deleteMany({ where: { id: { in: ids } } });
  if (custIds.length) await db.customer.deleteMany({ where: { id: { in: custIds } } });
  // پاک‌سازی دفاعی هر ردیف سرگردان
  if (custIds.length) await db.order.deleteMany({ where: { customerId: { in: custIds } } });
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("── Phase 26: تسویه گروهی بدهی مشتری ──\n");

  const login = await api("/api/auth/login", { method: "POST", body: MASTER });
  const cookie = cookieOf(login.setCookie);
  ok(login.status === 200 && !!cookie, "لاگین مستر");

  try {
    await setup();

    // ═══ 1) FIFO خودکار: 250k روی IQD ═══
    console.log("\n■ 1) تخصیص FIFO خودکار (قدیمی‌ترین‌اول)");
    const r1 = await api("/api/finance/bulk-settle", {
      method: "POST",
      cookie,
      body: {
        customerId: cust.id,
        currency: "IQD",
        amount: 250_000,
        method: "cash",
        note: "تست فاز ۲۶ — موج اول",
      },
    });
    ok(r1.status === 201 && r1.data?.ok === true, "POST bulk-settle → 201");
    ok(r1.data?.totalApplied === 250_000, `totalApplied=250k (گرفت: ${r1.data?.totalApplied})`);
    ok(r1.data?.excess === 0, `excess=0 (گرفت: ${r1.data?.excess})`);
    const appliedMap = new Map((r1.data?.applied ?? []).map((a) => [a.number, a.applied]));
    ok(appliedMap.get(oA.number) === 100_000, `سفارش A کامل 100k (گرفت: ${appliedMap.get(oA.number)})`);
    ok(appliedMap.get(oB.number) === 150_000, `سفارش B نیمه→کامل 150k (گرفت: ${appliedMap.get(oB.number)})`);
    ok(!appliedMap.has(oC.number) && !appliedMap.has(oE.number), "C و E در این موج نیامدند");
    ok((r1.data?.applied ?? []).every((a) => a.fullySettled === true), "هر دو ردیف fullySettled");

    const [A, B, C, D, E] = await Promise.all([
      db.order.findUnique({ where: { id: oA.id } }),
      db.order.findUnique({ where: { id: oB.id } }),
      db.order.findUnique({ where: { id: oC.id } }),
      db.order.findUnique({ where: { id: oD.id } }),
      db.order.findUnique({ where: { id: oE.id } }),
    ]);
    ok(A.paidAmount === 100_000, `DB: A.paid=100k (گرفت: ${A.paidAmount})`);
    ok(B.paidAmount === 200_000, `DB: B.paid=200k (گرفت: ${B.paidAmount})`);
    ok(C.paidAmount === 0 && D.paidAmount === 0 && E.paidAmount === 0, "DB: C/D/E دست‌نخورده");

    // ═══ 2) سینک اسناد (مسیر موجود paid-sync) ═══
    console.log("\n■ 2) آینه‌شدن پیش‌فاکتور/فاکتور");
    const pi = await db.preInvoice.findUnique({ where: { id: piB.id } });
    ok(pi.paidAmount === 200_000, `پیش‌فاکتور B سینک شد (گرفت: ${pi.paidAmount})`);

    // ═══ 3) RevenueLog + OrderEvent ═══
    console.log("\n■ 3) دفتر درآمد + رویداد حساس");
    const logs = await db.revenueLog.findMany({
      where: { orderId: { in: [oA.id, oB.id] } },
      orderBy: { amount: "asc" },
    });
    ok(logs.length === 2, `۲ RevenueLog (گرفت: ${logs.length})`);
    ok(
      logs.every((l) => l.currency === "IQD" && l.note?.startsWith("تسویه گروهی")),
      "ارز IQD + یادداشت «تسویه گروهی»"
    );
    ok(
      logs.some((l) => l.amount === 100_000 && l.totalAfter === 100_000) &&
        logs.some((l) => l.amount === 150_000 && l.totalAfter === 200_000),
      "amount/totalAfter دقیق هر ردیف"
    );
    const evs = await db.orderEvent.findMany({
      where: { orderId: { in: [oA.id, oB.id] }, type: "payment_recorded" },
    });
    ok(evs.length === 2 && evs.every((e) => e.sensitive === true), "۲ رویداد حساس payment_recorded");
    ok(evs.every((e) => e.title?.includes("تسویه گروهی")), "عنوان رویداد شامل «تسویه گروهی»");

    // ═══ 4) بدهی باقی‌مانده در پاسخ ═══
    console.log("\n■ 4) remainingDebtPer در پاسخ");
    ok(
      Math.abs((r1.data?.remainingDebtPer?.IQD ?? -1) - 380_000) < 0.01,
      `IQD مانده=380k (C 300k + F 80k) — گرفت: ${r1.data?.remainingDebtPer?.IQD}`
    );
    ok(
      Math.abs((r1.data?.remainingDebtPer?.USD ?? -1) - 500) < 0.01,
      `USD مانده=500 (E باطل حذف) — گرفت: ${r1.data?.remainingDebtPer?.USD}`
    );

    // ═══ 5) کلمپ: تخصیص > مانده → کلمپ؛ Σ ≤ مبلغ می‌ماند ═══
    console.log("\n■ 5) کلمپ سروری تخصیص به ماندهٔ تازه");
    // F مانده 80k؛ می‌فرستیم 200k روی F + 5k روی C با مبلغ کل 100k
    const r2 = await api("/api/finance/bulk-settle", {
      method: "POST",
      cookie,
      body: {
        customerId: cust.id,
        currency: "IQD",
        amount: 100_000,
        allocations: [
          { orderId: oC.id, amount: 5_000 },
          { orderId: oF.id, amount: 200_000 },
        ],
      },
    });
    ok(r2.status === 201, "POST با allocations → 201");
    // F: 200k → کلمپ به 80k؛ Σ = 85k ≤ 100k → بدون ترم
    const m2 = new Map((r2.data?.applied ?? []).map((a) => [a.number, a.applied]));
    ok(m2.get(oF.number) === 80_000, `F کلمپ شد به 80k (گرفت: ${m2.get(oF.number)})`);
    ok(m2.get(oC.number) === 5_000, `C همان 5k (گرفت: ${m2.get(oC.number)})`);
    ok(r2.data?.totalApplied === 85_000 && r2.data?.excess === 15_000, "totalApplied=85k + excess=15k");
    const F = await db.order.findUnique({ where: { id: oF.id } });
    ok(F.paidAmount === 80_000, `DB: F.paid=80k (گرفت: ${F.paidAmount})`);
    const C2 = await db.order.findUnique({ where: { id: oC.id } });
    ok(C2.paidAmount === 5_000, `DB: C.paid=5k (گرفت: ${C2.paidAmount})`);

    // ═══ 6) ترم: Σ تخصیص > مبلغ → از انتها کم می‌شود ═══
    console.log("\n■ 6) ترم Σ>amount از انتهای لیست");
    // C مانده 295k، F دیگر بدهی ندارد → تخصیص فقط روی C
    const r3 = await api("/api/finance/bulk-settle", {
      method: "POST",
      cookie,
      body: {
        customerId: cust.id,
        currency: "IQD",
        amount: 10_000,
        allocations: [{ orderId: oC.id, amount: 50_000 }],
      },
    });
    ok(r3.status === 201 && r3.data?.totalApplied === 10_000, `ترم به amount: 10k (گرفت: ${r3.data?.totalApplied})`);
    const C3 = await db.order.findUnique({ where: { id: oC.id } });
    ok(C3.paidAmount === 15_000, `DB: C.paid=15k (گرفت: ${C3.paidAmount})`);

    // ═══ 7) مازاد: بیش از کل بدهی → excess و ثبت‌نشدن ═══
    console.log("\n■ 7) پرداخت بیش از بدهی → excess");
    // بدهی IQD الان: C 285k — می‌پردازیم 1M
    const r4 = await api("/api/finance/bulk-settle", {
      method: "POST",
      cookie,
      body: { customerId: cust.id, currency: "IQD", amount: 1_000_000 },
    });
    ok(r4.status === 201 && r4.data?.totalApplied === 285_000, `فقط بدهی: 285k (گرفت: ${r4.data?.totalApplied})`);
    ok(r4.data?.excess === 715_000, `excess=715k (گرفت: ${r4.data?.excess})`);
    const C4 = await db.order.findUnique({ where: { id: oC.id } });
    ok(C4.paidAmount === 300_000, `DB: C کامل شد (گرفت: ${C4.paidAmount})`);
    const inv = await db.invoice.findUnique({ where: { id: invC.id } });
    ok(inv.paidAmount === 300_000, `فاکتور C آینه شد (گرفت: ${inv.paidAmount})`);
    ok(
      (r4.data?.remainingDebtPer?.IQD ?? 1) === 0 && (r4.data?.remainingDebtPer?.USD ?? 1) === 500,
      "بدهی IQD صفر شد؛ USD هنوز 500"
    );

    // ═══ 8) تفکیک ارزی: پرداخت USD فقط سفارش USD ═══
    console.log("\n■ 8) تفکیک ارزی");
    const r5 = await api("/api/finance/bulk-settle", {
      method: "POST",
      cookie,
      body: { customerId: cust.id, currency: "USD", amount: 200 },
    });
    ok(r5.status === 201 && r5.data?.totalApplied === 200, "USD 200 تخصیص یافت");
    const D2 = await db.order.findUnique({ where: { id: oD.id } });
    ok(D2.paidAmount === 200, `DB: D.paid=200 USD (گرفت: ${D2.paidAmount})`);
    const usdLogs = await db.revenueLog.findMany({ where: { orderId: oD.id } });
    ok(
      usdLogs.length === 1 && usdLogs[0].currency === "USD" && usdLogs[0].amount === 200,
      "RevenueLog با ارز USD"
    );

    // ═══ 9) اعتبارسنجی‌ها ═══
    console.log("\n■ 9) اعتبارسنجی ورودی");
    const badAmount = await api("/api/finance/bulk-settle", {
      method: "POST",
      cookie,
      body: { customerId: cust.id, currency: "IQD", amount: -5 },
    });
    ok(badAmount.status === 400, "مبلغ منفی → 400");
    const badCur = await api("/api/finance/bulk-settle", {
      method: "POST",
      cookie,
      body: { customerId: cust.id, currency: "EUR", amount: 100 },
    });
    ok(badCur.status === 400, "ارز نامعتبر → 400");
    const badCust = await api("/api/finance/bulk-settle", {
      method: "POST",
      cookie,
      body: { customerId: "nonexistent", currency: "IQD", amount: 100 },
    });
    ok(badCust.status === 404, "مشتری ناموجود → 404");
    const noDebt = await api("/api/finance/bulk-settle", {
      method: "POST",
      cookie,
      body: { customerId: custNoDebtIqd.id, currency: "IQD", amount: 100 },
    });
    ok(noDebt.status === 409, "بدهی در این ارز ندارد → 409");
    // بدون کوکی → 401
    const noAuth = await api("/api/finance/bulk-settle", {
      method: "POST",
      body: { customerId: cust.id, currency: "IQD", amount: 100 },
    });
    ok(noAuth.status === 401, "بدون لاگین → 401");

    // ═══ 10) یکپارچگی نهایی دیتا ═══
    console.log("\n■ 10) یکپارچگی نهایی");
    const finalOrders = await db.order.findMany({ where: { customerId: cust.id } });
    const byNum = new Map(finalOrders.map((o) => [o.number, o]));
    ok(byNum.get(oA.number).paidAmount === 100_000, "A نهایی 100k");
    ok(byNum.get(oB.number).paidAmount === 200_000, "B نهایی 200k");
    ok(byNum.get(oC.number).paidAmount === 300_000, "C نهایی 300k");
    ok(byNum.get(oD.number).paidAmount === 200, "D نهایی 200 USD");
    ok(byNum.get(oE.number).paidAmount === 0, "E باطل دست‌نخورده");
    ok(byNum.get(oF.number).paidAmount === 80_000, "F نهایی 80k");
    const allLogs = await db.revenueLog.findMany({
      where: { orderId: { in: [oA.id, oB.id, oC.id, oD.id, oF.id] } },
    });
    // A=1 + B=1 + C=3 (سه موج: 5k + 10k + 285k) + D=1 + F=1 = 7
    ok(allLogs.length === 7, `۷ RevenueLog — A/B/D/F یکی‌یکی + C سه موج (گرفت: ${allLogs.length})`);
    const allEvents = await db.orderEvent.findMany({
      where: { orderId: { in: [oA.id, oB.id, oC.id, oD.id, oF.id] }, type: "payment_recorded" },
    });
    ok(allEvents.length === 7, `۷ رویداد حساس (گرفت: ${allEvents.length})`);
  } finally {
    await teardown();
    // اطمینان: هیچ ردیف تستی نماند
    const left = await db.order.count({
      where: { customer: { phone: { in: ["07700000026", "07700000027"] } } },
    });
    const leftCust = await db.customer.count({
      where: { phone: { in: ["07700000026", "07700000027"] } },
    });
    ok(left === 0 && leftCust === 0, `پاک‌سازی کامل (order=${left}, customer=${leftCust})`);
  }

  console.log(`\n═══ نتیجه: ${pass} ✅ / ${fail} ❌ ═══`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("💥 خطای تست:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
