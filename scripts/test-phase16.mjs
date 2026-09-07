// Printoo24 ERP — Phase 16 E2E test suite
// حقوق و دستمزد + بسته‌بندی/بج/QR + موجودی انبار
// Run: node scripts/test-phase16.mjs  (dev server must be running on :3000)

const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const fails = [];

function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name + (extra ? ` — ${extra}` : "")); console.log(`  ✗ ${name} ${extra}`); }
}

async function jfetch(path, opts = {}, jar) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (jar) headers["Cookie"] = jar;
  const res = await fetch(BASE + path, { ...opts, headers });
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body, cookies: res.headers.getSetCookie?.() ?? [] };
}

async function login(email, pw) {
  const r = await jfetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: pw }) });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status}`);
  const cookie = (r.cookies.find((c) => c.startsWith("printoo24_session=")) || "").split(";")[0];
  return cookie;
}

async function main() {
  console.log("══ Phase 16 E2E — payroll + packages + materials ══\n");

  const negar = await login("negar@printoo24.com", "employee123"); // finance
  const hossein = await login("hossein@printoo24.com", "employee123"); // warehouse
  const admin = await login("admin@printoo24.com", "admin123"); // master
  const sara = await login("sara@printoo24.com", "employee123"); // designer (gates)

  // ═══════════ A) PAYROLL ═══════════
  console.log("── A) حقوق و دستمزد ──");

  // A1. gates
  let r = await jfetch("/api/payroll", {}, sara);
  ok("A1 gate: designer → 403 on payroll", r.status === 403);
  r = await jfetch("/api/payroll/analytics", {}, sara);
  ok("A1 gate: designer → 403 on analytics", r.status === 403);

  // A2. GET payroll (auto-ensure current period)
  r = await jfetch("/api/payroll", {}, negar);
  ok("A2 finance GET /api/payroll → 200", r.status === 200);
  const cur = r.body.current;
  ok("A2 current period open", cur.status === "open", cur.status);
  ok("A2 entries ≥ 9 employees", cur.entries.length >= 9, String(cur.entries.length));
  ok("A2 module snapshot present", cur.entries.every((e) => Array.isArray(e.modules)));
  const saraEntry = cur.entries.find((e) => e.name === "سارا احمدی");
  const rezaEntry = cur.entries.find((e) => e.name === "رضا کریمی");
  ok("A2 سارا pendingAdvance=300000 (seed)", saraEntry.pendingAdvanceSum === 300000, String(saraEntry.pendingAdvanceSum));

  // A3. PUT entry — set overtime for رضا
  r = await jfetch(`/api/payroll/entries/${rezaEntry.id}`, {
    method: "PUT", body: JSON.stringify({ overtimeHours: 10, overtimeRate: 20000, bonus: 100000 }),
  }, negar);
  ok("A3 PUT entry → 200", r.status === 200);
  const expectedNet = rezaEntry.baseSalary + 10 * 20000 + 100000 - rezaEntry.insurance; // bonus replaced by 100000
  ok("A3 netPay computed server-side", Math.abs(r.body.netPay - expectedNet) < 1,
    `${r.body.netPay} vs ${expectedNet}`);

  // A3b. advanceDeducted > pending → 400
  r = await jfetch(`/api/payroll/entries/${rezaEntry.id}`, {
    method: "PUT", body: JSON.stringify({ advanceDeducted: 999999 }),
  }, negar);
  ok("A3b advanceDeducted > pending → 400", r.status === 400);

  // A3c. updateContract flag persists baseSalary to user
  r = await jfetch(`/api/payroll/entries/${saraEntry.id}`, {
    method: "PUT", body: JSON.stringify({ baseSalary: 1300000, updateContract: true }),
  }, negar);
  ok("A3c contract update → 200", r.status === 200);

  // A4. advance: register for مهدی
  const mehdiEntry = cur.entries.find((e) => e.name === "مهدی رحیمی");
  r = await jfetch("/api/payroll/advances", {
    method: "POST", body: JSON.stringify({ userId: mehdiEntry.userId, amount: 250000, note: "تست مساعده" }),
  }, negar);
  ok("A4 POST advance → 201 + costId", r.status === 201 && !!r.body.advance.costId);
  const advId = r.body.advance.id;
  const advCostId = r.body.advance.costId;

  // A4b. advance shows in free costs with حقوق category
  r = await jfetch("/api/material-costs?scope=free", {}, negar);
  const advCost = r.body.costs.find((c) => c.id === advCostId);
  ok("A4b advance cost exists w/ category حقوق", !!advCost && advCost.expenseType?.name === "حقوق" && advCost.status === "approved");

  // A4c. delete advance (pending) → cost removed too
  r = await jfetch(`/api/payroll/advances/${advId}`, { method: "DELETE" }, negar);
  ok("A4c DELETE advance → 200", r.status === 200);
  r = await jfetch("/api/material-costs?scope=free", {}, negar);
  ok("A4c advance cost removed", !r.body.costs.some((c) => c.id === advCostId));

  // A5. pay single entry (رضا) — cost created + notification
  const costsBefore = (await jfetch("/api/material-costs?scope=free", {}, negar)).body.costs.length;
  r = await jfetch(`/api/payroll/entries/${rezaEntry.id}/pay`, { method: "POST" }, negar);
  ok("A5 pay entry → 200", r.status === 200, JSON.stringify(r.body).slice(0, 120));
  const costsAfter = (await jfetch("/api/material-costs?scope=free", {}, negar)).body.costs.length;
  ok("A5 cost created (+1)", costsAfter === costsBefore + 1, `${costsBefore}→${costsAfter}`);
  r = await jfetch("/api/payroll", {}, negar);
  const rezaPaid = r.body.current.entries.find((e) => e.id === rezaEntry.id);
  ok("A5 entry locked (paid + costId)", rezaPaid.status === "paid" && !!rezaPaid.costId);
  // notification to رضا
  r = await jfetch("/api/notifications", {}, await login("reza@printoo24.com", "employee123"));
  ok("A5 رضا got payroll notification", r.body.notifications?.some((n) => n.title === "پرداخت حقوق"));

  // A5b. edit locked entry → 409
  r = await jfetch(`/api/payroll/entries/${rezaEntry.id}`, {
    method: "PUT", body: JSON.stringify({ bonus: 50000 }),
  }, negar);
  ok("A5b locked entry edit → 409", r.status === 409);

  // A6. سارا advance deduction: set advanceDeducted=300000 then pay
  const saraE2 = (await jfetch("/api/payroll", {}, negar)).body.current.entries.find((e) => e.name === "سارا احمدی");
  r = await jfetch(`/api/payroll/entries/${saraE2.id}`, {
    method: "PUT", body: JSON.stringify({ advanceDeducted: 300000 }),
  }, negar);
  ok("A6 سارا advanceDeducted=300000 saved", r.status === 200);
  r = await jfetch(`/api/payroll/entries/${saraE2.id}/pay`, { method: "POST" }, negar);
  ok("A6 سارا paid", r.status === 200);
  r = await jfetch("/api/payroll", {}, negar);
  const adv = r.body.advances.find((a) => a.name === "سارا احمدی");
  ok("A6 advance FIFO-deducted (deductedPeriodKey set)", adv.deductedPeriodKey === r.body.current.key, JSON.stringify(adv));

  // A7. period pay (remaining drafts incl. user with 0 → skipped, period stays open)
  r = await jfetch(`/api/payroll/periods/${cur.id}/pay`, { method: "POST" }, negar);
  ok("A7 period pay → 200 with skipped report", r.status === 200 && Array.isArray(r.body.skipped), JSON.stringify(r.body).slice(0, 150));
  r = await jfetch("/api/payroll", {}, negar);
  ok("A7 period status paid (or open w/ skipped entry only)", ["paid", "open"].includes(r.body.current.status));
  const paidCount = r.body.current.totals.paidCount;
  ok("A7 paidCount ≥ 9", paidCount >= 9, String(paidCount));
  const payrollCosts = (await jfetch("/api/material-costs?scope=free", {}, negar)).body.costs.filter((c) => c.title.startsWith("حقوق ") && c.title.includes(cur.key));
  ok("A7 payroll costs (this period) == paidCount", payrollCosts.length === paidCount, `${payrollCosts.length} vs ${paidCount}`);

  // A7b. pay again → 409
  r = await jfetch(`/api/payroll/periods/${r.body.current.id}/pay`, { method: "POST" }, negar);
  ok("A7b re-pay → 409", r.status === 409, String(r.status));

  // A8. analytics
  r = await jfetch("/api/payroll/analytics?from=2026-08-01", {}, negar);
  ok("A8 analytics → 200 + monthly 2 months", r.status === 200 && r.body.monthly.length === 2);
  ok("A8 byModule has print+designer", r.body.byModule.some((m) => m.module === "print") && r.body.byModule.some((m) => m.module === "designer"));
  ok("A8 byEmployee sorted desc", r.body.byEmployee.every((e, i, arr) => i === 0 || arr[i - 1].sum >= e.sum));
  ok("A8 advances pending sum ≥ 0", r.body.advances.pendingSum >= 0);
  ok("A8 lastDelta pct computed", r.body.lastDelta !== null && typeof r.body.lastDelta.pct === "number");

  // A8b. master analytics access
  r = await jfetch("/api/payroll/analytics", {}, admin);
  ok("A8b master analytics → 200", r.status === 200);

  // ═══════════ B) PACKAGES ═══════════
  console.log("\n── B) بسته‌بندی + بج + تحویل ──");

  // B1. gates
  r = await jfetch("/api/packages", {}, negar);
  ok("B1 finance → 403 on packages", r.status === 403);
  r = await jfetch("/api/packages", {}, sara);
  ok("B1 designer → 403 on packages", r.status === 403);
  r = await jfetch("/api/packages", {}, admin);
  ok("B1 master → 200 on packages", r.status === 200);

  // B2. packable orders
  r = await jfetch("/api/packages?packable=1", {}, hossein);
  ok("B2 packable → 200 with orders", r.status === 200 && r.body.orders.length > 0);
  const packOrders = r.body.orders;
  const o1 = packOrders.find((o) => o.number === 20) ?? packOrders[0];
  const o2 = packOrders.find((o) => o.number === 18) ?? packOrders[1];

  // B3. create package (multi-order!)
  r = await jfetch("/api/packages", {
    method: "POST",
    body: JSON.stringify({
      items: [
        ...o1.items.filter((i) => !i.packedIn).map((i) => ({ orderId: o1.id, orderItemId: i.id, quantity: i.quantity })),
        ...o2.items.filter((i) => !i.packedIn).map((i) => ({ orderId: o2.id, orderItemId: i.id, quantity: i.quantity })),
      ],
      address: "اربیل، تست چند-سفارشی",
      contentsNote: "بنر + کارت",
      codAmount: 120000,
    }),
  }, hossein);
  ok("B3 multi-order package created", r.status === 201 && /^PKG-[A-Z2-9]{6}$/.test(r.body.package.code), JSON.stringify(r.body).slice(0, 120));
  const pkg1 = r.body.package;

  // B3b. packed item double-pack → 400
  r = await jfetch("/api/packages", {
    method: "POST",
    body: JSON.stringify({ items: [{ orderId: o1.id, orderItemId: o1.items[0].id }], address: "x" }),
  }, hossein);
  ok("B3b double-pack rejected → 400", r.status === 400);

  // B3c. packable now marks items packed
  r = await jfetch("/api/packages?packable=1", {}, hossein);
  const o1After = r.body.orders.find((o) => o.id === o1.id);
  ok("B3c items marked packed-in (PKG shown)", o1After.items.every((i) => i.packedIn?.code === pkg1.code || i.packedIn !== null));

  // B4. detail
  r = await jfetch(`/api/packages/${pkg1.id}`, {}, hossein);
  ok("B4 detail → 200 with 2 orders", r.status === 200 && r.body.package.orders.length === 2);
  ok("B4 orders have allItems + itemsInPackage", r.body.package.orders.every((o) => Array.isArray(o.allItems) && Array.isArray(o.itemsInPackage)));

  // B5. invalid transition
  r = await jfetch(`/api/packages/${pkg1.id}`, { method: "PATCH", body: JSON.stringify({ status: "delivered" }) }, hossein);
  ok("B5 packing→delivered rejected → 409", r.status === 409);

  // B6. flow: ready → sent → delivered with COD
  r = await jfetch(`/api/packages/${pkg1.id}`, { method: "PATCH", body: JSON.stringify({ status: "ready" }) }, hossein);
  ok("B6 ready → 200", r.status === 200);
  const paidBefore20 = (await jfetch("/api/orders?excludeArchived=false", {}, hossein)).body.orders.find((o) => o.number === 20).paidAmount;
  r = await jfetch(`/api/packages/${pkg1.id}`, {
    method: "PATCH", body: JSON.stringify({ status: "sent", courier: "پیک تست", trackingNo: "TRK-1" }),
  }, hossein);
  ok("B6 sent → 200", r.status === 200);
  r = await jfetch(`/api/packages/${pkg1.id}`, {
    method: "PATCH", body: JSON.stringify({ status: "delivered", receiverName: "گیرندهٔ تست", collectCod: true }),
  }, hossein);
  ok("B6 delivered → 200 with COD total", r.status === 200 && r.body.codTotal > 0, JSON.stringify(r.body).slice(0, 200));
  ok("B6 orders completed", r.body.completedOrders >= 1, String(r.body.completedOrders));

  // B6b. COD reflected on order #20 paidAmount (FIFO first order)
  const paidAfter20 = (await jfetch("/api/orders?excludeArchived=false", {}, hossein)).body.orders.find((o) => o.number === 20).paidAmount;
  ok("B6b order#20 paidAmount grew by COD (FIFO)", paidAfter20 > paidBefore20, `${paidBefore20} → ${paidAfter20}`);

  // B6c. revenue log module=logistics
  r = await jfetch("/api/revenues", {}, negar);
  ok("B6c revenue log has logistics COD entry", r.body.logs?.some((l) => l.module === "logistics" && l.note?.includes(pkg1.code)));

  // B6d. order events
  r = await jfetch("/api/orders", {}, admin); // just to make sure no error
  ok("B6d orders list ok for admin", r.status === 200);

  // B7. public API — no auth
  r = await jfetch(`/api/public/packages/${pkg1.code}`, {});
  ok("B7 public no-auth → 200", r.status === 200);
  ok("B7 public has orders+company, no paidAmount leak", r.body.orders?.length === 2 && r.body.company?.faName && !("paidAmount" in (r.body.orders[0] || {})));
  r = await jfetch("/api/public/packages/PKG-BADCDE", {});
  ok("B7 bad code → 404", r.status === 404);

  // B8. cancel frees items (return flow)
  r = await jfetch("/api/packages", {
    method: "POST",
    body: JSON.stringify({
      items: packOrders.filter((o) => o.number === 22).flatMap((o) => o.items.filter((i) => !i.packedIn).map((i) => ({ orderId: o.id, orderItemId: i.id }))),
      address: "اربیل، تست لغو",
    }),
  }, hossein);
  const pkg2 = r.body.package;
  ok("B8 second package created", r.status === 201);
  r = await jfetch(`/api/packages/${pkg2.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) }, hossein);
  ok("B8 cancel → 200", r.status === 200);
  r = await jfetch("/api/packages?packable=1", {}, hossein);
  const o22 = r.body.orders.find((o) => o.number === 22);
  ok("B8 items freed after cancel", o22.items.every((i) => !i.packedIn));
  // delivered package can't be cancelled
  r = await jfetch(`/api/packages/${pkg1.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) }, hossein);
  ok("B8 delivered→cancelled rejected → 409", r.status === 409);

  // B9. warehouse stats
  r = await jfetch("/api/warehouse/stats", {}, hossein);
  ok("B9 stats → 200", r.status === 200 && typeof r.body.pendingPackItems === "number");
  ok("B9 deliveredToday ≥ 1", r.body.deliveredToday >= 1, String(r.body.deliveredToday));
  ok("B9 codMonth ≥ 120000", r.body.codMonth >= 120000, String(r.body.codMonth));

  // ═══════════ C) MATERIALS ═══════════
  console.log("\n── C) موجودی مواد اولیه ──");

  // C1. gates + list
  r = await jfetch("/api/materials", {}, sara);
  ok("C1 designer → 403 on materials", r.status === 403);
  r = await jfetch("/api/materials", {}, hossein);
  ok("C1 materials list → 200", r.status === 200 && r.body.materials.length >= 7);

  // C2. create + dup
  r = await jfetch("/api/materials", {
    method: "POST", body: JSON.stringify({ name: "تست مادهٔ E2E", unit: "ورق", minQuantity: 10 }),
  }, hossein);
  ok("C2 create material → 201", r.status === 201);
  const matId = r.body.material.id;
  r = await jfetch("/api/materials", { method: "POST", body: JSON.stringify({ name: "تست مادهٔ E2E" }) }, hossein);
  ok("C2 duplicate → 409", r.status === 409);

  // C3. moves in/out + negative guard
  r = await jfetch(`/api/materials/${matId}/moves`, { method: "POST", body: JSON.stringify({ delta: 100, reason: "خرید تست" }) }, hossein);
  ok("C3 stock-in 100 → 201", r.status === 201 && r.body.quantityAfter === 100);
  r = await jfetch(`/api/materials/${matId}/moves`, { method: "POST", body: JSON.stringify({ delta: -30, reason: "مصرف تست" }) }, hossein);
  ok("C3 stock-out 30 → 70", r.body.quantityAfter === 70);
  r = await jfetch(`/api/materials/${matId}/moves`, { method: "POST", body: JSON.stringify({ delta: -500 }) }, hossein);
  ok("C3 overdraw → 400", r.status === 400);
  r = await jfetch(`/api/materials/${matId}/moves`, {}, hossein);
  ok("C3 moves log has 2 entries", r.body.moves.length === 2);

  // C4. material-cost link → pending cost → approve → stock-in
  const matOrder = packOrders.find((o) => o.number === 22);
  r = await jfetch("/api/material-costs", {
    method: "POST",
    body: JSON.stringify({
      orderId: matOrder.id,
      title: "خرید کاغذ تست",
      amount: 400000,
      module: "material",
      materialId: matId,
      materialQty: 50,
    }),
  }, hossein);
  ok("C4 material cost registered (pending) → 201", r.status === 201, JSON.stringify(r.body).slice(0, 120));
  const costId = r.body.cost?.id ?? r.body.id;
  // stock NOT yet in (pending)
  r = await jfetch("/api/materials", {}, hossein);
  let mat = r.body.materials.find((m) => m.id === matId);
  ok("C4 stock unchanged while pending (70)", mat.quantity === 70, String(mat.quantity));
  // finance approves → stock-in
  r = await jfetch(`/api/material-costs/${costId}`, { method: "PUT", body: JSON.stringify({ status: "approved" }) }, negar);
  ok("C4 approve → 200 + stockIn message", r.status === 200 && !!r.body.stockIn, JSON.stringify(r.body).slice(0, 150));
  r = await jfetch("/api/materials", {}, hossein);
  mat = r.body.materials.find((m) => m.id === matId);
  ok("C4 stock now 120 (auto stock-in)", mat.quantity === 120, String(mat.quantity));
  // re-approve → no double stock-in
  r = await jfetch(`/api/material-costs/${costId}`, { method: "PUT", body: JSON.stringify({ status: "rejected" }) }, negar);
  r = await jfetch(`/api/material-costs/${costId}`, { method: "PUT", body: JSON.stringify({ status: "approved" }) }, negar);
  r = await jfetch("/api/materials", {}, hossein);
  mat = r.body.materials.find((m) => m.id === matId);
  ok("C4 no double stock-in on re-approve (still 120)", mat.quantity === 120, String(mat.quantity));

  // C5. delete guard (has moves)
  r = await jfetch(`/api/materials/${matId}`, { method: "DELETE" }, hossein);
  ok("C5 delete with moves → 409", r.status === 409);
  // deactivate instead
  r = await jfetch(`/api/materials/${matId}`, { method: "PUT", body: JSON.stringify({ isActive: false }) }, hossein);
  ok("C5 deactivate → 200", r.status === 200);

  // C6. moves-all endpoint
  r = await jfetch("/api/materials/moves?limit=10", {}, hossein);
  ok("C6 moves-all → 200 with material names", r.status === 200 && r.body.moves.every((m) => m.material?.name));

  // ═══════════ D) public page smoke (HTML) ═══════════
  console.log("\n── D) صفحهٔ عمومی (?pkg=) ──");
  const html = await (await fetch(`${BASE}/?pkg=${pkg1.code}`)).text();
  ok("D root page serves with pkg param (200 HTML)", html.includes("<!DOCTYPE html>") || html.includes("<html"));

  // ═══ summary ═══
  console.log(`\n══ RESULT: ${pass} pass / ${fail} fail ══`);
  if (fail > 0) {
    console.log("FAILURES:");
    fails.forEach((f) => console.log("  ✗ " + f));
    process.exit(1);
  }
}

main().catch((e) => { console.error("SUITE CRASH:", e); process.exit(1); });
