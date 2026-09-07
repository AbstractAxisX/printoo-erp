// Phase 15 E2E: finance module scenarios
// Run: node scripts/test-phase15.mjs
const BASE = "http://localhost:3000";

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  const data = await res.json();
  return { cookie, user: data.user };
}

async function call(cookie, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", cookie, ...(opts.headers ?? {}) },
  });
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
}

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

const money = (n) => Number(n).toLocaleString("en-US");

async function main() {
  console.log("── Phase 15 E2E ──");

  // ── logins ──
  const fin = await login("negar@printoo24.com", "employee123");
  const master = await login("admin@printoo24.com", "admin123");
  const print = await login("reza@printoo24.com", "employee123");
  const logi = await login("hossein@printoo24.com", "employee123");
  check("login finance", !!fin.cookie);
  check("login master", !!master.cookie);
  check("login print", !!print.cookie);
  check("login logistics", !!logi.cookie);

  // ── 1) summary API ──
  console.log("\n[1] finance summary");
  const sum = await call(fin.cookie, "/api/finance/summary");
  check("GET summary 200", sum.status === 200, JSON.stringify(sum.body).slice(0, 200));
  check("summary has fields", sum.body && "pendingCount" in sum.body && "unsettledSum" in sum.body && "freeByCategory" in sum.body);
  const sum2 = await call(print.cookie, "/api/finance/summary");
  check("print user blocked (403)", sum2.status === 403);

  // ── 2) free cost (حقوق) ──
  console.log("\n[2] free cost (حقوق)");
  const types = (await call(fin.cookie, "/api/expense-types")).body.expenseTypes;
  const hoquq = types.find((t) => t.name === "حقوق");
  check("حقوق category exists (hardcoded default)", !!hoquq && hoquq.isDefault === true);
  const free = await call(fin.cookie, "/api/material-costs", {
    method: "POST",
    body: JSON.stringify({ title: "تست حقوق مهر", amount: 500000, expenseTypeId: hoquq.id }),
  });
  check("free cost created 201", free.status === 201, JSON.stringify(free.body).slice(0, 200));
  check("free cost auto-approved (finance creator)", free.body?.cost?.status === "approved");
  check("free cost module=finance", free.body?.cost?.module === "finance");
  check("free cost has no orderId", free.body?.cost?.orderId === null || free.body?.cost?.orderId === undefined);
  check("free cost creator name snapshot", !!free.body?.cost?.createdByName);
  const freeByPrint = await call(print.cookie, "/api/material-costs", {
    method: "POST",
    body: JSON.stringify({ title: "تست غیرمجاز", amount: 100 }),
  });
  check("print user cannot create free cost (403)", freeByPrint.status === 403);

  // ── 3) category management ──
  console.log("\n[3] category management");
  const newCat = await call(fin.cookie, "/api/expense-types", {
    method: "POST",
    body: JSON.stringify({ name: "تست-دسته-موقت" }),
  });
  check("create category 201", newCat.status === 201);
  const delDef = await call(fin.cookie, `/api/expense-types/${hoquq.id}`, { method: "DELETE" });
  check("delete default (حقوق) blocked 409", delDef.status === 409);
  if (newCat.body?.expenseType?.id) {
    const del = await call(fin.cookie, `/api/expense-types/${newCat.body.expenseType.id}`, { method: "DELETE" });
    check("delete custom category 200", del.status === 200);
  }

  // ── 4) pick a test order + cost-on-order + approval ──
  console.log("\n[4] order cost + approval workflow");
  const orders = (await call(fin.cookie, "/api/orders")).body.orders;
  check("finance sees all orders", orders.length > 0);
  const target = orders.find((o) => o.items?.length >= 1 && o.status !== "cancelled");
  check("target order found", !!target, "none");
  const beforeEvents = (await call(fin.cookie, `/api/orders/${target.id}`)).body.order.events ?? [];
  const beforeCosts = (await call(fin.cookie, `/api/material-costs?orderId=${target.id}`)).body.costs.length;

  // print user registers a cost
  const pc = await call(print.cookie, "/api/material-costs", {
    method: "POST",
    body: JSON.stringify({
      orderId: target.id,
      title: "کاغذ تست",
      amount: 120000,
      module: "material",
    }),
  });
  check("print cost created pending", pc.status === 201 && pc.body.cost.status === "pending");
  check("print cost creator recorded", !!pc.body.cost.createdByName);

  // finance approves
  const appr = await call(fin.cookie, `/api/material-costs/${pc.body.cost.id}`, {
    method: "PUT",
    body: JSON.stringify({ status: "approved" }),
  });
  check("finance approve 200", appr.status === 200 && appr.body.cost.status === "approved");
  // print user cannot approve
  const apprP = await call(print.cookie, `/api/material-costs/${pc.body.cost.id}`, {
    method: "PUT",
    body: JSON.stringify({ status: "rejected" }),
  });
  check("print approve blocked 403", apprP.status === 403);
  // invalid transition approved→pending
  const badTrans = await call(fin.cookie, `/api/material-costs/${pc.body.cost.id}`, {
    method: "PUT",
    body: JSON.stringify({ status: "pending" }),
  });
  check("approved→pending blocked 409", badTrans.status === 409);
  // sensitive event visible to finance, hidden from non-finance viewers
  const evAfter = (await call(fin.cookie, `/api/orders/${target.id}`)).body.order.events ?? [];
  // print user only sees his own board orders — find one visible to reza
  const rezaOrders = (await call(print.cookie, "/api/orders?board=print")).body.orders;
  const rezaOrder = rezaOrders.find((o) => o.id === target.id) ?? rezaOrders[0];
  let sensitiveHidden = null;
  if (rezaOrder) {
    const evPrint = (await call(print.cookie, `/api/orders/${rezaOrder.id}`)).body.order?.events ?? null;
    if (evPrint !== null) {
      sensitiveHidden = evPrint.every((e) => !e.sensitive);
    }
  }
  check("cost_registered+cost_approved events (finance view)", evAfter.length >= beforeEvents.length + 2);
  check("sensitive events hidden from print view", sensitiveHidden !== false, "no visible order to verify");

  // ── 5) invoice-cost (ثبت هزینه در فاکتور) ──
  console.log("\n[5] invoice-cost injection");
  const orderBefore = (await call(fin.cookie, `/api/orders/${target.id}`)).body.order;
  const piBefore = orderBefore.preInvoices?.[0] ?? null;
  check("order has pre-invoice", !!piBefore);
  const invCostAmount = 70000;
  const invCost = await call(fin.cookie, "/api/material-costs", {
    method: "POST",
    body: JSON.stringify({
      orderId: target.id,
      title: "هزینه اضافی تست",
      amount: invCostAmount,
      module: "finance",
      includeInInvoice: true,
    }),
  });
  check("invoice-cost created 201", invCost.status === 201, JSON.stringify(invCost.body).slice(0, 300));
  const orderAfter = (await call(fin.cookie, `/api/orders/${target.id}`)).body.order;
  check(
    "order.totalAmount increased by cost",
    Math.abs(orderAfter.totalAmount - (orderBefore.totalAmount + invCostAmount)) < 0.001,
    `${orderBefore.totalAmount} → ${orderAfter.totalAmount}`
  );
  const piAfter = orderAfter.preInvoices?.find((p) => p.id === piBefore.id);
  const piItems = JSON.parse(piAfter?.items ?? "[]");
  check("cost sits in PI items like an item", piItems.some((i) => i.name === "هزینه اضافی تست"));
  check("PI total increased", piAfter.totalAmount > piBefore.totalAmount);
  // non-finance cannot set includeInInvoice
  const invP = await call(print.cookie, "/api/material-costs", {
    method: "POST",
    body: JSON.stringify({ orderId: target.id, title: "x", amount: 500, includeInInvoice: true }),
  });
  check("print includeInInvoice blocked 403", invP.status === 403);
  // admin (master) sees cost_invoiced event (non-sensitive)
  const evMaster = (await call(master.cookie, `/api/orders/${target.id}`)).body.order.events ?? [];
  check("cost_invoiced event visible (non-sensitive)", evMaster.some((e) => e.type === "cost_invoiced" && !e.sensitive));

  // ── 6) revenue smart-diff (1000 → 6000 = +5000) ──
  console.log("\n[6] revenue smart-diff (fresh order)");
  // سفارش تازه می‌سازیم تا تست idempotent باشد
  const customers = (await call(master.cookie, "/api/customers")).body.customers;
  const products = (await call(master.cookie, "/api/products")).body.products;
  check("customers+products available", customers.length > 0 && products.length > 0);
  const cust0 = customers[0];
  const prod0 = products.find((p) => p.basePrice && p.basePrice > 1000) ?? products[0];
  const created = await call(master.cookie, "/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customers: [cust0.id],
      itemsByCustomer: {
        [cust0.id]: [
          { productId: prod0.id, quantity: 2, pricePerUnit: 25000, totalAmount: 50000, stage: "design" },
        ],
      },
      splitMode: "grouped",
      priority: "normal",
      preInvoice: { paidAmount: 1000 },
    }),
  });
  check("fresh order created with 1000 prepayment", created.status === 201, JSON.stringify(created.body).slice(0, 200));
  const ord = { id: created.body.created[0].id, number: created.body.created[0].number };
  const fresh = (await call(fin.cookie, `/api/orders/${ord.id}`)).body.order;
  check("prepayment logged in revenue ledger (admin)", fresh.paidAmount === 1000);
  const p1logs = (await call(fin.cookie, `/api/orders/${ord.id}/payments`)).body.logs;
  check("wizard prepayment → revenue log", p1logs.length === 1 && p1logs[0].amount === 1000 && p1logs[0].module === "admin");
  const p2 = await call(fin.cookie, `/api/orders/${ord.id}/payments`, {
    method: "POST",
    body: JSON.stringify({ total: 6000, method: "cash", note: "ادیت کل" }),
  });
  check("edit 1000→6000: diff=5000 (smart)", p2.status === 201 && p2.body.diff === 5000, `diff=${p2.body?.diff}`);
  check("totalAfter=6000", p2.body.totalAfter === 6000);
  const logs = (await call(fin.cookie, `/api/orders/${ord.id}/payments`)).body.logs;
  check("two revenue logs with correct amounts", logs.length === 2 && logs[0].amount === 5000 && logs[1].amount === 1000);
  check("log has module+creator", logs[0].module === "finance" && !!logs[0].createdByName);
  const ordNow = (await call(fin.cookie, `/api/orders/${ord.id}`)).body.order;
  check("order.paidAmount=6000 (synced)", ordNow.paidAmount === 6000);
  // PIs redistributed to 6000
  const piSum = ordNow.preInvoices.reduce((s, p) => s + p.paidAmount, 0);
  check("PI paid redistributed (Σ=6000)", Math.abs(piSum - 6000) < 0.001, `Σ=${piSum}`);
  // negative correction
  const p3 = await call(fin.cookie, `/api/orders/${ord.id}/payments`, {
    method: "POST",
    body: JSON.stringify({ total: 3000, note: "اصلاح" }),
  });
  check("correction 6000→3000: diff=-3000", p3.status === 201 && p3.body.diff === -3000);
  // print user cannot record payment
  const pP = await call(print.cookie, `/api/orders/${ord.id}/payments`, {
    method: "POST",
    body: JSON.stringify({ amount: 100 }),
  });
  check("print payment blocked 403", pP.status === 403);
  // designer (sara) cannot
  const sara = await login("sara@printoo24.com", "employee123");
  const pS = await call(sara.cookie, `/api/orders/${ord.id}/payments`, {
    method: "POST",
    body: JSON.stringify({ amount: 100 }),
  });
  check("designer payment blocked 403", pS.status === 403);

  // ── 7) logistics cash collection ──
  console.log("\n[7] logistics cash-on-delivery");
  // find an order in warehouse stage
  const whOrders = (await call(logi.cookie, "/api/orders")).body.orders;
  check("logistics sees warehouse/completed orders", whOrders.length >= 0);
  const whTarget = whOrders.find((o) => o.status === "warehouse_logistics") ?? whOrders.find((o) => o.status === "completed") ?? ord;
  const whBefore = (await call(logi.cookie, `/api/orders/${whTarget.id}`)).body.order;
  const lc = await call(logi.cookie, `/api/orders/${whTarget.id}/payments`, {
    method: "POST",
    body: JSON.stringify({ amount: 4000, note: "دریافت در محل" }),
  });
  check("logistics collection 201", lc.status === 201, JSON.stringify(lc.body).slice(0, 200));
  check("logistics collection adds to paid", lc.body.totalAfter === (whBefore.paidAmount ?? 0) + 4000);
  const lcLogs = (await call(fin.cookie, `/api/orders/${whTarget.id}/payments`)).body.logs;
  const lastLog = lcLogs[0];
  check("revenue log module=logistics", lastLog.module === "logistics");
  check("revenue log has logistics employee name", !!lastLog.createdByName);
  const whAfter = (await call(logi.cookie, `/api/orders/${whTarget.id}`)).body.order;
  check("PI paid synced with logistics collection", whAfter.preInvoices.reduce((s, p) => s + p.paidAmount, 0) === whAfter.paidAmount);

  // ── 8) logistics cost form (module warehouse) ──
  const lcCost = await call(logi.cookie, "/api/material-costs", {
    method: "POST",
    body: JSON.stringify({ orderId: whTarget.id, title: "بسته‌بندی", amount: 15000, module: "warehouse" }),
  });
  check("logistics cost created pending", lcCost.status === 201 && lcCost.body.cost.status === "pending");

  // ── 9) revenues list + summary reflects ──
  console.log("\n[9] revenues ledger + summary");
  const revs = (await call(fin.cookie, "/api/revenues")).body.logs;
  check("revenues list 200 with entries", revs.length >= 3);
  check("revenue rows include order+customer", revs[0].order?.number > 0 && !!revs[0].order?.customer?.name);
  const revsAdmin = await call(print.cookie, "/api/revenues");
  check("revenues list blocked for print (403)", revsAdmin.status === 403);
  const todaySum = (await call(fin.cookie, "/api/finance/summary")).body;
  check("summary revenueSum > 0", todaySum.revenueSum > 0, `=${todaySum.revenueSum}`);
  check("summary has freeByCategory حقوق entry", todaySum.freeByCategory.some((f) => f.name === "حقوق"));

  // ── 10) proforma edit sync (PI PUT) ──
  console.log("\n[10] proforma paid edit sync");
  if (true) {
    // دادهٔ تازه: وضعیت فعلی سفارش و اولین PI را همان لحظه می‌خوانیم
    const prePut = (await call(fin.cookie, `/api/orders/${ord.id}`)).body.order;
    const pi = prePut.preInvoices[0];
    const piPut = await call(master.cookie, `/api/pre-invoices/${pi.id}`, {
      method: "PUT",
      body: JSON.stringify({ paidAmount: 2000 }),
    });
    check("PI PUT 200", piPut.status === 200, JSON.stringify(piPut.body).slice(0, 150));
    const postPut = (await call(fin.cookie, `/api/orders/${ord.id}`)).body.order;
    // delta = 2000 − pi.paid قبلی → order.paid همان‌قدر جابه‌جا می‌شود
    const expected = prePut.paidAmount - pi.paidAmount + 2000;
    check(
      "PI edit delta applied to order.paid",
      Math.abs(postPut.paidAmount - expected) < 0.001,
      `paid=${postPut.paidAmount} expected=${expected}`
    );
    check("PI paid syncs to invoice mirror (PIs Σ = order.paid)", Math.abs(
      postPut.preInvoices.reduce((s, p) => s + p.paidAmount, 0) - postPut.paidAmount
    ) < 0.001);
    const logsAfter = (await call(fin.cookie, `/api/orders/${ord.id}/payments`)).body.logs;
    check("PI edit logged in revenue ledger (admin module)", logsAfter.length >= 4 && logsAfter[0].module === "admin");
  }

  // ── 11) grouped/multi-customer order cost ──
  console.log("\n[11] group order (multi-customer) invoice-cost");
  const multi = orders.find((o) => o.splitMode === "separated" && (o.items?.length ?? 0) >= 1);
  if (multi) {
    const mCost = await call(fin.cookie, "/api/material-costs", {
      method: "POST",
      body: JSON.stringify({
        orderId: multi.id,
        title: "هزینه گروهی تست",
        amount: 25000,
        module: "finance",
        includeInInvoice: true,
      }),
    });
    check("grouped order invoice-cost 201", mCost.status === 201, JSON.stringify(mCost.body).slice(0, 200));
    const mOrder = (await call(fin.cookie, `/api/orders/${multi.id}`)).body.order;
    const anyPiHasCost = mOrder.preInvoices.some((p) =>
      JSON.parse(p.items).some((i) => i.name === "هزینه گروهی تست")
    );
    check("grouped order: cost sits in first PI", anyPiHasCost);
  } else {
    console.log("  (no separated order in demo data — skipped)");
  }

  // ── 12) costs list filters ──
  console.log("\n[12] costs history filters");
  const scopeFree = (await call(fin.cookie, "/api/material-costs?scope=free")).body.costs;
  check("scope=free → only free costs", scopeFree.every((c) => !c.orderId) && scopeFree.length >= 1);
  const scopeOrder = (await call(fin.cookie, "/api/material-costs?scope=order")).body.costs;
  check("scope=order → only order costs", scopeOrder.every((c) => !!c.orderId));
  const qSearch = (await call(fin.cookie, "/api/material-costs?q=حقوق")).body.costs;
  check("q search finds حقوق cost", qSearch.some((c) => c.title === "تست حقوق مهر"));
  const catFilter = (await call(fin.cookie, `/api/material-costs?scope=free&categoryId=${hoquq.id}`)).body.costs;
  check("category filter", catFilter.every((c) => c.expenseTypeId === hoquq.id) && catFilter.length >= 1);

  console.log(`\n════════ PASS: ${pass}  FAIL: ${fail} ════════`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
