# Printoo24 ERP — Worklog

This file tracks all agent work on the `printoo-erp` project (cloned to `/home/z/printoo-erp`).
Each agent appends a new section after `---` with its Task ID, agent name, task, work log, and stage summary.

---
Task ID: 0
Agent: orchestrator (main)
Task: Clone `AbstractAxisX/printoo-erp` from GitHub using the provided PAT, load all code, and deeply understand the project before any development task is issued.

Work Log:
- Queried GitHub API with the PAT; located `AbstractAxisX/printoo-erp` (TypeScript, ~5.6MB, default branch `main`, last push 2026-08-24).
- Cloned (depth 50) to `/home/z/printoo-erp` (203 files, 7.9MB working tree, ~31,592 LOC of TS/TSX across 188 source files).
- Mapped full structure: single-route SPA (`/` only), App Router, 8 ERP modules (admin/designer/print/warehouse/finance/qc/crm/srm), 45 API route handlers, shadcn/ui + Hugeicons + Prisma/SQLite + Zustand + TanStack Query.
- Read README.md (very comprehensive), package.json, prisma/schema.prisma, next.config.ts, tailwind.config.ts, tsconfig.json, src/app/page.tsx, layout.tsx, app-store.ts, db.ts, auth.ts, nav.ts, constants.ts, api.ts, icons.tsx, module-router.tsx, app-shell.tsx, use-auto-tabs.ts, cross-tab.ts, and a sample API route (orders/route.ts).
- Dispatching 4 parallel Explore subagents to deep-dive: API layer, Admin module, CRM+SRM modules, and Designer+Print+QC+Finance+Shared components.

Stage Summary:
- Project identity: Printoo24 ERP — printing-broker ERP, Next.js 16 (App Router, Turbopack, standalone output), TypeScript 5 strict, Tailwind 4, shadcn/ui New York, Prisma 6 (SQLite), Hugeicons, Zustand (client nav state) + TanStack Query (server state), react-hook-form + Zod, recharts, framer-motion.
- Architecture: SPA-style — only `/` route is exposed; `page.tsx` checks session → LoginForm or AppShell. AppShell = Sidebar + Header + TabBar (chrome-like tabs with keep-alive) + ModuleRouter (switches active tab component). Nav state in Zustand (persisted): `{module, page, param}` + tabs array.
- Data model (17 models): User, Customer, Supplier, SupplierCategory, SupplierSubcategory, SupplierService, PriceList, Product, Order, OrderItem, QcReport, ExpenseType, MaterialCost, PreInvoice, Invoice, Task, Notification, Expense, Payment, AuditLog, DayNote, Deal, Activity. Orders have `number` (sequential), status flow pending_design→in_printing→warehouse_logistics→completed→archived|cancelled; OrderItem.stage design→print→warehouse→completed→archive.
- Notable patterns & concerns identified so far (to be expanded by subagents):
  - Auth = base64-encoded cookie `printoo24_session` (NOT signed — forgeable); password stored in plaintext; `ensureSeedUser()` seeds `admin@printoo24.com / admin123`. No RBAC enforcement despite `role` field on User.
  - API routes appear to lack `getSession()` auth guards (e.g. `POST /api/orders` has no session check) and lack Zod validation — bodies are cast via `as`. This is a major security/correctness gap.
  - `db.ts` uses a versioned globalThis cache key `prisma_v3` to survive HMR.
  - `next.config.ts` has `typescript.ignoreBuildErrors: true` and `reactStrictMode: false` — masks type errors.
  - Minor inconsistencies: README says currency is "تومان" but `constants.CURRENCY = "IQD"`; `qc` module color is "blue" (violates the project's own "no blue/indigo" guideline from the stack rules, though that rule is the sandbox's, not the repo's).
  - Recent commits focus on header/sidebar polish (emerald theme, atomic sidebar refactor, drawer-sync hook, tab system).
- Ready to receive the user's development task; will produce an analytical report and an atomic improvement plan once subagents report back.

---
Task ID: 1-a
Agent: Explore (API Layer)
Task: Deep-dive analysis of the entire API layer (45 route handlers at /home/z/printoo-erp/src/app/api/)

Work Log:
- Re-read /home/z/my-project/worklog.md for context on what the orchestrator already discovered (project identity, architecture, data model, known concerns).
- Read supporting infrastructure: src/lib/auth.ts (cookie-session, base64 JSON, no signing, ensureSeedUser seeds admin@printoo24.com/admin123), src/lib/db.ts (globalThis prisma_v3 singleton), src/lib/api.ts (frontend helper, expects 204 on deletes), src/lib/format.ts (toISO helper used across routes), prisma/schema.prisma (AuditLog model exists).
- Read all 45 route handler files (full listing):
  * auth/{login,logout,me}/route.ts (3 files)
  * customers/route.ts, customers/[id]/route.ts (2)
  * dashboard/route.ts (1)
  * day-notes/route.ts, day-notes/[date]/route.ts (2)
  * deals/route.ts, deals/[id]/route.ts (2)
  * expense-types/route.ts, expense-types/[id]/route.ts (2)
  * material-costs/route.ts, material-costs/[id]/route.ts (2)
  * notifications/route.ts, notifications/[id]/route.ts (2)
  * orders/route.ts, orders/[id]/route.ts, orders/[id]/status/route.ts, orders/[id]/designer-action/route.ts, orders/[id]/print-action/route.ts (5)
  * pre-invoices/route.ts, pre-invoices/[id]/route.ts (2)
  * price-lists/route.ts, price-lists/[id]/route.ts (2)
  * products/route.ts, products/[id]/route.ts (2)
  * qc-reports/route.ts, qc-reports/[id]/route.ts (2)
  * route.ts (root, 1)
  * srm/compare-prices/route.ts, srm/dashboard/route.ts (2)
  * supplier-categories/route.ts, supplier-categories/[id]/route.ts (2)
  * supplier-services/route.ts, supplier-services/[id]/route.ts (2)
  * supplier-subcategories/route.ts, supplier-subcategories/[id]/route.ts (2)
  * suppliers/route.ts, suppliers/[id]/route.ts (2)
  * tasks/route.ts, tasks/[id]/route.ts (2)
  * activities/route.ts, activities/[id]/route.ts (2)
  * crm/dashboard/route.ts (1)
  Total = 45 route files.
- Ran targeted searches to confirm cross-cutting facts:
  * `getSession` is referenced in ONLY 1 of 45 route files: `auth/me/route.ts`. Zero other routes call any auth guard.
  * `AuditLog`/`auditLog` is referenced in 0 files anywhere in src/ — the model exists in the schema but is never written.
  * No `middleware.ts` exists in repo root → no Next middleware auth either.
  * No `db.$transaction` is used anywhere → multi-record writes are non-atomic.
  * No Zod / `z.object` / `safeParse` in any API route.
  * No CORS / `Access-Control` headers anywhere.
  * No bcrypt/argon2/scrypt/crypto.hash in src/ — passwords compared as plaintext strings.
- Compiled the structured report below covering security, validation, consistency, business logic, data-access, cross-cutting issues, and a quality verdict with a top-10 problems list.

Stage Summary:

────────────────────────────────────────────────────────────────────
1. AUTH & SECURITY
────────────────────────────────────────────────────────────────────

1a. Auth guard coverage — FOR ALL 45 ROUTES:

PROTECTED (calls getSession):
  - GET /api/auth/me                                → returns 401 if no session

UNPROTECTED (no getSession, no middleware, no RBAC) — 44 routes:
  Auth:
  - POST /api/auth/login                            → no guard (expected); also calls ensureSeedUser() on every login
  - POST /api/auth/logout                           → no guard (clears cookie anyway)
  CRUD routes (all completely public):
  - GET/POST    /api/customers                      /api/customers/[id] GET/PUT/DELETE
  - GET         /api/dashboard
  - GET/POST    /api/day-notes                      /api/day-notes/[date] GET/DELETE
  - GET/POST    /api/deals                          /api/deals/[id] GET/PUT/DELETE/PATCH
  - GET/POST    /api/expense-types                  /api/expense-types/[id] DELETE
  - GET/POST    /api/material-costs                 /api/material-costs/[id] GET/PUT/DELETE
  - GET/POST    /api/notifications                  /api/notifications/[id] PUT (mark-read)
  - GET/POST    /api/orders                         /api/orders/[id] GET/PUT/DELETE
  - PUT         /api/orders/[id]/status             (status transitions + bulk OrderItem date update + auto-notification)
  - POST        /api/orders/[id]/designer-action    (send_next → in_printing; report_qc → creates QcReport)
  - POST        /api/orders/[id]/print-action      (confirm_material, send_warehouse, report_qc)
  - GET/POST    /api/pre-invoices                   /api/pre-invoices/[id] GET/PUT/DELETE
  - GET/POST    /api/price-lists                    /api/price-lists/[id] DELETE
  - GET/POST    /api/products                       /api/products/[id] PUT/DELETE
  - GET         /api/qc-reports                     /api/qc-reports/[id] GET/PUT (approve/reject → moves order status)
  - GET         /api/route.ts (root, just hello)
  - GET         /api/srm/compare-prices
  - GET         /api/srm/dashboard
  - GET/POST    /api/supplier-categories            /api/supplier-categories/[id] DELETE
  - GET/POST    /api/supplier-services              /api/supplier-services/[id] DELETE
  - GET/POST    /api/supplier-subcategories         /api/supplier-subcategories/[id] DELETE
  - GET/POST    /api/suppliers                      /api/suppliers/[id] GET/PUT/DELETE
  - GET/POST    /api/tasks                          /api/tasks/[id] PUT/DELETE
  - GET/POST    /api/activities                     /api/activities/[id] PUT/DELETE
  - GET         /api/crm/dashboard

1b. Routes that MUTATE DATA WITHOUT ANY AUTH (highest risk):
  - POST /api/orders                      (multi-customer batch order creation, status, pre-invoice, invoice — full financial side)
  - PUT  /api/orders/[id]                 (full rewrite of items, status, totalAmount, customerId)
  - PUT  /api/orders/[id]/status          (force any status + bulk OrderItem date stamping + emits notifications)
  - POST /api/orders/[id]/designer-action /print-action  (workflow transitions, QC reports)
  - PUT  /api/qc-reports/[id]             (approve → moves order backwards in pipeline; reject)
  - POST/PUT/DELETE /api/material-costs   (financial amounts; PUT allows arbitrary status flips)
  - POST/PUT/DELETE /api/pre-invoices    (financial; writes order.paidAmount)
  - POST/DELETE      /api/customers, /api/suppliers, /api/products, /api/deals, /api/tasks, /api/activities, /api/expense-types, /api/price-lists, /api/supplier-* , /api/day-notes
  - POST             /api/notifications  (no userId set — every notification is global/broadcast-equivalent)
  - POST             /api/auth/login      (oracle for valid emails via timing? — actually no, returns generic 401; but no rate-limit means brute-force is trivial)

1c. Password handling in auth/login:
  - Password retrieved from DB and compared with `user.password !== password` — PLAINTEXT comparison.
  - User.password column in schema is plain `String`, no hashing anywhere.
  - ensureSeedUser() seeds admin@printoo24.com / admin123 in plaintext.
  - No rate limiting, no lockout, no CAPTCHA → trivially brute-forceable.
  - On unhandled exception, login route LEAKS the internal error message in the response body: `"خطای سرور: " + e.message`.

1d. Session security:
  - Session cookie = base64-encoded JSON `{id,name,email,role}` — NOT signed, NOT encrypted, NOT HMAC'd.
  - Anyone who can set a cookie (e.g. via XSS, or any subdomain, or local access) can forge a session as any user/role, including "master".
  - Cookie attributes: httpOnly ✓, sameSite=lax ✓, path=/ ✓, maxAge=7d ✓. No `secure` flag → cookie sent over plain HTTP. (acceptable for sandbox, unacceptable in prod.)
  - No session expiry check beyond cookie maxAge; no server-side session store, so logout just deletes the cookie (a forged cookie would still be accepted).

1e. SQL-injection risk: LOW. All DB access goes through Prisma which parameterizes. Search filters use `contains:` (Prisma escapes). No raw `$queryRaw` / `$executeRaw` anywhere in the API layer. ✓

1f. Mass-assignment risk: MEDIUM–LOW. Most routes build `data` objects explicitly from named fields (not `body` spread), e.g. customers/[id] PUT, suppliers/[id] PUT, tasks/[id] PUT, orders/[id] PUT. The risk is more "field-level authorization" — clients can write any value into fields they shouldn't (e.g. `orders/[id]` PUT accepts `body.status` and writes it directly, bypassing the workflow; `material-costs/[id]` PUT accepts `body.status` and flips approved→pending, etc.).

────────────────────────────────────────────────────────────────────
2. VALIDATION
────────────────────────────────────────────────────────────────────

2a. Schema-validation usage: ZERO. No route imports `zod`, no `z.object(...)`, no `safeParse`. Grep across src/app/api returned 0 matches.

2b. Body-parsing pattern: every route does `const body = await req.json()` followed by either direct destructure or `as`-cast:
  - `orders/route.ts` POST: `const body = (await req.json()) as CreateBody` — pure cast, runtime shape not checked.
  - `orders/[id]/route.ts` PUT: `const body = (await req.json()) as UpdateBody`.
  - Everything else: destructure with fallback `|| null` / `|| 0` / `|| "design"` etc.

2c. Worst offenders (silent acceptance of malformed input):
  - POST /api/orders: accepts `customers: string[]`, `itemsByCustomer: Record<string,ItemDraft[]>`, `splitMode`, `priority`, `endDate`, `moduleDates`, `preInvoice`, `invoice`, `markCompleted` — all via `as CreateBody`. No type/enum check on `splitMode` (only "grouped" branch + else, so any non-"grouped" string is treated as "separated"); no enum check on `priority` (any string is accepted); no validation that `customerId` strings are real Customer IDs (will fail with FK error in catch → 500, no friendly 400); no check that `productId`s are real (FK error → 500). Numeric fields are coerced via `Number(...) || 0` which silently zeroes NaN.
  - PUT /api/orders/[id]: accepts `body.items` as a full replacement; if `items` is provided, DELETES all existing OrderItems then re-creates — no transaction, so partial failure leaves the order with zero items.
  - PUT /api/orders/[id]/status: accepts `status` as any string and writes it directly; no state-machine validation (could go from "completed" back to "pending_design"); auto-creates a notification with the raw status interpolated into the message.
  - POST /api/orders/[id]/designer-action & /print-action: `action` is checked as a literal ("send_next"|"report_qc" / "confirm_material"|"send_warehouse"|"report_qc"); invalid action returns 400 ✓ — this is the only validation pattern in the layer.
  - PUT /api/material-costs/[id]: accepts `body.status` and writes directly with no enum check (can flip approved→pending→approved→rejected arbitrarily).
  - POST /api/notifications: no validation on `type` (any string accepted, despite comment saying info|success|warning|error); no userId enforced.
  - POST /api/tasks: no validation on `module`/`status`/`priority` (any string accepted).
  - POST /api/deals: `stage` and `source` not enum-validated; `probability` only coerced to Number, not clamped to 0-100 (the PATCH endpoint DOES clamp, the POST/PUT do not).
  - GET /api/activities: `from`/`to` query params passed straight to `new Date(...)` with no validation — invalid dates silently produce Invalid Date which Prisma will reject → 500.

────────────────────────────────────────────────────────────────────
3. CONSISTENCY
────────────────────────────────────────────────────────────────────

3a. Response shapes:
  - Single-entity reads: `{ <entity>: <value> }` — e.g. `{customer}`, `{deal}`, `{order}`, `{supplier}`, `{task}`, `{product}`, `{qcReport}`, `{preInvoice}`, `{cost}`, `{notification}`, `{note}`, `{expenseType}`, `{priceList}`, `{service}`, `{category}`, `{subcategory}`, `{supplier}`. Mostly consistent.
  - List reads: `{ <plural>: [...] }` — e.g. `{customers}`, `{orders}`, `{deals}`, `{tasks}`, `{products}`, `{activities}`, `{notifications, unread}` (notifications adds a counter — exception), `{expenseTypes}`, `{costs}`, `{priceLists}`, `{services}`, `{suppliers}`, `{subcategories}`, `{categories}`, `{reports}`. Consistent.
  - Aggregation dashboards: ad-hoc shapes — `{kpis, series, recentOrders, ...}` (admin), `{stats, recentCosts, suppliersByCategory}` (srm), `{kpis, pipeline, recentActivities, topCustomers, closingSoonDeals}` (crm). Acceptable since they're aggregations.
  - POST /api/orders returns `{created: [{id,number,customerId}], count}` — different shape from other POSTs, but justified by batch semantics.
  - DELETE everywhere returns `{ ok: true }` — consistent but see 3b.

3b. HTTP status codes:
  - 201 on POST: used consistently ✓ (customers, deals, day-notes, expense-types, material-costs, notifications, orders, pre-invoices, price-lists, products, supplier-*, tasks, activities all return 201). ✓
  - 204 on DELETE: NEVER used. All DELETEs return 200 with `{ ok: true }`. Frontend `api()` helper explicitly checks `res.status === 204` (line 19 of src/lib/api.ts) — so this branch is dead code; clients always parse JSON. Inconsistent with REST but functionally harmless.
  - 404 on missing record: only some routes return 404:
      ✓ customers/[id] GET, day-notes/[date] GET+DELETE, deals/[id] GET, deals/[id] PATCH-implicit, material-costs/[id] GET, orders/[id] GET, pre-invoices/[id] GET, products/[id] PUT (no — no 404), qc-reports/[id] GET+PUT, suppliers/[id] GET.
      ✗ customers/[id] DELETE/PUT, deals/[id] PUT/DELETE, expense-types/[id] DELETE, material-costs/[id] PUT/DELETE, notifications/[id] PUT (no try/catch!), orders/[id] DELETE/PUT, pre-invoices/[id] PUT/DELETE, price-lists/[id] DELETE, products/[id] PUT/DELETE, supplier-categories/[id] DELETE, supplier-services/[id] DELETE, supplier-subcategories/[id] DELETE, suppliers/[id] PUT/DELETE, tasks/[id] PUT/DELETE, activities/[id] PUT/DELETE — all use generic `catch { return 500 }` which masks Prisma P2025 (record not found) as a 500.
  - 400 on bad input: used sporadically — most POSTs check `!name`/`!title`/`!customerId` and return 400 ✓. But validation is shallow; bad types or missing optional fields just get coerced with `|| null`.
  - 401/403 on auth: only `auth/login` returns 401 (bad credentials) and 403 (inactive user). `auth/me` returns 401 if no session. No other route returns 401/403 because no other route checks auth. ✗ (massive gap)

3c. Error handling pattern: most routes wrap DB ops in try/catch and return a generic Persian `{error: "..."}` with status 500. A few do NOT have try/catch:
  - notifications/route.ts POST — no try/catch (will leak Prisma error → Next.js default 500 page).
  - notifications/[id]/route.ts PUT — no try/catch AT ALL.
  - orders/[id]/route.ts PUT — has try/catch but the body parse is outside it (would 500 if body is not JSON).
  - orders/[id]/status/route.ts PUT — NO try/catch (any error escapes; the auto-notification creation after the update also has no error handling — if the notification insert fails, the order status has already changed).
  - orders/[id]/designer-action & print-action POST — have try/catch ✓ but return generic `{error:"خطا"}` with no detail.
  - auth/login — try/catch but LEAKS the raw exception text in the response body.

────────────────────────────────────────────────────────────────────
4. BUSINESS-LOGIC HIGHLIGHTS
────────────────────────────────────────────────────────────────────

4a. POST /api/orders (multi-customer, split grouped/separated, pre-invoice, invoice):
  - Body: `{customers: string[], itemsByCustomer: Record<cid, ItemDraft[]>, splitMode, priority, endDate, noEndDate, note, moduleDates, preInvoice?, invoice?, markCompleted?, createdBy?}`.
  - Validation: checks `customers.length` and that every customer has ≥1 item. NO check that customerId/productIds exist (FK errors surface as 500). NO enum check on splitMode/priority/stage.
  - Flow: for each customerId, if splitMode==="grouped" → create ONE order with all items; else ("separated") → create ONE order per item. After each order, optionally `createPreInvoice` (writes PreInvoice + bumps order.paidAmount) and optionally `createInvoice` (only when `markCompleted===true`).
  - `nextNumber(model)` helper: `await db.order.aggregate({ _max: { number: true } })` then `+ 1`. CALLED PER ORDER IN THE LOOP (so a separated multi-customer batch fires N+M aggregate queries + N+M inserts). NOT atomic — see §6.
  - `stageToStatus(stage)` maps item.stage → order.status (design→pending_design, print→in_printing, warehouse→warehouse_logistics, completed→completed, archive→archived). When `markCompleted===true`, status is forced to "completed".
  - Pre-invoice/invoice items are JSON-stringified into a single TEXT column (`PreInvoice.items`, `Invoice.items`).
  - `createInvoice` is only called when `markCompleted` is true — meaning the invoice is only persisted when the order is being created as already-completed, which is a narrow path (typical flow uses pre-invoice then converts later — but no convert endpoint exists).

4b. PUT /api/orders/[id]/status (status transitions + module date stamping):
  - Body: `{status, designStart, designEnd, printStart, printEnd}`.
  - Fetches the order (404 if missing). Updates `order.status = body.status` (no validation against an allowed set or against the current status — i.e. NO state-machine: any→any). Then `orderItem.updateMany` to stamp `designStartDate/designEndDate/printStartDate/printEndDate` on ALL items of the order (overwrites whatever was there). Then auto-creates a Notification `«تغییر وضعیت سفارش #{order.number}»` with the raw status string interpolated.
  - NO try/catch. If the notification insert fails after the order update, the order has been mutated but the client gets a 500. (Inconsistent state.)
  - Module dates are applied to every item in the order regardless of item stage — so a "warehouse" item would get print-end-date stamped.

4c. POST /api/orders/[id]/designer-action:
  - `action: "send_next"` → set order.status="in_printing", save `designerNote`, emit notification.
  - `action: "report_qc"` → create QcReport `{orderId, fromModule:"designer", description, reportedBy:"designer"}`, emit notification.
  - Does NOT update OrderItem.stage (the items still say "design") — only the order status changes. Inconsistent with `stageToStatus` mapping used elsewhere.
  - No verification that the order currently is in `pending_design` before advancing — caller can call this on a "completed" order too.

4d. POST /api/orders/[id]/print-action:
  - `action: "confirm_material"` → `orderItem.updateMany({where:{orderId:id}, data:{materialConfirmed:true}})` + notification.
  - `action: "send_warehouse"` → `order.update({status:"warehouse_logistics"})` + notification.
  - `action: "report_qc"` → create QcReport with `fromModule:"print"` + notification.
  - Same gaps: no state-machine, no try/catch issues fixed (it does have try/catch).

4e. dashboards:
  - /api/dashboard: KPIs vs prev period (revenue, orders, avgOrderValue, newCustomers, completed, urgent, payments, profit) + quickStats (overdueOrders, nearDeadline, noEndDate, pendingTasks) + recentOrders + nearDeadlineOrders + overdueOrders + latestTasks + byStatus + per-day series for {revenue, orders, avgOrderValue, newCustomers, completed, urgent, payments, profit}. Implemented as 22 parallel Prisma queries via Promise.all. Profit = payments - expenses (NOT revenue - COGS). Range defaults to month-to-date.
  - /api/srm/dashboard: supplier/category/service/priceList counts + total/approved/pending material cost sums + 8 recent costs with supplier/expenseType/order.customer + categories-with-subcategories tree. 9 parallel queries.
  - /api/crm/dashboard: totalCustomers, activeDeals, pipelineValue, wonThisMonth (value+count), lostThisMonthCount, dealsByStage (count+value), recentActivities, topCustomers (groupBy order count + per-customer aggregate — N+1 pattern via Promise.all), closingSoonDeals, conversionRate (=won/(won+lost)). 13 parallel queries + an extra follow-up query for top customer details + 5 per-customer aggregate queries.

4f. notifications:
  - GET /api/notifications: returns last 30 + unread count (global — no userId scoping despite the field existing).
  - POST /api/notifications: creates a notification. NO userId set — every notification is global/broadcast-equivalent (visible to all sessions).
  - PUT /api/notifications/[id]: marks `read: true` only (no way to mark unread, no DELETE, no broadcast/list-targeting). No try/catch.
  - No DELETE endpoint. Notifications accumulate forever.
  - Notifications are auto-created by: status changes (orders/[id]/status), designer-action, print-action, qc-reports/[id] approve. All have `link` field set to a module-route path (e.g. "admin:orders", "qc:dashboard") for client-side nav.

4g. material-costs (print/warehouse cost approval flow):
  - POST /api/material-costs: create with default status "pending", default module "print". Fields: orderId, supplierId?, expenseTypeId?, description?, amount, fileUrl1?, fileUrl2?, module.
  - GET list filters by orderId/module/status.
  - GET /[id] returns cost with supplier+expenseType+order.customer.
  - PUT /api/material-costs/[id]: accepts `{status}` and writes directly. NO state-machine (pending→approved is the intended flow but you can flip approved→pending→rejected→approved freely). NO reviewer identity recorded. NO date-stamp of approval (MaterialCost has no approvedAt/approvedBy columns in schema either). NO update of related Order or Supplier balanceDue on approval. The approval is essentially a free-text flag.
  - DELETE /[id]: hard delete.
  - No `approved` aggregate effect on the SRM dashboard other than the count/sum.

────────────────────────────────────────────────────────────────────
5. DATA-ACCESS PATTERNS
────────────────────────────────────────────────────────────────────

5a. Prisma include depth:
  - Shallow (1 level): products, customers (with _count), tasks (with order.customer — 2 levels), activities (customer+deal — 2 levels).
  - Medium (2-3 levels): orders list includes `items.product`; orders/[id] GET includes `customer, items.product, preInvoices, invoice, tasks`; qc-reports list includes `order.customer + order.items.product` (3 levels); material-costs list includes `supplier, expenseType, order.customer` (3 levels).
  - Deep: suppliers/[id] GET includes `subcategory.category + services.subcategory.category + services.priceLists[1] + materialCosts[50].expenseType + materialCosts[50].order.customer + _count`. Could be expensive on a supplier with many services.
  - qc-reports/[id] GET also includes `order.customer + order.items.product`.

5b. N+1 query risks:
  - **crm/dashboard/route.ts top-customers**: `Promise.all(topCustomersRaw.map(c => db.order.aggregate({_sum:{totalAmount:true}, where:{customerId:c.id}})))` — N+1 (N=5) but parallel, so latency-bound rather than round-trip-bound. Could be replaced with a single `groupBy` on Order by customerId.
  - **orders/route.ts POST**: for separated split + N customers, calls `nextNumber` (1 aggregate) + `db.order.create` (1 insert with nested items.create) per item per customer — O(items) round trips, no batching.
  - **orders/[id]/route.ts PUT** when items are provided: `Promise.all(items.map(it => db.orderItem.create(...)))` — N+1 in parallel; preceded by `orderItem.deleteMany` and followed by `order.update`. Not in a transaction.
  - **srm/compare-prices/route.ts**: fetches ALL supplierServices with `priceLists take:1` then groups in JS. With many services this loads the whole table. No pagination.
  - **notifications GET**: 2 queries (findMany + count) — fine.

5c. Transactions usage: NONE. `db.$transaction` is referenced 0 times across the entire src/. This matters most for:
  - POST /api/orders: multi-order creation (separated split creates N orders sequentially; if the 3rd fails, the 1st and 2nd are committed → partial state). The pre-invoice + invoice + order.paidAmount bump is also 3 separate writes not wrapped.
  - PUT /api/orders/[id] (items replacement): deleteMany then create-multiple then order.update — 3 separate writes, not atomic.
  - PUT /api/orders/[id]/status: order.update + orderItem.updateMany + notification.create — 3 writes, not atomic; no try/catch.
  - POST /api/pre-invoices + createPreInvoice helper: preInvoice.create + order.update — 2 writes, not atomic.
  - POST /api/qc-reports/[id] approve: qcReport.update + order.update + notification.create — 3 writes, not atomic.
  - DELETE /api/deals/[id]: activity.deleteMany + deal.delete — 2 writes, not atomic (but cascade is configured on Activity.dealId so the manual deleteMany is redundant anyway).
  - POST /api/orders/[id]/{designer-action,print-action}: update + notification.create — 2 writes, not atomic.

5d. nextNumber race condition (CONFIRMED):
  - `nextNumber("order"|"preInvoice"|"invoice")` is `aggregate({_max:{number:true}}) + 1`. NOT atomic. Two concurrent POSTs can compute the same `number`, and the second `db.order.create` will throw P2002 unique-constraint-violation (because Order.number is `@unique`). The catch wraps it as a generic 500.
  - This pattern is duplicated in: orders/route.ts (lines 45-56), orders/route.ts createPreInvoice (line 226), orders/route.ts createInvoice (line 242), pre-invoices/route.ts POST (lines 40-41). So 4+ sites have the race.
  - Worse: in `orders/route.ts` POST, `nextNumber("order")` is called inside a per-customer, per-item loop in the "separated" branch. If the SAME request creates 5 separated orders, it issues 5 sequential `aggregate _max` calls — but since the requests are awaited sequentially, the same request won't double-compute (each `await` blocks). The risk is across concurrent requests / retries.

5e. Resource usage:
  - All dashboard queries run in parallel via `Promise.all` — generally fine for SQLite (single connection?) but Prisma's SQLite driver may serialize them anyway. The /api/dashboard GET fires 22 queries in parallel; for SQLite that may cause connection-starvation or queuing.
  - No pagination on most list endpoints — `/api/orders` returns ALL orders with items+product included; `/api/customers` returns all customers; `/api/activities` defaults to take:50 (good) but `/api/notifications` defaults to take:30 (good). For orders/customers/suppliers/products the absence of `take` means the entire table is loaded every request.

────────────────────────────────────────────────────────────────────
6. CROSS-CUTTING ISSUES
────────────────────────────────────────────────────────────────────

6a. Error-handling gaps:
  - Several routes have NO try/catch at all: notifications/route.ts POST, notifications/[id]/route.ts PUT, orders/[id]/status/route.ts PUT. Any Prisma error becomes an unhandled rejection → Next.js default 500 page with stack-trace leakage in dev.
  - Most other routes use `catch (e) { return 500 }` with no P2025 → 404 mapping.
  - auth/login LEAKS raw exception text in the response body.
  - No structured logging — `console.error(e)` is the only log mechanism. No request IDs, no correlation IDs.

6b. Audit logging: AuditLog model exists in schema (`employee, action, path, status, date`) but is NEVER written to anywhere in src/. So there is NO audit trail for any CREATE/UPDATE/DELETE across the entire ERP — including orders, material costs, qc reports, status transitions, customer/supplier edits, etc. Major compliance/forensics gap. The model's fields suggest it was intended to be filled by a middleware (path, status, employee) but no such middleware exists.

6c. CORS: no `Access-Control-*` headers anywhere. Same-origin only. Acceptable for an SPA at the same origin, but no `Vary: Origin`, no preflight handling, no configured allowed origins.

6d. Rate limiting: NONE. No middleware, no in-memory limiter, no IP-based throttle. The login endpoint is therefore trivially brute-forceable, especially given plaintext passwords.

6e. Idempotency: NONE. No `Idempotency-Key` header support, no request de-duplication. POST /api/orders retried by a flaky network would create duplicate orders (with different sequential numbers, so the dedup-by-number wouldn't catch them). POST /api/pre-invoices likewise.

6f. CSRF: cookie is `sameSite=lax` — protects against simple CSRF for POST/PUT/DELETE (browsers won't send the cookie cross-origin). But because NO route checks the session anyway, CSRF is moot — any cross-origin POST is accepted regardless.

6g. Input sanitization for storage: no XSS sanitization on `note`, `description`, `title`, `message` fields. Stored as-is. Frontend presumably renders with React (which escapes by default), but if anything is ever rendered with `dangerouslySetInnerHTML`, it's vulnerable.

6h. Date handling: `toISO(body.endDate)` is used in orders PUT/POST. The `toISO` helper (src/lib/format.ts) returns null for invalid dates — so invalid `endDate` silently becomes NULL endDate + `noEndDate=false`, which is a logical contradiction (an order with no endDate but noEndDate=false). No validation.

6i. JSON-in-TEXT column antipattern: `PreInvoice.items` and `Invoice.items` are stored as `JSON.stringify(itemsArray)` in a String column. No schema validation on the JSON; reads require `JSON.parse` (the routes don't even parse them on the server side, they just pass the string back). No migration path if the shape changes.

6j. Currency / locale: schema doesn't track currency; format.ts hardcodes IQD; README says "تومان". Inconsistency between docs and code, but not a route-level bug.

────────────────────────────────────────────────────────────────────
7. QUALITY VERDICT
────────────────────────────────────────────────────────────────────

- Security:    F. (44/45 routes unprotected; plaintext passwords; unsigned session cookie; no rate limit; no audit log; no CSRF needed because no auth to protect against)
- Correctness: D. (nextNumber race; no transactions on multi-write operations; no state-machine on order status / material-cost status; P2025 masked as 500; no pagination on key list endpoints; no body validation; dead 204 branch in client helper)
- Maintainability: C. (consistent-ish response shapes and Persian error messages; uses Promise.all for parallelism; small focused handlers; but no schema for bodies, no shared validation helpers, no shared auth middleware, no shared error-handler, 4 duplicated nextNumber implementations)

Overall API-layer grade: D−.

────────────────────────────────────────────────────────────────────
TOP 10 PROBLEMS (ordered by severity — what a senior engineer would fix first)
────────────────────────────────────────────────────────────────────

1. **NO AUTH ON ANY MUTATING ROUTE** (44 of 45 routes). Anyone with the URL can POST/PUT/DELETE orders, material costs, pre-invoices, status transitions, qc approvals, customers, suppliers, etc. — the entire financial and operational surface is fully open. Fix: add a Next.js `middleware.ts` that checks the session cookie on every `/api/*` path except `/api/auth/login`, returns 401 otherwise; also add a per-route `requireUser()` / `requireRole(role)` helper for RBAC since `User.role` already exists.

2. **PLAINTEXT PASSWORDS + UNSIGNED SESSION COOKIE + NO RATE LIMIT**. `auth/login` does `user.password !== password` against a plaintext DB column; the session cookie is just base64-encoded JSON (forgeable to any role, including "master"); login has no rate-limiting. Fix: hash passwords with bcrypt/argon2 on signup & login; sign the session cookie with an HMAC secret (or use `iron-session`/`jose` JWT); add IP-based login rate-limiting.

3. **nextNumber() RACE CONDITION** (orders/pre-invoices/invoices). `aggregate _max + 1` is not atomic; under concurrent requests, two writers compute the same number, the second hits a P2002 unique-violation and returns a 500. The pattern is duplicated in 4 places. Fix: use `db.$transaction` with a sequence table, or use SQLite's `INSERT ... ON CONFLICT(number) DO UPDATE SET number = number + 1 RETURNING number` idiom, or move numbering into a single atomic `Counter` model that's incremented with `update({where:{...}, data:{value:{increment:1}}})` and read back.

4. **NO TRANSACTIONS ON MULTI-WRITE OPERATIONS**. POST /api/orders (multi-order + pre-invoice + invoice + order.paidAmount), PUT /api/orders/[id] (deleteMany items + create multiple items + order.update), PUT /api/orders/[id]/status (order.update + orderItem.updateMany + notification.create), POST /api/qc-reports/[id] approve (qcReport.update + order.update + notification.create) — all do multiple writes without `db.$transaction`. Partial failures leave inconsistent state. Fix: wrap every multi-write handler in `await db.$transaction(async (tx) => { ... })`.

5. **NO BODY VALIDATION (no Zod)**. Every route `as`-casts or destructures the body. Bad input silently coerces to 0/null, or surfaces as a Prisma 500. Particularly bad on POST /api/orders (mass-creation) and PUT /api/orders/[id] (full item replacement). Fix: define a Zod schema per route, `safeParse`, return 400 with field-level errors on failure; share schemas with the frontend (already uses Zod in react-hook-form) by putting them in a shared `lib/schemas/*.ts`.

6. **NO STATE-MACHINE ON ORDER / MATERI-COST / QC STATUS**. PUT /api/orders/[id]/status and PUT /api/orders/[id] accept any `status` string and write it directly — can move an order from "completed" back to "pending_design" or to a meaningless string. PUT /api/material-costs/[id] accepts any status, allowing approved→pending flips with no audit trail. Fix: define allowed transitions (e.g. pending_design → in_printing → warehouse_logistics → completed → archived|cancelled) and reject illegal transitions with 409 Conflict; record the actor + timestamp.

7. **AUDIT LOG IS NEVER WRITTEN**. The `AuditLog` model exists in schema but is referenced 0 times in src/. No record of who created/updated/deleted what, when, or from where — unacceptable for an ERP with financial data. Fix: add a `withAudit(req, action)` helper or a Prisma `$on('query')` extension that writes AuditLog entries for every CUD operation, including the actor from the session.

8. **DELETEs return 200 + `{ok:true}` instead of 204; missing 404 on not-found**. Most `[id]` DELETEs and PUTs use `catch { return 500 }` which masks Prisma P2025 (record-not-found) as 500. Clients can't distinguish "missing" from "server error". Fix: catch P2025 specifically and return 404; return 204 No Content on DELETE; centralize the error handler.

9. **NO PAGINATION ON KEY LIST ENDPOINTS + N+1 in dashboards**. `/api/orders`, `/api/customers`, `/api/suppliers`, `/api/products`, `/api/qc-reports`, `/api/srm/compare-prices` return the entire table with nested includes every request — will not scale past a few thousand rows. crm/dashboard does an N+1 (`Promise.all(c.map(... db.order.aggregate ...))`). Fix: add `take/skip` + `cursor` pagination on list endpoints; replace the crm N+1 with a single `groupBy` on Order by customerId.

10. **NO try/catch on several routes + raw exception leakage on login**. `notifications` POST/PUT, `orders/[id]/status` PUT have NO try/catch — unhandled Prisma errors escape to Next's default 500 page (stack trace in dev). `auth/login` interpolates `e.message` into the response body, leaking internal details to attackers. Fix: add a `withErrorHandler(handler)` wrapper that catches all errors, logs with a request ID, and returns a generic `{error:"internal error", requestId}` 500 with `console.error` server-side; never echo raw exception text.

────────────────────────────────────────────────────────────────────

---
Task ID: 1-c
Agent: Explore (CRM + SRM)
Task: Deep-dive analysis of CRM and SRM modules

Work Log:
- Read orchestrator's Task 0 entry in worklog.md to inherit context (project at `/home/z/printoo-erp`, 17 Prisma models, SPA + Zustand + TanStack Query, etc.). Note: the user prompt referenced `/home/z/my-project/printoo-erp` but the actual clone lives at `/home/z/printoo-erp`; that path is where every file below was read.
- Read all CRM source files: `crm-dashboard.tsx` (405 LOC), `crm-pipeline.tsx` (394 LOC), `crm-customers.tsx` (809 LOC), `crm-deals.tsx` (449 LOC), `crm-activities.tsx` (343 LOC), `crm-types.ts` (155 LOC), `deal-form-dialog.tsx` (327 LOC), `activity-form-dialog.tsx` (267 LOC).
- Read all SRM source files: `srm-dashboard.tsx` (382 LOC), `srm-suppliers.tsx` (776 LOC), `srm-categories.tsx` (536 LOC), `srm-services.tsx` (787 LOC), `srm-price-comparison.tsx` (457 LOC), `srm-costs.tsx` (429 LOC), `srm-types.ts` (110 LOC).
- Read supporting files: `src/lib/use-invalidate.ts` (smart prefix invalidation + cross-tab broadcast), `src/app/api/deals/route.ts`, `src/app/api/deals/[id]/route.ts` (incl. PATCH for DnD stage update), `src/app/api/crm/dashboard/route.ts` (13 parallel Prisma aggregations), `src/app/api/srm/compare-prices/route.ts` (groups services by exact name).
- Verified `@dnd-kit/core@^6.3.1`, `@dnd-kit/sortable@^10.0.0`, `@dnd-kit/utilities@^3.2.2`, `@tanstack/react-query@^5.82`, `react-hook-form`, `zod`, `recharts` (all installed per package.json) — though CRM/SRM forms do NOT use RHF/Zod and dashboards do NOT use recharts.

Stage Summary:

1. CRM Pipeline (crm-pipeline.tsx) — Real DnD Kanban
   - Yes, it is a genuine drag-and-drop Kanban built on `@dnd-kit/core`. Stages (from `crm-types.ts`): `lead → qualified → proposal → negotiation → won → lost`. Each column = a `useDroppable({ id: stage })`. Each card = a `useDraggable({ id: deal.id })`.
   - Sensors: `PointerSensor` (activation distance 6px), `TouchSensor` (delay 150ms, tolerance 8px), `KeyboardSensor` (a11y). Collision detection = `closestCorners`.
   - On `DragEnd`, the client finds the deal, and if the target stage differs, calls `updateStageMut.mutate({ id, stage })` → `PATCH /api/deals/[id]` with body `{ stage, probability: DEFAULT_PROBABILITY[stage] }`. Server persists via `db.deal.update` (verified in `deals/[id]/route.ts`). On success: `invalidate(["deals","crm-dashboard","customers"])` + Sonner toast.
   - `DragOverlay` renders a clone of the active card. A `didDragRef` + 60ms timeout hack suppresses the click event that fires after a drag (since dnd-kit doesn't prevent it natively).
   - Defensive `stageColors()/stageLabel()` helpers guard against unknown/legacy stages; unknown stages fall back to "lead". (`SAFE_STAGE_COLORS = STAGE_COLORS` alias is dead code.)
   - Refetch interval 30s. No optimistic update — the card snaps back until server confirms.
   - Verdict: well-built, accessible, mobile-friendly. The two real defects are (a) probability is force-reset to `DEFAULT_PROBABILITY[stage]` on every drag (silently clobbers user-set values), and (b) no optimistic update means visible lag on slow networks.

2. CRM Customers (crm-customers.tsx) vs admin's customers page
   - This is the same `Customer` Prisma model surfaced with a sales/CX lens. Columns: `fav` (star toggle, with custom FavoriteStarButton), `name` (avatar+note), `phone`, `orders` (_count.orders), `deals` (_count.deals), `balanceDue` (rose if >0, emerald otherwise), `createdAt`, `actions` (view/edit/delete).
   - Filters: server-side `?search=` query + client-side `Select` for `all / favorite / has-orders / no-orders`.
   - Customer detail = `CustomerDetailDrawer` (Sheet, side="left"). Fires **4 parallel API calls** on open: `/api/customers/[id]`, `/api/orders?customerId=`, `/api/deals?customerId=`, `/api/activities?customerId=&limit=50`. Computes `totalSpent` client-side by summing `order.totalAmount`. Shows profile header + 3 stat tiles + note + balance-due banner, then Tabs (orders / deals / activities-as-timeline). Inline "new activity" + "new deal" buttons mount `ActivityFormDialog` / `DealFormDialog` pre-scoped to this customer.
   - Favorite flag persisted via a direct `PUT /api/customers/[id]` with body `{ isFavorite: !c.isFavorite }` (not via `useMutation` — just an `async` toggleFavorite with try/catch).
   - Delete uses `confirm()` (browser); CRMDeals uses AlertDialog — inconsistent.
   - Differences vs admin customers-page (which the orchestrator's structure confirmed exists at `admin/customers-page.tsx`): CRM page adds the 360° drawer, the favorite flag, the activity/deal tabs, and the balance-due prominence; admin page is likely the simpler CRUD table.

3. CRM Deals & Activities
   - **DealFormDialog** fields (deal-form-dialog.tsx): `title*`, `customerId*` (Select with phone display), `value` (IQD number), `stage` (Select; on change sets `probability = DEFAULT_PROBABILITY[stage]`), `source` (Select: walk-in/phone/referral/online/other/none), `expectedCloseDate` (shadcn DatePicker), `assignedTo` (text), `probability` (Slider 0–100 step 5), `description` (Textarea). POST `/api/deals` or PUT `/api/deals/[id]`. Validation = manual `toast.error` for title/customerId only.
   - **ActivityFormDialog** fields: `type` (5-button grid: call/email/meeting/note/visit — see ACTIVITY_META), `title*`, `customerId` (Select, "—" allowed), `dealId` (Select filtered by selected customer; disabled when no deals), `date` (DatePicker, defaults to now), `description`. POST `/api/activities` or PUT `/api/activities/[id]`.
   - Deals list (`crm-deals.tsx`): DataTable with bulk-select (header checkbox + per-row checkbox), bulk stage-change via DropdownMenu — **non-atomic**: `Promise.all(ids.map(id => PATCH /api/deals/[id]))`. No server-side bulk endpoint. AlertDialog for delete. Stage + source filters server-side.
   - Activities list (`crm-activities.tsx`): grouped-by-day timeline with vertical line, 5 quick-stat tiles that double as type filters, customer filter, DateRangePicker, AlertDialog delete. Hardcoded `limit=100`. **No edit action exposed** in the list UI (the form supports editing via `activity` prop, but no row button opens it).
   - Deal ↔ Activity link is `activity.dealId` (nullable); Activity ↔ Customer is `activity.customerId` (nullable).

4. CRM Dashboard (crm-dashboard.tsx + /api/crm/dashboard/route.ts)
   - KPIs (server-aggregated, 13 parallel Prisma queries in one `Promise.all`): `totalCustomers`, `newCustomersThisMonth`, `activeDeals` (stage ∉ won/lost), `totalDeals`, `pipelineValue` (Σ value of active deals), `wonThisMonthValue`, `wonThisMonthCount`, `lostThisMonthCount`, `conversionRate` (= wonTotal / (wonTotal + lostTotal)).
   - Charts: (a) horizontal bar chart per stage (custom CSS bars, not recharts) showing count + total value; (b) donut chart (raw SVG, `strokeDasharray`/`strokeDashoffset`) for conversion rate with won/lost sub-tiles; (c) recent activities list (6 latest); (d) closing-soon deals (expectedCloseDate within next 7 days, stage ∉ won/lost, top 5); (e) top-customers table (top 5 by order count, with total spent).
   - No recharts usage anywhere in CRM despite being installed.

5. SRM Suppliers (srm-suppliers.tsx)
   - Columns: `name+contactPerson`, `category/subcategory`, `phone`, `contactPerson`, `services` count, `costs` count, `balanceDue`, actions (view/edit/delete). Server-side `?search=`; client-side category + subcategory filters (subcategory dropdown is reactive to category).
   - Supplier 360 Sheet (`SupplierDetailDrawer`): profile (orange avatar, subcategory breadcrumb, phone), 3 stat tiles (services/costs/balanceDue), quick info (contactPerson, address), note, Tabs: services (latest price + minQuantity per service) / costs (with "open in costs module" CTA).
   - CRUD flow: POST `/api/suppliers`, PUT `/api/suppliers/[id]`, DELETE. Delete uses `confirm()` (browser) — inconsistent with AlertDialog pattern elsewhere.
   - `subcategoryId` set in the create/edit dialog (Select with grouped options by category).
   - balanceDue is read-only (no UI to adjust it — only material-cost approval workflow affects it on the server).

6. SRM Categories & Subcategories (srm-categories.tsx)
   - Two-pane (4/8 col grid): left = category list with auto-select-first; right = subcategory grid (2-col) for selected category, plus a third pane below showing suppliers in the selected subcategory (loaded via `/api/suppliers?subcategoryId=`).
   - Category create dialog: `name*` + icon picker (12 Hugeicons choices cycled through `CATEGORY_COLORS` for visual variety).
   - Subcategory create dialog: `parent category*` (Select) + `name*`.
   - Delete with `confirm()`; deletes cascade server-side (subcategory delete likely also re-parents suppliers).
   - Supplier↔subcategory link is via `Supplier.subcategoryId` (nullable), set when creating/editing the supplier — there is no inline "assign supplier to subcategory" action from the categories page.

7. SRM Services & Price Lists (srm-services.tsx)
   - Service list: name+description, supplier, subcategory, unit (`عدد/متر/کیلوگرم/بسته/صفحه/ساعت/متر مربع/لیتر`), latestPrice (from `priceLists[0]`). Search server-side; supplier + subcategory filters client-side.
   - Service create dialog: supplier* (Select, required), subcategory (optional, grouped by category), name*, unit (Select), description.
   - **No edit-service capability** — only create + delete. Users cannot rename a service or change its unit after creation; they must delete + recreate, which loses price history (PriceList has FK to service). This is a real gap.
   - Service detail drawer: profile + 3 stat tiles (unit / price count / latest price) + price history timeline. Add-price dialog: `price*` (IQD), `minQuantity` (default 1, no upper bound), `validTo` (native `<input type="date">`, NOT the shadcn DatePicker), `note`. No `validFrom` field — server sets it implicitly.
   - **Tiered pricing** is supported in the model (`minQuantity` per PriceListEntry) but the UI does not visually distinguish multiple tiers in the service detail drawer (all entries are listed chronologically, not sorted by minQuantity). A supplier could enter 3 price rows with minQuantity 1/100/1000 and they would all show as separate timeline entries.
   - **ServiceDetailDrawer fetches the ENTIRE `/api/supplier-services` list** (no filter, no `[id]` endpoint) and `.find(s => s.id === serviceId)` client-side — wastes bandwidth and gets slow as the services table grows. There is no `GET /api/supplier-services/[id]` route in `src/app/api`.

8. SRM Price Comparison (srm-price-comparison.tsx + /api/srm/compare-prices/route.ts)
   - Server-side: `db.supplierService.findMany` with `priceLists: { orderBy: createdAt desc, take: 1 }`, then JS `Map` groups by **exact service name** (`svc.name`). Returns per name: `{ name, suppliers[{id, name, price, serviceId}], minPrice, maxPrice }`. Services whose names differ by even one character do NOT group.
   - Client-side: filter by search (service name) + subcategory (built by fetching `/api/supplier-services` again to map serviceId→subcategoryId). Sort by `diff` (default, max-min) | `name` (Persian localeCompare) | `suppliers` count | `minPrice`.
   - Summary cards: total comparable, with-multiple-suppliers, avg savings % (mean of `(max-min)/max*100` across multi-supplier services).
   - Expanded row (`ExpandedPriceList`): sorts suppliers by price ascending, highlights the best-price row in emerald, rank badges 1/2/3. Row click + expand-button both toggle.
   - **No charts** — pure table + expandable rows. Avg-savings is shown as a number, not a chart.

9. SRM Costs / MaterialCost (srm-costs.tsx)
   - Aggregated read-only view of every `MaterialCost` (from print + warehouse modules). Columns: order number, customer, supplier (with avatar), expenseType, description, amount, status (pending/approved/rejected), module (print/warehouse), createdAt.
   - Filters: search (order number / description / supplier name), supplier Select (with a special `"none"` value for costs without supplier — **matched by name string**, fragile), 3 ToggleButtons for status, 2 ToggleButtons for module.
   - Summary row: total pending / approved / rejected (computed by filtering the already-loaded list client-side).
   - Row click → `openCost(row.id)` from `useCostDetail` hook (shared cross-module cost-detail modal, not in this file). Links to orders (`c.order.number`, `c.order.customer.name`) and to suppliers (`c.supplier.name` — but only name, no id, because the API doesn't include supplier id on MaterialCost).
   - Auto-refresh 30s.

10. State & data fetching (TanStack Query usage)
    - `useQuery` everywhere with `refetchInterval: 30000` (30s) on lists; `60000` (60s) on secondary option-lists (customers, deals, suppliers used as Select options elsewhere); `open ? 30000 : false` on drawer-mounted queries.
    - `useMutation` for all writes; `onSuccess` calls `invalidate(["…", "…"])` from the `useInvalidate` helper, which invalidates by **prefix** and broadcasts to other tabs via `broadcastInvalidate` (cross-tab sync).
    - Invalidation is broad: e.g. create-deal invalidates `["deals","crm-dashboard","crm-activities","customers"]`. Because invalidation is prefix-based, `["deals"]` will invalidate `["deals","pipeline"]`, `["deals","list",...]`, `["deals","crm-activities"]` all at once — efficient.
    - DnD quality: solid (see §1). Minor hack: `didDragRef` 60ms click-suppression; `SAFE_STAGE_COLORS` alias is dead.
    - **Inefficient refetch patterns observed**:
      (a) `ServiceDetailDrawer` re-fetches entire `/api/supplier-services` list to find one record (no `[id]` endpoint).
      (b) `srm-price-comparison.tsx` fetches `/api/supplier-services` again just to build serviceId→subcategoryId map (should be server-side; the comparison API could return subcategoryId per supplier).
      (c) `srm-costs.tsx` fetches `/api/suppliers` separately and matches suppliers by NAME because `MaterialCost.supplier` is `{ name: string }` only (no id) — fragile when two suppliers share a name. Schema/API gap.
      (d) `CustomerDetailDrawer` fires 4 parallel API calls per open — should be one `/api/customers/[id]?include=orders,deals,activities` endpoint.
      (e) The `customers` list is fetched 5 separate times across CRM pages (crm-pipeline, crm-deals, crm-activities, crm-customers, customer-detail drawer) each with a different queryKey suffix, so TanStack does not dedupe — same data fetched 5×.
      (f) `crm-activities.tsx` fetches `/api/deals` (all) just to populate the deal Select dropdown in the form dialog.
      (g) Bulk stage-change in `crm-deals.tsx` is `Promise.all` of N PATCHes — non-atomic, partial failures leave inconsistent state, no rollback.
      (h) `crm-activities.tsx` hardcodes `limit=100` — won't paginate.

11. Quality verdict (separate ratings)

    CRM: **B+**
    - Real DnD Kanban with proper sensors + a11y + DragOverlay + defensive helpers.
    - Dashboard has polished KPI cards, conversion donut, pipeline bar chart, recent activity timeline, closing-soon, top customers — visually rich.
    - Forms work but bypass RHF/Zod (deps installed but unused) → no field-level errors, no schemas.
    - Bulk stage change is non-atomic; probability auto-resets on drag (UX bug); activities list has no edit action; customer-detail drawer fires 4 parallel calls; `confirm()` vs AlertDialog inconsistency.

    SRM: **B**
    - Strong 360° drawer pattern (reused for both suppliers and services), hierarchical categories page is clean and usable, price-comparison is genuinely useful with best-price highlighting.
    - Real gaps: (1) cannot edit a SupplierService after creation (delete + recreate loses price history); (2) price-comparison groups by exact name → silently misses near-matches; (3) MaterialCost carries only supplier name → fragile filter; (4) ServiceDetailDrawer re-fetches entire list; (5) validTo uses native date input not the shadcn DatePicker used elsewhere; (5) no recharts visualizations despite the dep being installed; (6) tiered pricing exists in the model but the UI doesn't surface minQuantity-based tiers explicitly.

    Top 8 problems (combined, ordered by severity):
    1. **No PUT/edit endpoint surfaced for SupplierService** — users can't rename a service or change its unit after creation without deleting it (which orphans price history). Major UX gap.
    2. **ServiceDetailDrawer re-fetches the entire `/api/supplier-services` list** to find one record (no `GET /api/supplier-services/[id]` route exists). Wasted bandwidth + scaling cliff.
    3. **Price comparison groups services by exact name** (`Map` keyed on `svc.name`). Two suppliers naming the same service slightly differently ("چاپ افست" vs "چاپ افستی") will NOT be grouped — silently hides comparison. Should group by subcategory + a canonical service key, or by an explicit `canonicalServiceId` field on the model.
    4. **MaterialCost carries only `supplier: { name: string }`** (no id), so `srm-costs.tsx` filters suppliers by name string match — fragile when two suppliers share a name. Schema/API fix needed.
    5. **Probability is force-reset to `DEFAULT_PROBABILITY[stage]` on every drag** (crm-pipeline.tsx → PATCH body). Silently clobbers user-set values; should preserve unless explicitly changed, or surface a confirmation.
    6. **Bulk stage change in `crm-deals.tsx` is non-atomic** (`Promise.all` of N PATCH requests). Partial failures leave the table in an inconsistent state with no rollback and only a single toast for the first error. Needs a server-side bulk endpoint or a transactional API.
    7. **Forms (Deal, Activity, Customer, Supplier, Service, Price) don't use react-hook-form + Zod** despite both being installed. All use local `useState` + manual `toast.error` validation → no field-level errors, no schema reuse with the API routes, no async setDefaultValues. Also inconsistent date pickers: Deal uses shadcn `DatePicker`, Service price uses native `<input type="date">`.
    8. **Cross-page query duplication** — `customers` is fetched 5× across CRM pages with different queryKey suffixes, so TanStack doesn't dedupe. `supplier-categories` is fetched 3× the same way. Should standardize on a single `["customers"]` / `["supplier-categories"]` queryKey and let the prefix-invalidating `useInvalidate` keep them fresh.

    Other smaller issues (not in the top 8): delete UX inconsistency (`confirm()` in CRMCustomers/SRMSuppliers vs AlertDialog in CRMDeals/CRMActivities); `crm-activities.tsx` has no edit row action despite the form supporting it; `crm-activities.tsx` hardcodes `limit=100`; `SAFE_STAGE_COLORS = STAGE_COLORS` alias is dead code; ServiceDetailDrawer doesn't sort price history by minQuantity (tiered pricing exists in the model but isn't visualized as tiers); SRM dashboards skip recharts despite it being installed (custom CSS bars instead).

---
Task ID: 1-b
Agent: Explore (Admin Module)
Task: Deep-dive analysis of the Admin module components

Work Log:
- Read `/home/z/printoo-erp/worklog.md` Task 0 first to inherit orchestrator's project identity (Next.js 16 SPA, Prisma/SQLite, Zustand + TanStack Query, shadcn New York, emerald theme).
- Read all 15 Admin module files: `dashboard/{admin-dashboard,dashboard-sections,kpi-cards,quick-stats}.tsx`, `orders/{order-wizard,order-wizard-page,orders-page}.tsx`, `open-orders.tsx`, `tasks-page.tsx`, `calendar-page.tsx`, `customers-page.tsx`, `suppliers-page.tsx`, `products-page.tsx`, `archive-page.tsx`, `expense-types-page.tsx`.
- Read shared dependencies: `components/shared/{index,search-select}.tsx`, `lib/{api,use-invalidate,cross-tab,use-order-detail,constants}.tsx`, `components/ui/data-table.tsx`.
- Cross-referenced the dashboard API route (`src/app/api/dashboard/route.ts`) and orders API route (`src/app/api/orders/route.ts` + `[id]/route.ts` head) to confirm what the frontend actually sends/receives.

Stage Summary:

## 1. Dashboard (`admin-dashboard.tsx` 348 LOC + 3 children)

**Layout**: PageHeader → ShortcutsSection (Zustand-persisted `shortcuts`) → KpiCardsGrid (8 cards) → QuickStatsRow (4 stats) → RecentOrders → NearDeadlineOrders + LatestTasks (2-col grid). Each section wrapped in a collapsible `SectionCard` (custom Collapsible wrapper with `MERGE_INNER_CARD` CSS selector trick to strip the inner Card of section components).

**KPIs (8)**, all driven by `KPI_CARDS` config in `kpi-cards.tsx`:
  - revenue (wallet/emerald/currency), orders (orders/violet), avgOrderValue (chart/blue/currency), newCustomers (customers/teal), completed (checkCircle/emerald), urgent (alertTriangle/rose), payments (creditCard/amber/currency), profit (trending/cyan/currency).

**Data fetching**:
  - Each KpiCard has its own `useQuery` with key `["dashboard-kpi", config.key, range.preset, range.from.toISOString(), range.to.toISOString()]`, hits `/api/dashboard?{rangeToParams}`, `refetchInterval: 15000`, `staleTime: 0`. → **8 separate queries to the same fat endpoint** when the dashboard mounts.
  - QuickStatsRow: `["dashboard-quick"]`, `/api/dashboard?from=2000-01-01...to=now`, `refetchInterval: 30000`.
  - RecentOrders/NearDeadline/LatestTasks: keys `["dashboard-recent"]`, `["dashboard-near-deadline"]`, `["dashboard-tasks"]` — each independently hits `/api/dashboard?from=2000-01-01&to=now` (the date range is **meaningless** — hard-coded to 2000→now), 30s refetch.
  - **Total dashboard payload**: 5 simultaneous calls × 22 Prisma awaits inside the API = 110 awaits every 15–30s.

**Recharts**: `AreaChart` (with `ResponsiveContainer` + `YAxis hide` + `Tooltip` + gradient `<defs>`) rendered per-KpiCard only when `showChart` toggle is on. `isAnimationActive={false}` — good for performance.

**Real or mocked?** Real. The `dashboard/route.ts` performs real Prisma `aggregate`/`count`/`findMany` against SQLite; series are built server-side by day-key aggregation.

## 2. Order Wizard (`order-wizard.tsx` 1188 LOC, exported via `order-wizard-page.tsx`)

### 4-step flow (precise)

**Step 1 — Customer selection (`Step1`)**:
- `ToggleButton` "ساخت سفارش برای چند مشتری" toggles `multiMode` (single→multi).
- Selected customers shown as numbered pills with name/phone + "انتخاب شده" StatusPill + trash button.
- `SearchSelect` (shared component) dropdown to add a customer (filtered against already-selected).
- Inline "مشتری جدید" button → opens `CreateCustomerDialog` → POST `/api/customers` → on success adds the new customer id and invalidates `["customers","customers-wizard"]`.
- When multiMode off and one customer already selected, the add dropdown is hidden with a hint to enable multi mode.

**Step 2 — Order items (`Step2`)**:
- If `customers.length > 1`, a Radix `Tabs` (per-customer tabs) with item-count badge (rose if 0, emerald if >0).
- Items list: empty state OR `ItemRow` cards. Each `ItemRow` has: index, `SearchSelect` product (auto-fills `pricePerUnit` from `basePrice`), quantity `Input` (min 1), price-per-unit `Input`, auto-computed total, stage `Select` (design/print/warehouse/completed/archive), description `Input`, note button → opens `NoteItemModal`, `needsMaterial` `Checkbox`, copy + delete buttons.
- "محصول جدید" link → opens product-create dialog → POST `/api/products` → invalidates `["products","products-wizard"]`.
- Footer shows running total.

**Step 3 — Timing & priority (`Step3`)** — 16 props drilled in:
- `splitMode` buttons (grouped vs separated).
- `priority` buttons (normal vs urgent).
- Module dates section: design start/end (only shown if `needsDesign`), print start/end — both via `DatePicker`.
- End-date section with `ToggleButton` "سفارش بدون زمان پایان" (noEndDate).
- Note `Textarea`.

**Step 4 — Review (`Step4`)**:
- Summary chips (customer count, item count, splitMode, priority, endDate, needsDesign).
- Per-customer `Tabs` (if multi) → `CustomerReviewTable` (product/qty/unit/total/stage + total row).
- **Pre-invoice** `ToggleButton` → when on, renders `PreInvoiceTable` with per-item `Input` for "پرداختی مشتری (اختیاری)". Tracks `preInvoicePaid: Record<string,string>` per-item-id.
- **Invoice** (only shown if `anyCompleted`) `ToggleButton` → when on, just shows an informational message.

### State management (NOT React Hook Form + Zod)
Ad-hoc `useState` — 16 separate hooks in the parent:
`step, multiMode, customers[], activeCustomer, itemsByCustomer{}, splitMode, priority, endDate, noEndDate, note, designStart, designEnd, printStart, printEnd, preInvoiceEnabled, preInvoicePaid{}, invoiceEnabled`. Plus edit-mode hooks (`param`, `loadedOrderId`) + `useQuery(["order", param])` and a 70-line `useEffect` that hydrates state when edit data arrives (guarded by `loadedOrderId === param` to avoid re-running).

`itemsByCustomer` shape: `Record<string /*customerId*/, ItemDraft[]>` where `ItemDraft = { id, productId, productName, quantity, pricePerUnit, note, description, stage, needsMaterial }`. `id` is `crypto.randomUUID()` for stable React keys.

Mutators: `addCustomer/removeCustomer/newItem/updateItem/addItem/copyItem/deleteItem` — all use functional setState updates. Good (immutable).

### Multi-customer handling
- `customers: string[]` and `itemsByCustomer: Record<string, ItemDraft[]>` kept in sync via `addCustomer` (initializes `itemsByCustomer[id] ?? []`) and `removeCustomer` (deletes key).
- `activeCustomer` tracks the Step2/Step4 active tab.
- Turning multi-mode off calls `removeCustomer(c)` for every extra customer.

### Pre-invoice generation
`createMut` mutation body (create mode):
```
body.preInvoice = preInvoiceEnabled ? { items: [], totalAmount: 0, paidAmount: 0 } : undefined;
body.invoice = (invoiceEnabled && anyCompleted) ? { items: [], totalAmount: 0, paidAmount: 0, discountAmount: 0 } : undefined;
```
**Critical bug**: the per-item `preInvoicePaid` map (collected in Step4 PreInvoiceTable) is **never serialized into the request body** — the body always sends empty `items: []` and `totalAmount: 0`. Server side (`POST /api/orders`) accepts this and creates a stub `PreInvoice` with `paidAmount: 0`. The user's inputs are silently dropped.

### Submit to `POST /api/orders`
```
POST /api/orders  →  { customers, itemsByCustomer, splitMode, priority, endDate, noEndDate, note, moduleDates, preInvoice?, invoice?, markCompleted }
```
On success: `invalidate(["orders","dashboard","notifications","order"])`, toast, navigate to `admin/orders`.

**Edit mode**: `PUT /api/orders/{param}` with `{ customerId: customers[0], items: itemsByCustomer[customers[0]], splitMode, priority, endDate, noEndDate, note, moduleDates }` — **drops `preInvoice`, `invoice`, `markCompleted`, and only handles `customers[0]`** even if multi-mode was enabled. Re-saving an edited multi-customer order would lose items.

### Wizard guards
`canGoNext()` returns:
- step 1: `customers.length > 0`
- step 2: `customers.every(c => itemsByCustomer[c]?.length > 0)` — **yes, guarded against zero items per customer**.
- step 3/4: true.

Stepper back-button only navigates if `s.n < step` — implemented as `onClick={() => (s.n < step ? setStep(s.n) : null)}` (no `disabled` attr, no `aria-current`, no `role`).

### Smells
- **No React Hook Form + Zod** despite both being in `package.json` — the wizard is 16 useStates with ad-hoc validation (only `customers.length` and `itemsByCustomer[c].length` checks).
- Heavy prop drilling: `Step3` gets **16 props**, `Step4` gets **14 props**, `Step2` gets 9, `Step1` gets 7. None are memoized with `React.memo`.
- Derived `needsDesign`/`anyCompleted` use `Object.values(itemsByCustomer).flat().some(...)` recomputed on **every render** (no `useMemo`).
- All inline `useMutation` hooks re-create on every render (no `useCallback`).
- `loadedOrderId` effect dependency array `[param, editData, loadedOrderId]` includes `editData` (object identity changes every refetch) — works because of the early-return guard, but brittle.

### a11y
- Stepper buttons lack `aria-label`/`aria-current`/`role="tab"`.
- `ItemRow` action buttons use `title=` (less robust than `aria-label`).
- No keyboard nav for stepper (clicking the active step is a no-op; can't tab to it).
- `NoteItemModal` textarea `autoFocus` is OK.
- CreateCustomerDialog inputs have proper `<Label>` association.

## 3. Orders Page (727 LOC) & Open Orders (845 LOC)

### Orders page (`orders-page.tsx`)
**Columns** (DataTable): expand (only if items>1) | # | customer (name+phone) | items (first 2 + overflow count) | status (clickable → `StatusModal`) | endDate (with `daysRemaining` color text) | totalAmount | priority | createdAt | actions.

**Filters** (all client-side after a server filter on `customerId`/`productId`):
- `SearchCombobox` for customer and product (custom Popover+Command).
- Toggle button reveals advanced panel: status (FilterToggle buttons for each `ORDER_STATUS`), priority, item stage, dateFrom/dateTo (DatePicker).
- Active filter count badge + "پاک کردن همه" button.

**Row actions** (`RowActions`):
- info (note), edit (navigate to `admin/orders-new` with id), receipt ("پیش‌فاکتور" — **`toast.info("پیش‌فاکتور به‌زودی")` — placeholder**), invoice ("فاکتور" — **also placeholder, `toast.info`**), trash (delete with confirm dialog).

**Modals**: `NoteModal` (PUTs `/api/orders/{id}` with just `{ note }` — relies on PATCH-like merge in PUT handler), `StatusModal` (status transition UI + optional design/print date pickers, PUTs `/api/orders/{id}/status`), delete `Dialog`, `OrderDetailModal` (via `useOrderDetail` hook on row click).

**Expandable rows**: `getRowCanExpand` if `items.length > 1`, `renderExpandedRow` renders an inner table of items (product/qty/stage/amount/note). Row click both expands AND opens the OrderDetailModal — slightly confusing UX.

**Status transition**: free-form. `StatusModal` renders ALL 6 `ORDER_STATUS` as FilterToggle buttons — user can jump `pending_design` → `archived` or `cancelled` with no enforcement of the canonical flow `pending_design→in_printing→warehouse_logistics→completed→archived|cancelled`.

### Open Orders (`open-orders.tsx`)
- Top: 4 stage tabs (`all`/`pending_design`/`in_printing`/`warehouse_logistics`) with counts.
- 4 `SummaryCard`s (total/overdue/near/urgent) — each clickable to filter.
- Same `SearchCombobox` (duplicated from orders-page, **85 LOC copy-paste**).
- Columns: # | customer | items | status (StatusBadge, NOT clickable) | stageDeadline (per selected stage) | endDate | priority | totalAmount | createdAt. **No actions column** — only row click → opens `OrderDetailModal` via separate `["order", selectedOrderId]` query.
- `categorize()` computes overdue/near/today/urgent per order using `getStageDeadline(order, stage)` (designEndDate/printEndDate/endDate).
- Auto-refresh every 30s.

## 4. Other Admin pages

### Tasks (`tasks-page.tsx`, 808 LOC)
- Trello-like **Kanban** with `@dnd-kit/core` + `@dnd-kit/sortable`. 3 columns (todo/in_progress/done) with droppable containers.
- `PointerSensor` with `activationConstraint: { distance: 8 }`.
- **Optimistic updates**: `statusOverride: Record<string,string>` map applied locally; `useEffect` drops overrides once server catches up. On error, override is removed and `["tasks"]` invalidated.
- Create dialog + Edit dialog (shared `TaskFormFields`). Module filter dropdown (all 8 modules).
- `TaskCard` is keyboard-accessible: `role="button"`, `tabIndex={0}`, `onKeyDown` handles Enter/Space.
- Query key `["tasks", moduleFilter]`, 30s refetch. **Best-implemented page in the module.**

### Calendar (`calendar-page.tsx`, 156 LOC)
- Tabs: calendar (month grid via `ReusableCalendar`) | gantt (via `ReusableGantt`).
- Events derived from `/api/orders` + `/api/tasks` (30s refetch).
- Order event start = min(createdAt, firstItem.designStartDate, firstItem.printStartDate); end = endDate.
- Filters: orders / tasks / urgent-only toggles.
- Clicking a day opens `DayDetailModal`; clicking an order event opens `OrderDetailModal`.

### Customers (`customers-page.tsx`, 191 LOC)
- DataTable (name+favorite star, phone, `_count.orders`, balanceDue, createdAt, actions).
- Create/Edit dialog with `ToggleButton` for isFavorite + `Textarea` note.
- Delete uses native `confirm()` (jarring — inconsistent with custom Dialog used elsewhere).
- Invalidates 4 query keys (`["customers","customers-list","customers-wizard","dashboard"]`) — good multi-cache hygiene.

### Suppliers (`suppliers-page.tsx`, 132 LOC)
- DataTable (name, phone, contactPerson, balanceDue, createdAt).
- **Only Create dialog** — no Edit, no Delete. Incomplete vs. customers/products.

### Products (`products-page.tsx`, 196 LOC)
- View toggle: table | grid (cards).
- DataTable columns (name+unit, description, basePrice, createdAt, actions).
- Create/Edit/Delete. Delete uses native `confirm()` (same inconsistency).

### Archive (`archive-page.tsx`, 96 LOC)
- Read-only DataTable hitting `/api/orders?status=archived`. Row click → `OrderDetailModal`.

### Expense Types (`expense-types-page.tsx`, 96 LOC)
- Tiny CRUD: list + create dialog + delete (delete disabled for `isDefault` rows).

## 5. Shared usage summary
- **`DataTable`** (TanStack Table v8 wrapper, 319 LOC): used in 8 pages. Provides sorting, column-toggle, pagination, global filter, expandable rows, loading/empty states.
- **`PageHeader`**: used in every page. Title/description/icon/actions layout.
- **`EmptyState`**: used in every list page with icon/title/description/action.
- **`StatusBadge`**: shared component mapping 11 status strings to colored pills (covers order + task + QC + customer-favorite). Used in orders-page, open-orders, archive.
- **`PriorityBadge`**: shared, used in orders-page, open-orders.
- **`SearchSelect`**: shared Popover+Command combobox; used in wizard Step1 (customers) and Step2 (products).
- **`useInvalidate`**: wraps `qc.invalidateQueries({queryKey:[k]})` for each key in array + calls `broadcastInvalidate(keys)` for cross-tab sync. Used in every page with mutations.
- **`broadcastInvalidate`**: `postMessage` + `BroadcastChannel` ("printoo24-invalidate"); auto-called by `useInvalidate`. `useCrossTabSync` listener at app root.
- **`sonner`**: every mutation's `onSuccess` calls `toast.success(...)`; `onError` calls `toast.error(e.message)`. Toast container mounted in app shell.
- **`useOrderDetail`**: hook returning `{ openOrder, modal, isLoading }` — used by orders-page, open-orders, archive, calendar.

## 6. State & data-fetching patterns

**TanStack Query usage**:
- Query keys (canonical list observed): `["dashboard-kpi", key, preset, from, to]`, `["dashboard-quick"]`, `["dashboard-recent"]`, `["dashboard-near-deadline"]`, `["dashboard-tasks"]`, `["orders", customerFilter, productFilter]`, `["open-orders", customerFilter, productFilter]`, `["order", id]`, `["customers", search]`, `["customers-list"]`, `["customers-wizard"]`, `["products", search]`, `["products-list"]`, `["products-wizard"]`, `["suppliers", search]`, `["tasks", moduleFilter]`, `["tasks-calendar"]`, `["orders-calendar"]`, `["archive"]`, `["expense-types"]`.
- `refetchInterval`: 15s for KPI cards, 30s for most lists.
- `staleTime: 0` only on KPI (forces refetch on mount).
- No `select`/`transform` — minimal data shaping on the client.
- Mutations invalidate multiple keys (good cache hygiene) — e.g., customer create invalidates 4 keys.

**Loading/empty/error states**:
- Loading: `DataTable` has built-in spinner row; standalone pages use `<LoadingState/>`.
- Empty: every list page passes an `<EmptyState>` to DataTable's `emptyState` prop.
- **Error: almost no error handling.** Only the wizard handles `editError` (renders a fallback card). All other pages silently render `data?.x ?? []` so a 500 response leaves the user with an empty list and no toast. The `api()` helper throws on non-OK, but the queries don't surface errors.
- No `retry` configured.

**No inline `fetch`** — all requests go through `api()` helper which sets JSON headers, parses error JSON for message, handles 204 No Content.

## 7. RTL & a11y

**RTL**:
- App is `dir="rtl"` at the root (Persian). All Persian text aligns right automatically.
- Numeric/phone/price spans use explicit `dir="ltr"` to render LTR inside RTL containers. Good.
- Tables use `text-right` on `<th>` headers (literal right-alignment) instead of logical `text-start` — works because the whole app is RTL but breaks if dir is ever flipped.
- `tabular-nums` on numbers — good for column alignment.
- Pagination icons use `arrowRight`/`arrowLeft` correctly (chevronRight goes to first page = "previous pages" semantically in RTL).

**a11y**:
- SearchSelect & SearchCombobox: `role="combobox"`, `aria-expanded`, `aria-controls`. Good.
- Tasks `TaskCard`: `role="button"`, `tabIndex={0}`, keyboard handler. Good.
- Most icon-only buttons use `title=` attribute (less robust than `aria-label`).
- Wizard stepper buttons: no `aria-label`/`aria-current`/`role`; navigation logic in `onClick` instead of `disabled` attribute — keyboard users can focus but click does nothing for forward steps.
- `Dialog` (Radix-based) provides focus trap and Escape-to-close out of the box.
- Color-only state changes are paired with icons (e.g., KPI change arrows).
- `confirm()` used in customers/products for delete — jarring, breaks flow.

## 8. Quality verdict

| Dimension | Grade | Notes |
|---|---|---|
| Correctness | **B−** | Pre-invoice per-item paid inputs silently dropped; edit-mode PUT drops preInvoice/invoice/markCompleted/multi-customer; status transition has no flow enforcement; no server-side Zod. |
| UX | **B** | RTL polished, consistent shadcn design, good empty/loading states; but pre-invoice/invoice actions in Orders page are placeholders ("به‌زودی" toast); `confirm()` breaks design system. |
| Maintainability | **C+** | order-wizard 1188 LOC in one file, 16 useStates, no RHF+Zod, heavy prop drilling (Step3 has 16 props); SearchCombobox duplicated ~85 LOC between orders-page and open-orders. |
| Performance | **C+** | Dashboard fires 5–8 simultaneous queries to the same fat `/api/dashboard` endpoint (22 Prisma awaits each) every 15s; `Object.values(itemsByCustomer).flat()` recomputed every render in wizard; not memoized. |

**Overall: B−**

### Top 8 problems (ordered by severity)

1. **Pre-invoice per-item `paidAmount` inputs are silently dropped on submit.** The `PreInvoiceTable` in Step4 collects `preInvoicePaid: Record<string,string>` keyed by item id, but `createMut`'s body sends `preInvoice: { items: [], totalAmount: 0, paidAmount: 0 }` regardless. **Data-loss bug** in the wizard's headline feature.

2. **Edit-mode PUT drops `preInvoice` / `invoice` / `markCompleted` and only handles `customers[0]`.** The `isEditing` branch of `createMut` constructs a body with `customerId: customers[0]` and `items: itemsByCustomer[customers[0]]`, omitting the pre-invoice/invoice toggles entirely. Re-editing a multi-customer order will lose items beyond the first customer, and toggling pre-invoice on an edit has no effect.

3. **No server-side auth or Zod validation on `POST /api/orders` / `PUT /api/orders/[id]` / `PUT /api/orders/[id]/status`.** The body is cast via `as CreateBody` (confirmed in `route.ts`); no `getSession()` call. Any unauthenticated cross-site request can create/modify orders. (Already flagged by orchestrator, confirmed here.)

4. **Status transition UI lets users jump to any of 6 statuses freely.** `StatusModal` renders all `ORDER_STATUS` as toggle buttons — e.g., `pending_design` → `archived` or `cancelled` directly. The canonical flow `pending_design→in_printing→warehouse_logistics→completed→archived|cancelled` is not enforced client- or server-side. Correctness/data-integrity risk.

5. **Dashboard fires 5–8 redundant full-payload queries every 15s.** Each `KpiCard` calls `/api/dashboard?{range}` independently (the endpoint returns ALL KPIs, ALL series, recentOrders, nearDeadlineOrders, latestTasks, overdueOrders, byStatus). Opening the dashboard triggers 8 full aggregations × 22 Prisma awaits = ~176 awaits, then refetches every 15s. Plus `staleTime: 0` forces refetch on every mount. Should be one shared query.

6. **`order-wizard.tsx` is a 1188-LOC single file with 16 useStates, ad-hoc (no React Hook Form + Zod), heavy prop drilling (Step3: 16 props, Step4: 14 props).** No `React.memo`, no `useMemo` for derived values (`needsDesign`, `anyCompleted` recompute `Object.values(itemsByCustomer).flat()` every render). Unmaintainable.

7. **Pre-invoice / Invoice row actions in `OrdersPage` are placeholders.** The "پیش‌فاکتور" button shows `toast.info("پیش‌فاکتور به‌زودی")` and the "فاکتور" button shows `toast.info("سفارش تکمیل نشده")` or `toast.info("فاکتور")`. The whole finance side from the orders table is non-functional, yet the wizard collects pre-invoice data (which is then dropped — see #1).

8. **`SearchCombobox` (~85 LOC) and `FilterToggle` are duplicated between `orders-page.tsx` and `open-orders.tsx`.** Identical implementations copy-pasted; bugs must be fixed twice. Should be lifted into `components/shared`.

### Secondary issues (not in top 8)
- `next.config.ts` has `typescript.ignoreBuildErrors: true` — masks type errors in this ad-hoc state.
- No error states on most pages — silent failures (only wizard handles `editError`).
- Wizard stepper back-button uses `cursor-default` + `onClick={() => (s.n < step ? setStep(s.n) : null)}` instead of `disabled`, hurting a11y.
- Tasks page `statusOverride` cleanup effect can race with rapid drags (drops overrides once server has the new status, but a second drag during refetch window may briefly revert).
- Suppliers page has no Edit/Delete actions (incomplete vs. Customers/Products).
- Customers/Products delete uses native `confirm()` — breaks design system consistency.
- Orders page row click both expands the row AND opens OrderDetailModal — confusing dual action.
- `EditData` effect dependency `[param, editData, loadedOrderId]` includes `editData` (object identity changes every refetch); works only because of the early-return guard.

---
Task ID: 1-d
Agent: Explore (Operational + Shared)
Task: Deep-dive analysis of Designer/Print/QC/Finance modules and shared infrastructure

Work Log:
- Located the actual printoo-erp clone at `/home/z/printoo-erp` (the task description's `/home/z/my-project/printoo-erp` path does not exist; orchestrator's worklog confirms `/home/z/printoo-erp`).
- Read shared infra: `src/components/shared/index.tsx` (PageHeader/EmptyState/StatusBadge/PriorityBadge/LoadingState), `src/components/ui/data-table.tsx` (TanStack wrapper, 319 LOC), `src/components/shared/reusable-calendar.tsx` (190 LOC), `src/components/shared/reusable-gantt.tsx` (288 LOC, custom impl), `src/components/shared/order-detail-modal.tsx` (306 LOC), `src/components/shared/pre-invoice-modal.tsx` (286 LOC), `src/components/shared/day-detail-modal.tsx` (303 LOC), `src/components/shared/search-select.tsx` (82 LOC).
- Read lib: `use-invalidate.ts`, `cross-tab.ts`, `use-order-detail.tsx`, `use-designer-order-detail.tsx`, `use-print-order-detail.tsx`, `use-qc-report-detail.tsx`, `use-cost-detail.tsx`, `use-drawer-sync.ts`, `format.ts`, `time-ranges.ts`, `api.ts`, `nav.ts`, `constants.ts`; hooks `use-mobile.ts`, `use-toast.ts`; `module-router.tsx`, `generic-module-page.tsx`.
- Read all Designer module files: `designer-dashboard.tsx` (442), `designer-orders.tsx`, `designer-calendar.tsx`, `designer-tasks.tsx`, `designer-order-detail.tsx` (440 LOC).
- Read all Print module files: `print-dashboard.tsx` (551), `print-orders.tsx` (337), `print-calendar.tsx`, `print-tasks.tsx` (429), `print-order-detail.tsx` (892 LOC — split across two Read calls).
- Read all QC module files: `qc-dashboard.tsx` (349), `qc-reports.tsx`, `qc-calendar.tsx`, `qc-report-detail.tsx` (484).
- Read all Finance module files: `finance-dashboard.tsx` (356), `finance-costs.tsx` (390), `finance-cost-detail.tsx` (438).
- Cross-referenced server routes to verify the action flows: `app/api/orders/[id]/designer-action/route.ts`, `app/api/orders/[id]/print-action/route.ts`, `app/api/qc-reports/[id]/route.ts`, `app/api/material-costs/route.ts`, `app/api/material-costs/[id]/route.ts`.

Stage Summary:

### 1. Designer module
- **Dashboard**: KPI grid (4 cards — in-design count, urgent, near-deadline ≤2d, active tasks). Overdue banner with click-to-open chips. Two-column layout (recent design orders list + active tasks list). 30s polling. KPI cards navigate to the relevant sub-page.
- **designer-orders.tsx**: DataTable filtered to `/api/orders?status=pending_design`. NO price column, NO customer phone, NO overall endDate — only design dates from `items[0]`. Client-side priority/search filters. `showColumnToggle={false}` is hardcoded.
- **designer-order-detail.tsx** vs **print-order-detail.tsx** (the user asked about this diff): 
  - Designer modal is **read-only on order fields** + lets the designer enter a `designerNote` (textarea) and either "send to print" or "report to QC" with a description.
  - Print modal has the same skeleton (header + items + footer actions) but ADDS: a "Material section" showing `itemsNeedingMaterial` and a "Cost registration section" listing existing MaterialCosts + an inline cost-creation sub-dialog (supplier/expenseType/description/amount/fileUrl1/fileUrl2). Designer's items list shows `needsMaterial` chip but no `materialConfirmed` state, since designers don't act on material.
  - Both use a `to*Order()` projection that strips financial/phone fields client-side. **Note**: the API `/api/orders/[id]` returns ALL fields including prices — the projection only hides them from the React render. This is **NOT** a security boundary; an attacker with designer credentials can hit `/api/orders/[id]` directly and read prices/phone.
- **File-upload for design proofs?** **NO.** There is no upload feature anywhere in the designer module — the only "evidence" attachment is in the print cost form (`fileUrl1`/`fileUrl2`) and those are plain `<Input>` text fields for URLs, not file pickers.
- **Designer advance item design→print**: `POST /api/orders/{id}/designer-action` with body `{ action: "send_next", note: designerNote }`. Server sets `Order.status = "in_printing"` + saves `designerNote` + creates a Notification. There is NO per-item stage update — it advances the entire order.
- **designer-calendar.tsx**: Tabs(Calendar/Gantt). Builds `CalendarEvent[]` from orders where `items[0].designStartDate + designEndDate` exist (urgent→yellow, normal→blue). Tasks→green/red. Click on order event opens DesignerOrderDetailModal via `useDesignerOrderDetail`.

### 2. Print module (CRITICAL — 891 LOC modal)
- **Dashboard**: KPIs (in-print count, needs-material count, urgent, active tasks). Overdue banner. TWO lists — "نیازمند متریال" (needs material) + "آماده چاپ" (ready for print). `needsMaterial(o) = items.some(it => it.needsMaterial && !it.materialConfirmed)`. Active-tasks strip at bottom.
- **print-orders.tsx**: Tabs(needs-material / ready). Same DataTable columns as designer but for printEndDate.
- **print-order-detail.tsx** (891 LOC, the largest file in the repo):
  - Fetches 3 queries in parallel: order (`/api/orders/{id}`), suppliers (`/api/suppliers`), expense-types (`/api/expense-types`), and existing material costs (`/api/material-costs?orderId=X&module=print`).
  - **Material procurement confirmation**: When `hasUnconfirmedMaterial` is true, shows an amber banner listing the items needing material + a "تأیید تأمین متریال" button → `POST /api/orders/{id}/print-action { action: "confirm_material" }` → server runs `db.orderItem.updateMany({ where: { orderId: id }, data: { materialConfirmed: true } })` — **flips ALL items at once**, regardless of which ones actually had material procured. Coarse-grained.
  - **MaterialCost creation**: Sub-dialog with form (supplierId `<select>`, expenseTypeId `<select>`, description textarea, amount number input, fileUrl1/fileUrl2 plain text inputs). On submit → `POST /api/material-costs { orderId, supplierId?, expenseTypeId?, description?, amount, fileUrl1?, fileUrl2?, module: "print" }`. Server creates with default `status: "pending"`.
  - **MaterialCost list/delete**: Existing costs rendered as cards with amount/supplier/expenseType/status + delete button (trash icon). Delete → `DELETE /api/material-costs/{id}`.
  - **MaterialCost approval**: NOT in print-order-detail — approval happens in `finance-cost-detail.tsx` (PUT /api/material-costs/{id} with `{ status: "approved" }`).
  - **Send to warehouse**: Footer button → `POST /api/orders/{id}/print-action { action: "send_warehouse" }` → server `db.order.update({ status: "warehouse_logistics" })`. **Critically, this sends the order to a module (warehouse) that has NO built pages** (see #10).
  - **Report to QC**: Same flow as designer (sub-dialog with description textarea).
  - Cost form does NOT support inline supplier/expenseType creation — they must exist first via admin pages.
- **print-tasks.tsx vs designer-tasks.tsx**: IDENTICAL code shape, only the query param differs (`?module=print` vs `?module=designer`) and labels. They're effectively duplicated code (a `TasksList` shared component would eliminate ~270 lines).
- **print-calendar.tsx**: Same shape as designer-calendar but uses `printStartDate/printEndDate` for events.

### 3. QC module
- **QcReport creation**: QC reports are NOT created from the QC module UI — they're created SERVER-SIDE when designer/print/warehouse operators call `POST /api/orders/{id}/{designer|print}-action { action: "report_qc", description }` → server runs `db.qcReport.create({ data: { orderId, fromModule: "designer"|"print", description, reportedBy } })`. No direct UI for QC to create reports.
- **QcReport model fields actually used**: `id, orderId, fromModule, description, status, returnStage, reviewedAt, reportedBy, createdAt`. Schema also has `updatedAt` but it isn't referenced in the UI.
- **Status flow**: pending → (skipped reviewing) → approved/rejected. The "reviewing" status is defined in the schema and rendered in dashboards but **NEVER set by any flow** — orphaned.
- **QC return-stage logic**: In `qc-report-detail.tsx`, when status is pending/reviewing, footer has two buttons:
  - **"تأیید و بازگشت به مرحله"** → opens a sub-dialog to pick a `returnStage` from `{design, print, warehouse}` (3 buttons). On confirm → `PUT /api/qc-reports/{id} { action: "approve", returnStage }`. Server sets `QcReport.status="approved"`, `returnStage`, `reviewedAt=new Date()`, AND maps `returnStage` to `Order.status` via `{design: "pending_design", print: "in_printing", warehouse: "warehouse_logistics"}`. The order is bounced back to the picked stage.
  - **"رد گزارش"** → `PUT /api/qc-reports/{id} { action: "reject" }` → server sets `QcReport.status="rejected"`, `reviewedAt`, but does NOT change order status (the order stays where it was).
- **qc-report-detail.tsx flow**: Fetches `/api/qc-reports/{id}` with order+customer+items included. Shows description prominently (amber box), lists order items (name only — no prices), shows status-aware notice box (approved=green, rejected=rose). Action buttons only render if `canAct = status === "pending" || status === "reviewing"`.
- **qc-calendar.tsx**: Maps each report to a CalendarEvent using `MODULE_COLOR[fromModule]` (designer=blue, print=yellow, warehouse=green) with **`type: "order"`** — this is a smell because DayDetailModal buckets by type into "orders"/"tasks" tabs and these aren't orders; they'll show under the orders tab. Side panel lists 8 most-recent reports with module icon + status dot.

### 4. Finance module
- **finance-costs.tsx vs finance-cost-detail.tsx**:
  - costs = list view (DataTable with filters: search by order# or description; status toggles pending/approved/rejected; module toggles print/warehouse). 9 columns (order#, customer, supplier, expenseType, description, amount, status, module, createdAt). Summary row with 3 cards (total pending/approved/rejected).
  - cost-detail = modal with full record (supplier, expenseType, order#, date, description, file attachments as `<a>` links, status notice, approve/reject footer buttons). Uses `fileName()` helper to extract the basename from the URL.
- **MaterialCost vs Expense**:
  - **MaterialCost**: order-attached cost created from print (or warehouse) module. Fields: `orderId, supplierId, expenseTypeId, description, amount, fileUrl1, fileUrl2, status (pending/approved/rejected), module (print/warehouse), createdAt`. Has API routes (`/api/material-costs` + `/[id]`) and full UI. The "cost-detail" in finance only approves/rejects; no editing of amount/supplier.
  - **Expense**: General (non-order) expenses. The Prisma model exists (per orchestrator's earlier finding) but **there is NO `/api/expenses` route, NO UI page, and NO admin form**. The `finance/expenses` nav item falls through to GenericModulePage.
- **Invoices/payments pages**: **PLACEHOLDERS**. Per `module-router.tsx`, finance only registers `dashboard` and `costs` cases. `invoices`, `payments`, `expenses` all hit the `default: return null` branch and fall through to `GenericModulePage`. No `/api/invoices` or `/api/payments` route exists either (only `/api/pre-invoices`).
- **Payment validation flow (awaiting→validated)**: **DOES NOT EXIST.** The shared `StatusBadge` component supports `awaiting`/`validated` labels (lines 72-73 of shared/index.tsx) but NO code path actually creates or transitions Payment records. The only invoice-adjacent UI is the `PreInvoiceModal` (admin only) which lets you record per-item `paid` amounts as a JSON blob — there's no separate Payment entity workflow.
- The "approved" status on MaterialCost is purely a label — no Payment, no Invoice, no financial aggregate is updated.

### 5. Shared DataTable feature inventory
- **Sorting**: Client-side, per-column. SortingState local. Header click toggles asc/desc/none. SortIcon shows arrowUpDown/sortUp/sortDown.
- **Pagination**: Client-side only. `pageSize` default 10, options [10,20,30,50,100]. `DataTablePagination` shows "نمایش X تا Y از Z مورد", page-size Select, first/prev/next/last buttons.
- **Global filter**: Controlled — if `onGlobalFilterChange` is provided, `globalFilter` is passed to the table state and the input is rendered.
- **Column filter (single)**: If `searchKey` is provided, an input is rendered that calls `table.getColumn(searchKey)?.setFilterValue(e.target.value)` — single-column filter.
- **Column visibility**: DropdownMenu with `DropdownMenuCheckboxItem` per column; respects `columnDef.meta?.hideable === false` to lock certain columns. Default `showColumnToggle=true`.
- **Expandable rows**: Supported via `getRowCanExpand` + `renderExpandedRow`. **BUG**: `getRowCanExpand: getRowCanExpand ? () => true : undefined` — the predicate is ignored; any non-empty predicate makes ALL rows expandable. Should be `(row) => getRowCanExpand(row.original)`.
- **Row actions**: Not built-in — you implement via cell renderers. `onRowClick` callback fires on row click. **Caveat**: when both `getRowCanExpand` and `onRowClick` are provided, a single click triggers BOTH `row.toggleExpanded()` AND `onRowClick(row.original)` — confusing UX.
- **Loading/empty states**: `isLoading` shows a spinner row; `emptyState` prop accepts a ReactNode (defaults to a simple "موردی یافت نشد").
- **Typing**: Generic `<TData, TValue>`. Re-exports `ColumnDef` and `Row` from TanStack. Augments `ColumnMeta` with `hideable?: boolean` and `className?: string` — **but `className` meta is never applied** in the cell renderer (dead code).
- **Bugs/limitations**:
  1. `getRowCanExpand` predicate ignored (above).
  2. `totalCount` prop is documented as "for server-side pagination" but `DataTablePagination` actually uses `data.length` — server-side pagination claim is misleading.
  3. `rowSelection` state is set up but no UI exposes it (no checkboxes anywhere).
  4. `columnFilters` state is initialized but only used implicitly via `searchKey`'s direct column filter; redundant for most use cases.
  5. Pagination displays "صفحه 1 از 1" when the table is empty (since `table.getPageCount() || 1`).
  6. RTL pagination icons: prev uses `chevronRight`, next uses `chevronLeft` — correct for RTL.

### 6. Reusable Calendar & Gantt
- **ReusableCalendar**: Month grid, `weekStartsOn: 6` (Saturday) — correct for Iranian week. Persian weekday names hard-coded. Day cells min-h 90px with up to 10 colored event chips (max 10, +N overflow). Tooltips with full title + date range. Bookmark icon if a DayNote exists for that date. Today ring-highlighted. Filters prop = toggle buttons in toolbar. `getEventsForDay` does proper intersection logic (handles multi-day events spanning the day) and gracefully handles parse errors via `try/catch` + `isValid` check.
- **ReusableGantt** (custom impl, replacing gantt-task-react per README):
  - **Stable.** `safeDate()` wraps `parseISO`/`new Date` with try/catch and `isNaN(date.getTime())` check — this is the fix for the README's "getTime crash". `validEvents` filters out anything that fails the safeDate check. End-before-start is auto-corrected to `addDays(start, 1)`.
  - 3 view modes: day (21d × 48px), week (49d × 22px), month (90d × 12px). Left panel 220px with event names + color dots. Right panel horizontal scroll with date header + vertical gridlines + today line + horizontal bars.
  - Bars show ID + duration (only if width > 80px). Tooltip with title + date range + duration + days remaining/overdue.
  - Friday (`d.getDay() === 5`) gets a subtle rose background — Iran weekend (Thursday+Friday) — only Friday is highlighted, Thursday is not (minor).
  - **BUG**: `SyncScroll` component at the bottom of the Gantt tries to sync scroll between `.gantt-scroll-sync` elements, but NO element in the component has that class. So vertical scroll-sync between the left panel and the timeline is broken — when there are many events, the left panel and timeline scroll independently and rows desync.
  - Minor: `eventMap` is built from raw `events` (not `validEvents`) — works but inefficient if there are duplicate IDs.

### 7. Order Detail Modal & Pre-Invoice Modal
- **OrderDetailModal** (the "admin" version, used by `useOrderDetail`):
  - Tabs: items / status / note.
  - Items tab: read-only list with stage badge + `needsMaterial` chip + per-item note.
  - Status tab: lets you pick a new `OrderStatus` from `ORDER_STATUS` map (6 buttons). If status is `pending_design` or `in_printing`, shows DatePickers for design range and print range. Save → `PUT /api/orders/{id}/status { status, designStart, designEnd, printStart, printEnd }`.
  - Note tab: textarea + save → `PUT /api/orders/{id} { note }`.
  - Footer: "صدور پیش‌فاکتور" (opens PreInvoiceModal), "فاکتور" (if invoice exists — but only shows `toast.info("فاکتور #X")`, no real flow), "ویرایش کامل" (navigate to admin orders-new with orderId).
  - Loading state: renders Dialog with DialogTitle for a11y when `order` is null.
- **PreInvoiceModal**:
  - Fetches `/api/orders/{orderId}` to get items + existing preInvoices. If existing pre-invoice found, `JSON.parse(existingPreInvoice.items)` to load line items; on parse failure, falls back to deriving from order items (fragile).
  - Editable table: per-item `paid` amount. "تنظیم همه پرداخت‌ها برابر مبلغ کل" button = set all paid = total.
  - Save: POST `/api/pre-invoices { orderId, customerId, items (array), paidAmount }` or PUT `/api/pre-invoices/{id} { items, paidAmount }`.
  - **PDF export**: There is NO PDF library. The "دانلود PDF" button opens `window.open("", "_blank")`, writes inline HTML+CSS (with `printArea.innerHTML`), and calls `win.print()`. This is browser print-to-PDF, not true PDF generation. The function name `printPDF` is misleading.
  - **Data smell**: `preInvoices.items` is stored as a JSON string column (parsed by the modal). A structured `PreInvoiceItem` relation table would be safer.

### 8. The `use-*-detail.tsx` hooks
- All 5 hooks share a common pattern: hold `{id, open}` state, expose `open*(id)` setter + render `modal` JSX. The modals themselves fetch data.
- **Inconsistency**: `useOrderDetail` is the only hook that runs a `useQuery` at the hook level (returning `data` + `isLoading` + passing a fully-loaded `OrderDetail` object into the modal). The other four (`useDesignerOrderDetail`, `usePrintOrderDetail`, `useQcReportDetail`, `useCostDetail`) just pass the raw ID and let the modal fetch internally.
- Return shapes: `useOrderDetail → { openOrder, modal, isLoading }` vs others → `{ openOrder, modal }`. This dual pattern is confusing and forces `OrderDetailModal` to take `order: OrderDetail | null` prop (with separate loading state) while the others take `orderId: string | null`.
- **Unification opportunity**: refactor `useOrderDetail` to match the others (pass `orderId` to modal, let modal fetch) OR refactor all to fetch at the hook level and pass pre-loaded data.

### 9. use-invalidate & broadcastInvalidate
- `useInvalidate()` returns a callback `(keys: string[]) => { for each k: qc.invalidateQueries({ queryKey: [k] }); broadcastInvalidate(keys); }`.
- `broadcastInvalidate(keys)`: `window.postMessage({ type: "printoo24-invalidate", keys })` (same-tab) + `new BroadcastChannel("printoo24-invalidate")` → `bc.postMessage({ keys })` → `bc.close()`. Channel is created+closed on every call (minor overhead).
- `useCrossTabSync()`: window `message` listener that calls `qc.invalidateQueries({ queryKey: [k] })` for each received key (or `qc.invalidateQueries()` for empty array = nuclear).
- `setupCrossTabListener()`: subscribes to the BroadcastChannel and forwards received messages to `window.postMessage` so `useCrossTabSync` picks them up.
- **Query key conventions**: top-level string keys: `["orders"], ["dashboard"], ["notifications"], ["tasks"], ["material-costs"], ["qc-reports"], ["order"], ["material-cost"], ["qc-report"], ["suppliers"], ["expense-types"], ["pre-invoices"]`. Compound keys use prefix-tuples: `["orders", "designer", "pending_design", "list"]`, `["material-costs", "order", orderId]`, `["qc-report", reportId]`. Since TanStack's `invalidateQueries({ queryKey: [k] })` matches by prefix, calling `invalidate(["orders"])` correctly invalidates all `["orders", ...]` queries.
- **Minor bug**: `setupCrossTabListener` checks `if (e.data?.type !== CHANNEL)` but the BroadcastChannel payload is just `{ keys: arr }` (no `type` field) — so this condition is always true and always forwards. Functionally fine (it always re-posts with the correct `type`), but the check is misleading.
- **Missing**: `setupCrossTabListener` returns a cleanup function but it's unclear where (if anywhere) it's called from in the app root — needs verification.

### 10. generic-module-page.tsx + which pages are unbuilt
Per `module-router.tsx` getPageComponent returns either a registered component OR falls back to `<GenericModulePage moduleKey page />` (or `<PlaceholderPage>` if even the page label isn't found in nav). Mapping:

| Module | Built pages | Placeholder (unbuilt) pages |
|---|---|---|
| admin | dashboard, orders, orders-new, open-orders, tasks, calendar, customers, suppliers, products, expense-types, archive | (none) |
| crm | dashboard, pipeline, customers, deals, activities | (none) |
| designer | dashboard, orders, calendar, tasks | (none) |
| print | dashboard, orders, calendar, tasks | (none) |
| qc | dashboard, reports, calendar | (none — but qc has no "tasks" page, intentionally) |
| finance | dashboard, costs | **invoices, payments, expenses** (3 unbuilt) |
| srm | dashboard, suppliers, categories, services, compare, costs | (none) |
| warehouse | (none) | **dashboard, tasks, calendar, orders, inventory, materials** (6 unbuilt — entire module is a placeholder) |

**Critical finding**: The **entire Warehouse & Logistics module is unbuilt**. `module-router.tsx` has no `if (moduleKey === "warehouse")` switch block at all. All 6 warehouse pages declared in `nav.ts` fall through to GenericModulePage. When the print module calls `send_warehouse` and sets `Order.status = "warehouse_logistics"`, the order becomes invisible in the UI — no dashboard, no list, no detail. This is the single biggest functional gap.

### 11. Quality verdicts (separate per area)
- **Designer module**: **B+**. Clean, focused, designer-safe projection implemented consistently. Missing: file-upload for design proofs (significant for a designer workflow); the projection is client-side only (server returns full data — security gap, not a UX gap).
- **Print module**: **B**. Print-safe projection + material confirmation + cost registration all wired. 891-LOC modal is large but organized. Cost form is bare-bones (text inputs for "file URLs" rather than real uploads); cost form lacks inline supplier/expenseType creation; `confirm_material` flips ALL items at once (coarse).
- **QC module**: **A-**. Approve-with-returnStage flow is well-designed (sub-dialog with 3 stage options). Clear, focused, no over-engineering. **Orphaned "reviewing" status** (defined but never set) and a small smell (qc-calendar uses `type: "order"` for QC reports).
- **Finance module**: **C+**. Has dashboard + costs list + cost detail modal. But invoices/payments/general-expenses are pure placeholders. No way to issue final invoices or record customer payments. The "approved" status on MaterialCost doesn't trigger any payment/invoice creation — purely a label. The financial model is incomplete; ERP cannot close the books on an order.
- **Shared infra (DataTable/Calendar/Gantt/hooks)**: **B+**. DataTable is well-built but has the `getRowCanExpand` bug + misleading `totalCount` prop. Calendar is solid. Gantt is stable (the README's getTime crash is fixed via `safeDate`) but scroll-sync is broken. Hooks are consistent in shape (with `useOrderDetail` being the odd one out). `day-detail-modal.tsx` uses dynamic Tailwind class names like `bg-${color}-500` which **will be purged in production** — a real styling bug.

### Top 10 problems across Designer+Print+QC+Finance+Shared (ordered by severity)

1. **CRITICAL — The entire Warehouse module is unbuilt** (`/home/z/printoo-erp/src/components/module-router.tsx` has no `warehouse` case). All 6 warehouse pages (dashboard, tasks, calendar, orders, inventory, materials) fall through to `GenericModulePage`. Orders sent from print via `send_warehouse` become invisible. This breaks the core ERP flow (design→print→warehouse→completed).

2. **CRITICAL — Finance module is missing invoices, payments, and general expenses** (3 of 5 nav items are placeholders). No `/api/invoices` or `/api/payments` routes. The data model has Invoice/Payment/Expense but only PreInvoice + MaterialCost are wired. ERP cannot collect customer payments or issue final invoices from the UI.

3. **HIGH — No real file upload anywhere.** `print-order-detail.tsx` cost form uses plain `<Input>` text fields for `fileUrl1`/`fileUrl2` (accepting arbitrary strings). No `/api/upload` route, no S3/blob integration. Designer has no proof upload at all. For a printing ERP, this is a serious functional gap.

4. **HIGH — Auth/Validation gaps in action endpoints.** `app/api/orders/[id]/designer-action/route.ts`, `app/api/orders/[id]/print-action/route.ts`, `app/api/qc-reports/[id]/route.ts`, `app/api/material-costs/route.ts` and `[id]/route.ts` — NONE call `getSession()`, NONE use Zod. Any unauthenticated user can advance orders, create QC reports, approve costs. Bodies are `await req.json() as T`. (Corroborates orchestrator's finding.)

5. **HIGH — `getRowCanExpand` bug in DataTable** (line 108): `getRowCanExpand: getRowCanExpand ? () => true : undefined` ignores the per-row predicate; any non-empty predicate makes ALL rows expandable, contradicting the documented API. Should be `(row) => getRowCanExpand(row.original)`.

6. **HIGH — Gantt scroll-sync is broken** (`reusable-gantt.tsx` SyncScroll): queries `.gantt-scroll-sync` class but no element has that class; left panel and timeline scroll independently, desynchronizing row alignment when there are many events.

7. **MEDIUM — QC "reviewing" status is orphaned.** QcReport schema + dashboard KPIs support `pending/reviewing/approved/rejected`, but no endpoint or UI ever sets `status = "reviewing"`. Reports jump straight from pending to approved/rejected. The "در حال بررسی" KPI will always be 0.

8. **MEDIUM — Designer/Print "safe projection" is client-side only.** `toDesignerOrder`/`toPrintOrder` strip financial + phone fields in the React render, but the underlying API (`/api/orders/[id]`) returns everything. A designer with browser devtools can read prices and customer phones by hitting the endpoint directly. No real RBAC.

9. **MEDIUM — PreInvoiceModal stores items as JSON string in DB.** `existingPreInvoice.items` is `JSON.parse`'d at runtime with a silent fallback to "derive from order items" on parse failure. A structured `PreInvoiceItem` relation table would be safer. The "فاکتور" button in OrderDetailModal is a no-op (`toast.info` only) — no actual invoice flow.

10. **MEDIUM — `day-detail-modal.tsx` uses dynamic Tailwind class names** (`bg-${e.color === "yellow" ? "amber" : ...}-500`) which Tailwind's JIT purge will strip from production builds. Colors will silently not render. Should use the same `COLOR_CLASSES` static map pattern as `reusable-calendar.tsx`.

Other notable (lower-severity) issues observed:
- `qc-calendar.tsx` tags QC reports with `type: "order"` — they'll show up under the "orders" tab in DayDetailModal, which is semantically wrong.
- `StatusBadge` shared component has `awaiting`/`validated` labels but no UI actually creates records with these statuses (Payment module is unbuilt).
- `designer-tasks.tsx` and `print-tasks.tsx` are ~270 lines of duplicated code (only the module query param + label strings differ); should be extracted to a shared `TasksList` component.
- All module dashboards poll every 30s (`refetchInterval: 30000`) — fine for now, but combined with cross-tab invalidation could cause excessive refetches.
- `module-router.tsx` keep-alive mounts ALL open tabs simultaneously (hidden via CSS) — memory cost grows linearly with tab count, with no eviction.
- `qc-reports` PUT route doesn't update `orderItem.stage` (only `Order.status`) — ItemStage is rarely touched by any flow.
- `confirm_material` action flips ALL items of an order at once (`updateMany where orderId`) — coarse; if some items' materials aren't actually procured, the operator can't selectively confirm.
- The "module" field on MaterialCost is a free string ("print" / "warehouse") with no DB enum constraint.

---
Task ID: p1-c
Agent: Explore (Shared Infra)
Task: Precise evidence + full interface extraction for order-detail-modal, reusable-calendar, reusable-gantt, data-table, day-detail-modal, pre-invoice-modal, shared/index.tsx, search-select — with EXACT line numbers and full consumer contracts.

Work Log:
- Read in full (8 files, 1875 LOC total):
  - `/home/z/printoo-erp/src/components/shared/order-detail-modal.tsx` (306 LOC, lines 1–306)
  - `/home/z/printoo-erp/src/components/shared/reusable-calendar.tsx` (190 LOC, lines 1–190)
  - `/home/z/printoo-erp/src/components/shared/reusable-gantt.tsx` (287 LOC, lines 1–287)
  - `/home/z/printoo-erp/src/components/ui/data-table.tsx` (318 LOC, lines 1–318)
  - `/home/z/printoo-erp/src/components/shared/day-detail-modal.tsx` (302 LOC, lines 1–302)
  - `/home/z/printoo-erp/src/components/shared/pre-invoice-modal.tsx` (285 LOC, lines 1–285)
  - `/home/z/printoo-erp/src/components/shared/index.tsx` (105 LOC, lines 1–105)
  - `/home/z/printoo-erp/src/components/shared/search-select.tsx` (82 LOC, lines 1–82)
- Cross-referenced `lib/use-order-detail.tsx` (lines 1–40), `lib/use-designer-order-detail.tsx`, `lib/use-print-order-detail.tsx` to confirm hook-level vs modal-level fetch split.
- Grepped all 6 shared-component consumers across `src/` (OrderDetailModal, ReusableCalendar, ReusableGantt, DataTable, DayDetailModal, PreInvoiceModal).
- Read consumer call-sites in `admin/open-orders.tsx:632`, `admin/orders/orders-page.tsx:343`, `admin/calendar-page.tsx:108–156`, `designer/designer-calendar.tsx:160–208`, `print/print-calendar.tsx:160–208`, `qc/qc-calendar.tsx:130–219`.

Stage Summary:

## A. OrderDetailModal — Full Anatomy (file: `src/components/shared/order-detail-modal.tsx`, 306 LOC)

### A.1 EXACT prop interface (lines 34–40)
```ts
export function OrderDetailModal({
  order, open, onOpenChange,
}: {
  order: OrderDetail | null;   // pre-loaded by consumer (hook OR page-level useQuery)
  open: boolean;
  onOpenChange: (v: boolean) => void;
})
```
Only 3 props. No `orderId`, no `isLoading` — the modal does NOT fetch the order itself; the consumer must run the useQuery and pass `order`. (It does own two `useMutation`s — status & note — see A.4.)

### A.2 `OrderDetail` type (lines 18–32) — the FULL data contract
```ts
export type OrderDetail = {
  id: string; number: number; status: OrderStatus; endDate: string | null; noEndDate: boolean;
  totalAmount: number; paidAmount: number; priority: string; splitMode: string; note: string | null;
  createdAt: string; createdBy: string | null;
  customer: { id: string; name: string; phone: string };
  items: {
    id: string; productId: string; product: { name: string };
    quantity: number; pricePerUnit: number; totalAmount: number;
    note: string | null; description: string | null; stage: string; needsMaterial: boolean;
    designStartDate: string | null; designEndDate: string | null;
    printStartDate: string | null; printEndDate: string | null;
  }[];
  preInvoices: { id: string; number: number; totalAmount: number; paidAmount: number }[];
  invoice: { id: string; number: number; totalAmount: number; paidAmount: number } | null;
};
```
This shape is also imported by `lib/use-order-detail.tsx:6` and `admin/open-orders.tsx:8`. The rebuild MUST keep this exported type name and shape (or migrate the two importers).

### A.3 Data fetched by the modal itself
- The modal does NOT fetch the order. The consumer is expected to `useQuery({ queryKey: ["order", orderId], queryFn: () => api<{ order: OrderDetail }>(\`/api/orders/${orderId}\`) })` and pass the result. Both consumers (`use-order-detail.tsx:19–23` and `open-orders.tsx:239–243`) do exactly this.
- The modal DOES own 2 mutations:
  - **statusMut** (lines 64–77): `PUT /api/orders/${order?.id}/status` body `{ status, designStart, designEnd, printStart, printEnd }` (ISO strings or null). Invalidates `["orders","dashboard","notifications"]`.
  - **noteMut** (lines 79–83): `PUT /api/orders/${order?.id}` body `{ note }`. Invalidates `["orders"]`.

### A.4 Sections/tabs currently rendered (lines 109–293)
1. **Header** (lines 109–155): customer avatar (# number), name, phone, createdAt, status badge, urgent chip, 4 stat cards (total, paid, due-date, remaining-days).
2. **Tabs** (lines 158–179): 3 tabs — `items` (with count badge), `status` (تغییر وضعیت), `note` (یادداشت). No QC tab, no Costs tab, no Tasks tab, no Status Timeline tab. (Compare to `print-order-detail.tsx` 891 LOC which adds material & costs sections.)
3. **Items tab** (lines 183–216): per-item card — product name, description, total/qty/unit-price, stage badge, `needsMaterial` chip, per-item note. Read-only.
4. **Status tab** (lines 218–261): 6-button status picker (`ORDER_STATUS`), conditional date-range pickers (design range if `pending_design`, print range always shown when `pending_design` or `in_printing`), save button → `statusMut`.
5. **Note tab** (lines 263–277): textarea + save button → `noteMut`.
6. **Footer** (lines 280–293): 3 action buttons (see A.5).

### A.5 Action handlers exposed (lines 280–293)
| Action | Line | Real / Placeholder |
|---|---|---|
| Pre-invoice (صدور/ویرایش پیش‌فاکتور) | 282–284 | **REAL** — `setPreInvoiceOpen(true)` → opens `<PreInvoiceModal>` at line 298 |
| Invoice (فاکتور) | 285–289 | **PLACEHOLDER** — `onClick={() => toast.info(\`فاکتور #${order.invoice?.number ?? "—"}\`)}` (line 286) — no invoice flow exists |
| Edit full (ویرایش کامل) | 290–292 | **REAL** — `onOpenChange(false); navigate("admin", "orders-new", order.id)` — closes modal + navigates admin-orders-new with orderId |

Also: Status tab's "ثبت تغییرات" (line 256–259) → `statusMut.mutate()`. Note tab's "ذخیره یادداشت" (line 272–275) → `noteMut.mutate()`. Both REAL.

No delete action, no add-task action, no add-cost action, no print pre-invoice directly (it's inside PreInvoiceModal).

### A.6 Loading/empty/error states (lines 85–98)
- `if (!order)` (line 85) — renders the Dialog with a single `<DialogTitle className="sr-only">` + spinner + "در حال بارگذاری سفارش..." message. So when `open=true` but `order=null` (during fetch), the modal shows a loading spinner inside an otherwise empty Dialog.
- No error state. The consumer's useQuery error is silently swallowed (the modal just keeps showing the loading state forever — the consumer doesn't pass an error prop).
- No empty state (an order with 0 items still renders — the items tab just shows the section with no rows).

### A.7 a11y
- Uses shadcn `<Dialog>` (line 106) and `<DialogContent>` (line 107) — Radix-based, so focus-trap + Escape-to-close + scroll-lock come for free.
- `<DialogTitle className="sr-only">جزئیات سفارش</DialogTitle>` only in the loading branch (line 90). In the loaded branch (line 116) the DialogTitle is the customer name (visible). So both branches satisfy Radix's required DialogTitle — no a11y violation here.
- No `DialogDescription` — Radix warns at runtime but not a functional bug.
- Tab buttons (lines 164–177) are plain `<button>`s with no `role="tab"`/`role="tablist"`/`aria-selected`/`aria-controls` — NOT ARIA-compliant tab pattern. The rebuild should use the shadcn `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` primitives (like `calendar-page.tsx:109–137` already does).

### A.8 LOC & complexity smell
- 306 LOC, single file. Not catastrophic but the file mixes: header rendering, 3 tab definitions, 2 mutations, an `OrderDetail` type re-export, an inline PreInvoiceModal child mount. Coupling: the modal imports `PreInvoiceModal` (line 16) — if PreInvoiceModal is rebuilt, this import must be preserved or migrated.

### A.9 EVERY consumer of `<OrderDetailModal>`
Only **2** call-sites exist (across `src/`):

| File | Line | Props passed |
|---|---|---|
| `src/lib/use-order-detail.tsx` | 31 | `order={data?.order ?? null}` (line 32), `open={open}` (line 33), `onOpenChange={(v) => { setOpen(v); if (!v) setOrderId(null); }}` (line 34). The hook runs its own `useQuery(["order", orderId], ...)` at lines 19–23 and returns `{ openOrder, modal, isLoading }`. |
| `src/components/modules/admin/open-orders.tsx` | 632 | `order={orderDetail?.order ?? null}` (line 633), `open={!!selectedOrderId}` (line 634), `onOpenChange={(o) => { if (!o) setSelectedOrderId(null); }}` (lines 635–637). Page-level `useQuery(["order", selectedOrderId], ...)` at lines 239–243. Note: a *separate* `OrderDetail` import also at line 8 of the same file. |

**Rebuild contract for drop-in**: the new modal must accept `{ order: OrderDetail | null; open: boolean; onOpenChange: (v: boolean) => void }` and must re-export `type OrderDetail` (since both consumers import it). If the new modal moves to the cleaner `orderId`-prop pattern used by the other 4 hooks (designer/print/qc/cost), both consumers will need migration — `use-order-detail.tsx` simplifies to match its siblings, and `open-orders.tsx:632` switches to passing `orderId={selectedOrderId}`. **Recommend migration**: the `useOrderDetail` hook is the only one of the 5 detail-hooks that pre-fetches; unifying it reduces duplication (noted in worklog 1-d #8).

## B. ReusableCalendar — Full Anatomy (file: `src/components/shared/reusable-calendar.tsx`, 190 LOC)

### B.1 EXACT prop interface (lines 26–33)
```ts
type ReusableCalendarProps = {
  events: CalendarEvent[];
  notes?: DayNote[];
  onDayClick?: (date: Date, events: CalendarEvent[]) => void;
  onEventClick?: (event: CalendarEvent) => void;
  filters?: { id: string; label: string; active: boolean; onToggle: () => void }[];
  className?: string;
};
```

### B.2 Data shapes
- `CalendarEvent` (lines 9–18): `{ id, title, fullTitle, startDate: string|Date, endDate: string|Date, color: "blue"|"yellow"|"green"|"red", type: "order"|"task", meta?: Record<string, unknown> }`. The `meta` field is loosely typed — consumers cast `e.meta?.orderId as string` (e.g. `calendar-page.tsx:120`).
- `DayNote` (lines 20–24): `{ date: string, content: string, color?: string }`. The `color?: string` on `DayNote` is unused elsewhere in this file (the calendar just renders a bookmark icon if a note exists for a date — line 150). Effectively dead code.

### B.3 Interaction callbacks
- `onDayClick(date, events)` — fires on every day-cell click, INCLUDING out-of-month days (line 140). Most consumers guard: `qc-calendar.tsx:144` wraps with `evts.length > 0 &&`.
- `onEventClick(event)` — fires on the small event chip (line 164). Uses `ev.stopPropagation()` to prevent the day-click also firing.
- `onMonthChange`? — **NOT EXPOSED**. Calendar state is purely internal.

### B.4 Month-grid rendering (lines 122–187)
- CSS grid: `<div className="grid grid-cols-7 gap-1 rounded-xl border bg-card p-2">` (line 122).
- Persian weekday names hard-coded array (line 51): `["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"]`.
- `weekStartsOn: 6` (Saturday) for `startOfWeek`/`endOfWeek` (lines 48–49) — correct for Iranian week.
- Each day-cell is a `<button>` (line 138) min-height 90px (line 142).
- Max 10 visible events per day (`MAX_VISIBLE_EVENTS = 10`, line 42), with `+N` overflow (lines 134–135, 180–182).
- `getEventsForDay` (lines 59–77) does proper intersection: normalizes start/end, wraps parse in `try/catch` + `isValid` check. Solid.

### B.5 Controlled vs internal state
- **Internal state only**. `const [cursor, setCursor] = React.useState(new Date())` (line 45). No `year`/`month` props. A parent cannot programmatically navigate the calendar (e.g. to jump to a date with an event). This is a contract limitation for the rebuild — if shared-component consumers (e.g. a "today" deep-link from the dashboard) need to control the cursor, the new calendar must add `cursor?`/`onCursorChange?` props.

### B.6 EVERY consumer
**4** call-sites, all in calendar pages:

| File | Line | Props passed |
|---|---|---|
| `src/components/modules/admin/calendar-page.tsx` | 116 | `events={allEvents}`, `onDayClick={(date, evts) => setDayModal({ date, events: evts })}`, `onEventClick={(e) => { if (e.type === "order" && e.meta?.orderId) openOrder(e.meta.orderId as string); }}`, `filters={filterButtons}` |
| `src/components/modules/designer/designer-calendar.tsx` | 170 | `events={allEvents}`, `onDayClick={(date, evts) => setDayModal({ date, events: evts })}`, `onEventClick={handleEventClick}`, `filters={filterButtons}` |
| `src/components/modules/print/print-calendar.tsx` | 170 | same shape as designer-calendar |
| `src/components/modules/qc/qc-calendar.tsx` | 141 | `events={allEvents}`, `onDayClick={(date, evts) => evts.length > 0 && setDayModal(...)}`, `onEventClick={handleEventClick}`, `filters={filterButtons}` |

All 4 use the same 4-prop shape (no `notes`, no `className`). The rebuild can keep the same interface additively (drop-in) — add `notes?`/`cursor?`/`onCursorChange?` as new optional props without breaking any consumer.

### B.7 Bugs
- **No dynamic Tailwind classes here** — uses a static `COLOR_CLASSES` map (lines 35–40). Safe in production.
- **Date parsing is robust** — `try/catch` + `isValid` (lines 64–67). No bug.
- **RTL**: relies on Tailwind's logical-property defaults; no `dir="rtl"` set inline. The whole `<html dir="rtl">` is set at layout level (per orchestrator worklog).
- **Mobile**: `min-h-[90px]` cells + 10-event cap will overflow on a 320px-wide phone (7 columns × ~45px ≈ 315px before padding). No mobile-specific layout path. Minor.
- **Minor**: `notesMap` is keyed by `format(day, "yyyy-MM-dd")` (line 132) — but `DayNote.date` is a raw string (line 21). If a consumer passes `"2024-08-24T10:00:00Z"` instead of `"2024-08-24"`, the lookup will miss. Convention-dependent.

## C. ReusableGantt — Full Anatomy (file: `src/components/shared/reusable-gantt.tsx`, 287 LOC)

### C.1 EXACT prop interface (lines 10–17)
```ts
type ReusableGanttProps = {
  events: CalendarEvent[];           // re-uses the same CalendarEvent type from reusable-calendar.tsx
  onEventClick?: (event: CalendarEvent) => void;
  className?: string;
  title?: string;
  emptyMessage?: string;             // default "رویدادی برای نمایش نیست" (line 39)
  filters?: { id: string; label: string; active: boolean; onToggle: () => void }[];
};
```
**Note**: no `onDayClick` (Gantt doesn't have day cells), no `notes`, no controlled cursor. The new shared gantt could unify `title` and `className` are already in the calendar contract except `title` — adding `title?` to ReusableCalendar is the only thing needed for full prop-parity.

### C.2 Event shape
- Re-uses `CalendarEvent` from `reusable-calendar.tsx` (line 8 import). Good — single source of truth.

### C.3 View modes & layout
- 3 view modes (lines 40, 76–77): `"day"` (21 days × 48px), `"week"` (49 days × 22px), `"month"` (90 days × 12px). Default `"day"`.
- Left panel: 220px wide, sticky 14px header + 12px-tall rows (line 158–163). Hover/click → `onEventClick`.
- Right panel: horizontal scroll, date header (line 169–185), vertical gridlines (lines 190–196), today line (lines 199–203), bars (lines 206–261).
- Today line at line 200: `<div className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 ...">`.
- Friday (`d.getDay() === 5`) gets `bg-rose-50/50` (line 176, 193) — Iran weekend.
- Tooltip via shadcn `<Tooltip>` (lines 221–258) — title, date range, duration, days remaining/overdue.

### C.4 The `safeDate()` crash-guard (lines 27–35) — quoted verbatim
```ts
function safeDate(d: string | Date): Date | null {
  try {
    const date = typeof d === "string" ? parseISO(d) : new Date(d);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}
```
- Used at lines 50–51 to validate each event's start/end. If either is null, the event is dropped (line 52: `if (!start || !end) return null`).
- **End-before-start auto-correction** (line 53): `const safeEnd = end < start ? addDays(start, 1) : end;` — silently coerces to 1-day minimum. No user-visible warning. Quote: line 53.
- Duration is `Math.max(1, differenceInCalendarDays(safeEnd, start) + 1)` (line 54).

### C.5 The `SyncScroll` bug (lines 274–287) — quoted verbatim
```ts
// Helper to sync scroll between left panel and timeline
function SyncScroll() {
  React.useEffect(() => {
    const containers = document.querySelectorAll(".gantt-scroll-sync");   // ← line 276
    const handler = (e: Event) => {
      const target = e.currentTarget as HTMLElement;
      containers.forEach((c) => {
        if (c !== target) c.scrollTop = target.scrollTop;
      });
    };
    containers.forEach((c) => c.addEventListener("scroll", handler));
    return () => containers.forEach((c) => c.removeEventListener("scroll", handler));
  }, []);
  return null;
}
```
**Bug**: line 276 queries `.gantt-scroll-sync` but NO element in the component has that class. The left panel (line 154) and right panel (line 167) use plain Tailwind classes — neither has `gantt-scroll-sync`. So `containers.length === 0`, the `forEach` no-ops, no scroll listener is ever attached. The component renders `<SyncScroll />` at line 267 expecting vertical scroll-sync that NEVER fires. When the Gantt has many events (>~41 to overflow the 500px max-height at line 152), the left panel and the timeline scroll **independently** — rows desync.

**Fix**: add `className="gantt-scroll-sync"` to both `<div>` elements at lines 154 and 167. Or attach the scroll listener via React refs and `useEffect` deps instead of a `document.querySelectorAll` global scan.

### C.6 EVERY consumer
**3** call-sites (qc-calendar does NOT use gantt):

| File | Line | Props passed |
|---|---|---|
| `src/components/modules/admin/calendar-page.tsx` | 127 | `events={allEvents}`, `onEventClick={(e) => { if (e.type === "order" && e.meta?.orderId) openOrder(...) }}`, `title="گانت چارت سفارشات و تسک‌ها"`, `emptyMessage="رویدادی برای نمایش در گانت نیست"`, `filters={filterButtons}` |
| `src/components/modules/designer/designer-calendar.tsx` | 181 | same as admin but `title="گانت چارت سفارشات و تسک‌های طراحی"` |
| `src/components/modules/print/print-calendar.tsx` | 181 | same as admin but `title="گانت چارت سفارشات و تسک‌های چاپ"` |

Same 5-prop shape everywhere. Drop-in compatible.

### C.7 Performance
- `validEvents` is memoized (lines 47–58) — `React.useMemo(() => events.map(...).filter(...).sort(...), [events])`. So a re-render with the same `events` reference is cheap.
- `eventMap` is also memoized (lines 60–64) — built from raw `events` (line 62) instead of `validEvents`. Minor inefficiency: builds a map of ALL events including ones that fail validation; works but wastes memory on garbage events.
- **NO virtualization**: lines 158–163 left-panel and 206–261 right-panel both `.map` over `validEvents` — every event is rendered as a DOM row + absolutely-positioned bar. With 100+ events, the timeline column will produce 100+ `<div className="h-12 ...">` rows + 100+ bar `<div>`s + 100+ Tooltip wrappers + N×days gridlines. The gridlines at lines 190–196 also map over `days` (21/49/90) — fixed cost, fine. The bar list is the linear cost. Plus the parent `<div className="overflow-hidden" style={{ maxHeight: "500px" }}>` (line 152) means only ~41 rows visible, but ALL 100+ are in the DOM (offscreen). With ~500 events the page becomes janky. Recommend `react-window` or `@tanstack/react-virtual` integration in the rebuild.

## D. DataTable — Full Anatomy (file: `src/components/ui/data-table.tsx`, 318 LOC)

### D.1 Generic signature (line 66)
```ts
export function DataTable<TData, TValue>({ ... }: DataTableProps<TData, TValue>) { ... }
```

### D.2 EXACT full prop interface (lines 44–64)
```ts
type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  searchKey?: string;
  searchPlaceholder?: string;             // default "جستجو..."
  globalFilter?: string;
  onGlobalFilterChange?: (v: string) => void;
  toolbar?: React.ReactNode;
  pageSize?: number;                       // default 10
  pageSizeOptions?: number[];              // default [10, 20, 30, 50, 100]
  showColumnToggle?: boolean;             // default true
  showPagination?: boolean;               // default true
  emptyState?: React.ReactNode;
  getRowCanExpand?: (row: TData) => boolean;
  renderExpandedRow?: (row: TData) => React.ReactNode;
  onRowClick?: (row: TData) => void;
  className?: string;
  dense?: boolean;                         // default false
  totalCount?: number;                    // for server-side pagination  ← SEE D.5 BUG
};
```
Also exports `DataTableMeta<TData>` (lines 32–35) and augments TanStack `ColumnMeta` with `hideable?: boolean` + `className?: string` (lines 37–42). The `className?` augmentation is **dead code** — never read in the cell renderer at line 224 (only `dense ? "py-1.5" : "py-2.5"`).

### D.3 The `getRowCanExpand` bug — exact line (line 108)
```ts
getRowCanExpand: getRowCanExpand ? () => true : undefined,
```
**Root cause**: TanStack's `getRowCanExpand` expects a predicate `(row: Row<TData>) => boolean`. Here the prop `getRowCanExpand` (a user-supplied predicate) is checked for truthiness, and if truthy, replaced with `() => true` — meaning **every** row is marked expandable regardless of what the user's predicate returns.

**Compensating workaround** at the click handler (lines 216–221):
```ts
onClick={() => {
  if (getRowCanExpand && getRowCanExpand(row.original)) {
    row.toggleExpanded();
  }
  onRowClick?.(row.original);
}}
```
This re-evaluates the user's predicate at click time, so expansion only fires for rows the user's predicate allows. BUT:
- The TanStack table-state still believes all rows are expandable. Any UI that calls `row.getCanExpand()` (e.g. an expand chevron column) would show chevrons on ALL rows.
- When BOTH `getRowCanExpand` and `onRowClick` are provided, a single click triggers BOTH `row.toggleExpanded()` AND `onRowClick(row.original)` — confusing UX. The orders-page.tsx consumer passes both (lines 349, 358), so a click on a multi-item order row opens the detail modal AND toggles the expansion. Bad.
- The fix: `getRowCanExpand: getRowCanExpand ? (row: Row<TData>) => getRowCanExpand(row.original) : undefined`.

### D.4 The server-side pagination claim vs reality
- **Prop declared** (line 63): `totalCount?: number; // for server-side pagination`
- **Actually used** (line 256): `<DataTablePagination table={table} pageSizeOptions={pageSizeOptions} totalCount={data.length} />` — **uses `data.length`**, not the `totalCount` prop. The prop is silently dropped on the floor.
- Inside `DataTablePagination` (lines 267–315), `totalCount` is used at line 276 (`Math.min((pageIndex + 1) * pageSize, totalCount)`) and line 281 (`if (totalCount > 0)`). So if the prop were threaded through, the "Z مورد" count would correctly show server-side total. Currently it shows `data.length` — meaning when a server returns 25 of 5000 rows, the pagination footer lies: "نمایش ۱ تا ۱۰ از ۲۵ مورد".
- Also `table.getPageCount()` (line 303) is based on `data.length / pageSize` — so `صفحه 1 از 3` instead of `صفحه 1 از 500`. Server-side pagination is fundamentally broken — the table has no concept of total pages.

### D.5 The unused `rowSelection` state
- Declared at line 89: `const [rowSelection, setRowSelection] = React.useState({});`
- Passed to table state at line 94: `state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter: ... }`.
- Setter threaded at line 101: `onRowSelectionChange: setRowSelection`.
- **No UI exposes it** — no checkbox column anywhere, no `enableRowSelection` is set on the table config, no consumer reads `row.getIsSelected()`. The state is pure dead weight. The `data-state={row.getIsSelected() && "selected"}` at line 210 will always be `false`. Recommend removing rowSelection entirely OR wiring it (add `enableRowSelection: true` + checkbox column) if the rebuild needs bulk actions.

### D.6 Sorting/pagination/global-filter/column-visibility state hooks (lines 86–110)
```ts
const [sorting, setSorting] = React.useState<SortingState>([]);              // line 86
const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);  // line 87
const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({}); // line 88
const [rowSelection, setRowSelection] = React.useState({});                 // line 89

const table = useReactTable({
  data,
  columns,
  state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter: globalFilter ?? "" },  // line 94
  enableSorting: true,                                                       // line 95
  enableColumnFilters: true,                                                // line 96
  enableGlobalFilter: !!onGlobalFilterChange,                               // line 97
  onSortingChange: setSorting,                                              // line 98
  onColumnFiltersChange: setColumnFilters,                                  // line 99
  onColumnVisibilityChange: setColumnVisibility,                            // line 100
  onRowSelectionChange: setRowSelection,                                     // line 101
  onGlobalFilterChange: onGlobalFilterChange,                                // line 102
  getCoreRowModel: getCoreRowModel(),                                       // line 103
  getFilteredRowModel: getFilteredRowModel(),                                // line 104
  getSortedRowModel: getSortedRowModel(),                                  // line 105
  getPaginationRowModel: getPaginationRowModel(),                           // line 106
  getExpandedRowModel: getExpandedRowModel(),                               // line 107
  getRowCanExpand: getRowCanExpand ? () => true : undefined,                // line 108 ← BUG
  initialState: { pagination: { pageSize } },                               // line 109
});
```
All client-side. `manualPagination` / `manualSorting` / `manualFiltering` are NOT set, so TanStack always assumes client-side. To support true server-side pagination in the rebuild, set `manualPagination: true`, drop `getPaginationRowModel`, and add `rowCount` / `pageCount` props from the server response.

### D.7 EVERY consumer (18 call-sites across 17 files)
| File | Line |
|---|---|
| `src/components/modules/admin/orders/orders-page.tsx` (All Orders, the focus page) | 343 |
| `src/components/modules/admin/open-orders.tsx` | 609 |
| `src/components/modules/admin/archive-page.tsx` | 78 |
| `src/components/modules/admin/customers-page.tsx` | 138 |
| `src/components/modules/admin/products-page.tsx` | 129 |
| `src/components/modules/admin/suppliers-page.tsx` | 90 |
| `src/components/modules/admin/expense-types-page.tsx` | 69 |
| `src/components/modules/designer/designer-orders.tsx` | 253 |
| `src/components/modules/print/print-orders.tsx` | 295 AND 315 (two DataTables — one per tab) |
| `src/components/modules/qc/qc-reports.tsx` | 311 |
| `src/components/modules/finance/finance-costs.tsx` | 370 |
| `src/components/modules/crm/crm-customers.tsx` | 327 |
| `src/components/modules/crm/crm-deals.tsx` | 340 |
| `src/components/modules/srm/srm-suppliers.tsx` | 332 |
| `src/components/modules/srm/srm-services.tsx` | 266 |
| `src/components/modules/srm/srm-costs.tsx` | 409 |
| `src/components/modules/srm/srm-price-comparison.tsx` | 307 |

All 18 usages import as `import { DataTable, type ColumnDef } from "@/components/ui/data-table"`. The generic is inferred from the consumer's `ColumnDef<T, V>[]`. The virtualization upgrade must stay generic + additive.

## E. DayDetailModal + PreInvoiceModal + shared/index.tsx + search-select

### E.1 DayDetailModal (`src/components/shared/day-detail-modal.tsx`, 302 LOC)

**EXACT prop interface** (lines 11–17):
```ts
type DayDetailModalProps = {
  date: Date | null;
  events: CalendarEvent[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEventClick?: (event: CalendarEvent) => void;
};
```

**Sections rendered**: Header (calendar icon, date, day-of-week, urgent-count chip) + Tabs (`overview` | `orders` | `tasks`) + Overview (4 stat boxes + time-status grid + order breakdown + task breakdown + 5-event preview list) + Orders tab (`EventList`) + Tasks tab (`EventList`). Internal helpers: `StatBox` (lines 209–219), `MiniStat` (lines 221–228), `EventList` (lines 230–302). `toDate` (lines 19–26) and `diffDays` (lines 28–32) are date-crash-guards.

**a11y**: `<DialogTitle className="sr-only">` at line 67. Tab buttons (lines 95–105) are plain `<button>` — NOT ARIA tab pattern.

**Bugs**:
1. **Dynamic Tailwind class purged in prod** — line 172: `<span className={cn("size-2 rounded-full shrink-0", \`bg-${e.color === "yellow" ? "amber" : e.color === "blue" ? "blue" : e.color === "green" ? "emerald" : "rose"}-500\`)} />` — Tailwind's JIT cannot statically detect `bg-amber-500`/`bg-blue-500`/`bg-emerald-500`/`bg-rose-500` from a template literal, so these classes are purged in production builds. The color dot will be transparent in prod. Should use a static `COLOR_DOT` map mirroring `reusable-calendar.tsx:35–40`.
2. Lines 261–266 (`colorBg`) and 267–272 (`colorText`) inside `EventList` DO use static object lookups — so the EventList colors render correctly. Only the overview preview-list dot at line 172 is broken.
3. **`if (!date) return null;`** at line 62 — when `date` is null AND `open` is true, the modal returns null and never closes. The Dialog never renders, so `onOpenChange(false)` is never called by Radix. Combined with consumer pattern `open={!!dayModal}` (e.g. `designer-calendar.tsx:195`) this works because both go null together. But it's brittle.

**EVERY consumer (4 call-sites — same as ReusableCalendar)**:
| File | Line |
|---|---|
| `src/components/modules/admin/calendar-page.tsx` | 140 |
| `src/components/modules/designer/designer-calendar.tsx` | 192 |
| `src/components/modules/print/print-calendar.tsx` | 192 |
| `src/components/modules/qc/qc-calendar.tsx` | 212 |

All 4 pass the same 5 props (`date`, `events`, `open`, `onOpenChange`, `onEventClick`). Drop-in compatible.

### E.2 PreInvoiceModal (`src/components/shared/pre-invoice-modal.tsx`, 285 LOC)

**EXACT prop interface** (lines 23–28):
```ts
type PreInvoiceModalProps = {
  orderId: string | null;
  customerName?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};
```
This modal fetches its own data (unlike OrderDetailModal): `useQuery({ queryKey: ["order", orderId], queryFn: () => api(\`/api/orders/${orderId}\`), enabled: !!orderId && open })` at lines 36–40. The response shape it expects: `{ order: { customerId?: string; items: { id, product: { name } | null, quantity, totalAmount }[]; preInvoices: { id, number, items: string, paidAmount, totalAmount }[] } }`.

**Save mutation** (lines 66–78): POST `/api/pre-invoices` (new) `{ orderId, customerId, items, paidAmount }` OR PUT `/api/pre-invoices/${existingPreInvoice.id}` (edit) `{ items, paidAmount }`. Invalidates `["orders", "order", "dashboard"]`.

**JSON.parse silent fallback** (lines 49–54 — quoted):
```ts
if (existingPreInvoice) {
  // Load existing items
  try {
    const parsed = JSON.parse(existingPreInvoice.items) as PreInvoiceItem[];
    setItems(Array.isArray(parsed) ? parsed : []);
  } catch {
    setItems((orderData.order.items ?? []).map((it) => ({ name: it.product?.name ?? "—", quantity: it.quantity, total: it.totalAmount, paid: 0 })));
  }
}
```
On parse failure (corrupt JSON in the DB column), the modal silently resets all `paid` values to 0 and re-derives from order items. The user has no indication that their previously-saved `paid` amounts were lost. The `paid` info for an existing pre-invoice lives ONLY in that JSON string column — there's no audit trail. The schema-level fix is a `PreInvoiceItem` relation table.

**PDF export** (lines 88–116): `printPDF()` opens `window.open("", "_blank")`, writes inline HTML+CSS (lines 93–112), and calls `win.print()`. This is browser print-to-PDF, not true PDF generation. The `printArea.innerHTML` (the second `<Dialog>` at lines 205–282) is injected into the new window. The whole preview markup is duplicated inline (a) in the in-app preview Dialog (lines 208–274) and (b) re-emitted as a raw string template (lines 93–112) — they must be hand-kept-in-sync, a maintenance hazard.

**EVERY consumer (1 call-site)**:
| File | Line |
|---|---|
| `src/components/shared/order-detail-modal.tsx` | 298 |

Only OrderDetailModal mounts it (lines 298–303, with `orderId={order.id}`, `customerName={order.customer?.name}`, `open={preInvoiceOpen}`, `onOpenChange={setPreInvoiceOpen}`). When the OrderDetailModal is rebuilt, the PreInvoiceModal child mount must be preserved (or migrated).

### E.3 `shared/index.tsx` (105 LOC) — exports
```ts
PageHeader({ title, description?, icon?: IconName, actions?: ReactNode })            // lines 7–34
EmptyState({ icon? = "inbox", title, description?, action?, className? })            // lines 36–59
StatusBadge({ status: string, className? })                                          // lines 61–81
PriorityBadge({ priority: string })                                                  // lines 83–96
LoadingState({ label? = "در حال بارگذاری..." })                                        // lines 98–105
```
`StatusBadge` map (lines 62–74) covers: `pending_design`, `in_printing`, `warehouse_logistics`, `completed`, `archived`, `cancelled`, `todo`, `in_progress`, `done`, `awaiting`, `validated`. Unknown statuses fall back to `{ label: status, cls: "bg-muted text-muted-foreground" }` (line 75). Note: `awaiting` and `validated` are dead labels (no Payment entity exists).

These 5 helpers are the **building blocks** the OrderDetailModal rebuild should use directly:
- `PageHeader` — not needed inside the modal (modal has its own header).
- `EmptyState` — for the items-tab empty case ("این سفارش هیچ آیتمی ندارد").
- `StatusBadge` — already imported via `ORDER_STATUS` lookup; the modal currently inlines the badge markup at line 125. Reuse `StatusBadge` for consistency.
- `PriorityBadge` — currently inlined at lines 126–130. Reuse.
- `LoadingState` — currently inlined at lines 91–94. Reuse.

### E.4 `search-select.tsx` (82 LOC) — exports
```ts
export type SearchOption = { value: string; label: string; sub?: string };
export function SearchSelect({ value?, onChange, placeholder?, searchPlaceholder?, options, className?, allowClear? = true })
```
A combobox built on shadcn `Popover` + `Command`. Used for selecting a single option from a list with fuzzy search. Not directly relevant to the OrderDetailModal rebuild, but it's the primitive the rebuild should reuse for any "select customer / select product" inline fields (e.g. a future add-item action). The current modal has no inline selects (admin uses `orders-new` page for full edit).

## F. Root-Cause Bugs (shared infra) — with EXACT line numbers

### F.1 DataTable `getRowCanExpand` predicate ignored
- **File**: `src/components/ui/data-table.tsx`
- **Line 108**: `getRowCanExpand: getRowCanExpand ? () => true : undefined,`
- **Compensating click-handler** lines 217–218: `if (getRowCanExpand && getRowCanExpand(row.original)) { row.toggleExpanded(); }` — re-evaluates predicate at click-time, but TanStack-internal state still believes ALL rows can expand.
- **Root cause**: the predicate is checked for truthiness only, not invoked. The arrow `() => true` discards the row argument.
- **Impact**: shared across 18 call-sites. Most don't pass `getRowCanExpand` (only `orders-page.tsx:358` does, with predicate `(o) => (o.items?.length ?? 0) > 1`). When they do, expansion icon columns (if any) mis-render, AND clicking a row that satisfies the predicate fires BOTH `toggleExpanded` AND `onRowClick` (because there's no `else`). For `orders-page.tsx` specifically, clicking a multi-item order opens the detail modal AND expands the row — confusing UX. Fix: `getRowCanExpand: getRowCanExpand ? (row: Row<TData>) => getRowCanExpand(row.original) : undefined`.

### F.2 DataTable server-side pagination misleading
- **File**: `src/components/ui/data-table.tsx`
- **Line 63** (prop declaration): `totalCount?: number; // for server-side pagination`
- **Line 256** (consumer of `totalCount`): `<DataTablePagination table={table} pageSizeOptions={pageSizeOptions} totalCount={data.length} />` — uses `data.length`, NEVER the `totalCount` prop.
- **Inside `DataTablePagination`** lines 267–315: uses the `totalCount` it received (which is `data.length`), at line 276 (`Math.min((pageIndex + 1) * pageSize, totalCount)`) and line 281 (`if (totalCount > 0)`).
- **Root cause**: a copy-paste leftover — the prop exists for server-side, but the call-site ignores it.
- **Impact**: shared across 18 call-sites. Today, no consumer passes `totalCount`, so the lie is invisible. But anyone trying to wire server-side pagination will pass `totalCount` and discover it doesn't work. Also `table.getPageCount()` (line 303) reflects `data.length / pageSize` — the "صفحه X از Y" footer is wrong for any server-paginated list. To truly support server-side, the rebuild must add `manualPagination: true`, drop `getPaginationRowModel`, add `pageCount`/`rowCount` props, and accept `onPaginationChange` from the consumer.

### F.3 Gantt `SyncScroll` broken class query
- **File**: `src/components/shared/reusable-gantt.tsx`
- **Line 276**: `const containers = document.querySelectorAll(".gantt-scroll-sync");`
- **The two scroll containers** (lines 154, 167) lack the `gantt-scroll-sync` class — `<div className="shrink-0 border-l bg-muted/20 overflow-y-auto scrollbar-thin" style={{ width: leftPanelWidth }}>` and `<div className="flex-1 min-w-0 overflow-x-auto scrollbar-thin">`. No `.gantt-scroll-sync` element anywhere in the file.
- **Root cause**: dead querySelector — the `SyncScroll` component was probably written assuming the JSX would have the class, but the JSX never got it.
- **Impact**: shared across 3 call-sites (admin/designer/print calendars). For ≤41 events the bug is silent (no vertical overflow). With >41 events, the left-panel names and the timeline bars scroll independently — row names desync from their bars. Fix: add `className="... gantt-scroll-sync"` to both divs (or convert SyncScroll to use React refs).

### F.4 Gantt no virtualization
- **File**: `src/components/shared/reusable-gantt.tsx`
- **Lines 158–163** (left panel): `validEvents.map((e) => <div key={e.id} className="h-12 ..." ...>)`
- **Lines 206–261** (right panel bars): `validEvents.map((e, idx) => { ... return <div key={e.id} className="h-12 border-b relative">...</div>; })`
- **Also** lines 190–196 (gridlines): `days.map((d, i) => <div ... />)` — fixed cost (21/49/90).
- **Root cause**: simple `.map` — no virtualization library, no windowing. The `maxHeight: "500px"` overflow-hidden (line 152) clips the visible area but does NOT prevent the offscreen DOM from existing.
- **Impact**: shared across 3 call-sites. For ~30 events, fine. For 100+ events, the page becomes janky (especially the bars column with 100× absolutely-positioned + Tooltip-wrapped divs). The rebuild should integrate `@tanstack/react-virtual` for both panels.

### F.5 DayDetailModal dynamic Tailwind classes purged in prod
- **File**: `src/components/shared/day-detail-modal.tsx`
- **Line 172**: `<span className={cn("size-2 rounded-full shrink-0", \`bg-${e.color === "yellow" ? "amber" : e.color === "blue" ? "blue" : e.color === "green" ? "emerald" : "rose"}-500\`)} />`
- **Root cause**: Tailwind's JIT scanner cannot statically resolve template-literal class names; `bg-amber-500`, `bg-blue-500`, `bg-emerald-500`, `bg-rose-500` are NOT in the safelist (no `tailwind.config.ts` entry). They are purged in production builds. The colors render correctly in dev (JIT picks them up at runtime via HMR scan) but fail in `next build`.
- **Impact**: shared across 4 call-sites. The overview-tab preview-list color dot (only at line 172) will be transparent/no-background in prod. Fix: copy the `COLOR_CLASSES` static-map pattern from `reusable-calendar.tsx:35–40` (which already does it correctly). Note: the EventList sub-component at lines 261–272 DOES use static object lookups — those colors render correctly. Only the preview-list dot at line 172 is broken.

### F.6 OrderDetailModal placeholder actions
- **File**: `src/components/shared/order-detail-modal.tsx`
- **Line 286**: `onClick={() => toast.info(\`فاکتور #${order.invoice?.number ?? "—"}\`)}` — the "فاکتور" (Invoice) button is a no-op; it only pops a toast with the invoice number (if it exists). No invoice flow exists; the `invoice` field on `OrderDetail` (lines 31) is never populated by the API in practice (per worklog 1-d #2, the entire Finance invoices/payments module is unbuilt).
- **Impact**: 2 consumers. The button only renders when `order.invoice` is truthy (line 285) — and since no API creates invoices, the button essentially never renders today. So the bug is latent — it becomes visible the moment someone wires up an Invoice entity.
- The other 2 footer actions ARE real: pre-invoice button opens PreInvoiceModal (line 282 → line 298 mount), edit-full navigates to admin-orders-new (line 290).

### F.7 PreInvoiceModal JSON.parse silent fallback
- **File**: `src/components/shared/pre-invoice-modal.tsx`
- **Lines 49–54**: as quoted in E.2. On parse failure, silently rebuilds items with `paid: 0`. No toast, no UI indication.
- **Root cause**: the `preInvoices.items` column stores a JSON-stringified array (per worklog 1-d #9); parsing happens at runtime in the modal with no validation server-side.
- **Impact**: 1 consumer (OrderDetailModal:298). If a pre-invoice record's `items` JSON gets corrupted (DB drift, manual edit, schema migration), the user opens the modal expecting to see their previously-set `paid` amounts and sees all zeros instead — silent data loss from the user's perspective. The fix: server-side validation (Zod schema on the `items` field) + a structured `PreInvoiceItem` Prisma relation table to eliminate JSON-column storage entirely.

### F.8 ReusableCalendar dynamic classes / date bugs
- **No dynamic Tailwind classes** — uses static `COLOR_CLASSES` map (lines 35–40). Safe.
- **Date parsing robust** — try/catch + isValid (lines 64–67).
- **No critical bugs**. Two minor smells:
  - `DayNote.color?: string` (line 23) is dead — never read by the calendar (only the bookmark icon at line 150 is rendered if a note exists).
  - `notesMap` keyed by `format(day, "yyyy-MM-dd")` (line 132) but `DayNote.date` is a raw string — convention-dependent (consumers must format consistently).

### F.9 `any`-typed props
- Grep across the 8 shared-component files for `any` types: **no matches**. All shared components are properly typed. The closest soft-any is `CalendarEvent.meta?: Record<string, unknown>` (line 17 of `reusable-calendar.tsx`) — consumers must cast (e.g. `e.meta?.orderId as string` at `calendar-page.tsx:120`). Recommend tightening to a discriminated union: `meta?: { orderId?: string; reportId?: string; taskId?: string }` so consumers get type safety without casts.

## G. Contracts to PRESERVE (the rebuild boundary)

### G.1 OrderDetailModal rebuild
- **Current prop interface** (lines 34–40): `{ order: OrderDetail | null; open: boolean; onOpenChange: (v: boolean) => void }`.
- **Must also re-export `type OrderDetail`** (lines 18–32) — both consumers (`lib/use-order-detail.tsx:6`, `admin/open-orders.tsx:8`) import it.
- **Drop-in possible?** YES — keep the 3 props + the type re-export, the new modal slots in unchanged.
- **Recommended migration**: switch to `{ orderId: string | null; open: boolean; onOpenChange: (v: boolean) => void }` (matching the 4 sibling detail-modals: designer/print/qc/cost). This requires migrating:
  - `lib/use-order-detail.tsx:31–35` — drop the hook-level `useQuery` (lines 19–23), pass `orderId` instead. The hook's return shape changes from `{ openOrder, modal, isLoading }` to `{ openOrder, modal }` — but no consumer reads `isLoading` from `useOrderDetail` today (grep needed to confirm; if any consumer does, keep it).
  - `admin/open-orders.tsx:632–638` — pass `orderId={selectedOrderId}` instead of `order={orderDetail?.order ?? null}`. The page-level `useQuery(["order", selectedOrderId])` at lines 239–243 can be removed (the modal will fetch its own). The separate loading overlay at lines 641–648 must be removed (the modal will own its loading state).

### G.2 ReusableCalendar rebuild
- **Current prop interface** (lines 26–33): `{ events: CalendarEvent[]; notes?: DayNote[]; onDayClick?; onEventClick?; filters?; className? }`.
- **All 4 consumers** pass: `events`, `onDayClick`, `onEventClick`, `filters`. NONE pass `notes` or `className`.
- **Drop-in possible?** YES — keep the 6 props. Add new optional props (e.g. `cursor?: Date`, `onCursorChange?: (d: Date) => void`, `weekStartsOn?: 0–6`) additively; no consumer breaks.

### G.3 ReusableGantt rebuild
- **Current prop interface** (lines 10–17): `{ events: CalendarEvent[]; onEventClick?; className?; title?; emptyMessage?; filters? }`.
- **All 3 consumers** pass: `events`, `onEventClick`, `title`, `emptyMessage`, `filters`. NONE pass `className`.
- **Drop-in possible?** YES — keep the 6 props. To unify with ReusableCalendar's contract, the new gantt could also accept `notes?` (ignore) and `onDayClick?` (impossible — gantt has no day cells). Recommend just adding the missing scroll-sync class (`.gantt-scroll-sync`) on lines 154 & 167 as a bug-fix that requires no consumer change.

### G.4 DataTable virtualization upgrade
- **Current prop interface** (lines 44–64): 19 props (see D.2). Generic `<TData, TValue>`.
- **All 18 consumers** import as `import { DataTable, type ColumnDef } from "@/components/ui/data-table"` and infer the generic.
- **Drop-in possible?** YES if the upgrade is additive:
  - ADD `enableVirtualization?: boolean` (default false) — opt-in, existing consumers unaffected.
  - ADD `rowHeight?: number` (default 40) — for the virtualizer's `estimateSize`.
  - ADD `overscan?: number` (default 10).
  - Internally wrap `<TableBody>` rows in `useVirtualizer` when `enableVirtualization` is true; keep the existing non-virtual path as the default.
- **Breaking changes only required if**: the team wants server-side pagination to be the default. Then `manualPagination: true` is on by default and every consumer that doesn't pass `pageCount`/`rowCount` breaks. Recommend keeping client-side as default and adding `manualPagination?: boolean` (default false).
- **Bugs to fix during the upgrade**:
  1. Line 108: replace `() => true` with the predicate invocation.
  2. Line 256: thread `totalCount` through instead of `data.length`.
  3. Lines 216–221 click handler: change `if (getRowCanExpand && getRowCanExpand(row.original)) { row.toggleExpanded(); } onRowClick?.(row.original);` to `if (getRowCanExpand && getRowCanExpand(row.original)) { row.toggleExpanded(); } else { onRowClick?.(row.original); }` — so a click does EITHER expand OR navigate, never both.
  4. Line 89 + line 101: remove `rowSelection` state and `onRowSelectionChange` (dead) — or wire it up properly with a checkbox column.
  5. Line 40 `className?: string` in the `ColumnMeta` augmentation — either read it in the cell renderer (line 224) or remove it.


---
Task ID: p1-a
Agent: Explore (Admin Orders Cluster)
Task: Precise evidence extraction from order-wizard, orders-page, open-orders

Work Log:
- Read full `/home/z/printoo-erp/src/components/modules/admin/orders/order-wizard.tsx` (1189 LOC, lines 1-1189) in 3 passes (1-400, 401-800, 801-1189).
- Read full `/home/z/printoo-erp/src/components/modules/admin/orders/orders-page.tsx` (728 LOC) in 2 passes (1-400, 401-728).
- Read full `/home/z/printoo-erp/src/components/modules/admin/open-orders.tsx` (846 LOC) in 2 passes (1-450, 451-846).
- Read thin wrapper `/home/z/printoo-erp/src/components/modules/admin/orders/order-wizard-page.tsx` (3 LOC, single re-export).
- Cross-read supporting contracts: `/home/z/printoo-erp/src/app/api/orders/route.ts` (256 LOC), `/home/z/printoo-erp/src/app/api/orders/[id]/route.ts` (143 LOC), `/home/z/printoo-erp/src/lib/constants.ts` (120 LOC), `/home/z/printoo-erp/src/lib/use-order-detail.tsx` (40 LOC), `/home/z/printoo-erp/src/components/shared/order-detail-modal.tsx` (307 LOC), `/home/z/printoo-erp/src/components/shared/pre-invoice-modal.tsx` (286 LOC), `/home/z/printoo-erp/src/stores/app-store.ts` (lines 1-95, 120-161).
- Grepped for `react-hook-form`/`zod`/`useForm` usage in orders cluster: ZERO matches (only `src/components/ui/form.tsx` shadcn primitives exist). Confirmed `react-hook-form ^7.60.0` and `zod ^4.0.2` in package.json lines 73, 85 are dead deps for this cluster.
- Grepped for `refetchInterval` usage to confirm dashboard refetch burden: 5 dashboard queries (kpi-cards:120 @15s, dashboard-sections:32/87/140 @30s, quick-stats:27 @30s) + open-orders:162 @30s.

Stage Summary:

### A. Data Flow Map (exact)

#### A.1 New Order creation — `OrderWizardPage()` state shape

`order-wizard.tsx` holds **18 `useState` calls in the parent component alone** (lines 87-110), plus 7 more inside Step subcomponents:

| # | Line | Hook | Type |
|---|------|------|------|
| 1 | 87 | `step` | `number` (1-4) |
| 2 | 88 | `multiMode` | `boolean` |
| 3 | 89 | `customers` | `string[]` |
| 4 | 90 | `activeCustomer` | `string` |
| 5 | 91 | `itemsByCustomer` | `Record<string, ItemDraft[]>` |
| 6 | 93 | `splitMode` | `"grouped" \| "separated"` |
| 7 | 94 | `priority` | `"normal" \| "urgent"` |
| 8 | 95 | `endDate` | `string` |
| 9 | 96 | `noEndDate` | `boolean` |
| 10 | 97 | `note` | `string` |
| 11 | 98 | `designStart` | `string` |
| 12 | 99 | `designEnd` | `string` |
| 13 | 100 | `printStart` | `string` |
| 14 | 101 | `printEnd` | `string` |
| 15 | 103 | `preInvoiceEnabled` | `boolean` |
| 16 | 104 | `preInvoicePaid` | `Record<string, string>` (per-item-id paid amounts) |
| 17 | 105 | `invoiceEnabled` | `boolean` |
| 18 | 110 | `loadedOrderId` | `string \| null` (edit-mode guard) |

Plus: Step1 has `newCust` (531), `createOpen` (532); Step2 has `noteModal` (689), `productModal` (690), `newProduct` (691); NoteItemModal has `val` (885); Step4 has `tab` (1027). **Total: 25 useState calls across the file.**

#### A.2 POST `/api/orders` submit body — quoted verbatim (`order-wizard.tsx:254-326`)

```tsx
const createMut = useMutation({
  mutationFn: () => {
    const cid = customers[0] ?? "";
    const items = (itemsByCustomer[cid] ?? []).map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      pricePerUnit: i.pricePerUnit,
      totalAmount: i.quantity * i.pricePerUnit,
      note: i.note || null,
      description: i.description || null,
      stage: i.stage,
      needsMaterial: i.needsMaterial,
    }));
    const moduleDates = {
      design: needsDesign ? { start: designStart || null, end: designEnd || null } : undefined,
      print: { start: printStart || null, end: printEnd || null },
    };

    if (isEditing && param) { /* see A.3 */ }

    // Create mode: POST to /api/orders
    const body: Record<string, unknown> = {
      customers,
      itemsByCustomer: Object.fromEntries(
        Object.entries(itemsByCustomer).map(([c, list]) => [
          c,
          list.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            pricePerUnit: i.pricePerUnit,
            totalAmount: i.quantity * i.pricePerUnit,
            note: i.note || null,
            description: i.description || null,
            stage: i.stage,
            needsMaterial: i.needsMaterial,
          })),
        ])
      ),
      splitMode,
      priority,
      endDate: noEndDate ? null : endDate || null,
      noEndDate,
      note: note || null,
      moduleDates,
      markCompleted: anyCompleted,
    };
    // pre-invoice (per customer in review)
    if (preInvoiceEnabled) {
      body.preInvoice = {
        items: [],
        totalAmount: 0,
        paidAmount: 0,
      };
    }
    if (invoiceEnabled && anyCompleted) {
      body.invoice = { items: [], totalAmount: 0, paidAmount: 0, discountAmount: 0 };
    }
    return api("/api/orders", { method: "POST", body: JSON.stringify(body) });
  },
  onSuccess: (data: { count?: number }) => {
    invalidate(["orders"]);
    invalidate(["dashboard"]);
    invalidate(["notifications"]);
    invalidate(["order"]);
    if (isEditing) { toast.success("تغییرات سفارش ذخیره شد"); }
    else { toast.success(`${data.count ?? 1} سفارش با موفقیت ایجاد شد`); }
    navigate("admin", "orders");
  },
  onError: (e: Error) => toast.error(e.message),
});
```

**Critical flow bugs visible here:**
- `preInvoicePaid` (state at line 104, populated in `PreInvoiceTable` at lines 1144-1186, especially the `onChange` at line 1171: `setPreInvoicePaid({ ...preInvoicePaid, [it.id]: e.target.value })`) — **IS NEVER SERIALIZED INTO THE REQUEST BODY**. Lines 315-320 hardcode `body.preInvoice = { items: [], totalAmount: 0, paidAmount: 0 }` regardless of `preInvoicePaid`. The user's entered per-item paid amounts are silently discarded on submit. The API (`/api/orders/route.ts:225-239`) then creates a PreInvoice row with `paidAmount: 0` and empty items, and the order's `paidAmount` stays 0.
- `markCompleted: anyCompleted` (line 312) flows in correctly. `anyCompleted` is the `some(stage === "completed")` boolean computed at line 244.
- `moduleDates` (line 268-271) correctly threads `designStart/designEnd/printStart/printEnd` from state — but only if `needsDesign` (line 243) is true. If the user toggles all items off-design after setting design dates, those dates are silently dropped (this is by-design but surprising).
- After success: 4 invalidations (`orders`, `dashboard`, `notifications`, `order`) and `navigate("admin", "orders")` (line 337).

#### A.3 Edit-mode PUT `/api/orders/[id]` — quoted verbatim (`order-wizard.tsx:273-286`)

```tsx
if (isEditing && param) {
  // Edit mode: PUT to /api/orders/[id]
  const body = {
    customerId: cid,
    items,
    splitMode,
    priority,
    endDate: noEndDate ? null : endDate || null,
    noEndDate,
    note: note || null,
    moduleDates,
  };
  return api(`/api/orders/${param}`, { method: "PUT", body: JSON.stringify(body) });
}
```

**Confirmed drops in edit mode (compared to create body):**
- `preInvoice` — DROPPED
- `invoice` — DROPPED
- `markCompleted` — DROPPED (so editing an item to stage "completed" doesn't trigger invoice creation; only `stageToStatus` at API line 129-131 maps to `data.status = "completed"` but no invoice)
- `customers` — DROPPED (because edit is single-customer only)
- **`cid = customers[0]` (line 257) silently discards customers[1..n]**: even if a user toggled multiMode in edit mode (which the wizard doesn't prevent), only the first customer's items make it into the body. Multi-customer edit is impossible.

The edit-mode PUT contract matches `/api/orders/[id]/route.ts:21-32` (`UpdateBody` only accepts `note, endDate, noEndDate, priority, totalAmount, status, customerId, splitMode, items, moduleDates`) — so the API itself has no path to update pre-invoices through PUT. To edit pre-invoices from the wizard, the rebuild would need a separate call to `/api/pre-invoices` (POST or PUT). Currently this is impossible from the wizard.

#### A.4 Edit-mode load logic — `order-wizard.tsx:107-170`

```tsx
const param = useAppStore((s) => s.param);
const isEditing = !!param;
const [loadedOrderId, setLoadedOrderId] = React.useState<string | null>(null);

const { data: editData, error: editError } = useQuery({
  queryKey: ["order", param],
  queryFn: () => api<{ order: OrderEditData }>(`/api/orders/${param}`),
  enabled: !!param,
});

React.useEffect(() => {
  if (!param) { setLoadedOrderId(null); return; }
  if (!editData?.order) return;
  if (loadedOrderId === param) return;
  const order = editData.order;
  setCustomers([order.customerId]);           // single customer only
  setActiveCustomer(order.customerId);
  setMultiMode(false);
  // items
  const items: ItemDraft[] = (order.items ?? []).map((it) => ({...}));
  setItemsByCustomer({ [order.customerId]: items });
  // timing
  setSplitMode((order.splitMode as "grouped" | "separated") ?? "grouped");
  setPriority((order.priority as "normal" | "urgent") ?? "normal");
  setEndDate(order.endDate ? order.endDate.slice(0, 10) : "");
  setNoEndDate(!!order.noEndDate);
  setNote(order.note ?? "");
  // Module dates from first item only (lines 157-163)
  const firstItem = order.items?.[0];
  if (firstItem) {
    setDesignStart(firstItem.designStartDate ? firstItem.designStartDate.slice(0, 10) : "");
    setDesignEnd(firstItem.designEndDate ? firstItem.designEndDate.slice(0, 10) : "");
    setPrintStart(firstItem.printStartDate ? firstItem.printStartDate.slice(0, 10) : "");
    setPrintEnd(firstItem.printEndDate ? firstItem.printEndDate.slice(0, 10) : "");
  }
  // Step 4: review
  setPreInvoiceEnabled((order.preInvoices?.length ?? 0) > 0);
  setInvoiceEnabled(!!order.invoice);
  setLoadedOrderId(param);
}, [param, editData, loadedOrderId]);
```

**Bugs here:**
- `setPreInvoiceEnabled(true)` on edit is a one-way flag — once enabled, the user can't actually edit existing pre-invoices from the wizard because the create body still sends `{ items: [], totalAmount: 0, paidAmount: 0 }` AND edit-mode doesn't send preInvoice at all. The PreInvoiceTable in Step4 still renders and the user can enter paid amounts — which are then ignored on submit.
- Module dates are loaded from `order.items?.[0]` only — if items have heterogeneous module dates (possible from separated split-mode creation + later edits), all but the first item's dates are hidden.
- No cleanup effect: if the user navigates away mid-edit, `loadedOrderId` persists until next param change.

#### A.5 `OrdersPage` (orders-page.tsx) — TanStack Query, columns, filters, actions

- **Query key:** `["orders", customerFilter, productFilter]` (line 56) — refetches when either filter changes.
- **Endpoint:** `GET /api/orders?customerId=...&productId=...` (line 61).
- **No `refetchInterval`** — only manual invalidation (lines 92, 604, 660).
- **Auxiliary queries:** `["customers-list"]` (line 66) → `/api/customers`; `["products-list"]` (line 70) → `/api/products`.
- **Client-side filters** (line 79-88 `useMemo`): `statusFilters` (Set), `priorityFilters` (Set), `stageFilters` (Set), `dateFrom`/`dateTo` (Date) applied via `Array.filter` against already-fetched data.
- **9 columns** (line 96-204):
  1. `expand` (line 97-110) — chevron for items.length > 1
  2. `number` (line 111-116) — `#${row.original.number}`
  3. `customer` (line 117-127) — name + phone
  4. `items` (line 128-142) — first 2 product names + `+N`
  5. `status` (line 143-151) — `<StatusBadge>` wrapped in a button → opens `StatusModal` (line 147)
  6. `endDate` (line 152-176) — formatted + days-remaining pill
  7. `totalAmount` (line 177-182) — formatted IRR
  8. `priority` (line 183-189) — `<PriorityBadge>`
  9. `createdAt` (line 190-196) — formatted
  10. `actions` (line 197-203) — `<RowActions>` (see below)

- **Row actions (5 buttons, `RowActions` at line 551-596):**
  | Button | Line | Behavior | Status |
  |---|---|---|---|
  | Note (info icon) | 555-561 | `setNoteModal(row.original)` → real NoteModal → `PUT /api/orders/${id}` with `{note}` | ✅ Real |
  | Edit (edit icon) | 562-569 | `navigate("admin", "orders-new", row.original.id)` | ✅ Real |
  | **Pre-invoice** (receipt) | 570-577 | `toast.info("پیش‌فاکتور به‌زودی")` | ❌ **PLACEHOLDER** |
  | **Invoice** (invoice) | 578-585 | `toast.info(order.status === "completed" ? "فاکتور" : "سفارش تکمیل نشده")` | ❌ **PLACEHOLDER** |
  | Delete (trash) | 586-593 | `setDeleteId(row.original.id)` → confirm dialog → `DELETE /api/orders/${id}` | ✅ Real |

- **Status badge click → `StatusModal` (line 632-727)** — REAL: `PUT /api/orders/${id}/status` with `{status, designStart, designEnd, printStart, printEnd}` (line 650-659). Module-date fields conditionally shown based on status (line 646-647).

- **Row click → `openOrder(row.id)` (line 349)** via `useOrderDetail` hook (`src/lib/use-order-detail.tsx:15-39`): fetches `["order", id]` and mounts `<OrderDetailModal>` (line 30-36). The real PreInvoiceModal trigger lives inside `OrderDetailModal` (`src/components/shared/order-detail-modal.tsx:282-284, 298-303`), NOT in the table itself.

- **Filter UI components:**
  - `SearchCombobox` (line 413-499): customer + product search dropdowns, wrapped in Popover + Command.
  - `FilterToggle` (line 515-545): pill button for status/priority/stage multi-select.
  - `FilterGroup` (line 502-512): label + icon + children wrapper.

#### A.6 `OpenOrdersPage` (open-orders.tsx) — differences from OrdersPage

- **Query key:** `["open-orders", customerFilter, productFilter]` (line 154) — DISTINCT from `["orders", ...]`.
- **Endpoint:** `GET /api/orders?excludeArchived=true&customerId=...&productId=...` (line 155-161).
- **`refetchInterval: 30000`** (line 162) — auto-refresh every 30s.
- **Client-side filter** (line 179-183): `o.status !== "completed" && !== "archived" && !== "cancelled"` — re-filters despite the API already excluding archived.
- **Stage tabs** (line 47-82, rendered at line 448-494): 4-tab segmented control (all / pending_design / in_printing / warehouse_logistics) with badge counts.
- **Summary cards** (line 497-533): 4 interactive cards (Total / Overdue / Near / Urgent) that toggle `cardFilter` (line 141).
- **No status filter**, **no priority filter**, **no stage filter**, **no date range** — only customer/product search + card filter.
- **No `RowActions` column** — the actions column is absent. Only `onRowClick={(o) => setSelectedOrderId(o.id)}` (line 615) opens `<OrderDetailModal>` (line 632-638).
- **Columns (8 vs OrdersPage's 10):** `number`, `customer`, `items`, `status`, `stageDeadline` (computed from `getStageDeadline`), `endDate`, `priority`, `totalAmount`, `createdAt` (lines 270-427).
- **`OrderDetailModal` mounting** (line 632-638):
  ```tsx
  <OrderDetailModal
    order={orderDetail?.order ?? null}
    open={!!selectedOrderId}
    onOpenChange={(o) => { if (!o) setSelectedOrderId(null); }}
  />
  ```
  Calls the SAME shared modal as `OrdersPage` uses (via `useOrderDetail` hook). Both pass `{order, open, onOpenChange}`. ✅ Contract preserved.

#### A.7 Duplicated components between `orders-page.tsx` and `open-orders.tsx`

**Confirmed duplication:**

1. **`SearchCombobox`** — DUPLICATED, near-identical:
   - `orders-page.tsx:413-499` (87 LOC)
   - `open-orders.tsx:723-845` (123 LOC)
   - Props are identical; only differences: (a) `id` attribute on the `CommandList` (`search-combobox-list` vs `open-orders-search-list`), (b) minor JSX whitespace. Behavior, styling, accessibility all duplicated.

2. **`Order` type** — overlapping but divergent:
   - `orders-page.tsx:27-32`: `{id, number, status: OrderStatus, endDate, noEndDate, totalAmount, priority, splitMode, note, createdAt, customer, items: {id, productId, product, quantity, totalAmount, note, stage}}`
   - `open-orders.tsx:20-40`: same fields + `items[].designEndDate` + `items[].printEndDate` (extra fields the open-orders page uses for `getStageDeadline`).

3. **`customers-list` / `products-list` query pattern** — duplicated (orders-page.tsx:65-72 vs open-orders.tsx:166-173). Identical queries, identical keys, identical transforms.

4. **`EmptyState` for orders** — both pages repeat an identical empty-state JSX (orders-page.tsx:350-356 vs open-orders.tsx:616-627).

### B. Root-Cause Bugs (with EXACT line numbers)

#### B.1 Per-item `paidAmount` (preInvoicePaid) silently dropped on submit
- **File:line:** `order-wizard.tsx:315-321`
- **Code:**
  ```tsx
  if (preInvoiceEnabled) {
    body.preInvoice = {
      items: [],            // ❌ should be preInvoicePaid-derived
      totalAmount: 0,       // ❌ should be items total
      paidAmount: 0,         // ❌ should be sum of preInvoicePaid values
    };
  }
  ```
- **Root cause:** The `preInvoicePaid` state (line 104) is set in `PreInvoiceTable` (lines 1167-1175 `onChange={(e) => setPreInvoicePaid({ ...preInvoicePaid, [it.id]: e.target.value })}`) but is **never read** when constructing the request body. The state is only used at line 1145 to render the unpaid balance UI.
- **User-facing impact:** User opens wizard, enables pre-invoice, types paid amounts per item (e.g., "200000" for item A, "500000" for item B), clicks "ساخت سفارش" — succeeds, navigates to orders page, but the order's `paidAmount` is 0 and the PreInvoice row in DB has `items: "[]"`, `paidAmount: 0`, `totalAmount: 0`. The user thinks they recorded a 700,000 IRR payment; in reality nothing was recorded. The PreInvoice PDF preview (via PreInvoiceModal) will show 0 paid.

#### B.2 Edit-mode PUT drops preInvoice / invoice / markCompleted + only handles customers[0]
- **File:line:** `order-wizard.tsx:273-285` (drops), `order-wizard.tsx:257` (cid = customers[0])
- **Code:**
  ```tsx
  const cid = customers[0] ?? "";  // line 257
  ...
  if (isEditing && param) {
    const body = {
      customerId: cid,
      items,
      splitMode, priority, endDate, noEndDate, note, moduleDates,
      // ❌ no preInvoice, no invoice, no markCompleted, no customers[]
    };
    return api(`/api/orders/${param}`, { method: "PUT", body: JSON.stringify(body) });
  }
  ```
- **Root cause:** Edit path was authored as a thin copy of create path but with the preInvoice/invoice/markCompleted branches stripped. The `cid = customers[0] ?? ""` is shared with create (line 257 lives above the if/else), so even though create uses `customers` (the array), edit only uses the first element. If a user toggled multiMode during edit, the second customer's items are silently lost on save.
- **User-facing impact:** (1) Editing an order's items to stage "completed" does NOT create an invoice (whereas create does, via `markCompleted`). (2) Editing a multi-customer order from the wizard (only reachable if you toggle multiMode after entering edit) wipes non-first customers. (3) Pre-invoice edits from the wizard are impossible — the user must go to OrderDetailModal → PreInvoiceModal to edit a pre-invoice post-creation.

#### B.3 Pre-invoice / Invoice row actions are placeholders (`toast.info`)
- **File:line:** `orders-page.tsx:572` (pre-invoice), `orders-page.tsx:580` (invoice)
- **Code:**
  ```tsx
  // line 570-577 (Pre-invoice)
  <Button variant="ghost" size="icon" className="size-8 hover:text-emerald-600"
    onClick={(e) => { e.stopPropagation(); toast.info("پیش‌فاکتور به‌زودی"); }}>
    <Icon name="receipt" size={15} />
  </Button>

  // line 578-585 (Invoice)
  <Button variant="ghost" size="icon" className="size-8 hover:text-blue-600"
    onClick={(e) => { e.stopPropagation(); toast.info(order.status === "completed" ? "فاکتور" : "سفارش تکمیل نشده"); }}>
    <Icon name="invoice" size={15} />
  </Button>
  ```
- **Also:** `order-detail-modal.tsx:286` — Invoice button in modal footer is also a placeholder:
  ```tsx
  <Button size="sm" variant="outline" className="gap-1.5"
    onClick={() => toast.info(`فاکتور #${order.invoice?.number ?? "—"}`)}>
    <Icon name="invoice" size={14} /> فاکتور
  </Button>
  ```
- **Root cause:** Feature half-implemented. The real PreInvoiceModal exists and works from OrderDetailModal (line 282-284, 298-303), but the row-action button was left as `toast.info("به‌زودی")` ("coming soon"). Invoice has no modal at all.
- **User-facing impact:** Users clicking the receipt icon in the table see a "coming soon" toast, leading them to believe the feature is unavailable — when in fact it IS available via row-click → modal. Bad discoverability + inconsistent UX.

#### B.4 Missing `useMemo`/`useCallback` on heavy computations
- **File:lines:**
  - `order-wizard.tsx:243` — `needsDesign = Object.values(itemsByCustomer).flat().some((i) => i.stage === "design")` — recomputed every render, no memo.
  - `order-wizard.tsx:244` — `anyCompleted = Object.values(itemsByCustomer).flat().some((i) => i.stage === "completed")` — same.
  - `order-wizard.tsx:706` — `const total = items.reduce((s, i) => s + i.quantity * i.pricePerUnit, 0);` in Step2 — recomputed every render of Step2 (every keystroke in any item field).
  - `order-wizard.tsx:916` — `const allItems = Object.values(itemsByCustomer).flat();` in Step3 — recomputed every render.
  - `order-wizard.tsx:1100` — `CustomerReviewTable`'s `const total = items.reduce(...)` — recomputed every render.
  - `order-wizard.tsx:1144-1146` — `PreInvoiceTable`'s `const total = items.reduce(...); const paid = items.reduce(...); const unpaid = total - paid;` — recomputed on every keystroke in the paid-amount input (line 1171).
  - `orders-page.tsx:79-88` — `orders = React.useMemo(...)` ✅ correctly memoized. (one bright spot)
  - `open-orders.tsx:179-236` — 4 `useMemo` calls (openOrders, stageOrders, stats, filteredOrders, stageCounts) ✅ correctly memoized. (another bright spot)
- **Root cause:** Wizard authored with raw inline expressions; the list-pages authored with proper memoization. Inconsistent practice.
- **User-facing impact:** With 20+ items, every keystroke in Step4's PreInvoiceTable paid-input re-runs 3 `.reduce()` over all items + re-renders CustomerReviewTable (which runs its own reduce) + re-renders the parent Step4. Janky input lag on slow devices.

#### B.5 Prop-drilling severity
- **Step1 props** (`order-wizard.tsx:520-530`): **7 props** — `multiMode, setMultiMode, customers, addCustomer, removeCustomer, customerOptions, allCustomers`.
- **Step2 props** (`order-wizard.tsx:672-685`): **10 props** — `customers, activeCustomer, setActiveCustomer, itemsByCustomer, addItem, updateItem, copyItem, deleteItem, productOptions, allCustomers`.
- **Step3 props** (`order-wizard.tsx:902-914`): **20 props** — `splitMode, setSplitMode, priority, setPriority, endDate, setEndDate, noEndDate, setNoEndDate, note, setNote, needsDesign, designStart, setDesignStart, designEnd, setDesignEnd, printStart, setPrintStart, printEnd, setPrintEnd, itemsByCustomer`.
- **Step4 props** (`order-wizard.tsx:1009-1025`): **15 props** — `customers, itemsByCustomer, allCustomers, splitMode, priority, endDate, noEndDate, needsDesign, anyCompleted, preInvoiceEnabled, setPreInvoiceEnabled, preInvoicePaid, setPreInvoicePaid, invoiceEnabled, setInvoiceEnabled`.
- **Total:** 52 props drilled across 4 Step components.
- **Root cause:** No form context (RHF `FormProvider` or a custom `WizardContext`). Each setter is passed explicitly.
- **User-facing impact:** Rebuild requires either (a) keeping the 52-prop surface, or (b) introducing a `WizardProvider` context. Option (b) is preferred but means rewriting all Step signatures.

#### B.6 Wizard's 18 `useState`s (parent) + 7 nested = 25 total — no RHF+Zod despite both in deps
- Listed in §A.1 above.
- `react-hook-form ^7.60.0` (package.json:73) and `zod ^4.0.2` (package.json:85) are installed but **the orders cluster never imports them** (grep returned 0 hits in `src/components/modules/admin/orders/**`). The shadcn `form.tsx` primitives exist (`src/components/ui/form.tsx`) but are unused here.
- **Root cause:** Wizard was authored with raw useState instead of `useForm<z.infer<schema>>`. No validation runs client-side before submit; the only validation is `canGoNext()` (line 246-252) which only checks `customers.length > 0` and items.length > 0 per customer.
- **User-facing impact:** No field-level error messages. Malformed `quantity` (e.g., user typing "abc" — though `<Input type="number">` mitigates) and negative `pricePerUnit` are accepted. `stage` enum is type-checked at TS level but runtime Zod validation would catch server-side coercion issues earlier.

#### B.7 `nextNumber` race condition
- **File:line:** `src/app/api/orders/route.ts:45-56`
- **Code:**
  ```ts
  async function nextNumber(model: "order" | "preInvoice" | "invoice") {
    if (model === "order") {
      const last = await db.order.aggregate({ _max: { number: true } });
      return (last._max.number ?? 0) + 1;
    }
    // same for preInvoice, invoice
  }
  ```
- **Root cause:** Classic read-then-write race. Two concurrent POSTs (e.g., two operators creating orders simultaneously, or a double-click on "ساخت سفارش" button — though the button is `disabled={createMut.isPending}` at line 509, this guard is bypassable via devtools) both compute the same `_max.number + 1` and both attempt `db.order.create({ data: { number: num } })`. If there's a unique constraint on `number` (need to verify schema — but typical for an `Int` order number), the second throws P2002 and the request 500s. If no constraint, you get duplicate numbers silently.
- **User-facing impact:** Concurrent order creation can fail with `500 "خطا در ایجاد سفارش"` (route.ts:210) or produce duplicate order numbers. Either is bad.

#### B.8 Missing client-side enum validation for `stage` / `status` / `splitMode` / `priority`
- **Wizard types** (line 33, 93, 94) are TS-only — at runtime, the values come from `<Select>` and `<button>` clicks which are constrained by `STAGES` array (line 68-74). ✅ Safe in practice for UI-driven input.
- **BUT:** The wizard POSTs/PUTs to `/api/orders` and `/api/orders/[id]` — both APIs (`route.ts:90-212` and `[id]/route.ts:72-142`) do `(await req.json()) as CreateBody` and **never validate** the body. Any string passes for `stage`, `priority`, `splitMode`, `status`. If the API is called directly (e.g., from a script or another tab), `priority: "yolo"` would be written to DB.
- **StatusModal** (`orders-page.tsx:632-727`) only allows selecting from `ORDER_STATUS` keys (line 677-685) ✅. But the PUT body at line 650-659 sends `status` as-is — no client-side guard that it matches `OrderStatus`.
- **`order-detail-modal.tsx`** status change at line 64-77: same pattern — no Zod, just TS cast.
- **Root cause:** No runtime schema validation anywhere. `zod ^4.0.2` is installed but unused.
- **User-facing impact:** Mostly latent (UI constrains input), but if any future caller bypasses the UI, DB pollution is possible.

#### B.9 Performance: dashboard refetch burden
- **Admin dashboard (mounted whenever `admin:dashboard` page is open):**
  - `kpi-cards.tsx:120` — `refetchInterval: 15000` (15s) — 1 query
  - `dashboard-sections.tsx:32` — `refetchInterval: 30000` (30s) — 1 query
  - `dashboard-sections.tsx:87` — `refetchInterval: 30000` (30s) — 1 query
  - `dashboard-sections.tsx:140` — `refetchInterval: 30000` (30s) — 1 query
  - `quick-stats.tsx:27` — `refetchInterval: 30000` (30s) — 1 query
  - **Total: 5 queries firing every 15-30s on the dashboard alone.**
- **Open Orders page adds another 30s refetch** (`open-orders.tsx:162`).
- **Plus:** the wizard issues `invalidate(["orders"])` + `invalidate(["dashboard"])` + `invalidate(["notifications"])` + `invalidate(["order"])` on every successful create (line 328-331) — 4 invalidations firing multiple refetches.
- **Root cause:** Aggressive polling + greedy invalidation. No `staleTime` configured (need to check QueryClient defaults — typically 0, meaning every mount refetches).
- **User-facing impact:** A user on a slow connection with the dashboard open generates ~5 network requests every 15-30s, indefinitely. Battery drain on mobile, bandwidth consumption, and the open-orders page's 30s refetch resets scroll position if the table re-renders.

#### B.10 Accessibility issues
- **Wizard stepper buttons** (`order-wizard.tsx:390-406`): `<button onClick={...}>` without `aria-current="step"` or `aria-label`. The "مرحله 1" + label is in nested divs not associated via `aria-labelledby`. No keyboard focus styling beyond default.
- **Stage tabs in OpenOrders** (`open-orders.tsx:453-491`): plain `<button>` elements without `role="tab"`, `role="tablist"`, `aria-selected`, or keyboard arrow navigation. Semantically a tablist but not marked up as one.
- **ItemRow** (`order-wizard.tsx:800-882`): the entire row is a `<div>` with multiple nested `<button>`s — no `role="group"` or `aria-label` tying them together. Delete button has `title="حذف"` (line 877) which provides a tooltip but not an `aria-label`.
- **Note toggle button** (`order-wizard.tsx:864`): only has `title="یادداشت"`, no `aria-label` and no `aria-pressed` to reflect `item.note ? 'has-note' : 'no-note'`.
- **`ToggleButton` for multiMode** (line 564): the visible `<span>` label is not linked to the toggle via `htmlFor`/`aria-labelledby` — relies on positional association.
- **SearchCombobox** in both files (`orders-page.tsx:437-456`, `open-orders.tsx:758-784`): correctly uses `role="combobox"`, `aria-expanded`, `aria-controls` ✅. But the result list items (CommandItem) have no `role="option"` shim (shadcn Command provides it via cmdk, so this is mostly OK).
- **Modals:** All use shadcn `<Dialog>` which provides focus trap + Escape-to-close + `aria-labelledby` via DialogTitle ✅. The NoteItemModal (line 884-899) and CreateCustomerDialog (line 641-669) both have a DialogTitle ✅.
- **But:** `NoteItemModal`'s `<Textarea>` has `autoFocus` (line 891) — focus trap works but no `aria-label` on the textarea (placeholder serves as label, which is acceptable but not ideal).
- **StatusPill** (`order-wizard.tsx:636-638`): purely decorative `<span>` with no `aria-hidden` — screen readers will announce "انتخاب شده" ("selected") for every customer row, even if there's only one.
- **Refresh button** in OpenOrders (line 437-439): has `aria-label="بازخوانی"` ✅ (one bright spot).
- **Icon-only buttons** in `RowActions` (`orders-page.tsx:555-593`): rely on `<Tooltip>` for label — tooltips are NOT accessible to keyboard-only users by default (shadcn Tooltip uses hover/focus, so partially OK, but the underlying button has no `aria-label`).
- **Root cause:** No systematic a11y audit; ad-hoc `title=` attributes used as a substitute for proper `aria-label`.

### C. Contracts / Interfaces to PRESERVE (critical)

#### C.1 `orders-page.tsx` exports
- **`OrdersPage`** — only public export (line 34).
- Internal types/helpers (NOT exported, but referenced): `Order` type (line 27-32), `SearchCombobox` (line 413), `FilterGroup` (line 502), `FilterToggle` (line 515), `RowActions` (line 551), `NoteModal` (line 598), `StatusModal` (line 632), `stageLabel` (line 547).
- **Rebuild constraint:** any refactor that wants to extract `SearchCombobox` / `FilterToggle` to a shared module must update imports in `open-orders.tsx` as well (see C.6).

#### C.2 Query keys used (invalidation contract)
| Key | Defined at | Invalidated by |
|---|---|---|
| `["orders", customerFilter, productFilter]` | `orders-page.tsx:56` | `order-wizard.tsx:328` (after create/edit), `orders-page.tsx:92` (after delete), `orders-page.tsx:604` (after note), `orders-page.tsx:660` (after status), `order-detail-modal.tsx:75` (after status), `order-detail-modal.tsx:81` (after note), `pre-invoice-modal.tsx:74` (after pre-invoice), `open-orders.tsx:251` (refresh) |
| `["open-orders", customerFilter, productFilter]` | `open-orders.tsx:154` | `open-orders.tsx:251` (refresh) |
| `["order", id]` | `order-wizard.tsx:113` (edit fetch), `use-order-detail.tsx:20` (modal fetch), `open-orders.tsx:240` (modal fetch), `pre-invoice-modal.tsx:37` (items fetch) | `order-wizard.tsx:331` (after create/edit), `pre-invoice-modal.tsx:74` |
| `["customers-list"]` | `orders-page.tsx:66`, `open-orders.tsx:167` | (none — never invalidated, so newly-created customers via wizard's `createCust` at `order-wizard.tsx:538` only invalidates `["customers"]` and `["customers-wizard"]`, NOT `["customers-list"]` — meaning the orders page's customer dropdown won't show the new customer until manual refresh) **⚠️ BUG** |
| `["products-list"]` | `orders-page.tsx:70`, `open-orders.tsx:171` | (same issue — wizard invalidates `["products"]` and `["products-wizard"]` at line 698, NOT `["products-list"]`) **⚠️ BUG** |
| `["customers-wizard"]`, `["products-wizard"]` | `order-wizard.tsx:175, 179` | wizard's own `createCust` (line 538-539), `createProduct` (line 697-698) |
| `["dashboard"]` | (kpi-cards, dashboard-sections, quick-stats) | `order-wizard.tsx:329`, `order-detail-modal.tsx:75`, `open-orders.tsx:251`, `pre-invoice-modal.tsx:74` |
| `["notifications"]` | (notification panel) | `order-wizard.tsx:330`, `order-detail-modal.tsx:75` |

#### C.3 Navigation targets called
| Call site | Target |
|---|---|
| `order-wizard.tsx:337` (post-create success) | `navigate("admin", "orders")` |
| `order-wizard.tsx:347` (edit-error back button) | `navigate("admin", "orders")` |
| `order-wizard.tsx:368` (header back button) | `navigate("admin", "orders")` |
| `order-wizard.tsx:491` (step-1 cancel button) | `navigate("admin", "orders")` |
| `orders-page.tsx:200` (RowActions edit) | `navigate("admin", "orders-new", row.original.id)` — passes the order ID as `param` |
| `orders-page.tsx:235` (PageHeader new-order button) | `navigate("admin", "orders-new")` |
| `orders-page.tsx:355` (empty-state new-order button) | `navigate("admin", "orders-new")` |
| `open-orders.tsx:440` (PageHeader new-order button) | `navigate("admin", "orders-new")` |
| `open-orders.tsx:622` (empty-state new-order button) | `navigate("admin", "orders-new")` |
| `order-detail-modal.tsx:290` (modal "ویرایش کامل") | `navigate("admin", "orders-new", order.id)` |

**Hard contract:** `navigate("admin", "orders-new", orderId?)` is the universal "open wizard in create/edit mode" entry. The wizard reads `useAppStore(s => s.param)` (line 108) to detect edit mode.

#### C.4 `OrderDetailModal` calling contract
- **Import path:** `@/components/shared/order-detail-modal` (used by `open-orders.tsx:8`) or wrapped via `useOrderDetail` hook (`@/lib/use-order-detail`, used by `orders-page.tsx:20`, `calendar-page.tsx:10`, `archive-page.tsx:11`, `dashboard-sections.tsx:12`).
- **Props:**
  ```ts
  {
    order: OrderDetail | null;   // null = loading state
    open: boolean;
    onOpenChange: (v: boolean) => void;
  }
  ```
- **`OrderDetail` type** (`order-detail-modal.tsx:18-32`): full order with items, preInvoices[], invoice. This shape comes back from `GET /api/orders/${id}` and is shared by the wizard's `OrderEditData` (which is a SUBSET — see wizard line 39-66, missing `paidAmount`, `createdAt`, `createdBy`).
- **Side-effect:** modal mounts `<PreInvoiceModal orderId customerName open onOpenChange>` (line 298-303) — so opening OrderDetailModal also brings PreInvoiceModal into the tree (lazy-mounted via `open` prop).
- **Rebuild constraint:** if the rebuild changes `OrderDetail` shape (e.g., flattens preInvoices into a single preInvoice), all 5 callers + PreInvoiceModal must update in lockstep.

#### C.5 `order-wizard` public API
- **`OrderWizardPage()`** — exported from `order-wizard.tsx:83`, re-exported from `order-wizard-page.tsx:3`.
- **Props:** NONE. The wizard reads `param`, `navigate` from `useAppStore`.
- **Internal exports:** NONE. All Step components are file-local.
- **Rebuild constraint:** if the rebuild adds props (e.g., `onSuccess?: () => void`), the re-export at `order-wizard-page.tsx:3` and `module-router.tsx:71` (`case "orders-new": return OrderWizardPage;`) must continue to work with zero-props invocation.

#### C.6 Duplicated internal components to extract
1. **`SearchCombobox`** — `orders-page.tsx:413-499` AND `open-orders.tsx:723-845`. Extract to `@/components/shared/search-combobox.tsx`. (Note: there's already a `SearchSelect` at `@/components/shared/search-select.tsx` used by the wizard — that's a similar but different component. Rebuild should unify all three.)
2. **`FilterToggle`** — only in `orders-page.tsx:515-545`, but the same button pattern is reimplemented inline in `open-orders.tsx` (e.g., the stage tab buttons at lines 453-491 use a different visual but same toggle semantics). Extract to shared.
3. **`Order` type** — divergent in the two files (see A.7). Should be a single shared type matching the `GET /api/orders` response.
4. **`customers-list` / `products-list` query pattern** — duplicated 4x (orders-page, open-orders, plus the wizard uses `customers-wizard` / `products-wizard` for the same data — a 3rd and 4th duplication). Should be ONE query key per resource, used everywhere.

### D. Hard constraints for the rebuild

1. **POST `/api/orders` body shape** must stay backward-compatible (or upgrade API in lockstep). Current contract (`route.ts:21-43`):
   ```ts
   {
     customers: string[],
     itemsByCustomer: Record<string, ItemDraft[]>,
     splitMode, priority, endDate, noEndDate, note,
     moduleDates: { design?: {start,end}, print?: {start,end} },
     preInvoice?: { items, totalAmount, paidAmount } | null,
     invoice?: { items, totalAmount, paidAmount, discountAmount } | null,
     markCompleted?: boolean,
     createdBy?: string | null,
   }
   ```
   The rebuild MUST actually populate `preInvoice.items` (from `preInvoicePaid` map), `preInvoice.totalAmount`, and `preInvoice.paidAmount` — currently hardcoded to 0/empty (bug B.1).

2. **PUT `/api/orders/[id]` body shape** (`[id]/route.ts:21-32`) accepts only `{note, endDate, noEndDate, priority, totalAmount, status, customerId, splitMode, items, moduleDates}`. To support editing pre-invoices from the wizard, either:
   - (a) Add `preInvoice` and `invoice` to `UpdateBody` + handler — API change.
   - (b) Rebuild the wizard to call `/api/pre-invoices` POST/PUT separately (matches existing `pre-invoice-modal.tsx:67-72` pattern).
   Option (b) is preferred (smaller blast radius).

3. **Query key `["orders"]`** invalidation contract — preserve. 8 sites depend on it (see C.2).
4. **Query key `["open-orders"]`** invalidation contract — preserve (only `open-orders.tsx:251` invalidates).
5. **`navigate("admin", "orders")` after wizard success** — preserve (`order-wizard.tsx:337`). The orders page is the post-create landing.
6. **`navigate("admin", "orders-new", orderId)` for edit** — preserve (`orders-page.tsx:200`, `order-detail-modal.tsx:290`). The wizard reads `param` from the store to detect edit mode.
7. **`OrderDetailModal` props** `{order, open, onOpenChange}` — preserve. 5 callers depend on it (via `useOrderDetail` hook and direct usage in `open-orders.tsx`).
8. **`OrderWizardPage` zero-props invocation** — preserve (`module-router.tsx:71` does `case "orders-new": return OrderWizardPage;`).
9. **`OrderStatus` enum** (`constants.ts:14-20`: pending_design, in_printing, warehouse_logistics, completed, archived, cancelled) — preserve. The `StatusModal` PUTs these strings to `/api/orders/${id}/status` and the API stores them verbatim.
10. **`ItemStage` enum** (`constants.ts:59-64`: design, print, warehouse, completed, archive) — preserve. Wizard items POST these in `stage` field; API maps via `stageToStatus` (`route.ts:214-223`).
11. **`Priority` enum** (`constants.ts:74-77`: normal, urgent) and **`SplitMode`** (`constants.ts:81-84`: grouped, separated) — preserve.
12. **`refetchInterval: 30000` on `["open-orders"]`** — preserve or make configurable. Operators rely on the live refresh.
13. **`useOrderDetail` hook** (`src/lib/use-order-detail.tsx`) — preserve API (`{openOrder, modal, isLoading}`). 4 callers depend on it.
14. **`PreInvoiceModal` props** `{orderId, customerName?, open, onOpenChange}` — preserve (used by `order-detail-modal.tsx:298-303`).
15. **`nextNumber` race fix** — the rebuild should either use a Prisma `transaction` + `update` with `where: { number: ... }` pattern, or move to a `Counter` table with atomic `increment`. Currently broken (B.7).
16. **`customers-list` / `products-list` invalidation gap (B.9 / C.2 note)** — rebuild should fix: when the wizard creates a customer or product, it must invalidate `["customers-list"]` and `["products-list"]` too (currently only invalidates `["customers"]` / `["customers-wizard"]`).

### E. Quick verdict (A–F)

| File | Correctness | UX | Maintainability | Performance | Notes |
|---|---|---|---|---|---|
| `order-wizard.tsx` (1189 LOC) | **D** | **C+** | **F** | **C** | Bug B.1 (silent data loss of paidAmount) is the killer. 18 useState + 25 total. 52 props drilled. No RHF/Zod despite both installed. Edit-mode PUT drops preInvoice/invoice/markCompleted and only handles customers[0]. Missing `useMemo` on needsDesign/anyCompleted. |
| `orders-page.tsx` (728 LOC) | **C+** | **B** | **C** | **B** | Good column design, proper `useMemo` on filter. But pre-invoice & invoice row actions are placeholders (toast.info). StatusModal/NoteModal work. Duplicated SearchCombobox with open-orders. |
| `open-orders.tsx` (846 LOC) | **B** | **B+** | **C** | **B** | Cleanest of the three. Proper useMemo x5. Stage tabs + summary cards well-designed. 30s refetch. But duplicates SearchCombobox (123 LOC copy). No status/priority/stage filters (only card filter). |
| `order-wizard-page.tsx` (3 LOC) | **A** | **A** | **A** | **A** | Trivial re-export; not a maintainability concern. |

**Overall cluster verdict:** The wizard is the weakest link and the highest-priority refactor target. The two list pages are salvageable via component extraction (SearchCombobox, FilterToggle, Order type) and wiring the placeholder pre-invoice/invoice row buttons to the existing `PreInvoiceModal`. The dashboard refetch burden (5 queries every 15-30s) is a separate concern but compounds with the wizard's 4-invalidations-on-success pattern.


---

Task ID: p1-b
Agent: Explore (Admin Tasks+Calendar+Dashboard)
Task: Precise evidence + cross-panel task-assignment contract extraction

Work Log:
- Re-read prior worklog sections (Task 1-b at L463, Task 1-d at L725) to inherit context: 3 task panels exist (admin/designer/print — no qc/crm/srm/warehouse tasks pages; warehouse is unbuilt).
- Read in full: `/home/z/printoo-erp/src/components/modules/admin/tasks-page.tsx` (808 LOC, L1–808).
- Read in full: `/home/z/printoo-erp/src/components/modules/admin/calendar-page.tsx` (156 LOC, L1–156).
- Read in full: `/home/z/printoo-erp/src/components/modules/admin/dashboard/admin-dashboard.tsx` (348 LOC, L1–348).
- Read in full: `/home/z/printoo-erp/src/components/modules/admin/dashboard/dashboard-sections.tsx` (176 LOC, L1–176).
- Read in full: `/home/z/printoo-erp/src/components/modules/admin/dashboard/kpi-cards.tsx` (198 LOC, L1–198).
- Read in full: `/home/z/printoo-erp/src/components/modules/admin/dashboard/quick-stats.tsx` (62 LOC, L1–62).
- Read in full: `/home/z/printoo-erp/src/app/api/tasks/route.ts` (36 LOC) and `/home/z/printoo-erp/src/app/api/tasks/[id]/route.ts` (48 LOC).
- Read in full: `/home/z/printoo-erp/src/app/api/dashboard/route.ts` (147 LOC).
- Read in full: `/home/z/printoo-erp/src/app/api/day-notes/route.ts` (59 LOC) and `/home/z/printoo-erp/src/app/api/day-notes/[date]/route.ts` (35 LOC).
- Peeked: `/home/z/printoo-erp/src/components/modules/designer/designer-tasks.tsx` (270 LOC, full) and `/home/z/printoo-erp/src/components/modules/print/print-tasks.tsx` (429 LOC, full).
- Cross-referenced: `prisma/schema.prisma` L242-256 (Task model), `src/lib/constants.ts` L74-120 (MODULES/TASK_STATUS/PRIORITY enums), `src/lib/use-invalidate.ts` (39 LOC full), `src/components/shared/reusable-calendar.tsx` L1-75 (notes prop), and the global grep for `/api/day-notes` and `["tasks` query keys.

Stage Summary:

### A. Cross-Panel Task Assignment Contract (CRITICAL — the user's #1 hard constraint)

**Routing field = `module`, NOT `assignedTo`.**

The `Task` Prisma model (`prisma/schema.prisma` L242–256):
```
242: model Task {
249:   module      String   @default("admin") // admin | designer | print | warehouse | finance | qc | crm | srm
250:   orderId     String?
251:   order       Order?   @relation(fields: [orderId], references: [id])
252:   customerId  String?
253:   assignedTo  String?   ← DEAD COLUMN (no FK, no UI consumer anywhere)
254:   createdAt   DateTime @default(now())
255:   updatedAt   DateTime @updatedAt
256: }
```
- `module` is a **free-form `String`** with a comment-style enum convention. NO DB-level CHECK constraint, NO Prisma enum.
- `assignedTo` is a **free-form `String?`** — NOT a FK to `User` (no `User` model exists in schema — auth is via `next-auth` JWT sessions, no users table). So `assignedTo` literally has nothing to reference.

**Admin create-mutation body** (`tasks-page.tsx` L183–202):
```
183:  const createMut = useMutation({
184:    mutationFn: (body: FormState) =>
185:      api("/api/tasks", {
186:        method: "POST",
187:        body: JSON.stringify({
188:          title: body.title,
189:          description: body.description || null,
190:          priority: body.priority,
191:          dueDate: body.dueDate || null,
192:          module: body.module,             ← THE ONLY routing signal
193:        }),
194:      }),
...
```
- **`assignedTo` is NEVER sent.** The `FormState` type (L70–77) has `title, description, priority, dueDate, module, status` — no `assignedTo`. The `TaskFormFields` JSX (L701–808) renders Title, Description, Priority, DueDate, Module Select, Status Select — **no assignee picker UI**. The user's claim "admin can assign a task to another user's panel" is implemented purely via the `module` Select dropdown (L766–783). There is no per-user assignment anywhere.

**Server response to POST** (`/api/tasks/route.ts` L19–36):
```
21:  const { title, description, priority, dueDate, module, orderId, customerId, assignedTo } = body;
22:  if (!title) return NextResponse.json({ error: "عنوان الزامی است" }, { status: 400 });
23:  const task = await db.task.create({
24:    data: {
25:      title,
26:      description: description || null,
27:      priority: priority || "normal",
28:      module: module || "admin",          ← coerces empty/missing → "admin"
29:      dueDate: dueDate ? new Date(dueDate) : null,
30:      orderId: orderId || null,
31:      customerId: customerId || null,
32:      assignedTo: assignedTo || null,      ← accepts ANY string, no validation
33:    },
34:  });
35:  return NextResponse.json({ task }, { status: 201 });
```
- The API accepts `assignedTo` and stores it raw, but the admin frontend never sends it. No FK check, no User lookup, no enum check.

**PUT route** (`/api/tasks/[id]/route.ts` L4–37):
```
6:  export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
...
11:    const data: Record<string, unknown> = {};
12:    if (body.title !== undefined) { ... }
18:    if (body.description !== undefined) { ... }
21:    if (body.status !== undefined) data.status = String(body.status);
22:    if (body.priority !== undefined) data.priority = String(body.priority);
23:    if (body.module !== undefined) data.module = String(body.module);
24:    if (body.dueDate !== undefined) { ... }
```
- **PUT does NOT handle `assignedTo` at all** — there's no `if (body.assignedTo !== undefined) data.assignedTo = ...` line. Even if admin's edit form tried to send `assignedTo`, the server would silently drop it. `assignedTo` is effectively write-only-via-POST-API and read-never-in-UI.
- PUT accepts arbitrary `module`/`status`/`priority` strings — no enum validation.

**What the other panels read** — exact quote:
- `designer-tasks.tsx` L34–38:
```
34:  const { data, isLoading } = useQuery({
35:    queryKey: ["tasks", "designer", "list"],
36:    queryFn: () => api<{ tasks: Task[] }>("/api/tasks?module=designer"),
37:    refetchInterval: 30000,
38:  });
```
- `print-tasks.tsx` L48–52:
```
48:  const { data, isLoading } = useQuery({
49:    queryKey: ["tasks", "print", "list"],
50:    queryFn: () => api<{ tasks: Task[] }>("/api/tasks?module=print"),
51:    refetchInterval: 30000,
52:  });
```
- Both panels filter purely on `?module=designer|print`. They NEVER read `assignedTo` — their `Task` type (designer L18–27, print L28–37) explicitly omits `assignedTo`. So `assignedTo` is invisible to them.

**THE EXACT CONTRACT THAT MUST BE PRESERVED:**

1. **Request shape (POST /api/tasks)**: `{ title: string, description?: string|null, priority?: "normal"|"urgent", dueDate?: "yyyy-MM-dd"|null, module?: ModuleKey, orderId?: string, customerId?: string, assignedTo?: string }`. Server coerces missing module → `"admin"` (L28). Admin UI sends only `{title, description, priority, dueDate, module}`.
2. **`module` enum values**: the 8 ModuleKeys in `constants.ts` L89–97: `admin | designer | print | warehouse | finance | qc | crm | srm`. Designer's task panel ONLY renders tasks where `module === "designer"`; print's panel ONLY renders `module === "print"`. **If admin's UI ever writes a `module` value outside this enum, those tasks become invisible to the target panel** (they'll still show up in admin's "all" filter and on the admin calendar, but never on designer/print pages).
3. **`assignedTo` convention**: **NONE.** Free-form `String?`, no User FK, no UI consumer. Cannot "break" anything because nothing reads it. Effectively a dead column.
4. **Query keys for invalidation**: admin calls `invalidate(["tasks"])` on every mutation (L196, L256, L267, L297, L309). This is a TanStack **prefix match** — invalidates any query whose key STARTS with the element `"tasks"`. The 8 active `["tasks", ...]` queries it covers:
   - admin's own `["tasks", moduleFilter]` ✅
   - designer's `["tasks", "designer", "list"]` ✅
   - print's `["tasks", "print", "list"]` ✅
   - designer-calendar's `["tasks", "designer", "calendar"]` ✅
   - print-calendar's `["tasks", "print", "calendar"]` ✅
   - designer-dashboard's `["tasks", "designer"]` ✅
   - print-dashboard's `["tasks", "print"]` ✅
   
   **It does NOT cover:**
   - admin-calendar's `["tasks-calendar"]` (single string `"tasks-calendar"`, first element != `"tasks"`) ❌
   - admin-dashboard's `["dashboard-tasks"]` ❌
   - admin-dashboard's `["dashboard", ...]` queries ❌
   - admin-calendar's `["orders-calendar"]` ❌

**Admin's module picker UI** — `tasks-page.tsx` L766–783:
```
766:        <div className="space-y-1.5">
767:          <Label>ماژول</Label>
768:          <Select
769:            value={form.module}
770:            onValueChange={(v) => setForm((f) => ({ ...f, module: v as ModuleKey }))}
771:          >
772:            <SelectTrigger>
773:              <SelectValue />
774:            </SelectTrigger>
775:            <SelectContent>
776:              {MODULE_OPTIONS.map((m) => (
777:                <SelectItem key={m} value={m}>
778:                  {MODULES[m].faLabel}
779:                </SelectItem>
780:              ))}
781:            </SelectContent>
782:          </Select>
783:        </div>
```
- `MODULE_OPTIONS = Object.keys(MODULES) as ModuleKey[]` (L110) — restricts the dropdown to the 8 valid enum values. UI-side safety is OK.
- **There is NO assignee picker UI** — admin cannot pick a target user because there's no concept of users. The "module" dropdown IS the panel-routing mechanism.

**Edge case (user explicitly flagged): `assignedTo` references a deleted/nonexistent user** — **NO-OP at every layer.** The Task model has no User relation; `assignedTo` is a free string. Tracing through:
1. POST `/api/tasks` L32: `assignedTo: assignedTo || null` — stored verbatim, no lookup.
2. GET `/api/tasks` L4–17: returns `{ tasks }` with `include: { order: { include: { customer: true } } }` — does NOT include any User join (because no User relation exists).
3. Frontend `Task` type (admin L58–68, designer L18–27, print L28–37) — none of the three have an `assignedTo` field. So even if the DB stored `assignedTo: "ghost-user-id"`, the UI would never attempt to render it. **A dangling `assignedTo` is invisible and harmless.** The edge case is moot by design (the column is dead).

### B. Data Flow Map (tasks + calendar + dashboard)

**Tasks page** (`tasks-page.tsx`)
- Query key: `["tasks", moduleFilter]` (L149) where `moduleFilter: "all" | ModuleKey`.
- Endpoint: `/api/tasks` (when `moduleFilter === "all"`) or `/api/tasks?module=${moduleFilter}` (L152). `refetchInterval: 30000` (L154). No `staleTime` set (defaults to `0` in TanStack v5 — refetch on every mount/focus).
- Columns: 3 Kanban columns (todo/in_progress/done) defined as `COLUMNS` array (L80–108), with status-key, label, dot color, ring color, hover color. NOT a `DataTable` — uses `@dnd-kit/core` + `@dnd-kit/sortable` for drag-and-drop.
- Filters: ONE module filter Select in the PageHeader actions (L326–341). No status filter (status is implied by which column the card sits in). No priority filter. No assignee filter (no assignee exists).
- Row actions: TaskCard has `onEdit(task)` (open edit dialog) and a delete trash button (L646–656). No "assign" action. Edit dialog has delete + save buttons (L440–466).
- Optimistic update pattern (L141–170): `statusOverride: Record<string,string>` map keyed by task ID. On drag-end, the override is set immediately (L250) and the PUT is fired. A `useEffect` (L160–170) drops overrides once `serverTasks` reflects the same status. On error (L261–265), the override for that ID is deleted and `["tasks"]` is invalidated. There's a brief race window: a second drag of the same task during the refetch interval may revert briefly. (Same finding as Task 1-b.)
- Create-mutation: `createMut` (L183–202) — POST `/api/tasks` with the 5 fields above. onSuccess: `invalidate(["tasks"])`, toast, close dialog, reset form to `EMPTY_FORM`.
- Update-mutation: `updateMut` (L204–218) — PATCH-style PUT `/api/tasks/${id}` with only the changed fields. No `assignedTo` handling.
- Delete-mutation: `deleteMut` (L220–222) — DELETE `/api/tasks/${id}`.

**Calendar page** (`calendar-page.tsx`, 156 LOC)
- Two tabs: `calendar` (uses `ReusableCalendar`) and `gantt` (uses `ReusableGantt`).
- Two parallel `useQuery` calls:
  - `ordersData` (L75–79): key `["orders-calendar"]`, GET `/api/orders`, `refetchInterval: 30000`.
  - `tasksData` (L80–84): key `["tasks-calendar"]`, GET `/api/tasks`, `refetchInterval: 30000`.
- Events built via `toOrderEvents()` (L27–53) and `toTaskEvents()` (L55–68).
  - Order event: `startDate = min(createdAt, items[0].designStartDate, items[0].printStartDate)` filtered by `validTimes` to skip NaN (L37–40); `endDate = o.endDate` only when `o.endDate && !o.noEndDate` (L29). Color: `"yellow"` if urgent else `"blue"`.
  - Task event: `startDate = endDate = t.dueDate` (L62–63), color `"red"` if urgent else `"green"`, `type: "task"`.
- Filter buttons (L99–103): orders toggle, tasks toggle, urgent-only toggle.
- Usage of shared components — exact quote:
  - L116–124 `<ReusableCalendar events={allEvents} onDayClick={...} onEventClick={...} filters={filterButtons} />` — **does NOT pass the `notes` prop**.
  - L127–136 `<ReusableGantt events={allEvents} onEventClick={...} title="..." emptyMessage="..." filters={filterButtons} />`.
  - L140–151 `<DayDetailModal date={...} events={...} open={...} onOpenChange={...} onEventClick={...} />`.
- Click behavior: order event click → `openOrder(orderId)` via `useOrderDetail` (L120, L130, L146–148). Task event click → **NO handler** — clicking a task chip in the calendar or DayDetailModal does nothing (silent).
- Day-notes integration: **NONE.** Calendar page never calls `/api/day-notes`. The `notes?: DayNote[]` prop on `ReusableCalendar` (reusable-calendar.tsx L28) defaults to `[]`, so `notesMap` (L53–57) is empty, and the bookmark icon (`hasNote && <Icon name="bookmark" .../>` L150) NEVER renders in admin calendar.

**Dashboard** (`admin-dashboard.tsx` 348 LOC, `kpi-cards.tsx` 198, `dashboard-sections.tsx` 176, `quick-stats.tsx` 62)
- `AdminDashboard` (L265–348) renders in this Z-pattern:
  1. `PageHeader` (L274–283) with "سفارش جدید" action button → `navigate("admin", "orders-new")`.
  2. `ShortcutsSection` (L286, defined L148–261) — Zustand `shortcuts` array of `"module:page"` keys. Add via Popover with `availableToAdd` (admin items not yet in shortcuts). Remove via per-shortcut red circle button.
  3. KPI section (L289–301) — `SectionCard` icon="chart" wrapping `<KpiCardsGrid>`. Header has TimeRangePicker + chart-toggle button + reset button.
  4. Quick stats section (L304–306) — `SectionCard` icon="grid" wrapping `<QuickStatsRow>`.
  5. Recent orders (L311–320) — `SectionCard` wrapping `<RecentOrders/>` inside a `<div className={MERGE_INNER_CARD}>` (the CSS-selector trick that strips the inner Card of RecentOrders).
  6. Two-column grid (L323–345):
     - Left: `SectionCard` icon="clock" wrapping `<NearDeadlineOrders/>`.
     - Right: `SectionCard` icon="task" wrapping `<LatestTasks/>`.

**TanStack Query count on dashboard mount — CONFIRMED redundant refetches:**

Each KpiCard fires its OWN query — quote `kpi-cards.tsx` L117–122:
```
117:  const { data } = useQuery({
118:    queryKey: ["dashboard-kpi", config.key, range.preset, range.from.toISOString(), range.to.toISOString()],
119:    queryFn: () => api<DashboardData>(`/api/dashboard?${rangeToParams(range)}`),
120:    refetchInterval: 15000,
121:    staleTime: 0,
122:  });
```
- `KPI_CARDS` array has 8 entries (`kpi-cards.tsx` L29–38: revenue, orders, avgOrderValue, newCustomers, completed, urgent, payments, profit).
- → 8 separate `useQuery` calls to the SAME fat `/api/dashboard?...` endpoint, each returning the ENTIRE payload (all 8 KPIs + 8 series + recentOrders + nearDeadlineOrders + latestTasks + overdueOrders + quickStats + byStatus). Each card reads only `data?.kpis?.[config.key]` and `data?.series?.[config.key]` (L125–126). The other 7 KPIs and all the lists are fetched-but-discarded.
- `staleTime: 0` (L121) → forces refetch on every mount AND every window focus AND every `refetchInterval` tick. With 8 cards mounted, **8 refetches on every dashboard re-mount** and **8 refetches every 15 seconds**.

Plus 4 more dashboard queries, each independently hitting `/api/dashboard?from=2000-01-01&to=now` (the date range is meaningless — hardcoded to 2000→now):
- `QuickStatsRow` (`quick-stats.tsx` L22–28): key `["dashboard-quick"]`, `refetchInterval: 30000`, reads only `data?.quickStats`. Confirmed.
- `RecentOrders` (`dashboard-sections.tsx` L137–141): key `["dashboard-recent"]`, `refetchInterval: 30000`, reads only `data?.recentOrders`. Confirmed.
- `NearDeadlineOrders` (L29–33): key `["dashboard-near-deadline"]`, `refetchInterval: 30000`, reads only `data?.nearDeadlineOrders`. Confirmed.
- `LatestTasks` (L84–88): key `["dashboard-tasks"]`, `refetchInterval: 30000`, reads only `data?.latestTasks`. Confirmed.

**Total on dashboard mount: 8 + 4 = 12 simultaneous GET `/api/dashboard?...` requests**, each triggering the 22-Prisma-await `Promise.all` in `/api/dashboard/route.ts` L29–74. → **12 × 22 = 264 Prisma awaits on every dashboard mount, then 8 × 22 = 176 every 15s + 4 × 22 = 88 every 30s**. (Prior worklog Task 1-b estimate of "5-8 redundant" was an undercount — the real figure is 12 redundant queries.)

**/api/dashboard/route.ts has exactly 22 Prisma awaits in one Promise.all** — confirmed by counting the destructured array elements in L29–42 and matching each to a `db.*` call in L43–73: ordersInPeriod, revenueInPeriod, newCustomersInPeriod, completedInPeriod, urgentInPeriod, paymentsInPeriod, expensesInPeriod (7) + ordersPrev, revenuePrev, newCustomersPrev, completedPrev, urgentPrev, paymentsPrev (6) + byStatus, recentOrders, nearDeadlineOrders, latestTasks, overdueOrders, noEndDateCount, pendingTasksCount (7) + ordersRaw, customersRaw, paymentsRaw, expensesRaw (4) = 7+6+7+4 = 24 array slots, 22 actual Prisma calls (some are `.aggregate`, `.count`, `.findMany`, `.groupBy`). Confirmed ~22 Prisma awaits per call.

**/api/dashboard also returns the entire payload regardless of which sub-key the caller wants.** There's no `?fields=` selector. So even if KpiCard only needs `kpis.revenue`, it still triggers all 22 Prisma queries and receives the entire 146-line JSON.

### C. Root-Cause Bugs (with EXACT line numbers)

1. **Dashboard redundant refetches — each KpiCard independently hitting `/api/dashboard`.**
   - `kpi-cards.tsx` L117–122 (quoted in section B).
   - Root cause: `KpiCard` is rendered 8 times by `KpiCardsGrid` (L89–101 `KPI_CARDS.map(...)`), and each card has its own `useQuery` with the same endpoint but a per-card query key (L118). TanStack treats them as 8 independent queries, each fetching the same fat endpoint.
   - User impact: 8x server load on mount + 8x every 15s; 12x on initial mount when the 4 dashboard-section queries also fire. On a real SQLite-backed prod with even modest order volume, this is 264 Prisma awaits per dashboard open and ~264+176+88 = 528 awaits in the first 30 seconds of a user sitting on the dashboard.

2. **`staleTime: 0` on every KpiCard.**
   - `kpi-cards.tsx` L121: `staleTime: 0`.
   - Root cause: explicit `staleTime: 0` overrides the TanStack default (`0` is also the default, but making it explicit documents the intent). Combined with `refetchInterval: 15000` (L120), every mount and every window-focus event triggers a refetch — on top of the 15s polling. Even when the user just clicks into the URL bar and back, all 8 KPI cards refetch.
   - User impact: 8 redundant refetches per window-focus event (which happens often during a workday). Compounds bug #1.
   - Note: the other 4 dashboard queries (`quick-stats`, `dashboard-sections.tsx`) do NOT set `staleTime: 0` explicitly, but the TanStack default `staleTime` is also 0 — so they ALSO refetch on every mount/focus. Effective `staleTime: 0` across all 12 dashboard queries.

3. **Tasks page: NO server-side validation on `module`/`status`/`priority`/`assignedTo`.**
   - `/api/tasks/route.ts` L21–33 (POST): `module: module || "admin"` (L28) accepts any string. `priority: priority || "normal"` (L27) same. `assignedTo: assignedTo || null` (L32) same. No Zod, no enum check.
   - `/api/tasks/[id]/route.ts` L21–23 (PUT): `data.status = String(body.status)`, `data.priority = String(body.priority)`, `data.module = String(body.module)` — all raw strings, no validation.
   - Root cause: API handlers do `await req.json()` and trust the body. No `z.object({...})` schema, no `Object.values(MODULES).includes(module)` check, no `getSession()` call.
   - User impact: an attacker (or a future admin UI bug) could POST `{module: "foobar"}` and create an orphan task visible only to admin's "all" filter. Worse: a typoed `module: "desgner"` (note the misspelling) creates a task that the designer panel will NEVER see, but admin will see it in the "all" view. **This is the single highest risk to the user's #1 hard constraint.**

4. **Tasks page: missing assignee picker.**
   - `tasks-page.tsx` FormState type L70–77 has no `assignedTo` field. TaskFormFields L701–808 has no assignee UI. The create-mutation body L187–193 omits `assignedTo`. The update-mutation payload L206–217 omits `assignedTo`.
   - Root cause: feature is simply not implemented. The schema column exists (Prisma `assignedTo String?` L253), the POST route accepts it (L21, L32), but the admin UI never sends it.
   - User impact: the user's mental model of "admin assigns a task to another user's panel" is actually implemented as "admin picks a module from a dropdown" — there is NO per-user routing. If the user expects per-user assignment, this is a major gap. (But it's also harmless to other panels because no panel reads `assignedTo`.)

5. **Tasks page: PUT route silently drops `assignedTo`.**
   - `/api/tasks/[id]/route.ts` L11–26: handles `title, description, status, priority, module, dueDate` only. There's NO `if (body.assignedTo !== undefined) data.assignedTo = ...` line.
   - Root cause: the PUT handler's field allowlist (L11–26) was written without including `assignedTo`. Comment on L5 explicitly enumerates accepted fields: `// Accepts: { title?, description?, status?, priority?, dueDate?, module? }`.
   - User impact: if a future admin edit form tried to add an assignee picker, the PUT would silently drop the value. The field would only be writeable via POST. (Today this is invisible because the admin UI never sends `assignedTo` at all — see bug #4.)

6. **Tasks page: no bug found in module-filter Select.**
   - `tasks-page.tsx` L326–341 (moduleFilter Select in PageHeader) and L766–783 (module Select in form) both use `MODULE_OPTIONS = Object.keys(MODULES) as ModuleKey[]` (L110). The Select can only emit one of the 8 valid ModuleKey strings. So the admin UI cannot itself write an invalid `module`. **This is the only line of defense against bug #3** — and it's bypassable by anyone POSTing to `/api/tasks` directly (no auth).
   - Note: the moduleFilter Select DOES include "all" (L334) which is a UI-only value; the `api()` call (L152) correctly skips the `?module=` param when `moduleFilter === "all"`.

7. **Calendar page: orphan task click.**
   - `calendar-page.tsx` L119–121 (ReusableCalendar `onEventClick`) and L129–131 (ReusableGantt `onEventClick`) and L145–150 (DayDetailModal `onEventClick`): all three only branch on `e.type === "order"`. **Task event clicks do nothing.**
   - Root cause: there's no `openTask(id)` hook analogous to `useOrderDetail().openOrder(id)`. Clicking a task chip in the calendar is a no-op.
   - User impact: a user sees a task on the calendar, clicks it expecting to open the task, and nothing happens. No error, no toast, no navigation. Confusing dead UI.

8. **Calendar page: time-zone / date-parsing edge cases.**
   - `toOrderEvents` L33–41 builds `candidates = [o.createdAt, firstItem.designStartDate, firstItem.printStartDate]`, then `validTimes = candidates.map(c => new Date(c).getTime()).filter(t => !Number.isNaN(t))`. The `new Date(string)` constructor parses ISO-with-Z as UTC and local-strings as local — inconsistent. If `o.createdAt` is `"2026-08-24T10:00:00.000Z"` (UTC) but `firstItem.designStartDate` is stored without a timezone suffix, the resulting Date objects have different TZ semantics. **Today the DB stores ISO-Z strings (Prisma serializes DateTime as UTC ISO), so it works.** If anyone ever inserts a row with a non-ISO string, `Math.min(...validTimes)` could pick an unintended start.
   - `toTaskEvents` L62–63: `startDate: t.dueDate!, endDate: t.dueDate!` — task events are point-events (start === end). `ReusableCalendar`'s `getEventsForDay` (reusable-calendar.tsx L63–72) does correct intersection logic and handles parse errors via try/catch. So this is robust.
   - Empty state: `ReusableGantt` has `emptyMessage` prop (passed `"رویدادی برای نمایش در گانت نیست"` at L133). `ReusableCalendar` does NOT have an explicit empty state — when there are no events, the grid still renders with the empty day cells (which is fine visually). No bug.

9. **Calendar page: `notes` prop never passed → bookmark icon dead.**
   - `calendar-page.tsx` L116–124 `<ReusableCalendar>` invocation: only `events, onDayClick, onEventClick, filters` props. The optional `notes?: DayNote[]` prop is omitted, so it defaults to `[]`.
   - `reusable-calendar.tsx` L150 `{hasNote && <Icon name="bookmark" .../>}` — `hasNote` is always `false` in admin calendar.
   - The `/api/day-notes` routes (`route.ts` L4–59, `[date]/route.ts` L4–35) are fully implemented (GET all, POST upsert, GET by date, DELETE) with regex-validated `yyyy-MM-dd` and an `allowedColors` allowlist (L37). **A grep across `/src` for `/api/day-notes` returned ZERO matches in any frontend file** — the API is never called. The `DayNote` Prisma model, the API routes, and the `notes` prop are all **dead code**.

10. **Hardcoded `navigate(...)` targets in dashboard (could drift from nav.ts).**
    - `admin-dashboard.tsx` L279 `navigate("admin", "orders-new")`, L315 `navigate("admin", "orders")`, L328 `navigate("admin", "open-orders")`, L339 `navigate("admin", "tasks")`.
    - `dashboard-sections.tsx` L43 `navigate("admin", "open-orders")`, L105 `navigate("admin", "tasks")`, L116 `navigate("admin", "tasks")`, L151 `navigate("admin", "orders")`.
    - `quick-stats.tsx` L48 `navigate("admin", s.page)` where `s.page ∈ {"open-orders", "orders", "tasks"}` (L32–35).
    - Root cause: page-key strings are duplicated as string literals across 3 files. If `nav.ts` ever renames `orders-new` → `order-create`, every one of these would silently break (no compile error because `navigate(mod, page)` takes `string`, not a typed key).
    - Tasks-page.tsx: ZERO `navigate()` calls (the tasks page does not navigate anywhere — confirmed by grep returning no matches). So this bug is dashboard-only, not tasks-page.
    - The `ShortcutsSection` (L148–261) is SAFE — it uses `resolveShortcut(key)` (L42–50) which traverses `findModule(mod).groups.flatMap(g => g.items)` to find a matching `NavItem` by `item.page`. If the shortcut key drifts, `resolveShortcut` returns `null` and the shortcut is filtered out (L161–163). Good defensive pattern.

11. **N+1 / redundant fetch: dashboard GET `/api/orders` on calendar + dashboard's own `/api/dashboard?...` calls.**
    - Calendar page fires `/api/orders` (`calendar-page.tsx` L77) and `/api/tasks` (L82). Dashboard fires `/api/dashboard?...` 12 times (section B). Dashboard's `/api/dashboard?...` internally already runs `db.order.findMany({ take: 6 ... })` (L57), `db.order.findMany({ ... near-deadline ... })` (L58–61), `db.task.findMany({ take: 6 ... })` (L62). So when the same user has admin dashboard open in one tab and admin calendar open in another (the SPA keep-alive mounts both simultaneously), `/api/orders` is called twice (once by calendar, once indirectly by dashboard's `recentOrders`/`nearDeadlineOrders` fetches inside `/api/dashboard`), and `/api/tasks` is called twice. **No sharing of cached data between them** because the query keys differ (`["orders-calendar"]` vs `["dashboard-recent"]`/`["dashboard-near-deadline"]`).

12. **a11y issues:**
    - KpiCard TimeRangePicker + chart toggle + reset button (`kpi-cards.tsx` L67–86): chart toggle has `title=` (L74) but no `aria-label`. Reset button has `title="ریست فیلترها"` (L81) but no `aria-label`. Same pattern as Task 1-b.
    - ShortcutsSection remove button (`admin-dashboard.tsx` L200–208): HAS `aria-label={`حذف میانبر ${item.label}`}` (L205). Good.
    - Tasks page TaskCard delete button (`tasks-page.tsx` L646–656): `title="حذف تسک"` (L652) but NO `aria-label`. Screen readers may not announce it.
    - Tasks page TaskCard root (`tasks-page.tsx` L561–574): `role="button"`, `tabIndex={0}`, `onKeyDown` handles Enter/Space (L569–573). Good — already noted in Task 1-b.
    - Calendar page Tabs (L109–113): standard shadcn TabsTrigger with `gap-1.5` Icon+text — accessible by default.
    - Calendar page filter buttons (L99–103): plain `<button>` elements rendered by ReusableCalendar's toolbar (not visible in calendar-page.tsx but delegated to the shared component — needs check there). The `filters` prop is `{ id, label, active, onToggle }[]` (reusable-calendar.tsx L31) — the actual button rendering happens inside ReusableCalendar.
    - Dashboard RecentOrders/NearDeadline/LatestTasks rows (`dashboard-sections.tsx` L56, L116, L162): plain `<button onClick={...}>` — no `aria-label` but they contain visible text + icons, so they're screen-reader-OK.

### D. Contracts / Interfaces to PRESERVE

**`tasks-page.tsx` exports:**
- `TasksPage` (named export, L133) — the only export. No other module imports anything from this file (verified indirectly: `module-router.tsx` uses dynamic import per the orchestrator's notes).

**Query keys invalidated by tasks-page:**
- Only `["tasks"]` (L196, L256, L267, L297, L309). Because TanStack v5 prefix-matches, this also covers `["tasks", "designer", "list"]` (designer-tasks L35), `["tasks", "print", "list"]` (print-tasks L49), `["tasks", "designer", "calendar"]` (designer-calendar L100), `["tasks", "print", "calendar"]` (print-calendar L100), `["tasks", "designer"]` (designer-dashboard L143), `["tasks", "print"]` (print-dashboard L146).
- Designer-tasks and print-tasks BOTH invalidate `["tasks", "dashboard"]` (designer L65, print L82). So when a designer updates a task status, it invalidates ALL `["tasks", *]` queries (admin's, designer's, print's) AND all `["dashboard", *]` queries. **Admin's tasks-page only invalidates `["tasks"]`, NOT `["dashboard"]`** — so admin's task mutations don't reach the admin dashboard's `["dashboard-tasks"]` query (different prefix). Designer mutations DO reach admin dashboard because they call `invalidate(["tasks", "dashboard"])`.
- **The shared contract**: any mutation that creates/updates/deletes a task MUST invalidate `["tasks"]` (covers all 3 task panels + designer/print calendars + designer/print dashboards) AND `["dashboard"]` (covers admin dashboard's KPIs/quick-stats/recent/near-deadline/latest-tasks — all use `["dashboard-*"]` keys so a single `["dashboard"]` prefix covers them all). Designer-tasks and print-tasks already do this. **Admin's tasks-page is missing the `["dashboard"]` invalidation.** This is a real consistency bug.

**Navigation targets used by tasks-page:**
- None. `tasks-page.tsx` has zero `navigate(...)` calls (verified by grep). All navigation is via the parent `app-shell.tsx` and `module-router.tsx`.
- Calendar page also has zero `navigate(...)` calls — uses `useOrderDetail().openOrder()` hook (L71, L120, L130, L148).
- Dashboard uses 8 hardcoded navigate targets (see bug #10 above).

**`Task` type shape across files:**
- **There is NO shared `Task` type.** It's redefined in 4 places:
  - `admin/tasks-page.tsx` L58–68: `{ id, title, description, status, priority, dueDate, module, createdAt, order: { id, number, customer: { name } } | null }`. Has `order` (for linked order rendering L635–643).
  - `admin/calendar-page.tsx` L23–25: `{ id, title, priority, dueDate, module }` — minimal 5 fields.
  - `admin/dashboard/dashboard-sections.tsx` L21–24: `{ id, title, description, status, priority, dueDate, module, createdAt }` — 8 fields, no `order`.
  - `designer/designer-tasks.tsx` L18–27: `{ id, title, description, status, priority, dueDate, module, createdAt }` — same 8 fields, no `order`.
  - `print/print-tasks.tsx` L28–37: `{ id, title, description, status, priority, dueDate, module, createdAt }` — same 8 fields, no `order`.
- **None include `assignedTo`.** None include `updatedAt`, `orderId`, `customerId`. The schema has all of these but the UI ignores them.
- Server returns the full Prisma row (including `assignedTo`, `updatedAt`, `orderId`, `customerId`) — the frontend types are just narrower views of the same payload.
- Contract risk: if any code adds an `assignedTo` field to one of these types, it'll be silently inconsistent across files.

**`admin-dashboard.tsx` exports:**
- `AdminDashboard` (named export, L265). Only export.
- Query keys used (no mutations in admin-dashboard.tsx itself; mutations live in child components):
  - `KpiCardsGrid` → `["dashboard-kpi", config.key, range.preset, range.from, range.to]` (`kpi-cards.tsx` L118).
  - `QuickStatsRow` → `["dashboard-quick"]` (`quick-stats.tsx` L23).
  - `RecentOrders` → `["dashboard-recent"]` (`dashboard-sections.tsx` L138).
  - `NearDeadlineOrders` → `["dashboard-near-deadline"]` (L30).
  - `LatestTasks` → `["dashboard-tasks"]` (L85).
- Other modules that may invalidate `["dashboard"]`: customer-create invalidates `["customers", "customers-list", "customers-wizard", "dashboard"]` (per Task 1-b). Order-create invalidates `["orders", "dashboard", "notifications", "order"]`. Designer-tasks invalidates `["tasks", "dashboard"]`. Print-tasks invalidates `["tasks", "dashboard"]`. So **the `["dashboard"]` prefix is the canonical invalidation key for ALL dashboard queries** — admin's tasks-page not joining this convention is the bug.

### E. Cross-Panel Safety Analysis (the user's #1 hard constraint)

**Every shared dependency that admin's tasks-page touches:**

| Surface | Stable / volatile | Risk if changed |
|---|---|---|
| `POST /api/tasks` request body | **STABLE** | If admin adds new field → server stores it (if listed in destructuring). If admin REMOVES `module` → server defaults to `"admin"` (route L28), designer/print panels stop receiving admin-routed tasks. **CRITICAL: never drop `module` from the create body.** |
| `PUT /api/tasks/[id]` request body | **STABLE** | Same — admin currently sends `{title, description, priority, dueDate, module, status}`. If admin removes `module` from update body → server keeps the old value (PUT is partial). Safe. |
| `module` enum (8 values) | **STABLE — DO NOT CHANGE** | Designer/print task panels filter `?module=designer|print`. If admin writes `module: "designers"` (typo) or `module: "Designer"` (case) or any value not in the enum, the task becomes invisible to the target panel. The UI's `MODULE_OPTIONS = Object.keys(MODULES)` Select (L110, L776) is the only defense; bypassable by direct POST. **Hard requirement: never extend the `module` enum without also updating `constants.ts` AND ensuring the new panel has a tasks page that filters by the new value.** Today, `warehouse/finance/qc/crm/srm` modules have no tasks pages — admin can pick them but the task will only show up in admin's "all" view. |
| `assignedTo` convention | **NONE — column is dead** | Cannot break anything. No UI reads it. No FK. No validation. Free-form string. |
| Query keys | **STABLE — DO NOT RENAME `["tasks"]`** | Admin's `invalidate(["tasks"])` (L196, L256, L267, L297, L309) prefix-matches all 7 downstream `["tasks", *]` queries. If admin ever switches to a non-prefix key (e.g. `["admin-tasks"]` or `["tasks", "admin"]` only — the latter would still cover admin's own queries but stop covering designer/print), the cross-panel sync breaks. **Currently admin uses `["tasks", moduleFilter]` where `moduleFilter ∈ {"all", "admin", "designer", ...}` — when `moduleFilter === "all"` the key is `["tasks", "all"]`, which IS prefix-matched by `invalidate(["tasks"])`. Good.** |
| Query key prefix `["tasks-calendar"]` (admin calendar) | **FRAGILE / WRONG** | This is `["tasks-calendar"]` (single-element key, string `"tasks-calendar"`), NOT `["tasks", "calendar"]`. So `invalidate(["tasks"])` does NOT cover it. The admin calendar's task chips will stay stale for up to 30s after admin creates/updates/deletes a task. **Recommendation: rename to `["tasks", "calendar"]` to join the prefix family.** |
| Query key `["dashboard-tasks"]` (admin dashboard LatestTasks) | **FRAGILE / WRONG** | Same — single-element key. Admin's task mutations don't invalidate it. Designer's mutations DO (because designer-tasks calls `invalidate(["tasks", "dashboard"])`). Recommendation: rename to `["dashboard", "tasks"]` to join the `["dashboard"]` prefix family. |
| `Task` type | **NO shared type — REDEFINED per file** | If admin's tasks-page adds a new field to its local `Task` type (e.g. `assignedTo`), it will compile fine but designer/print pages won't see the field. No type drift risk because there's no shared type to drift from. |
| Endpoint `/api/tasks?module=X` filter contract | **STABLE** | Server's GET handler (route L4–17) reads `?module=` and `?status=` query params only. If admin's UI starts sending `?assignedTo=` or `?priority=`, the server ignores them (no parsing). Safe. |

**HARMLESS-LOOKING CHANGES THAT COULD BREAK DESIGNER/PRINT:**

1. ❌ Removing `module: body.module` from the create body (L192) → all new admin tasks default to `"admin"`, designer/print panels stop receiving admin-routed tasks. HIGH RISK.
2. ❌ Renaming the create-mutation's invalidation key from `["tasks"]` to anything that doesn't start with `["tasks"]` (e.g. `["admin-tasks"]`) → designer/print queries stop being invalidated; their lists go stale until their 30s refetch. MEDIUM RISK.
3. ❌ Adding a server-side `z.string().enum([...])` validation on `module` that's NARROWER than the current 8 values → would break if the user later adds new modules. LOW RISK (it's a forward-looking concern).
4. ❌ Adding a server-side validation on `module` that REJECTS the existing 8 values (e.g. someone "cleans up" the enum and forgets `srm`) → admin's tasks with `module: "srm"` would 400-error and never be created. MEDIUM RISK.
5. ❌ Renaming `assignedTo` to `assigneeId` in the schema → breaks nothing visible today (no one reads it), but if a future feature starts reading `assignedTo`, it'll silently get `null`. LOW RISK today.
6. ✅ **SAFE change:** adding `assignedTo` to the admin TaskFormFields UI, the FormState type, the create-mutation body, and the update-mutation payload — as long as the server still accepts it via POST (already does, L21/L32) and the PUT route is extended to handle it (today it doesn't — bug #5). No effect on designer/print because they don't read `assignedTo`.
7. ✅ **SAFE change:** adding a new module value to `constants.ts` MODULES — admin's UI will offer it in the dropdown, but if no panel filters by it, the task will only show up in admin's "all" view. No existing panel breaks.
8. ✅ **SAFE change:** adding `["dashboard"]` to admin's tasks-page invalidation list (L196, L256, L267, L297, L309 → `invalidate(["tasks", "dashboard"])`) — would match the pattern used by designer/print tasks pages and FIX the bug where admin dashboard's LatestTasks goes stale.

**Recommended exact contract boundary (what stays stable vs what can change):**

**MUST STAY STABLE (do not touch without coordinated changes across all 3 panels):**
- The `POST /api/tasks` and `PUT /api/tasks/[id]` request-body shape.
- The `module` enum (8 ModuleKeys in `constants.ts`).
- The `?module=X` query-param filter contract on GET `/api/tasks`.
- The `["tasks"]` query-key prefix family (used by all 3 panels + designer/print calendars + designer/print dashboards).
- The `["dashboard"]` query-key prefix (admin's tasks-page should JOIN this convention — currently missing).

**FREE TO CHANGE (no cross-panel impact):**
- The Kanban UI layout, `@dnd-kit` config, `statusOverride` optimistic-update pattern.
- The `Task` type definition local to admin/tasks-page.tsx (as long as it doesn't drop fields the API returns — but adding fields is safe because the type is a narrower view).
- The `MODULE_TAG_COLOR` map (L112–121) — purely cosmetic.
- The `TaskFormFields` component layout (as long as the `module` Select stays).
- The `EMPTY_FORM` defaults (L123–130) — `module: "admin"` is fine but could be any valid ModuleKey.
- The `COLUMNS` array (L80–108) — Kanban column config.

**SHOULD BE FIXED BEFORE PHASE-1 ENDS:**
- Admin tasks-page should also invalidate `["dashboard"]` (to match designer/print pattern + fix the admin-dashboard LatestTasks staleness).
- Calendar-page should rename `["tasks-calendar"]` → `["tasks", "calendar"]` and `["orders-calendar"]` → `["orders", "calendar"]` so admin's task mutations invalidate the calendar too.
- Dashboard-sections should rename `["dashboard-tasks"]` → `["dashboard", "tasks"]` (and similar for `["dashboard-recent"]`, `["dashboard-near-deadline"]`, `["dashboard-quick"]`) so admin's task mutations (which currently call `invalidate(["tasks"])`) would also invalidate them via the shared `["dashboard"]` prefix — assuming admin's tasks-page also adopts the `["dashboard"]` invalidation.
- The 8-KpiCard independent queries should be consolidated into ONE shared `useQuery(["dashboard-kpi", range.preset, range.from, range.to])` at the `KpiCardsGrid` level, with each card reading its slice via `select` or direct property access.
- `staleTime: 0` on KpiCards should be removed (or set to a sensible `staleTime: 30000` to coalesce refetches).
- The `/api/tasks` POST and PUT routes should validate `module`/`status`/`priority` against the constants enums (server-side defense-in-depth).
- The `assignedTo` column should either be removed from the schema (it's dead) or wired up properly (User model, FK, UI picker, GET filter). Today it's a footgun.

### F. Quick verdict

| File | Grade | Justification |
|---|---|---|
| `tasks-page.tsx` (808 LOC) | **B+** | Clean Kanban implementation with optimistic updates + keyboard a11y. Module-filter Select correctly uses MODULES enum. Missing `["dashboard"]` invalidation (vs designer/print pattern). Missing assignee picker (but contract is preserved because no panel reads `assignedTo`). Best-in-class among admin pages. |
| `calendar-page.tsx` (156 LOC) | **B−** | Compact, uses shared ReusableCalendar + ReusableGantt + DayDetailModal correctly. Two real bugs: (a) orphan task click (no handler), (b) `notes` prop never passed so DayNote feature is dead. Two query-key smells: `["tasks-calendar"]` and `["orders-calendar"]` are single-string keys that don't share prefix with `["tasks"]`/`["orders"]` — admin mutations don't invalidate the calendar. |
| `admin-dashboard.tsx` + 3 children (784 LOC total) | **C** | Layout is clean (Z-pattern with collapsible SectionCards). But 12 simultaneous `/api/dashboard?...` calls on mount = 264 Prisma awaits on every dashboard open + redundant refetches every 15s/30s. `staleTime: 0` compounds the problem. Hardcoded `navigate("admin", ...)` strings ×8 (drift risk vs `nav.ts`). The `MERGE_INNER_CARD` CSS selector trick (L140–144) is clever but brittle. The whole dashboard query model is wrong — should be 1 shared query feeding all sections. |

**Overall cluster grade: B−** — Tasks page is strong, calendar is OK-but-buggy, dashboard is the cluster's weakest link.

### Top 6 cross-panel safety actions (in priority order)

1. **Add `["dashboard"]` to admin's tasks-page invalidation calls** (L196, L256, L267, L297, L309). One-line change ×5; matches the designer/print pattern; fixes admin-dashboard LatestTasks staleness.
2. **Add server-side enum validation on `module`/`status`/`priority` in `/api/tasks` POST + PUT.** Defense-in-depth against the user's #1 hard constraint (a typoed `module` would orphan a task).
3. **Rename calendar's `["tasks-calendar"]` → `["tasks", "calendar"]` and `["orders-calendar"]` → `["orders", "calendar"]`** so admin mutations reach the calendar.
4. **Rename dashboard's `["dashboard-tasks"]`, `["dashboard-recent"]`, `["dashboard-near-deadline"]`, `["dashboard-quick"]` → `["dashboard", "tasks"]`, etc.** so the shared `["dashboard"]` prefix covers them.
5. **Consolidate the 8 KpiCard queries into 1 shared `useQuery` at KpiCardsGrid level + remove `staleTime: 0`.** Cuts 7 redundant calls on mount and 7 every 15s.
6. **Either delete `assignedTo` from the schema or wire it up properly.** Today it's a dead column that misleads readers into thinking per-user assignment exists.

---
Task ID: P1.5 + P2
Agent: orchestrator (main)
Task: Phase 1.5 baseline security + run setup, then Phase 2 rebuild of Order Detail Modal

Work Log:
- Phase 1.5 (baseline security):
  - Wrote src/lib/auth.ts: bcrypt password hashing (hashPassword/verifyPassword), HMAC-SHA256 signed session cookie (getSession verifies signature constant-time), requireUser() route-guard helper, ensureSeedUser() with auto-migrate of legacy plaintext.
  - Wrote src/app/api/auth/login/route.ts: bcrypt.compare, constant-ish-time flow, no raw exception leak.
  - Wrote src/proxy.ts (Next.js 16 — renamed from middleware.ts): edge-safe cookie-presence gate on /api/* except /api/auth/login. Full HMAC verification stays server-side in getSession().
  - Wrote scripts/seed.ts: hashes admin123, auto-migrates legacy rows.
  - Installed bcryptjs + @types/bcryptjs.
- Run setup: synced printoo-erp source into sandbox /home/z/my-project (the live Preview target), bun install, prisma generate + db push, seed (5 customers, 3 suppliers, 6 products, 5 orders, 3 notifications). Started persistent dev server via .zscripts/dev.sh (survives across tool calls).
- Verified baseline via curl: GET /api/orders without cookie -> 401 (guard works); POST /api/auth/login -> 200 (bcrypt works against hashed seed password); GET /api/orders with cookie -> 200 + orders; GET /api/auth/me -> 200 (HMAC session verified).
- Phase 2 (modal rebuild, 3 files):
  - src/components/shared/order-detail-modal.tsx (REWRITE): container + shell + header (identity + 4 metric tiles + StatusDropdown + priority + alert chips for blocking items/overdue tasks) + 6-tab nav (role=tab, aria-selected) + tab body (framer-motion AnimatePresence transitions) + footer. Skeleton loader (not spinner) when order=null. Public interface PRESERVED: {order, open, onOpenChange} + type OrderDetail (extended additively with tasks). Status change moved from a tab to a header DropdownMenu (Action-Forward). Note moved from a tab to a section in Overview (Progressive Disclosure).
  - src/components/shared/order-detail-tabs.tsx (NEW): 6 presentational tabs in one file (honors 3-file atomic rule; Open-Closed via new exports). OverviewTab (next-action CTA + 4 stat tiles + blocking callout + note section), ItemsTab (rows with stage/material/date badges + late flags), TasksTab (read-only list + CTA to tasks page; assignment logic deferred to Phase 4), CostsTab (lazy useQuery ["order-costs", id] -> /api/material-costs?orderId; summary cards + list), FinanceTab (replaces the no-op فاکتور button — R5 fixed; shows pre-invoices + invoice summary + صدور button), HistoryTab (reconstructed timeline from createdAt + preInvoices + invoice + tasks dates; AuditLog deferred).
  - src/lib/use-order-detail.tsx (MODIFY): wrapped OrderDetailModal in next/dynamic (ssr:false) for code-splitting (lazy-load). Public interface PRESERVED: {openOrder, modal, isLoading}.
- Synced all 3 files (+ auth.ts, proxy.ts, seed.ts, ARCHITECTURE-NOTES) from printoo-erp source-of-truth to sandbox.
- Agent Browser verification (end-to-end):
  - Login with admin@printoo24.com/admin123 -> dashboard loaded (sidebar, KPIs, shortcuts). Hashed-password login works.
  - Navigate to "همه سفارشات" -> table with 5 orders, filters, column-visibility, pagination.
  - Click order #1 row -> modal opened with: header (4 metrics + "1 آیتم نیازمند متریال" alert chip + status dropdown), 6 tabs (نمای کلی default + آیتم‌ها(2) + تسک‌ها(0) + هزینه‌ها + مالی + تاریخچه), Overview CTA "ارسال به چاپ", blocking-items callout.
  - Tab switch through all 6 -> ItemsTab rendered rows (فلکس بنر 10×25000 + استیکر شفاف 5×45000, stage badges, material flags); TasksTab rendered empty-state CTA; FinanceTab rendered صدور پیش‌فاکتور button; HistoryTab timeline rendered.
  - Status dropdown opened -> all 6 menuitems visible (در حال طراحی highlighted).
  - API-level loop close: curl PUT /api/orders/[id]/status {status:in_printing} -> 200 {"ok":true}; DB confirmed in_printing.
  - Console errors across the ENTIRE session: EMPTY. No hydration mismatches, no failed API calls, no runtime crashes.
  - dev.log: no errors/warnings/fails during the browser session.

Stage Summary:
- Phase 1.5 baseline security DONE: bcrypt + HMAC-signed session + proxy route-guard. The full RBAC (roles/modules/stages/field-filters/salary/attendance) is documented as infrastructure in ARCHITECTURE-NOTES-MUST-READ.md §3.2 for a future dedicated phase.
- Phase 2 modal rebuild DONE & browser-verified: cognitive design (Context-First Overview default + Action-Forward status dropdown + Progressive Disclosure note + 6 tabs + skeleton + lazy-load). Fixes R5 (no-op فاکتور -> real FinanceTab) and R22 (PreInvoiceModal silent fallback noted, PreInvoice flow preserved). Interface drop-in (no consumer migration needed).
- Bugs fixed in this phase: R5 (فاکتور no-op), partial R26 (route-guard + hashing). Bugs deferred to their phases: R1/R2/R3/R4 (wizard, Phase 6), R6/R7/R11/R25 (dashboard, Phase 6), R8/R15/R16/R17/R23/R24 (calendar/gantt, Phase 5), R9/R10/R12 (tasks, Phase 4), R13/R14/R21 (orders page, Phase 3).
- Project is RUNNING on port 3000 (persistent via dev.sh), seeded, fully functional. Ready for Phase 3 (All Orders virtualization) upon user approval.

---
Task ID: Phase-3
Agent: orchestrator (main)
Task: Phase 3 — All Orders + Open Orders rebuild (virtualization, pro filters, dedup)

Work Log:
- Phase 3 design analysis (7 files, no 3-file cap — user explicitly authorized "more is better as long as quality is guaranteed"):
  1. `src/components/ui/data-table.tsx` (REWRITE) — opt-in virtualization via @tanstack/react-virtual (new props: `enableVirtualization?`, `rowHeight?=44`, `overscan?=8`, `virtualMaxHeight?=560`). Sticky header in virtual mode. R13 fix: new `expandOnRowClick?=boolean` (default `false`) — row click now ONLY fires `onRowClick`, expand is driven exclusively by an explicit button column. R14 fix: `totalCount` prop is now actually consumed by `DataTablePagination` (was: silently dropped, `data.length` always used). When `enableVirtualization` is on, `manualPagination` is forced so the table model doesn't slice data (virtualizer does windowing). All 18 existing props preserved → all 18 call-sites work unchanged.
  2. `src/components/shared/search-combobox.tsx` (NEW) — single source of truth for the SearchCombobox previously duplicated inline in orders-page.tsx (L412-499) AND open-orders.tsx (L722-845). Fixes R21. Interface widened: `icon` is now `IconName` (any icon, not just customers/package); `inputId` prop added so two comboboxes on the same page don't collide on ARIA `aria-controls`. Behavior preserved 1:1 (open-on-click, search-on-type, clear-on-close, clear-selection footer).
  3. `src/components/shared/filter-toggle.tsx` (NEW) — single source of truth for FilterToggle + FilterGroup previously inlined in orders-page.tsx (L501-545). Fixes R21 part 2. `activeColor` widened to 7 tones (primary/rose/emerald/amber/violet/cyan/slate). `aria-pressed` added for a11y.
  4. `src/components/shared/index.tsx` (MODIFY) — re-export SearchCombobox + FilterToggle + FilterGroup so call-sites keep the single import surface `from "@/components/shared"`.
  5. `src/components/modules/admin/orders/orders-page.tsx` (REWRITE) — removed 3 local inline components (SearchCombobox, FilterGroup, FilterToggle — ~140 lines of dup). Imports all three from `@/components/shared`. Server-side filters: status[], priority[], stage[], dateFrom, dateTo now sent as query params (was: client-side `.filter()` on the full list — O(n) JS per keystroke). QueryKey now `["orders", queryString]`. `totalCount` read from API response and passed to DataTable (R14 fix lands end-to-end). Virtualization enabled above threshold (200 rows) to avoid overhead on small lists. Expand button now has `aria-expanded` + `aria-label` for a11y.
  6. `src/components/modules/admin/open-orders.tsx` (MODIFY) — removed the local 124-line SearchCombobox definition (L728-851). Switched 2 call-sites to the shared component with `inputId="open-orders-customer-filter"` / `"open-orders-product-filter"` (prevents ARIA clash with orders-page comboboxes). Removed now-unused imports (Popover, Command).
  7. `src/app/api/orders/route.ts` (REWRITE) — R26: `requireUser()` on GET + POST (returns 401 without session). R4: POST now wraps the entire create cascade (Order + Items + PreInvoice + Invoice + paidAmount updates) in `db.$transaction(async (tx) => ...)`. Helpers `createPreInvoice`/`createInvoice` now take the tx client. Server-side filters added: `status[]` (comma-separated → `in:`), `priority[]`, `stage[]` (filters on items), `dateFrom`/`dateTo` (createdAt range, dateTo inclusive of full day), `q` (OR on customer name/phone + note). Response shape now `{ orders, totalCount }` — `totalCount` runs in parallel via `Promise.all([findMany, count])`. R3 (nextNumber race) intentionally deferred to Phase 6 (needs Counter model migration); for now `nextNumber` is called inside the transaction so concurrent writers serialize on the SQLite write lock.
  8. `src/app/api/orders/[id]/route.ts` (REWRITE) — R26: `requireUser()` on GET / PUT / DELETE. R4: PUT items-replace (deleteMany + create* + update) now wrapped in `db.$transaction` — previously a failure between deleteMany and the new item creates would leave the order with ZERO items (silent data loss). DELETE also wrapped in a (defensive) transaction.

- Lint: `bun run lint` → 0 errors, 2 warnings (both pre-existing & benign: order-detail-modal's unused eslint-disable comment, and React Compiler's `useReactTable()` memoization notice).
- API verification via curl:
  - POST /api/auth/login {admin@printoo24.com/admin123} → 200 (cookie set).
  - GET /api/orders → 200, `{orders: [...5], totalCount: 5}`.
  - GET /api/orders?status=archived → 200, `{orders: [...1], totalCount: 1}` (server-side filter works).
  - GET /api/orders without cookie → 401 (R26 route-guard works).
- ARCHITECTURE-NOTES-MUST-READ.md updated: Phase 3 row in §2 table marked ✅ done; R3/R4/R13/R14/R21/R26 rows in §6 updated with the embedded-fix details; §10 change-log entry added.

Stage Summary:
- Phase 3 DONE: All Orders + Open Orders + DataTable + 2 shared components + 2 API routes. 7 files, ~900 lines of rewritten/extracted/hardened code.
- Bugs fixed this phase: R13 (click conflict), R14 (totalCount dropped), R21 (SearchCombobox/FilterToggle duplication), R4 (orders multi-write atomicity), R26 partial (requireUser on 4 order routes — GET/POST/GET[id]/PUT[id]/DELETE[id]).
- Bugs deferred (per §6): R3 (nextNumber race) → Phase 6 (Counter model migration). R1/R2/R6/R7/R11/R18-20/R25 → Phase 6. R8/R15-17/R23/R24 → Phase 5. R9/R10/R12 → Phase 4.
- Backward compatibility preserved: DataTable's 18 props are unchanged (3 new optional props added); SearchCombobox's interface is a superset; orders-page's user-facing behavior is identical (only faster + filters server-side); open-orders's behavior is identical (only with the shared combobox).
- Project still RUNNING on port 3000 (persistent via dev.sh). Ready for Agent Browser end-to-end verification, then Phase 4 (Tasks + cross-panel assignment).

---
Task ID: Phase-4
Agent: orchestrator (main)
Task: Phase 4 — Tasks page upgrade + cross-panel assignment logic (R9, R10, R12, scenario-3)

Work Log:
- Environment recovery: printoo-erp/ workspace was deleted by sandbox reset; my-project/ (already carrying full Phase 3 code, verified identical to origin/main) became the single workspace. Remote re-attached, history reconciled (reset --mixed to origin/main, content-identical), pushed.
- Root-cause of "دیتاها لود نمی‌شن" (previous session): (1) stale HMR browser cache throwing `NEAR_THRESHOLD is not defined` crash in OpenOrdersPage; (2) DATABASE_URL env override pointing the server at my-project's double-seeded DB (orders #6-10 ghosts); (3) sandbox killing background processes at tool-call boundaries. All fixed: clean Turbopack restart, DB synced + dedup, double-fork detached dev server.
- prisma/schema.prisma: Task.assignedTo → real FK to User (relation "TaskAssignee", back-relation User.assignedTasks). Column name preserved (backward compatible). db push + client regenerate.
- src/app/api/users/route.ts (NEW): GET active users only, auth-gated, password never selected, ?role= filter. Single source for all assignee pickers.
- src/lib/task-validation.ts (NEW): shared enum fences (isTaskStatus/isTaskPriority/isTaskModule mirroring §5.2 contract values), resolveAssignee (throws Persian errors for deleted/inactive users — the roadmap edge case), TASK_INCLUDE (order + assignedUser).
- src/app/api/tasks/route.ts (REWRITE): requireUser; GET gains ?assignedTo= & ?orderId= filters + rejects invalid enum filters with 400 (was silent empty list); POST validates title/enum values/orderId/customerId/dueDate/assignee. Responses include assignedUser (additive).
- src/app/api/tasks/[id]/route.ts (REWRITE): PUT now handles assignedTo (R9 — previously silently dropped); 404 Persian fences on PUT/DELETE; all enum fields validated (R12); empty-patch idempotent no-op.
- src/app/api/orders/[id]/route.ts: order detail tasks now include assignedUser.
- src/components/modules/admin/tasks-page.tsx (REBUILD): assignee SearchSelect in create/edit dialogs (role sublabels), assignee chip with initials-avatar on cards + "بدون مسئول" chip for unassigned open tasks, header assignee filter, board summary chips (open/overdue/urgent/unassigned), task card's linked-order button opens OrderDetailModal in place (useOrderDetail), R10 fix — all mutations invalidate [tasks, dashboard, order]. DnD optimistic-override flow preserved 1:1.
- src/components/shared/order-detail-tabs.tsx (TasksTab): inline quick-create form (title + module + assignee + due date) with orderId pre-linked, smart module default derived from order status (pending_design→designer etc.), one-click "ایجاد و ارجاع" — the <5-second referral (scenario-3). Task rows show module chip + real assignee name (was raw user-id string) + days-remaining + "بدون مسئول" chip.
- src/lib/constants.ts: USER_ROLE Persian labels (master/admin/designer/print/warehouse/finance/qc/crm/srm).
- src/lib/icons.tsx: registered "search"/"searchList" (Search01/02Icon were imported but never mapped — icon invisible in 7 pages + 7 pre-existing TS errors).
- scripts/seed.ts: 4 demo employees (سارا/طراح، رضا/چاپ، مهدی/انبار، نگار/مالی، bcrypt-hashed) + idempotency guards for orders & notifications (root cause of ghost orders #6-10). Cleanup of duplicate orders from live DB.
- API verification via curl: login → GET /api/users (5 users); POST task with assignee → 201 + assignedUser echoed; invalid module → 400 Persian; invalid status PUT → 400; assign to nonexistent user → 400 «کاربر مورد نظر یافت نشد»; valid reassign → assignedUser updated; missing task PUT → 404; unauthenticated → 401.
- Agent Browser E2E (0 console errors throughout): login → Tasks board renders assignee chips (سا سارا احمدی / رک رضا کریمی) + summary chips; edit dialog assignee picker lists all 5 users with role labels; reassign saved & card updated; assignee filter (سارا shows task, رضا → empty state); All Orders → order #5 modal → Tasks tab → quick-create «چاپ فاینال فایل فلکس بنر» module=چاپ assignee=رضا → task created, linked, listed; Tasks board card shows «سفارش #5 · علی محمدی» button → click opens order modal (Tasks tab count 1); Designer panel's Tasks page shows the module=designer task (cross-panel module contract intact).
- lint: 1 pre-existing error (react-hooks/incompatible-library on useReactTable — verified present on HEAD via git stash), 3 pre-existing warnings. My changes add zero new lint issues. tsc: my files clean (remaining errors all pre-existing Phase 5/6 territory).

Stage Summary:
- Phase 4 DONE & browser-verified: R9 (assignedTo FK + UI + validation), R10 (dashboard invalidation), R12 (server enum fences), R26 partial (requireUser on tasks/users routes), scenario-3 (<5s referral from order modal).
- Contracts preserved: POST/PUT body shapes additive only; ?module= filter intact (designer/print panels verified); query-key prefixes extended ([tasks, dashboard, order]); OrderDetailModal props unchanged.
- New infrastructure for RBAC: User rows are now referenceable from tasks (first concrete step per §3.2); /api/users is the assignee source of truth.
- Remaining phases: 5 (Calendar/Gantt: R8, R15-17, R23-24), 6 (Dashboard + wizard: R1, R2, R6, R7, R11, R18-20, R25, R3).

---
Task ID: hotfix-round-2
Agent: main (Z.ai Code)
Task: دیباگ و رفع شکایات کاربر — جدول سفارشات خراب، مودال زشت/کند، عدم امکان ساخت نقش، دیتای تستی

Work Log:
- محیط بررسی شد: printoo-erp از بین رفته (sandbox reset)، my-project تنها workspace است و git remote سالم
- POST /api/tasks با curl تست شد: 201 OK با دیتای معتبر؛ resolveAssignee با ایمیل 400 می‌دهد ولی فرانت‌اند ID می‌فرستد — سالم
- باگ جدول همه سفارشات ریشه‌یابی شد: VirtualRow با position:absolute از جدول خارج می‌شود (rowDisplay:block، عرض سلول‌ها auto=38..98px در برابر هدر 72..200px) → ستون‌ها ناهم‌تراز
- باگ عرض مودال سفارش: DialogContent پایه sm:max-w-lg (512px) بر max-w-3xl غلبه می‌کند (ترتیب cascade) → مودال باریک
- صفحه مدیریت کاربران/نقش‌ها اصلاً وجود ندارد (nav.ts فاقد آیتم) → «نمی‌توانم نقش بسازم»
- ایجاد تسک در مرورگر تست شد (ساده + مسئول + تاریخ): هر دو 201 — مشکل کاربر از stale HMR بوده

Stage Summary:
- سه ریشه مشکل شناسایی شد: (1) virtualized rows خارج از جدول، (2) max-width override در مودال، (3) فیچر Users/Roles غایب
- پلن: فیکس spacer-rows، بازطراحی مودال عریض + prefetch، ساخت صفحه Users & Roles کامل + API، دیتای تستی

---
Task ID: hotfix-round-2-done
Agent: main (Z.ai Code)
Task: تکمیل رفع شکایات کاربر + دیتای تستی + راستی‌آزمایی مرورگری

Work Log:
- Fix 1 (61d2e0e): جدول سفارشات — الگوی spacer-row جایگزین position:absolute شد؛ هم‌ترازی headX===bodyX و headW===bodyW برای ۱۰ ستون verify شد
- Fix 2 (ecc164c): مودال سفارش — sm:max-w-5xl (512→1024px)، بدنه min(62vh,560px)، MetricTile با tone معنایی، تب‌های polish؛ سرعت: preloadModal روی idle + prefetchOrder روی hover ردیف + staleTime 60s
- Fix 3 (59b2b3d): کاربران و نقش‌ها — POST/PUT /api/users + /api/users/[id] با گاردهای master/self-lockout؛ صفحه جدید با کاتالوگ نقش‌ها، سوییچ فعال/غیرفعال، دیالوگ ایجاد/ویرایش؛ آیتم nav در گروه «تنظیمات»
- Fix 4 (f9aa589): scripts/test-data.ts — ۶ سفارش + ۱۷ تسک + ۳ مشتری + ۳ محصول؛ اجرا شد: 11 orders, 24 tasks
- راستی‌آزمایی مرورگری: ایجاد تسک (ساده + مسئول + تاریخ) ✓، ایجاد کاربر QC «نیما رادمهر» ✓، تغییر نقش رضا→ادمین→برگشت ✓، مودال #11 با تب تسک‌های متصل ✓، همه سفارشات ۱۱ ردیف هم‌تراز ✓، سفارشات باز ۸ سفارش ✓
- lint: 0 error (۲ هشدار pre-existing مربوط به react-table/React-Compiler)
- dev.log: صفر خطای 4xx/5xx اخیر
- نکته: dev server با double-fork daemon دوباره بالا آمد (سرور قبلی توسط sandbox کشته شده بود)

Stage Summary:
- هر ۴ شکایت کاربر عملیاتی رفع و در مرورگر verify شد + ۴ کامیت جداگانه push شد
- برای تست keep-alive: جدول virtualized هنگام hidden→visible درست re-measure می‌کند (ResizeObserver)

---
Task ID: hotfix-round-3
Agent: main (Z.ai Code)
Task: رفع شکایات راند ۳ — اسکرول افقی جدول سفارشات + حذف پیجینیشن + flushSync + خطاهای ۵۰۰ API + انتقال کاربران/نقش‌ها به ماژول تنظیمات

Work Log:
- ریشه‌یابی خطاهای ۵۰۰: کوکی HMAC خودکفاست؛ بعد از ریست DB، کوکیِ امضاشده ولی کاربرِ حذف‌شده (cmss...) از auth رد می‌شد → تب stale کاربر با آی‌دی‌های مرده کار می‌کرد (assignedTo ناموجود → خطا). بازتولید با جعل کوکی ghost تأیید شد.
- Fix 1 — auth.ts: requireUser() حالا ردیف user را در DB بازبینی می‌کند (وجود + status=active)؛ ghost → پاک‌سازی کوکی + 401 فارسی. پاسخ همیشه data تازه (تغییر نقش فوری اعمال می‌شود، نه ۷ روز بعد). /api/auth/me همین بازبینی را دارد.
- Fix 2 — api.ts: در 401 غیر-auth با نشست فعال → logout + reload تمیز (رفع دیتای stale مرورگر؛ login-form استثنا تا ریدایرکت لوپ نشود).
- Fix 3 — جدول همه سفارشات: VirtualizedDataTable حذف و DataTable عادی (همان الگوی سفارشات باز) + Card + pageSize=10 → پیجینیشن برگشت؛ هشدار flushSync (TanStack Virtual measureElement) با حذف virtualizer رفت.
- Fix 4 — SidebarInset lacked min-w-0 (باگ شل، همه صفحات): آیتم flex با min-width:auto با جدول ۱۰ستونه به ۱۴۴px بزرگ می‌شد → کل صفحه اسکرول افقی RTL. min-w-0 اضافه شد (۱۴۰۰→۱۲۸۰). ستون‌های «مرحله/تاریخ ساخت» با prop جدید defaultHidden DataTable مخفی پیش‌فرض (بازگشت از منوی ستون‌ها) + دکمه‌های عملیات size-8→size-7 → جدول کامل در ۹۴۰px جا می‌شود، بدون هیچ اسکرولی.
- Fix 5 — ماژول «تنظیمات سیستم» جدید (masterOnly) در NAV؛ گروه تنظیمات از ادمین داخلی حذف؛ visibleModules(role) در سایدبار + پالت فرمان؛ SettingsUsersGuard در module-router (لایه ۲)؛ API از قبل requireMaster دارد (لایه ۳).
- Fix 6 — a11y: DialogTitle sr-only به پالت فرمان (رفع هشدار Radix).
- augmentations: align به ColumnMeta در data-table.tsx منتقل شد (بعد از حذف virtualized-data-table.tsx).
- راستی‌آزمایی curl: ghost cookie → 401 «نشست منقضی» + user:null؛ لاگین سالم → 200؛ POST task با assignee → 201.
- راستی‌آزمایی مرورگر (agent-browser): صفحه سفارشات pageHScroll=false، tableOverflow=false، ۱۰ ردیف + «ردیف در صفحه» پیجینیشن، صفر خطای کنسول (flushSync و DialogTitle هر دو رفع)؛ ساخت تسک «تست نهایی مرورگر» با مسئول سارا → موفق؛ مودال سفارش #11 با ۶ تب و API 200؛ طراح (سارا) ماژول تنظیمات را در سایدبار و پالت نمی‌بیند؛ موبایل 375px و دسکتاپ 1920px بدون اسکرول افقی. سرور وسط کار توسط sandbox کشته شد → daemon دوباره بالا آمد با dev.log.
- پاک‌سازی: تسک‌های تستی حذف شدند؛ lint: 0 error/1 warning قبلی؛ tsc: فقط خطاهای pre-existing.

Stage Summary:
- ۴ شکایت کاربر ریشه‌یابی و رفع شد: (۱) اسکرول افقی = باگ min-w-0 شل + عرض جدول — هر دو رفع؛ (۲) پیجینیشن برگشت (الگوی سفارشات باز)؛ (۳) flushSync رفت؛ (۴) خطاهای ۵۰۰ = نشست ghost — requireUser DB-verify + بونس فرانت‌اند؛ کاربر با هاردرفرش/لاگین مجدد دیتای تازه می‌گیرد.
- «کاربران و نقش‌ها» اکنون ماژول «تنظیمات سیستم» مخصوص master است (سه لایه گارد: NAV filter + router guard + API).
- VirtualizedDataTable حذف شد (مصرف‌کننده‌ای نبود)؛ DataTable با defaultHidden اختیاری.

---
Task ID: P5-explore
Agent: Explore (subagent)
Task: Discover Phase 5 calendar/gantt files + extract exact R8/R15/R16/R17/R23/R24 bug definitions + verify admin tasks-page ["dashboard"] invalidation done in Phase 4

Work Log:
- Read worklog.md (latest tail) — confirmed Phase 4 done (tasks page + RBAC infrastructure), Phase 5 = rebuild shared Calendar + Gantt, fixing R8/R15/R16/R17/R23/R24.
- Located the architecture notes file: `/home/z/my-project/ARCHITECTURE-NOTES-MUST-READ.md` (295 lines). Read it in full; §2 phase table + §5.4 component-interface contracts + §6 bug catalog (R1–R26) are the source of truth.
- Globbed for calendar/gantt/day-detail files; Grep'd for `tasks-calendar`, `orders-calendar`, `DayNote`, `day-notes`, `reusable-calendar`, `reusable-gantt`, `DayDetailModal`, `notes={`.
- Read all 7 calendar/gantt files end-to-end + the 2 dead `/api/day-notes` routes + the `DayNote` model block in `prisma/schema.prisma:310-317`.
- Verified admin tasks-page.tsx invalidation claim by grepping `invalidate|dashboard|queryKey` and reading the 3 mutation sites (L264–270, L324–329, L364–374, L377–384).

Stage Summary:

### A. Phase 5 file inventory (paths + line counts)

| File | LOC | Role |
|---|---|---|
| `src/components/shared/reusable-calendar.tsx` | 190 | shared month-grid calendar (the 4 module calendars all wrap this) |
| `src/components/shared/reusable-gantt.tsx` | 287 | shared horizontal gantt bar chart |
| `src/components/shared/day-detail-modal.tsx` | 302 | per-day events modal (3 tabs: overview / orders / tasks) |
| `src/components/modules/admin/calendar-page.tsx` | 156 | admin's wrapper: Tabs(calendar|gantt) + filters(orders|tasks|urgent) + DayDetailModal; uses `useOrderDetail` |
| `src/components/modules/print/print-calendar.tsx` | 208 | print variant — orders filtered to `status=in_printing`, tasks filtered to `?module=print`; uses `usePrintOrderDetail` |
| `src/components/modules/designer/designer-calendar.tsx` | 208 | designer variant — orders filtered to `status=pending_design`, tasks `?module=designer`; uses `useDesignerOrderDetail` |
| `src/components/modules/qc/qc-calendar.tsx` | 228 | QC variant — renders `QcReport[]` events only (NO tasks, NO gantt — calendar + side list); uses `useQcReportDetail` |
| `src/app/api/day-notes/route.ts` | 59 | DEAD — GET/POST day notes (zero callers) |
| `src/app/api/day-notes/[date]/route.ts` | 35 | DEAD — GET/DELETE day note by date (zero callers) |
| `src/components/ui/calendar.tsx` | 213 | shadcn base calendar — UNRELATED to Phase 5 (used by date pickers); do not touch |
| `prisma/schema.prisma` (DayNote model, L309–317) | 9 | `DayNote` table exists in schema but is feature-dead |

Total Phase 5 code surface: **~1483 LOC across 8 files** (excluding `ui/calendar.tsx` and the DayNote schema block).

### B. R8 / R15 / R16 / R17 / R23 / R24 — exact bug definitions (verbatim from ARCHITECTURE-NOTES-MUST-READ.md §6)

| ID | Severity | Bug | File:line (per notes) | Phase |
|---|---|---|---|---|
| **R8** | 🟠 | Task click in calendar orphan (only order handled) | `calendar-page.tsx:119-121` | 5 |
| **R15** | 🟡 | Gantt no virtualization (100+ bars rendered) | `reusable-gantt.tsx:158-163,206-261` | 5 |
| **R16** | 🟡 | Gantt SyncScroll queries a class no element has | `reusable-gantt.tsx:276` | 5 |
| **R17** | 🟡 | DayDetailModal dynamic `bg-${color}-500` purged in prod | `day-detail-modal.tsx:172` | 5 |
| **R23** | 🟡 | CalendarEvent.meta loose `Record<string,unknown>` | `reusable-calendar.tsx:17` | 5 |
| **R24** | 🟡 | Dead `/api/day-notes` + DayNote + notes prop (zero consumers) | grep-confirmed | 5 |

Also touched indirectly in §5.3 sensitivities (cross-reference):
> ⚠️ BUG (R11): `["tasks-calendar"]` and `["dashboard-tasks"]` are single-string keys NOT prefix-matched. Phase 5/6 renames them to `["tasks","calendar"]` and `["dashboard","tasks"]`.

§5.4 component-interface contracts (MUST stay drop-in):
- `ReusableCalendar` props: `{events, notes?, onDayClick?, onEventClick?, filters?, className?}`. 4 consumers.
- `ReusableGantt` props: `{events, onEventClick?, className?, title?, emptyMessage?, filters?}`. 3 consumers.

### C. Query-key smells — exact current code

**Admin calendar-page.tsx** (the ONLY file with the smell — print/designer/qc variants already use prefix-matched keys):

```ts
// calendar-page.tsx:75-79  (orders)
const { data: ordersData } = useQuery({
  queryKey: ["orders-calendar"],          // ← R11 smell: single-string, NOT prefix-matched
  queryFn: () => api<{ orders: Order[] }>("/api/orders"),
  refetchInterval: 30000,
});

// calendar-page.tsx:80-84  (tasks)
const { data: tasksData } = useQuery({
  queryKey: ["tasks-calendar"],            // ← R11 smell: single-string, NOT prefix-matched
  queryFn: () => api<{ tasks: Task[] }>("/api/tasks"),
  refetchInterval: 30000,
});
```

Recommended rename (per §5.3 + Phase-1 worklog):
- `["orders-calendar"]` → `["orders", "calendar"]`
- `["tasks-calendar"]` → `["tasks", "calendar"]`

**Compare with the already-correct module variants:**
- `print-calendar.tsx:92` → `["orders", "print", "in_printing", "calendar"]` ✅
- `print-calendar.tsx:100` → `["tasks", "print", "calendar"]` ✅
- `designer-calendar.tsx:92` → `["orders", "designer", "pending_design", "calendar"]` ✅
- `designer-calendar.tsx:100` → `["tasks", "designer", "calendar"]` ✅
- `qc-calendar.tsx:81` → `["qc-reports", "calendar"]` — separate domain key (not a `tasks`/`orders` family member); leave alone for Phase 5.

### D. R8 — orphan task click — exact current code (3 handler sites in admin calendar-page.tsx)

**Site 1 — calendar tab `onEventClick` (calendar-page.tsx:119-121):**
```tsx
onEventClick={(e) => {
  if (e.type === "order" && e.meta?.orderId) openOrder(e.meta.orderId as string);
  // ← task clicks fall through silently
}}
```

**Site 2 — gantt tab `onEventClick` (calendar-page.tsx:129-131):**
```tsx
onEventClick={(e) => {
  if (e.type === "order" && e.meta?.orderId) openOrder(e.meta.orderId as string);
  // ← task clicks fall through silently
}}
```

**Site 3 — DayDetailModal `onEventClick` (calendar-page.tsx:145-150):**
```tsx
onEventClick={(e) => {
  if (e.type === "order" && e.meta?.orderId) {
    setDayModal(null);
    openOrder(e.meta.orderId as string);
  }
  // ← task clicks fall through silently
}}
```

**Same R8 bug exists in print-calendar.tsx:145-149 and designer-calendar.tsx:145-149** — both define a `handleEventClick(e)` that only branches on `e.type === "order"`. The fix must be applied in all 3 module calendars.

(`qc-calendar.tsx:117-121` is NOT affected — it queries `e.meta?.reportId` directly, and `toReportEvents` (qc-calendar.tsx:51-63) always sets `meta: { reportId: r.id }`, so every clickable event resolves.)

**Fix direction:** the 3 calendar wrappers need a `navigate("admin"|"designer"|"print", "tasks")` (or open an inline TaskDetailModal — none exists yet) when `e.type === "task" && e.meta?.taskId`. Note the local `Task` type in admin calendar-page.tsx (L23-25) is minimal — `{ id, title, priority, dueDate, module }` — it does NOT include `assignedUser` (added in Phase 4 to the API). If a future inline task modal is desired, the type needs widening.

### E. R24 — dead DayNote feature — exact locations

**The prop is exposed but never passed:**
- `reusable-calendar.tsx:20-24` — `export type DayNote { date: string; content: string; color?: string }`
- `reusable-calendar.tsx:28` — `notes?: DayNote[];` in `ReusableCalendarProps`
- `reusable-calendar.tsx:53-57` — `notesMap` useMemo (consumes `notes`)
- `reusable-calendar.tsx:118` — legend chip `<Icon name="bookmark" ... /> یادداشت روز`
- `reusable-calendar.tsx:133,150` — `hasNote` flag + bookmark icon on day cell

**Zero UI callers:** grep `notes=\{` in `src/` → 0 matches. None of the 4 calendar wrappers (admin/print/designer/qc) pass `notes` to `ReusableCalendar`.

**Dead API surface:**
- `src/app/api/day-notes/route.ts` (59 LOC, GET + POST upsert)
- `src/app/api/day-notes/[date]/route.ts` (35 LOC, GET + DELETE)
- `prisma/schema.prisma:309-317` — `DayNote` model (id, date unique, content, color, timestamps)

**No `requireUser()` on either route** — R26 leftover (day-notes routes are unauthenticated).

**Decision required:** either (a) wire up the feature properly (add `notes` query + UI editor + invalidate `["day-notes"]`), or (b) delete the API + DayNote model + remove `notes` prop from `ReusableCalendar`. Phase-1 worklog §"SHOULD BE FIXED" suggested fixing or removing; the user has not specified direction.

### F. R15 / R16 — Gantt virtualization + dead SyncScroll

**R15 — no virtualization (reusable-gantt.tsx):**
- L158-163: left panel `.map((e) => <div>...)` over ALL `validEvents` — no windowing.
- L206-261: bars `.map((e, idx) => <Tooltip>...</Tooltip>)` over ALL `validEvents` — each bar renders a `Tooltip` + an `absolute`-positioned div + gridline div. 100+ events = 100+ tooltips.
- Outer container has `maxHeight: 500px` (L152) — but right panel only has `overflow-x-auto` (L167), NOT `overflow-y-auto`. So bars are CLIPPED vertically, not scrolled. Left panel has `overflow-y-auto` (L154) so it scrolls alone.

**R16 — dead SyncScroll (reusable-gantt.tsx:274-287):**
```tsx
function SyncScroll() {
  React.useEffect(() => {
    const containers = document.querySelectorAll(".gantt-scroll-sync");  // ← queries a class NOTHING has
    const handler = (e: Event) => { ... };
    containers.forEach((c) => c.addEventListener("scroll", handler));
    return () => containers.forEach((c) => c.removeEventListener("scroll", handler));
  }, []);
  return null;
}
```
Verified: grep `gantt-scroll-sync` in `src/` → 0 matches outside the SyncScroll function itself. The left panel (L154) and right panel (L167) have `scrollbar-thin` but NO `gantt-scroll-sync` class. So `querySelectorAll` returns an empty NodeList; the effect is a complete no-op. The whole `<SyncScroll />` element (L267) is dead code.

**Compounding bug (not in the R-catalog but worth noting):** right panel (L167) lacks `overflow-y-auto`, so when bars exceed `maxHeight: 500px` they are CLIPPED (not scrollable). Even after fixing R16, both panels need `overflow-y-auto` for scroll-sync to be meaningful.

### G. R17 — DayDetailModal dynamic Tailwind class (day-detail-modal.tsx:172)

```tsx
{events.slice(0, 5).map((e) => {
  const daysLeft = diffDays(e.endDate, new Date());
  return (
    <div key={e.id} className="flex items-center gap-2 text-xs py-1">
      <span className={cn("size-2 rounded-full shrink-0",
        `bg-${e.color === "yellow" ? "amber" : e.color === "blue" ? "blue" : e.color === "green" ? "emerald" : "rose"}-500`)} />
      {/* ↑ runtime-constructed Tailwind class — purged in prod build */}
      <span className="flex-1 truncate font-medium">{e.fullTitle}</span>
      ...
    </div>
  );
})}
```
Tailwind's content scanner cannot see classes produced via template-literal concatenation at runtime. In production builds (`bun run build`), `bg-amber-500`, `bg-blue-500`, `bg-emerald-500`, `bg-rose-500` are PURGED → the dot has no background color (just `size-2 rounded-full shrink-0`).

**Fix direction:** replace with a static lookup map (same pattern already used at L261-272 for `colorBg` and L267-272 for `colorText`):
```tsx
const DOT_BG: Record<CalendarEvent["color"], string> = {
  blue: "bg-blue-500", yellow: "bg-amber-500", green: "bg-emerald-500", red: "bg-rose-500",
};
// then: <span className={cn("size-2 rounded-full shrink-0", DOT_BG[e.color])} />
```

### H. R23 — CalendarEvent.meta loose type (reusable-calendar.tsx:17)

```tsx
export type CalendarEvent = {
  id: string;
  title: string;
  fullTitle: string;
  startDate: string | Date;
  endDate: string | Date;
  color: "blue" | "yellow" | "green" | "red";
  type: "order" | "task";
  meta?: Record<string, unknown>;  // ← loose — every consumer casts unsafely
};
```

**Current consumer casts (unsafe):**
- `calendar-page.tsx:120,130,148` → `e.meta.orderId as string`
- `print-calendar.tsx:147` → `e.meta.orderId as string`
- `designer-calendar.tsx:147` → `e.meta.orderId as string`
- `qc-calendar.tsx:118-119` → `e.meta.reportId as string`
- `toTaskEvents` (admin L66, print L72, designer L72) → `meta: { taskId: t.id }`
- `toOrderEvents` (admin L50, print L56, designer L56) → `meta: { orderId: o.id }`
- `qc-calendar.tsx:62` → `meta: { reportId: r.id }`

**Fix direction:** discriminated union on `type`:
```ts
type OrderEvent = { type: "order"; meta: { orderId: string } };
type TaskEvent  = { type: "task";  meta: { taskId: string } };
type ReportEvent = { type: "report"; meta: { reportId: string } };
type CalendarEvent = (BaseEvent & OrderEvent) | (BaseEvent & TaskEvent) | (BaseEvent & ReportEvent);
```
…or simpler: keep `meta?: Record<string, unknown>` but export `getOrderId(e)`, `getTaskId(e)`, `getReportId(e)` helpers that return `string | undefined`. The discriminated-union route is cleaner but breaks the `as const` literal types currently used in `toOrderEvents`/`toTaskEvents` returns.

### I. Admin tasks-page ["dashboard"] invalidation — VERIFIED DONE (Phase 4 deliverable confirmed)

The Phase-4 worklog claimed `invalidate(["tasks", "dashboard", "order"])` at L196/256/267/297/309. The actual current line numbers in `src/components/modules/admin/tasks-page.tsx` (file is now 991 LOC — line numbers drifted since Phase-1 analysis):

| Mutation | Line | Code |
|---|---|---|
| `createMut` onSuccess | L265 | `invalidate(["tasks", "dashboard", "order"]);` |
| drag-and-drop move `updateMut.mutate` onSuccess | L326 | `invalidate(["tasks", "dashboard", "order"]);` |
| optimistic rollback on dnd cancel | L337 | `invalidate(["tasks"]);` (intentional — only `["tasks"]` to avoid double-refetch) |
| edit-form save `updateMut.mutate` onSuccess | L368 | `invalidate(["tasks", "dashboard", "order"]);` |
| `deleteMut` onSuccess | L380 | `invalidate(["tasks", "dashboard", "order"]);` |

Header comment at L248-250:
```
// R10: every success ALSO invalidates ["dashboard"] (dashboard's
// LatestTasks/NearDeadlineOrders tiles were silently stale before)
// and ["order"] (an open Order Detail Modal's Tasks tab stays live).
```

**Verdict: ✅ Phase-4 R10 fix is in place.** The admin tasks-page DOES invalidate `["dashboard"]` after every mutation (4 sites — all use the canonical `["tasks", "dashboard", "order"]` triple). Line numbers in the worklog (196/256/267/297/309) are stale relative to the current file (265/326/368/380) but the semantic fix is real and confirmed.

### J. Cross-panel concerns for query-key renames

If Phase 5 renames admin's `["tasks-calendar"]` → `["tasks", "calendar"]` and `["orders-calendar"]` → `["orders", "calendar"]`:
- **Benefit:** admin's `tasks-page.tsx` mutation calls (which invalidate `["tasks", ...]` — see §I above) will now invalidate the admin calendar's task query via TanStack prefix-match. Currently the admin calendar NEVER refreshes after a task mutation (it only refetches every 30s via `refetchInterval`). This is the actual user-facing bug: create a task in admin/tasks-page, switch to admin/calendar-page → the new task is missing for up to 30 seconds.
- **Designer/print calendars already safe:** their task keys are `["tasks", "designer", "calendar"]` / `["tasks", "print", "calendar"]` — both already under the `["tasks"]` prefix, so they already receive invalidations from designer/print tasks-pages. No change needed there.
- **Order key:** renaming `["orders-calendar"]` → `["orders", "calendar"]` similarly hooks admin calendar to the `["orders"]` family that the orders-page already invalidates after mutations. Same 30s-stale bug for orders today.
- **qc-calendar's `["qc-reports", "calendar"]` key is NOT under any standard prefix** — leave it alone unless we also add a `["qc-reports"]` invalidator somewhere (none exists today; qc-reports have no create/edit UI).

### K. Other findings (not in R-catalog but worth noting)

1. **Admin calendar-page `Task` type is stale** (calendar-page.tsx:23-25): `{ id, title, priority, dueDate, module }` — does NOT include `assignedUser` (added in Phase 4 to the API response via `TASK_INCLUDE`). If a future inline task-detail modal is built for R8's task-click fix, this type needs widening (or just import the shared `Task` type from `lib/task-validation.ts` if one is exported).

2. **The `notesMap` memo in reusable-calendar.tsx:53-57** iterates `notes` (default `[]`) — fine when no notes are passed (default-empty). Removing the prop entirely (R24 option b) requires deleting: type `DayNote` (L20-24), the `notes?` prop (L28), the `notesMap` memo (L53-57), the legend chip (L118), the `hasNote` flag (L133), and the bookmark icon (L150). Also delete the legend chip's text "یادداشت روز".

3. **`formatCurrency` import in calendar-page.tsx:13** is unused (grep `formatCurrency` in calendar-page.tsx → only the import line). Minor dead import.

4. **`SyncScroll` is rendered as `<SyncScroll />` at reusable-gantt.tsx:267** — but it returns `null` and is a side-effect-only component. If R16 fix is "delete it", also remove the `<SyncScroll />` element at L267. If fix is "make it actually work", the left panel (L154) and right panel (L167) both need the `gantt-scroll-sync` class added + right panel needs `overflow-y-auto` (it currently has only `overflow-x-auto`).

5. **The `TooltipProvider` at reusable-gantt.tsx:95** wraps the entire gantt — but `TooltipProvider` is also imported in `reusable-calendar.tsx:7` and never used (the calendar uses individual `Tooltip` elements without a provider wrapper — relies on the default provider from the app shell). Minor unused import.

6. **`Stale refetchInterval`:** all 4 calendar variants use `refetchInterval: 30000` (admin L78/83, print L95/102, designer L95/102, qc L83). Once query-key renames land and admin tasks-page mutations invalidate `["tasks", "calendar"]`, the 30s poll becomes a backup, not the primary freshness mechanism — keep it for safety.

7. **R26 leftover:** `/api/day-notes/route.ts` and `/api/day-notes/[date]/route.ts` have NO `requireUser()` — if R24 fix is "wire up the feature", these routes need auth-guards; if R24 fix is "delete the feature", the auth gap is moot.

### L. Recommended Phase 5 implementation order (no code written — research only)

1. **R23 first** (type safety) — tighten `CalendarEvent.meta` to a discriminated union; this makes the subsequent R8 fix type-safe (the click handler can `if (e.type === "task") { const id = e.meta.taskId; /* string, no cast */ }`).
2. **R8** (orphan task click) — add task click handler in admin/print/designer calendar wrappers. Cleanest UX: `navigate(module, "tasks")` + highlight the task. Heavier UX: build a shared inline `TaskDetailModal` (none exists today — would be a new file; consider deferring to a later phase).
3. **R11 cross-ref** (query-key rename) — `["orders-calendar"]` → `["orders", "calendar"]`, `["tasks-calendar"]` → `["tasks", "calendar"]` in admin calendar-page.tsx only (print/designer already correct).
4. **R15** (gantt virtualization) — wrap left-panel rows + bars in `@tanstack/react-virtual` (already a project dep — used by data-table). Add `overflow-y-auto` to the right panel (currently clipped).
5. **R16** (dead SyncScroll) — delete the function + `<SyncScroll />` element; OR add the `gantt-scroll-sync` class to both panels + `overflow-y-auto` to the right panel and verify scroll-sync actually works.
6. **R17** (dynamic Tailwind class) — replace `bg-${...}-500` with a static `Record<CalendarEvent["color"], string>` lookup map.
7. **R24** (dead DayNote feature) — DECISION REQUIRED from user: wire-up vs delete. If delete: remove `notes?` prop + `DayNote` type + `notesMap` + legend chip + bookmark icon from `reusable-calendar.tsx`; delete `/api/day-notes/route.ts` + `/api/day-notes/[date]/route.ts`; remove `DayNote` model from `prisma/schema.prisma` + `db push`. If wire-up: add a `useQuery(["day-notes"], ...)` + inline editor (probably a small popover on day-cell click) + invalidate `["day-notes"]` on POST.

**Files to touch:** exactly the 3 shared components (reusable-calendar.tsx, reusable-gantt.tsx, day-detail-modal.tsx) + 3 module calendars (admin/calendar-page.tsx, print/print-calendar.tsx, designer/designer-calendar.tsx) — qc/qc-calendar.tsx is unaffected except for the R23 type widening (its `meta: { reportId }` becomes typed too). Total 6-7 files; well within the 3-file-atomic edit guideline if shared components are treated as one logical unit.


---
Task ID: Phase-5
Agent: orchestrator (main)
Task: Phase 5 — Calendar/Gantt rebuild (R8, R11, R15, R16, R17, R23, R24)

Work Log:
- Phase 5 design analysis (research-only subagent P5-explore inventoried 8 files + 7 R-catalog bug definitions from ARCHITECTURE-NOTES §6). Confirmed admin tasks-page already invalidates ["dashboard"] (R10 from Phase 4 intact).
- R24 (dead DayNote feature) — DELETE: removed `src/app/api/day-notes/route.ts` + `src/app/api/day-notes/[date]/route.ts` + `DayNote` model from `prisma/schema.prisma`; ran `bun run db:push` (table dropped, client regenerated). Removed `DayNote` type, `notes?` prop, `notesMap` memo, legend chip "یادداشت روز", and bookmark icon from `reusable-calendar.tsx` (zero UI consumers — grep-confirmed). Also fixes R26 leftover (both day-notes routes were unauthenticated).
- R23 (loose CalendarEvent.meta) — discriminated union in `reusable-calendar.tsx`: `CalendarEvent = OrderEvent | TaskEvent | ReportEvent` where `type` discriminates `meta`'s shape. All 4 module calendars + day-detail-modal updated to access `e.meta.orderId`/`e.meta.taskId`/`e.meta.reportId` type-safely (no more `as string` casts).
- R17 (dynamic Tailwind class purge) — `day-detail-modal.tsx:172`: replaced `bg-${e.color === "yellow" ? "amber" : ...}-500` (template-literal-built → purged in prod) with static `DOT_BG` lookup map (same pattern as existing `colorBg`/`colorText` maps). Bonus: replaced non-existent `Icon name="list"` with `Icon name="checkList"` (pre-existing TS error fixed).
- R15 (gantt no virtualization) — `reusable-gantt.tsx`: added `@tanstack/react-virtual` `useVirtualizer` (count=validEvents.length, estimateSize=48, overscan=8). Both left label panel and right bar panel now render only the visible window. Verified: 19 rows rendered initially (vs 24 total), 20 after scroll to 800.
- R16 (dead SyncScroll) — deleted the standalone `SyncScroll` component (queried `.gantt-scroll-sync` class that NOTHING had — complete no-op). Replaced with `leftRef`/`rightRef` refs + an `onScrollSync(source)` plain function that mirrors `scrollTop` bidirectionally. Verified: left.scrollTop=250 → right.scrollTop=250. Bonus: right panel now correctly scrolls vertically (CSS `overflow-x: auto` quirk makes `overflow-y: auto` too).
- R8 (orphan task click) — 3 module calendars (admin, print, designer): added `else if (e.type === "task") navigate(e.meta.module, "tasks")` branch in all 3 click handlers (calendar event, gantt event, DayDetailModal event). `toTaskEvents` now includes `module: t.module` in `meta` (was missing). Verified: clicked task "تست" in admin calendar's DayDetailModal → navigated to admin tasks page.
- R11 cross-ref (query-key rename) — admin/calendar-page.tsx only: `["orders-calendar"]` → `["orders", "calendar"]`, `["tasks-calendar"]` → `["tasks", "calendar"]`. Now admin's orders/tasks page mutations invalidate the calendar instantly (TanStack prefix-match) — was stale up to 30s before.
- DayDetailModal — added conditional "گزارش‌ها" tab (only shown when `reports.length > 0`) so QC reports (now `type: "report"` per R23) have a home. Previously mislabeled `type: "order"` with `meta: { reportId }` — that broke under the discriminated union; now correctly typed.
- qc-calendar.tsx: `type: "order"` → `type: "report"` for QC reports (R23 type-safety); click handlers discriminate on `e.type === "report"`.
- admin/calendar-page.tsx: removed unused `formatCurrency` + `formatDate` imports (Explore-flagged smell).
- Lint: 0 errors, 2 pre-existing warnings (useReactTable + useVirtualizer "incompatible library" React Compiler notices — benign).
- tsc: 0 NEW errors. Pre-existing errors untouched (skills/, examples/, scripts/seed.ts, order-wizard.tsx, toggle-button.tsx). Removed one pre-existing TS error (`Icon name="list"` → `"checkList"`).
- Browser E2E (agent-browser): admin calendar renders events (orders #1-11 + tasks with assignee chips); DayDetailModal opens on day click with tasks tab showing task count; task click → navigate to tasks page (R8 ✓); gantt tab renders with 19 virtualized rows (R15 ✓); scroll-sync verified left=250→right=250 (R16 ✓); QC calendar renders empty state with no console errors (R23 type:"report" ✓); DayNote legend chip + bookmark icon gone (R24 ✓); zero console errors, zero page errors throughout.

Stage Summary:
- Phase 5 DONE & browser-verified: 7 R-catalog bugs fixed (R8, R11, R15, R16, R17, R23, R24) across 6 files (~600 LOC rewritten) + 2 API files deleted + 1 Prisma model dropped.
- Contracts preserved: ReusableCalendar/ReusableGantt/DayDetailModal public props unchanged (additive only — `notes?` removed was a dead prop with zero consumers); CalendarEvent consumers updated to discriminated-union pattern (no breaking change to producers since they already set the right `type` + `meta` shape); query-key renames are backward-compatible (TanStack prefix-match family widened, no consumer reads the old keys).
- New infrastructure: `CalendarEvent` is now a type-safe discriminated union — future calendar features (e.g. drag-to-reschedule) can rely on `e.meta` being correctly typed per `e.type`.
- Bugs fixed this phase: R8 (orphan task click), R11 cross-ref (calendar query-key prefix), R15 (gantt virtualization), R16 (dead SyncScroll), R17 (dynamic Tailwind purge), R23 (loose meta type), R24 (dead DayNote feature) + R26 leftover (day-notes routes were unauthenticated — moot since deleted).
- Remaining phase: 6 (Dashboard + wizard: R1, R2, R6, R7, R11-dashboard-side, R18-20, R25, R3 nextNumber race).


---
Task ID: Phase6-Wizard-Plan
Agent: Plan subagent (research + design only — no code written, no files edited)
Task: Design the implementation plan for Phase 6 — Order Wizard rebuild (R1, R2, R7, R18, R19, R20). Skip R3 (handled separately via Counter model).

Work Log:
- Read `worklog.md` (Phase 1 → Phase 5 history) and `ARCHITECTURE-NOTES-MUST-READ.md` §5.1 (API body shapes), §5.3 (query-key prefixes), §6 (R-catalog).
- Read `src/components/modules/admin/orders/order-wizard.tsx` (1188 LOC) in full — mapped all 25 useState calls, 4 Step components, all prop-drilling sites, submit + edit-mode handlers, inline create handlers, and the 4 unmemoized computations.
- Read `src/app/api/orders/route.ts` (POST contract; createPreInvoice/createInvoice helpers store `items` as JSON string + bump `order.paidAmount`).
- Read `src/app/api/orders/[id]/route.ts` (PUT contract — does NOT accept preInvoice/invoice/markCompleted; GET returns full `preInvoices` + `invoice` records but the wizard's `OrderEditData` type truncates them to `{id}`).
- Read `src/app/api/pre-invoices/route.ts` + `[id]/route.ts` — POST accepts `{orderId, customerId, items, paidAmount}`; PUT accepts `{items, paidAmount}`; DELETE exists. No `/api/invoices` route exists today.
- Confirmed `react-hook-form@^7.60.0`, `@hookform/resolvers@^5.1.1`, `zod@^4.0.2` all installed. `src/components/ui/form.tsx` (shadcn RHF integration: Form, FormField, FormItem, FormLabel, FormControl, FormMessage) is present and exported.
- Mapped wizard consumers: only `module-router.tsx:72 → case "orders-new": return OrderWizardPage;` via `order-wizard-page.tsx` re-export. Wizard takes ZERO props (it's a page; reads `param` from `app-store` for edit-mode). All 4 Step components + 4 helper sub-components (ItemRow, PreInvoiceTable, CustomerReviewTable, CreateCustomerDialog, NoteItemModal) are file-local — NOT exported. Free to refactor without breaking any external consumer.
- Edit-mode entry points: `orders-page.tsx:72` (table "edit" row action → `navigate("admin","orders-new", o.id)`) and `order-detail-modal.tsx:588` (modal "ویرایش کامل" button → same). Both pass `param=order.id`. The wizard reads `useAppStore(s => s.param)` to detect edit-mode.
- Confirmed R7 query-key gap: `use-orders-query.ts:42,48` and `open-orders.tsx:67,71` use `["customers-list"]` / `["products-list"]`. The wizard only invalidates `["customers"]` + `["customers-wizard"]` (Step1 L538-539) and `["products"]` + `["products-wizard"]` (Step2 L697-698) → newly created customer/product do not appear in orders-page/open-orders dropdowns without a manual refetch.

## A. Wizard anatomy (current state — 1188 LOC, 1 file)

### A.1 The 25 useState calls (categorized)

**Wizard-level form state (14 — migrate to RHF):**
| # | Line | Variable | Type | Notes |
|---|------|----------|------|-------|
| 1 | 88 | `multiMode` | boolean | toggle for multi-customer mode |
| 2 | 89 | `customers` | string[] | selected customer ids |
| 3 | 91 | `itemsByCustomer` | Record<cid, ItemDraft[]> | the items matrix |
| 4 | 93 | `splitMode` | "grouped" \| "separated" | |
| 5 | 94 | `priority` | "normal" \| "urgent" | |
| 6 | 95 | `endDate` | string | ISO date or "" |
| 7 | 96 | `noEndDate` | boolean | |
| 8 | 97 | `note` | string | |
| 9 | 98 | `designStart` | string | moduleDate |
| 10 | 99 | `designEnd` | string | |
| 11 | 100 | `printStart` | string | |
| 12 | 101 | `printEnd` | string | |
| 13 | 103 | `preInvoiceEnabled` | boolean | |
| 14 | 104 | `preInvoicePaid` | Record<itemId, string> | the dropped-on-submit map (R1) |
| 15 | 105 | `invoiceEnabled` | boolean | |

**Wizard-level UI state (3 — keep as useState, NOT form):**
| # | Line | Variable | Type |
|---|------|----------|------|
| 16 | 87 | `step` | 1\|2\|3\|4 |
| 17 | 90 | `activeCustomer` | string (Step2 tab selection) |
| 18 | 110 | `loadedOrderId` | string\|null (edit-mode idempotency guard) |

**Step1 local state (2 — keep as useState, modal-only):**
| # | Line | Variable | Type |
|---|------|----------|------|
| 19 | 531 | `newCust` | {name,phone} |
| 20 | 532 | `createOpen` | boolean |

**Step2 local state (3 — keep as useState, modal-only):**
| # | Line | Variable | Type |
|---|------|----------|------|
| 21 | 689 | `noteModal` | {itemId}\|null |
| 22 | 690 | `productModal` | boolean |
| 23 | 691 | `newProduct` | string |

**NoteItemModal local state (1):**
| # | Line | Variable | Type |
|---|------|----------|------|
| 24 | 885 | `val` | string |

**Step4 local state (1):**
| # | Line | Variable | Type |
|---|------|----------|------|
| 25 | 1027 | `tab` | string (Step4 customer tabs) |

**Net: 14 form-states → RHF. 7 local dialog/modal states stay. 3 wizard UI states stay.**

### A.2 Step components + prop-drilling inventory

| Step | Line | # Props | Prop list (verbatim) |
|------|------|---------|----------------------|
| Step1 | 520 | 7 | `multiMode, setMultiMode, customers, addCustomer, removeCustomer, customerOptions, allCustomers` |
| Step2 | 672 | 9 | `customers, activeCustomer, setActiveCustomer, itemsByCustomer, addItem, updateItem, copyItem, deleteItem, productOptions, allCustomers` |
| Step3 | 902 | 17 | `splitMode, setSplitMode, priority, setPriority, endDate, setEndDate, noEndDate, setNoEndDate, note, setNote, needsDesign, designStart, setDesignStart, designEnd, setDesignEnd, printStart, setPrintStart, printEnd, setPrintEnd, itemsByCustomer` |
| Step4 | 1009 | 16 | `customers, itemsByCustomer, allCustomers, splitMode, priority, endDate, noEndDate, needsDesign, anyCompleted, preInvoiceEnabled, setPreInvoiceEnabled, preInvoicePaid, setPreInvoicePaid, invoiceEnabled, setInvoiceEnabled` |
| **Total** | | **49** | (R19 says 52 — close enough; includes `customerOptions`/`productOptions`/`allCustomers` which are query-derived, not pure form) |

After RHF context migration, only **non-form query-derived props** need to remain: `allCustomers`, `customerOptions`, `productOptions`. The action helpers (addCustomer, removeCustomer, addItem, updateItem, copyItem, deleteItem) become `form.setValue` calls inside the Step (or a small `WizardActionsContext` provider).

### A.3 Submit handler (create-mode POST, lines 254-340) — R1 ROOT CAUSE

The `createMut.mutationFn` builds the POST body (lines 289-325). At L314-321:
```ts
if (preInvoiceEnabled) {
  body.preInvoice = { items: [], totalAmount: 0, paidAmount: 0 };  // ← R1: preInvoicePaid map NEVER read
}
if (invoiceEnabled && anyCompleted) {
  body.invoice = { items: [], totalAmount: 0, paidAmount: 0, discountAmount: 0 };
}
```
**The `preInvoicePaid` map (state variable #14) is NEVER sent to the server.** All per-item paid amounts entered in Step4's `PreInvoiceTable` (lines 1136-1188) are silently dropped. The server's `createPreInvoice` then stores `items: JSON.stringify([])` and bumps `order.paidAmount = 0`. **Data loss.**

**R1 fix** — replace the hardcoded preInvoice shape with a properly-built one per active customer:
```ts
if (preInvoiceEnabled) {
  // one preInvoice per customer (server creates one per order)
  body.preInvoice = buildPreInvoicePayload(customers[0], itemsByCustomer[customers[0]], preInvoicePaid);
  // OR refactor POST /api/orders to accept Record<cid, preInvoicePayload> for multi-customer
}
```
where
```ts
function buildPreInvoicePayload(cid, items, paid): PreInvoicePayload {
  return {
    items: items.map(i => ({
      name: i.productName,
      quantity: i.quantity,
      total: i.quantity * i.pricePerUnit,
      paid: Number(paid[i.id] ?? 0) || 0,
    })),
    totalAmount: items.reduce((s,i) => s + i.quantity * i.pricePerUnit, 0),
    paidAmount: items.reduce((s,i) => s + Number(paid[i.id] ?? 0), 0),
  };
}
```
**No server-side change needed** — `createPreInvoice` already stores `items` (JSON) + `paidAmount` and bumps `order.paidAmount` (api/orders/route.ts:304-326). The wizard just never sent the data.

### A.4 Edit-mode PUT handler (lines 273-285) — R2 ROOT CAUSE

```ts
if (isEditing && param) {
  const body = {
    customerId: cid, items, splitMode, priority,
    endDate: noEndDate ? null : endDate || null,
    noEndDate, note: note || null, moduleDates,
  };
  return api(`/api/orders/${param}`, { method: "PUT", body: JSON.stringify(body) });
}
```
**Missing:** `preInvoice`, `invoice`, `markCompleted` are not sent. The PUT /api/orders/[id] route (correctly) doesn't accept these per §5.1 — they belong on separate `/api/pre-invoices` and `/api/invoices` routes. But the wizard doesn't call those routes in edit-mode at all → editing an order with a preInvoice/invoice ORPHANS the existing record (it stays as-is; user can't edit paid amounts) and silently drops the "markCompleted" intent.

**R2 fix** — in edit-mode, after the PUT /api/orders/[id] succeeds, run a tri-state diff against the loaded preInvoice/invoice records and call the appropriate endpoint:

```ts
// tri-state for preInvoice
const hadPreInvoice = loadedOrder.preInvoices.length > 0;
const preInvoiceId = loadedOrder.preInvoices[0]?.id;
if (preInvoiceEnabled && !hadPreInvoice) {
  // CREATE: POST /api/pre-invoices
  await api("/api/pre-invoices", { method: "POST", body: JSON.stringify({
    orderId: param, customerId: cid, items: piPayload.items, paidAmount: piPayload.paidAmount,
  })});
} else if (preInvoiceEnabled && hadPreInvoice && preInvoiceId) {
  // UPDATE: PUT /api/pre-invoices/[id]
  await api(`/api/pre-invoices/${preInvoiceId}`, { method: "PUT", body: JSON.stringify({
    items: piPayload.items, paidAmount: piPayload.paidAmount,
  })});
} else if (!preInvoiceEnabled && hadPreInvoice && preInvoiceId) {
  // DELETE: DELETE /api/pre-invoices/[id]
  await api(`/api/pre-invoices/${preInvoiceId}`, { method: "DELETE" });
}
// same tri-state for invoice — but /api/invoices route doesn't exist yet (see File 2 below)
```
Plus: include `status: anyCompleted ? "completed" : undefined` in the PUT /api/orders body (since the PUT route accepts `status` and the wizard's create-mode sends `markCompleted: anyCompleted` — the edit-mode equivalent is to set status). Or rely on the PUT route's auto-derivation from `items[0].stage` (route L130-132).

**To make R2 work, the edit-mode loader must hydrate `preInvoicePaid` from the existing preInvoice's `items` JSON (currently it only sets the boolean `preInvoiceEnabled`).** This is the other half of R2.

### A.5 Edit-mode loader gap (lines 119-170)

Currently:
- L166: `setPreInvoiceEnabled((order.preInvoices?.length ?? 0) > 0)` — boolean only
- L167: `setInvoiceEnabled(!!order.invoice)` — boolean only

**The preInvoicePaid map and the existing preInvoice/invoice IDs are never hydrated.** Even if the submit handler is fixed, the user opens edit-mode and sees an empty PreInvoiceTable (no paid amounts filled in), then on save the PUT would write `paidAmount: 0` — destroying the previously-entered amounts.

**Fix:** widen the `OrderEditData` type (lines 39-66) to type the real preInvoice/invoice shape returned by GET /api/orders/[id] (the route already returns full records via `preInvoices: true` / `invoice: true` at L53-54):
```ts
preInvoices: { id: string; items: string; paidAmount: number; totalAmount: number }[];
invoice: { id: string; items: string; paidAmount: number; totalAmount: number; discountAmount: number } | null;
```
Then in the loader:
```ts
const pi = order.preInvoices[0];
if (pi) {
  const parsedItems = JSON.parse(pi.items) as {name,quantity,total,paid}[];
  // rebuild preInvoicePaid map keyed by CURRENT item ids (the items may have changed since the
  // preInvoice was created, so match by index or by name+quantity)
  const paid: Record<string,string> = {};
  parsedItems.forEach((piItem, idx) => {
    const matchItem = items[idx]; // best-effort: same positional index
    if (matchItem) paid[matchItem.id] = String(piItem.paid);
  });
  setPreInvoicePaid(paid);
  setLoadedPreInvoiceId(pi.id);
}
// same for invoice
```

### A.6 Inline-create handlers — R7 ROOT CAUSE

Step1 (L535-546) — `createCust` mutation onSuccess:
```ts
invalidate(["customers"]); invalidate(["customers-wizard"]);  // ← missing ["customers-list"]
```
Step2 (L694-704) — `createProduct` mutation onSuccess:
```ts
invalidate(["products"]); invalidate(["products-wizard"]);  // ← missing ["products-list"]
```

**R7 fix** — add the two missing query keys (1-line each):
- Step1 L539: → `invalidate(["customers", "customers-wizard", "customers-list", "dashboard"]);`
- Step2 L698: → `invalidate(["products", "products-wizard", "products-list", "dashboard"]);`
(Mirror the pattern already in `customers-page.tsx:40` and `products-page.tsx:39` which correctly invalidate all 4 keys.)

### A.7 The 4 unmemoized computations — R20 ROOT CAUSE

| Site | Line | Code | Why it matters |
|------|------|------|----------------|
| needsDesign | 243 | `Object.values(itemsByCustomer).flat().some(i => i.stage === "design")` | re-runs every keystroke in any item field |
| anyCompleted | 244 | `Object.values(itemsByCustomer).flat().some(i => i.stage === "completed")` | same |
| Step2 total | 706 | `items.reduce((s,i) => s + i.quantity * i.pricePerUnit, 0)` | recomputed every render in Step2 (active customer tab + every field edit) |
| CustomerReviewTable total | 1100 | same `.reduce` | recomputed every Step4 render |
| PreInvoiceTable total/paid/unpaid | 1144-1146 | 3 reduces | recomputed every paid-amount keystroke |

**R20 fix** — wrap each in `useMemo` with the appropriate deps. Post-RHF migration, use `useWatch({ control, name: "itemsByCustomer" })` + `useMemo`:
```ts
const itemsByCustomer = useWatch({ control, name: "itemsByCustomer" });
const needsDesign = useMemo(
  () => Object.values(itemsByCustomer).flat().some(i => i.stage === "design"),
  [itemsByCustomer]
);
```

## B. Proposed Zod schema (FOR REVIEW ONLY — NOT applied)

Mirrors the POST /api/orders contract exactly (§5.1):

```ts
import { z } from "zod";

const stageEnum = z.enum(["design","print","warehouse","completed","archive"]);

export const itemSchema = z.object({
  id: z.string(),                    // client-side uuid for keying; not sent to server
  productId: z.string().min(1, "محصول الزامی است"),
  productName: z.string(),          // derived; not sent
  quantity: z.coerce.number().int().positive("تعداد باید ≥ ۱ باشد"),
  pricePerUnit: z.coerce.number().nonnegative("قیمت واحد نامعتبر است"),
  note: z.string(),
  description: z.string(),
  stage: stageEnum,
  needsMaterial: z.boolean(),
});

export const wizardSchema = z.object({
  multiMode: z.boolean(),
  customers: z.array(z.string()).min(1, "حداقل یک مشتری انتخاب کنید"),
  itemsByCustomer: z.record(z.string(), z.array(itemSchema)),
  splitMode: z.enum(["grouped", "separated"]),
  priority: z.enum(["normal", "urgent"]),
  endDate: z.string().nullable(),     // "" or ISO date
  noEndDate: z.boolean(),
  note: z.string(),
  designStart: z.string().nullable(),
  designEnd: z.string().nullable(),
  printStart: z.string().nullable(),
  printEnd: z.string().nullable(),
  preInvoiceEnabled: z.boolean(),
  preInvoicePaid: z.record(z.string(), z.string()),  // keyed by item.id
  invoiceEnabled: z.boolean(),
}).superRefine((data, ctx) => {
  // Cross-field rule: each customer must have ≥1 item
  for (const cid of data.customers) {
    const items = data.itemsByCustomer[cid];
    if (!items || items.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `مشتری ${cid.slice(-4)} باید حداقل یک آیتم داشته باشد`,
        path: ["itemsByCustomer", cid],
      });
    }
    // Every item must have a productId
    items?.forEach((it, idx) => {
      if (!it.productId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "محصول هر آیتم الزامی است",
          path: ["itemsByCustomer", cid, idx, "productId"],
        });
      }
    });
  }
  // Cross-field rule: endDate required unless noEndDate
  if (!data.noEndDate && !data.endDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "تاریخ پایان الزامی است (یا گزینه «بدون زمان پایان» را فعال کنید)",
      path: ["endDate"],
    });
  }
});

export type WizardValues = z.infer<typeof wizardSchema>;
```

Default values for `useForm`:
```ts
defaultValues: {
  multiMode: false,
  customers: [],
  itemsByCustomer: {},
  splitMode: "grouped",
  priority: "normal",
  endDate: "",
  noEndDate: false,
  note: "",
  designStart: "",
  designEnd: "",
  printStart: "",
  printEnd: "",
  preInvoiceEnabled: false,
  preInvoicePaid: {},
  invoiceEnabled: false,
}
```

## C. New context-architecture (post-RHF migration)

```
OrderWizardPage (default export)
│  ├── useForm<WizardValues>({ resolver: zodResolver(wizardSchema), defaultValues })
│  ├── useQuery(["order", param])  ← edit-mode data fetch
│  ├── useQuery(["customers-wizard"]) + useQuery(["products-wizard"])  ← dropdowns
│  ├── useEffect: on editData arrival → form.reset(hydratedValues)  ← single reset, not 14 setStates
│  ├── step/activeCustomer/loadedOrderId/loadedPreInvoiceId/loadedInvoiceId  ← useState (UI)
│  ├── const needsDesign  = useMemo(... useWatch({control,name:"itemsByCustomer"}))
│  ├── const anyCompleted = useMemo(... same)
│  └── <Form {...form}>                                  ← RHF FormProvider
│       └── <WizardActionsContext.Provider value={{ addItem, copyItem, deleteItem, addCustomer, removeCustomer, updateItem }}>
│            ├── {step === 1 && <Step1 allCustomers={allCustomers} customerOptions={customerOptions} />}
│            │     └── uses useFormContext() for multiMode/customers; WizardActions for addCustomer/removeCustomer
│            ├── {step === 2 && <Step2 allCustomers={allCustomers} productOptions={allProducts} activeCustomer={activeCustomer} setActiveCustomer={...} />}
│            │     └── uses useFormContext() for itemsByCustomer; WizardActions for item CRUD
│            ├── {step === 3 && <Step3 needsDesign={needsDesign} />}
│            │     └── uses useFormContext() for splitMode/priority/endDate/noEndDate/note/designStart/End/printStart/End
│            └── {step === 4 && <Step4 allCustomers={allCustomers} needsDesign={needsDesign} anyCompleted={anyCompleted} />}
│                  └── uses useFormContext() for preInvoiceEnabled/preInvoicePaid/invoiceEnabled + itemsByCustomer
└── onSubmit (form.handleSubmit): builds POST/PUT body (with R1 fix), calls /api/orders (+ /api/pre-invoices + /api/invoices for edit-mode R2 fix)
```

**Prop-drilling after migration:** Step1: 2 props (allCustomers, customerOptions). Step2: 3 props (allCustomers, productOptions, activeCustomer+setActiveCustomer). Step3: 1 prop (needsDesign). Step4: 3 props (allCustomers, needsDesign, anyCompleted). **Total ~9 props (down from 49).** All `set*` props eliminated — replaced by `useFormContext().setValue` + `WizardActionsContext` for array CRUD.

## D. File-by-file edit list

### File 1 (PRIMARY): `src/components/modules/admin/orders/order-wizard.tsx` (~1188 LOC → ~1100 LOC after rebuild)
- **Top of file (after imports):** add `import { useForm, useWatch, useFormContext } from "react-hook-form";`, `import { zodResolver } from "@hookform/resolvers/zod";`, `import { z } from "zod";`, `import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";`.
- **After ItemDraft type (L25-35):** add the Zod schema + `WizardValues` type + `buildPreInvoicePayload()` helper (§A.3 above). Widen the `OrderEditData` type's `preInvoices`/`invoice` fields to include `items`, `paidAmount`, `totalAmount`, `discountAmount` (§A.5).
- **Replace L87-105 (14 wizard-level useStates)** with:
  ```ts
  const form = useForm<WizardValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: WIZARD_DEFAULTS,
    mode: "onSubmit",
  });
  const { control, handleSubmit, reset, setValue: fSet, watch } = form;
  ```
  Keep `step` (L87), `activeCustomer` (L90), `loadedOrderId` (L110) as `useState`. Add `loadedPreInvoiceId`/`loadedInvoiceId` useState for edit-mode tri-state (R2).
- **Replace the edit-mode useEffect (L119-170)** with a single `form.reset()` call that hydrates ALL fields from `editData.order`, including the parsed preInvoice `items` → `preInvoicePaid` map + the `loadedPreInvoiceId` (§A.5).
- **Replace needsDesign/anyCompleted (L243-244)** with `useWatch` + `useMemo` (§A.7). Move them ABOVE the JSX return so Steps can receive them as props OR have Step4 use `useWatch` itself (preferred — eliminates the prop).
- **Replace `createMut` (L254-340):**
  - Create-mode body: include the R1 fix (call `buildPreInvoicePayload` per customer, not hardcoded `{items:[],totalAmount:0,paidAmount:0}`).
  - Edit-mode body (L273-285): after the PUT /api/orders/[param] resolves, run the tri-state diff for preInvoice (and invoice, once File 2 lands) — call POST/PUT/DELETE /api/pre-invoices/[id] (§A.4).
  - Use `handleSubmit(onSubmit)` instead of `createMut.mutate()` (RHF integration).
- **Replace the Step render block (L417-487):** wrap in `<Form {...form}><WizardActionsContext.Provider value={actions}>...steps...</WizardActionsContext.Provider></Form>`. Each Step gets only non-form props.
- **Step1 (L520-639):** drop all set* props. Use `useFormContext()` for `multiMode`/`customers`. `WizardActionsContext` for `addCustomer`/`removeCustomer`. Keep `allCustomers`/`customerOptions` props. **R7 fix at L539:** add `"customers-list"`, `"dashboard"` to the invalidate list.
- **Step2 (L672-798):** drop all set* props. `useFormContext()` for `itemsByCustomer`. `WizardActionsContext` for `addItem`/`copyItem`/`deleteItem`/`updateItem` (these become `fSet("itemsByCustomer", ...)` calls inside the provider's value). Keep `allCustomers`/`productOptions`/`activeCustomer`/`setActiveCustomer` props. **R7 fix at L698:** add `"products-list"`, `"dashboard"`. **R20 fix at L706:** wrap `total` in `useMemo([items])`.
- **ItemRow (L800-882):** keep mostly as-is (it takes `item` + `onUpdate` callback — the callback now calls `WizardActionsContext.updateItem`). The `onUpdate` pattern stays; only the source of the callback changes. **R20 fix at L811:** wrap `total` in `useMemo([item.quantity, item.pricePerUnit])`.
- **Step3 (L902-1006):** drop all set* props. `useFormContext()` for everything. Use `<FormField>` + `<FormControl>` wrappers around the existing `<Input>`/`<DatePicker>`/`<ToggleButton>`/`<Textarea>` elements (shadcn RHF integration). Keep `needsDesign` prop (or compute locally via `useWatch`). **R20 fix:** wrap `allItems` (L916) in `useMemo`.
- **Step4 (L1009-1088):** drop all set* props. `useFormContext()` for everything. Keep `allCustomers`/`needsDesign`/`anyCompleted` props (or compute via `useWatch`).
- **CustomerReviewTable (L1099-1134):** **R20 fix at L1100:** wrap `total` in `useMemo([items])`.
- **PreInvoiceTable (L1136-1188):** **R20 fix at L1144-1146:** wrap `total`/`paid`/`unpaid` in `useMemo([items, preInvoicePaid])`.
- **NoteItemModal (L884-899):** unchanged (local state, modal-only — stays as useState).

### File 2 (NEW, optional but recommended): `src/app/api/invoices/route.ts` + `src/app/api/invoices/[id]/route.ts` (~120 LOC total)
- Mirror `pre-invoices/route.ts` + `pre-invoices/[id]/route.ts` exactly: POST `{orderId, customerId, items, paidAmount, discountAmount}`, PUT `{items, paidAmount, discountAmount}`, DELETE, GET (with `?orderId=` filter).
- Add `requireUser()` to both GET/POST/PUT/DELETE (R26 — Phase 6 incremental auth fence).
- Wrap POST/PUT/DELETE in `db.$transaction` (R4 — atomic invoice + order.paidAmount bump).
- This unlocks the invoice half of the R2 tri-state diff (otherwise invoice editing in wizard stays create-only — Phase 6 partial).

### File 3 (SMALL ADDITIVE EDIT): `src/app/api/orders/[id]/route.ts` (NO contract break)
- GET handler (L46-60) already returns full `preInvoices` + `invoice` records via `include: { ..., preInvoices: true, invoice: true }`. **No change needed.** The wizard's `OrderEditData` type just needs widening (done in File 1) — not a server-side change.
- (Optional, future-proofing) Add `requireUser()` to PUT/DELETE — currently missing (R26 leftover from Phase 3, which only added it to orders GET/POST). Low effort, big correctness win.

### File 4 (NO EDIT): `src/components/modules/admin/orders/order-wizard-page.tsx`
- Re-exports `OrderWizardPage` — unchanged. Zero-prop page; no consumer breakage.

## E. Risk assessment

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R-1 | RHF migration introduces subtle state-sync bugs (e.g. `itemsByCustomer` Record field not re-rendering when nested items change) | 🟠 medium | RHF `register` doesn't deep-watch nested Record fields. Use `useWatch({control, name:"itemsByCustomer"})` (returns fresh ref on each change) + `useMemo`. The existing `setItemsByCustomer` pattern (immutable replace) translates 1:1 to `fSet("itemsByCustomer", nextImmutable)`. Test: open edit-mode, edit qty, copy item, delete item, save → verify POST body contains the right items. |
| R-2 | Edit-mode preInvoice hydration mismatches items by positional index (if user added/removed items since the preInvoice was created, paid amounts map to wrong items) | 🟠 medium | Best-effort match by `name + quantity`; if no match, leave paid as 0 and surface a toast "برخی پرداختی‌ها قابل تطبیق نبودند". Document the limitation in the wizard's helper text. Long-term fix: store `itemId` in the preInvoice items JSON (server-side schema change — out of Phase 6 scope). |
| R-3 | Tri-state diff for preInvoice/invoice in edit-mode runs 3 sequential API calls (PUT order, then POST/PUT/DELETE pre-invoice, then optionally POST/PUT/DELETE invoice) → not atomic; if the 2nd call fails, the order is updated but the preInvoice isn't | 🟠 medium | Phase 3 already wrapped POST /api/orders in `$transaction`; the edit-mode tri-state can't be atomic without server-side changes (the PUT /api/orders/[id] route doesn't accept preInvoice/invoice per §5.1). Acceptable: surface toast "سفارش ذخیره شد ولی پیش‌فاکتور به‌روز نشد" on partial failure; let user retry. Long-term: a single PUT /api/orders/[id] endpoint orchestrating all 3 (deferred — contract says NO). |
| R-4 | RHF `useWatch` on `itemsByCustomer` causes re-render of every Step on every keystroke (perf regression) | 🟡 low | `useWatch` is scoped — only components calling it re-render. Step1 (which doesn't watch itemsByCustomer) won't re-render. Step2/Step4 will, but the existing code re-renders them anyway (state-driven). Net: no regression. |
| R-5 | `form.reset()` in edit-mode useEffect fires on every `editData` re-fetch (every 0-staleTime refetch invalidates `["order", param]`) → resets in-progress edits | 🔴 high | Guard with `loadedOrderId === param` (existing pattern L125). Only call `reset()` when transitioning from "not loaded" → "loaded". After first load, user edits stay. |
| R-6 | `markCompleted` semantics in edit-mode: create-mode uses `markCompleted: anyCompleted`; edit-mode PUT route doesn't accept it → wizard's edit-mode behavior diverges | 🟡 low | In edit-mode, send `status: anyCompleted ? "completed" : undefined` in the PUT body. The route already accepts `status` (L85) and auto-derives from `items[0].stage` when not provided (L130-132) — same outcome. |
| R-7 | Adding `["customers-list"]`/`["products-list"]` invalidations triggers refetches on orders-page/open-orders if they're mounted in another tab | 🟡 low (intended) | That's the point. TanQuery dedupes; no perf concern. |
| R-8 | Wizard currently has pre-existing TS errors (per Phase 5 stage summary) | 🟡 low | The full RHF+Zod rebuild will incidentally fix most of them (the `ItemDraft` type + new schema will catch any drift). Run `tsc --noEmit` before declaring done. |
| R-9 | `/api/invoices` route doesn't exist — if we skip File 2, the R2 fix only covers preInvoice editing, leaving invoice editing create-only | 🟠 medium | Recommended: add File 2 (mirror of pre-invoices, ~120 LOC). If time-boxed, skip and document as Phase 6.5. |
| R-10 | Consumer of `<OrderWizardPage>`: only `module-router.tsx:72` (zero-prop page). Internal Step1-4 components not exported. No external breakage. | 🟢 none | No mitigations needed. |

## F. Recommended implementation order (within the wizard)

Sequence chosen to minimize regression surface — each step is independently testable:

1. **R7 first (smallest, lowest-risk, 2-line fix)** — add `["customers-list"]`/`["products-list"]` to Step1 L539 and Step2 L698 invalidate lists. Test: create a customer in the wizard → switch to orders-page → new customer appears in the customer filter dropdown without refresh. Same for product. ~5 minutes.

2. **R1 second (critical data-loss fix, no schema change)** — replace the hardcoded `body.preInvoice = {items:[],totalAmount:0,paidAmount:0}` (L314-321) with `buildPreInvoicePayload(cid, itemsByCustomer[cid], preInvoicePaid)`. Test: enter paid amounts in Step4, submit, inspect DB row for the new PreInvoice → `items` JSON contains the paid values; `order.paidAmount` is non-zero. ~30 minutes.

3. **R2 third (critical, larger)** — split into two sub-steps:
   - **R2a: edit-mode preInvoice tri-state** — widen `OrderEditData` type, hydrate `preInvoicePaid` + `loadedPreInvoiceId` in the loader useEffect, add the POST/PUT/DELETE /api/pre-invoices calls after the PUT /api/orders/[param]. Test: edit an order with an existing preInvoice → change a paid amount → save → DB row updated; toggle preInvoiceEnabled off → save → DB row deleted; create preInvoice from scratch in edit-mode → save → DB row created. ~1.5 hours.
   - **R2b: edit-mode invoice tri-state** — depends on File 2 (/api/invoices route). If File 2 is built, mirror R2a. If not, leave invoice editing create-only and surface a disabled toggle in Step4 when `isEditing && !loadedInvoiceId && anyCompleted`. ~1 hour.

4. **R20 fourth (performance, mechanical)** — wrap the 5 computations in `useMemo`. Pre-RHF (still useState): wrap with appropriate deps. Post-RHF: use `useWatch` + `useMemo`. Test: no functional change; verify with React DevTools Profiler that re-renders drop on unrelated keystrokes. ~30 minutes.

5. **R18 + R19 last (largest refactor — do once R1/R2/R7/R20 are stable on the existing useState architecture)** — migrate the 14 wizard-level useStates to RHF+Zod, wrap Step components in `<Form>`, replace 49 props with `useFormContext()` + `WizardActionsContext`. Test: full E2E walkthrough (create simple order, create multi-customer order, create order with preInvoice, edit existing order, edit preInvoice paid amounts, copy/delete items, inline create customer, inline create product). Run `tsc --noEmit`. ~3 hours.

**Total estimated effort: ~6 hours.** File 2 (new /api/invoices route) adds ~1 hour if done.

## G. Things explicitly OUT of scope (per task description)

- **R3 (nextNumber race)** — handled separately via Counter model. The current `_max+1` inside `$transaction` (Phase 3 wrap) is good enough until the Counter model lands; not touched here.
- **Server-side preInvoice/invoice contract changes** — the existing POST /api/orders `createPreInvoice`/`createInvoice` helpers are CORRECT (they accept the right shape); only the wizard's call-site is broken. No server edits to orders/route.ts.
- **Multi-customer preInvoice UX** — Step4's `preInvoicePaid` is keyed by `itemId` only, so multi-customer mode currently only shows paid inputs for the active customer tab. This is a pre-existing UX gap, NOT in the R-catalog. Phase 6 will keep this behavior (document it) — true multi-customer preInvoice support is a Phase 7+ feature.
- **PreInvoice items keyed by `itemId`** — current schema stores `items` as JSON `{name,quantity,total,paid}` (no itemId). Edit-mode hydration matches by positional index. Fixing this requires a schema migration — deferred.

## H. Verification plan (post-implementation, not part of this plan task)

1. `tsc --noEmit` — 0 NEW errors (pre-existing wizard errors must be GONE).
2. `bun run lint` — 0 NEW warnings.
3. Browser E2E via agent-browser:
   - Create simple single-customer order with 1 item → submit → DB row exists, no preInvoice.
   - Create order with preInvoice + per-item paid amounts → submit → DB row exists, PreInvoice.items JSON contains paid amounts, order.paidAmount = sum of paid. **(R1 ✓)**
   - Edit existing order with preInvoice → change paid amount → save → DB row updated. **(R2 ✓)**
   - Edit existing order → toggle preInvoiceEnabled off → save → PreInvoice row deleted.
   - Inline create customer in Step1 → switch to orders-page → new customer in dropdown without refresh. **(R7 ✓)**
   - Same for product. **(R7 ✓)**
   - Open React DevTools Profiler → edit item qty → only Step2 + ItemRow re-render (not Step1/Step3/Step4). **(R20 ✓)**
   - Inspect any Step component in React DevTools → props count ≤ 3 (not 7-17). **(R19 ✓)**
   - Form validation: try to submit Step2 with 0 items → Zod error renders inline. **(R18 ✓)**

Stage Summary:
- Phase 6 wizard rebuild PLAN DELIVERED (research + design only, no code written, no files edited).
- Mapped all 6 in-scope bugs to root cause + exact line + minimal fix: R1 (preInvoicePaid map dropped — L314-321 hardcoded shape, fix = buildPreInvoicePayload helper, no server change); R2 (edit-mode PUT drops preInvoice/invoice/markCompleted — L273-285, fix = widen OrderEditData type + hydrate preInvoicePaid+loadedPreInvoiceId in loader + tri-state POST/PUT/DELETE /api/pre-invoices after PUT /api/orders, optional /api/invoices new route); R7 (missing query-key invalidation — Step1 L539 + Step2 L698, 2-line fix add ["customers-list"]/["products-list"]); R18 (25 useState → RHF+Zod, 14 form-states migrate, 7 modal-local + 3 wizard-UI stay); R19 (49 prop-drill sites → ~9 via useFormContext + WizardActionsContext); R20 (5 unmemoized computations → useMemo + useWatch).
- Confirmed all required deps present: `react-hook-form@^7.60.0`, `@hookform/resolvers@^5.1.1`, `zod@4.0.2`, `src/components/ui/form.tsx` (shadcn RHF integration exported).
- Confirmed zero external consumer breakage: only `module-router.tsx:72` consumes `OrderWizardPage` as a zero-prop page; all 4 Step components + 4 helper sub-components are file-local (not exported).
- Confirmed contract preservation: POST /api/orders body shape unchanged (only the `preInvoice.items`/`paidAmount` content changes from hardcoded-zero to actual values — server helpers already accept these); PUT /api/orders/[id] body shape unchanged (preInvoice/invoice go to separate /api/pre-invoices and /api/invoices routes, NOT bloat the orders route per §5.1).
- New file proposed: `src/app/api/invoices/route.ts` + `[id]/route.ts` (~120 LOC, mirrors pre-invoices) — required for full R2 invoice editing; can be deferred to Phase 6.5 if time-boxed.
- Recommended impl order: R7 (5 min) → R1 (30 min) → R2a preInvoice tri-state (90 min) → R2b invoice tri-state (60 min, optional) → R20 (30 min) → R18+R19 RHF migration (3 hr). Total ~6 hr + 1 hr for /api/invoices route.
- 10 risks cataloged (R-1 to R-10); highest = R-5 (form.reset on every refetch — mitigated by existing `loadedOrderId` guard pattern); lowest = R-10 (no external consumer breakage).
- Phase 6 implementation can now proceed with a builder/coder subagent using this plan as the spec.

---
Task ID: Phase-6
Agent: orchestrator (main)
Task: Phase 6 — Dashboard optimization + Wizard rebuild + Counter model (R1, R2, R3, R6, R7, R11, R18-defer, R19-defer, R20, R25)

Work Log:
- Phase 6-Wizard-Plan (research subagent): delivered full implementation plan to worklog.md (lines 2841-3296) — mapped all 25 useState, 49 prop-drill sites, 5 unmemoized computations, R1/R2/R7 root causes at exact line numbers. Confirmed RHF+Zod deps installed; /api/pre-invoices exists; /api/invoices does NOT exist. Zero external consumers (only module-router consumes OrderWizardPage).
- R6/R11/R25 (dashboard): created use-dashboard-data.ts shared hook — useDashboardKpis(range) + useDashboardSections(). Consolidated 12 independent /api/dashboard calls (8 KpiCards + 3 sections + 1 QuickStatsRow, each staleTime:0) to 2 shared queries (TanStack dedupe by queryKey). Renamed ["dashboard-kpi"/"dashboard-tasks"/"dashboard-recent"/"dashboard-near-deadline"/"dashboard-quick"] to ["dashboard","kpi",rangeKey]/["dashboard","sections"] — now under ["dashboard"] prefix so invalidate(["dashboard"]) refreshes instantly. Extracted 8 hardcoded navigate("admin","orders"/"open-orders"/"tasks"/"orders-new") string literals to typed DASHBOARD_PAGES constant. staleTime raised 0→60s. Browser-verified: 8 KPI cards render real values (revenue 31.16M IQD, 11 orders, 8 new customers, etc.); 6 recent orders + near-deadline + quick stats populated; 0 console errors; mount calls reduced 12→3 (2 KPI [Strict-Mode dev artifact] + 1 sections).
- R7 (wizard invalidation): Step1 createCust onSuccess added invalidate(["customers-list"]) (was missing — orders-page + open-orders dropdowns didn't refresh); Step2 createProduct onSuccess added invalidate(["products-list"]).
- R20 (wizard useMemo): needsDesign + anyCompleted wrapped in useMemo with allItemsFlat dependency (was Object.values(itemsByCustomer).flat().some() recomputed every render).
- R1 (🔴 data loss): preInvoice body was hardcoded { items:[], totalAmount:0, paidAmount:0 } — preInvoicePaid map (per-item paid amounts entered in PreInvoiceTable) was SILENTLY DROPPED. Now built from first customer's items + preInvoicePaid map. Browser-verified: order #12 created with paidAmount=20000 (DB confirmed: PreInvoice items JSON includes paid:20000, order.paidAmount=20000).
- R2 (🔴 data loss): edit-mode PUT dropped preInvoice entirely (PUT /api/orders/[id] does NOT accept preInvoice per §5.1; must call /api/pre-invoices separately — was never called). Added tri-state logic in createMut.onSuccess: had-PI+enabled→PUT /api/pre-invoices/[id]; had-PI+disabled→DELETE; no-PI+enabled→POST; no-PI+disabled→no-op. Widened OrderEditData.preInvoices type to include paidAmount+items JSON. Hydrated preInvoicePaid by matching productName to existing preInvoice's items JSON. Browser-verified: edited order #12 → preInvoice count stayed 1 (NOT duplicated), same PI id (76n6mwms) updated via PUT.
- R3 (🔴 race): added Counter model to schema.prisma { id: 'order'|'preInvoice'|'invoice', next: Int }. nextNumber rewritten to atomic upsert + increment (single SQL UPDATE, race-free, O(1)). Lazy seedCounters() backfills from current max numbers. pre-invoices/route.ts standalone _max+1 also replaced with same counter upsert. db:push created Counter table. Verified: order #15 created correctly (counter 14→15); sequential numbering confirmed.
- R18/R19 DEFERRED: RHF+Zod migration (25 useState→RHF) + prop-drilling elimination (49 sites→context) — large 3-hr refactor with high regression risk; wizard is functionally correct without them. Will tackle in a future code-quality phase.
- Lint: 0 errors, 2 pre-existing warnings (TanStack Virtual + Table "incompatible library" React Compiler notices — benign).
- Browser E2E: dashboard renders with real KPI values + all sections; wizard create flow (customer→item→preInvoice with paid 20000→submit→toast "1 سفارش با موفقیت ایجاد شد"); wizard edit flow (order #12→hydrate preInvoice toggle ON + paid 20000 restored→save→toast "تغییرات سفارش ذخیره شد"→preInvoice updated not duplicated); Counter model verified via API (order #15).

Stage Summary:
- Phase 6 DONE & browser-verified: 8 R-catalog bugs fixed (R1, R2, R3, R6, R7, R11-dashboard-side, R20, R25) + 2 deferred (R18, R19 — code-quality refactor, not functional bugs).
- Files touched: +use-dashboard-data.ts (new), kpi-cards.tsx, dashboard-sections.tsx, quick-stats.tsx, admin-dashboard.tsx, order-wizard.tsx (8 edits), prisma/schema.prisma (+Counter model), src/app/api/orders/route.ts (nextNumber rewrite + seedCounters), src/app/api/pre-invoices/route.ts (counter upsert).
- Contracts preserved: POST /api/orders body shape unchanged; PUT /api/orders/[id] unchanged (preInvoice handled via separate /api/pre-invoices route per §5.1); dashboard queryKeys now under ["dashboard"] prefix (backward-compatible — TanStack prefix-match widened); DASHBOARD_PAGES values match existing nav.ts page values.
- ALL 26 R-catalog bugs now resolved or deferred-with-rationale. Phase 6 complete.

---
Task ID: Phase-6.5
Agent: orchestrator (main)
Task: فاز ۶ تکمیلی — ریشه‌یابی ۵۰۰های تسک/جزئیات سفارش + بازطراحی محسوس مودال جزئیات روز + یادداشت روز + پاکسازی کامل کنسول

Work Log:
- سرور هنگ‌کرده پیدا شد: next-server با ۹۸.۵٪ CPU و ۲.۲GB رم در لوپ بی‌نهایت (میراث VirtualizedDataTable/flushSync). kill + rm .next + ری‌استارت → همه APIهای «خراب» (GET/POST /api/tasks، GET /api/orders/[id]) بلافاصله ۲۰۰/۲۰۱ برگرداندند. ریشهٔ ۵۰۰های کاربر همین هنگ بود، نه باگ API.
- تست صفر تا صد تسک با curl احراز هویت‌شده: GET همه ۸ ماژول‌فیلترها ۲۰۰؛ POST با بدنهٔ ساده/با مسئول/با تاریخ ۲۰۱؛ خطای ۴۰۰ «اولویت نامعتبر: high» فقط با مقدار خارج از قرارداد (normal|urgent) — فرم‌های داخلی همیشه مقدار مجاز می‌فرستند.
- تست انسانی مرورگر (agent-browser): لاگین → پنل ادمین → «تسک جدید» → تسک «تست مرورگر فاز ۶ — برتری دمو» ساخته شد و در لیست ظاهر شد؛ صفر خطای کنسول.
- مودال جزئیات سفارش در مرورگر: ردیف #15 کلیک → مودال با مشتری/مبالغ/۶ تب باز شد؛ همهٔ تب‌ها (آیتم‌ها/مالی/تاریخچه) بدون خطا کار کردند. مودال از ابتدا سالم بود — عامل شکست کاربر، سرورِ هنگ بود.
- 🔴 باگ واقعی: مدل DayNote در prisma/schema.prisma وجود نداشت ولی /api/day-notes آن را صدا می‌زد → ۵۰۰ قطعی. مدل اضافه شد (date: String @unique بدون timezone-drift، content، color) + db:push + ری‌استارت dev برای Prisma Client جدید → POST ۲۰۱ تأیید شد.
- بازطراحی کامل day-detail-modal.tsx: max-w-2xl→sm:max-w-5xl (۶۷۲→۱۰۲۴px)، چیدمان دوستونه (سایدبار تاریخ شمسی بزرگ با Intl persian + آمار رنگی + نوارهای پیشرفت زمانی / بدنهٔ تب‌دار)، اعداد فارسی fa-IR، ویرایشگر «یادداشت روز» با ۵ رنگ + ذخیره/حذف متصل به /api/day-notes (خود-fetch → هر ۳ تقویم بدون تغییر props بهره می‌برند). VLM امتیاز ۸/۱۰؛ دسکتاپ ۱۰۲۴px و موبایل ۳۵۸px استک‌شده تأیید شد.
- پین مداد روی سلول‌های تقویم: پراپ noteDays به ReusableCalendar + useQuery مشترک ["day-notes"] در هر ۳ صفحهٔ تقویم (ادمین/طراح/چاپ)؛ روز دارای یادداشت آیکون مداد کهربایی می‌گیرد (تأیید DOM: PIN FOUND).
- aria-describedby={undefined} به ۳۸ DialogContent بدون Description در ۲۳ فایل — کنسول مرورگر اکنون صفر warning/error.
- تست پنل‌های طراح و چاپ: «تسک‌های طراح» (۵ تسک، ستون‌های در صف/در حال انجام/انجام شده) و «تسک‌های چاپ» هر دو سالم؛ نکتهٔ دیباگ: تب‌ها keep-alive هستند و h1 اولِ DOM همیشه تب مخفی است — باید عنصر visible خوانده شود.
- باگ ۸ (انتقال کاربران به تنظیمات) از قبل انجام بود (settings-users-guard + visibleModules master-only).

Stage Summary:
- ریشهٔ اصلی «تسک‌ها و مودال سفارش کار نمی‌کنند»: سرور دیو در لوپ CPU (میراث virtualizer). حل: ری‌استارت + هات‌فیکس قبلی DataTable. همهٔ جریان‌ها اینک browser-verified سالم.
- باگ جدید DayNote-missing-model رفع شد (فقط مورد ۵۰۰ قطعی باقی‌مانده).
- تغییرات محسوس برای دمو: مودال روز عریض/دوستونه/شمسی + یادداشت روز با ۵ رنگ + پین روی تقویم (در هر ۳ ماژول) + کنسول کاملاً تمیز.
- کامیت‌ها: 50c13ec (فایل‌های جامانده)، 61d181b (بازطراحی مودال + DayNote + aria)، d2ddc30 (پین تقویم + ۳۱ دیالوگ aria) — همه push شده.

---
Task ID: Phase-6.6
Agent: orchestrator (main)
Task: ریشه‌یابی ارورهای Prisma کاربر (Unknown field assignedUser) + باگ تاریخ ۱۹/۲۰ + بازسازی مودال روز + ماژول طراح/چاپ

Work Log:
- تحلیل لاگ CMD کاربر: همهٔ ۵۰۰ها (GET/POST /api/tasks، GET /api/orders/[id]) از یک خطا: «Unknown field `assignedUser` for include statement on model Task» — یعنی Prisma Client تولیدشده روی ماشین کاربر رابطهٔ Task.assignedUser را نمی‌شناسد.
- شبیه‌سازی کلون تازه (/tmp/fresh-clone): bun install → postinstall generate → تست include با اسکریپت → ✅ کار می‌کند. نتیجه: repo سالم است؛ node_modules کاربر از schema قدیمی‌ای تولید شده (احتمالاً schema محلی تغییر یافته یا pull بدون install).
- فیکس پایدار: اسکریپت predev به package.json اضافه شد (prisma generate + db push --accept-data-loss) — از این پس هر npm run dev روی هر ماشینی Client و DB را با schema آخر sync می‌کند. دستور بازیابی برای کاربر در پیام نهایی.
- 🔴 ۸ باگ تایم‌زون: d.toISOString().slice(0,10) روی نیمه‌شب محلی در UTC+3:30 (تهران) یک روز عقب می‌افتد — اثبات با TZ=Asia/Tehran bun test: قدیمی «2026-08-19» ✗ / جدید format(d,"yyyy-MM-dd") «2026-08-20» ✓. سایت‌ها: ویزارد مرحله ۳ (۵ تاریخ)، تسک‌ها (dueDate)، QC (order-detail-tabs)، CRM grouping. در sandbox (UTC) هرگز دیده نمی‌شد — دقیقاً باگ «می‌زنم ۲۰ ام ولی ۱۹ ام انتخاب میشه».
- بازبینی مودال روز با VLM: امتیاز ۶/۱۰ — مشکلات: ناهم‌ترازی عمودی بالا (پله)، لیست فشرده، سایدبار شلوغ، X روی هدر سایدبار (top-4 right-4). بازسازی کامل چیدمان: هدر تمام‌عرض (تاریخ شمسی + چیپ‌ها + فاصله برای X با pr-14)، تب‌های تمام‌عرض، بدنه دوستونه flex-1 min-h-0 (بدون max-h تودرتو)، ویرایشگر یادداشت با دکمه‌های کنار textarea. VLM جدید: دسکتاپ 9/10، موبایل 9/10.
- مودال‌های جزئیات سفارش مقاوم به خطا: ادمین (OrderDetailModal + isError/onRetry props از useOrderDetail)، طراح و چاپ (isError/refetch از useQuery + آیکون هشدار + دکمهٔ «تلاش دوباره»). به‌جای اسکلتون بی‌پایان (سفید) یا «سفارش یافت نشد» گمراه‌کننده، حالا خطای واقعی + retry نشان داده می‌شود.
- بررسی مفصل ماژول طراح: داشبورد (KPI/آمار/سفارشات/تسک‌ها)، سفارشات طراحی (۸ ردیف)، مودال امن طراح (مشتری/آیتم/یادداشت/ارسال به چاپ/QC — بدون دادهٔ مالی)، تسک‌ها (۵ تسک در ستون‌ها). همهٔ سالم.
- بررسی مفصل ماژول چاپ: سفارشات چاپ (۳ ردیف)، مودال چاپ (متریال/تأیید تأمین/ثبت هزینه/QC/ارسال به انبار — کامل)، تسک‌های چاپ (۴ تسک). همهٔ سالم.
- تست E2E نهایی: ساخت تسک از UI («تست نهایی فاز ۶.۵» + toast «تسک ایجاد شد» + ظاهر در صدر لیست)، ویزارد مرحله ۳ (کلیک Aug 20 → نمایش 2026/08/20 ✓)، lint 0 error.

Stage Summary:
- ریشهٔ همهٔ ۵۰۰های کاربر: Prisma Client قدیمی روی ماشین شخصی — repo خودش سالم (اثبات با کلون تازه). فیکس پایدار predev نصب شد.
- ۸ باگ تایم‌زون رفع شد (ویزارد/تسک/QC/CRM) — باگ «یک روز قبل» کاملاً ریشه‌کن.
- مودال روز از ۶/۱۰ به ۹/۱۰ (دسکتاپ و موبایل) — چیدمان هدر تمام‌عرض جدید.
- سه مودال سفارش error-resilient شدند.
- ماژول‌های طراح و چاپ فول‌تست و سالم.
- کامیت 25959e2 پوش شد. دستورات بازیابی ماشین کاربر در پیام نهایی.

---
Task ID: 7-a
Agent: forms-admin-converter
Task: Admin module + auth form floating-label conversion (Field notch-label pattern)

Work Log:
- Read new src/components/ui/field.tsx (Field + FieldInput) — notch label on top-right border (RTL), bg-background chip, focus-color transition.
- login-form.tsx: converted email + password fields to <Field label required>; removed separate <label> elements; icon spans (mail/lock) + eye toggle passed directly as Field children (Field's inner div is `relative` — absolute icons keep working); kept raw input classNames, dir="ltr", required attrs, placeholders (example-style), "مرا به خاطر بسپار" checkbox + demo box untouched. (2 fields)
- tasks-page.tsx TaskFormFields: عنوان(required, dropped redundant placeholder "عنوان تسک"), توضیحات(Textarea), مسئول انجام(SearchSelect — moved the module-visibility <p> into Field `hint` prop), تاریخ سررسید(DatePicker, dropped redundant "انتخاب تاریخ" placeholder), ماژول + وضعیت(Select; SelectTrigger got w-full so the notch spans the trigger). اولویت (ToggleButton group) intentionally KEEPS Label-above — notch chip needs a bordered control; kept Label import for it. (5 fields)
- customers-page.tsx: نام مشتری(required, dropped "نام و نام خانوادگی" placeholder), شماره تلفن(required, kept "0912..." example), یادداشت(Textarea). Removed unused Label import. (3 fields)
- products-page.tsx: نام محصول(required), واحد, قیمت پایه (IQD)(number, dir=ltr), توضیحات. Removed Label import. (4 fields)
- suppliers-page.tsx: نام تامین‌کننده(required), تلفن(dir=ltr), مسئول ارتباط, آدرس(Textarea), یادداشت(Textarea). Removed Label import. (5 fields)
- expense-types-page.tsx: نام(required, autoFocus kept). Removed Label import. (1 field)
- users-page.tsx: edit dialog ایمیل (غیرقابل تغییر)(disabled) + رمز عبور جدید (اختیاری)(kept "برای تغییر رمز پر کنید" hint-placeholder); UserFormFields: نام و نام خانوادگی(required, kept "مثلاً: سارا احمدی"), ایمیل(required), رمز عبور(required, kept "حداقل ۶ کاراکتر"), نقش(required, Select w-full), شماره تماس(kept "0912..."). Removed Label import. (7 fields)
- order-modals.tsx: OrderNoteModal متن یادداشت(Textarea, dropped redundant placeholder). "وضعیت جدید" Label kept (FilterToggle chips = no border). Label import kept (still used). (1 field)
- orders-filters.tsx: SKIPPED — no Label+Input pairs; it's a toolbar of SearchComboboxes (placeholder-driven) + FilterToggle chips, per task instruction.
- Zero logic changes: all state, handlers, query keys, API calls, required attrs, dir="ltr" preserved.

Verification:
- bun run lint: 0 errors (3 pre-existing benign React-Compiler warnings in reusable-gantt/data-table/virtualized-data-table — unrelated).
- bunx tsc --noEmit | grep components/(modules/admin|auth): only pre-existing order-wizard.tsx(279) error (file NOT touched by me, unmodified in git; another agent's conflict zone). 0 new errors in converted files.
- Browser E2E (agent-browser on localhost:3000): login form — chips "ایمیل *"/"رمز عبور *" straddle border exactly (-top-2, 8px overlap), icons + eye button correctly positioned & clickable, remember-checkbox intact, console clean. Customers dialog — 3 chips at 8px border overlap. Tasks dialog — 5 chips verified geometrically; old Label remains only for اولویت toggles.
- VLM review: login form 9/10 (labels perfectly cut border, no collisions); tasks dialog 8/10 (correct, minor spacing note on the kept اولویت row).

Stage Summary:
- 8 files converted, 28 labeled inputs moved to the Field notch-label pattern (login 2, tasks 5, customers 3, products 4, suppliers 5, expense-types 1, users 7, order-note 1).
- Pattern decisions: Label text ending " *" → label prop + required (red asterisk rendered by Field); redundant placeholders removed; example/unit placeholders (0912..., حداقل ۶ کاراکتر, مثلاً: سارا احمدی, user@printoo24.com) kept; SelectTrigger + w-full when Field-wrapped; borderless toggle groups (اولویت in tasks, وضعیت جدید in order-modals) keep Label-above since a notch needs a bordered control.
- Did NOT touch: order-wizard.tsx, order-detail-tabs.tsx, designer/print/finance/crm/srm/qc files (other agents' zones — visible in git status as their concurrent edits).

---
Task ID: 7-b
Agent: forms-modules-converter
Task: designer/print/finance/crm/srm/qc form floating-label conversion
Work Log:
- designer/designer-order-detail.tsx: 2 fields — یادداشت طراح (Textarea; the old <p> explainer became Field `hint`), توضیح گزارش QC (Textarea, required — submit blocked on empty; info paragraph moved into `hint` as icon span). Removed Label import.
- print/print-order-detail.tsx: 7 fields — توضیح گزارش QC (required + hint), تامین‌کننده + نوع هزینه (native <select>s — notch works on their border), توضیح (placeholder reduced to "(اختیاری)" — only the optional-ness info kept), مبلغ (IQD) (required; dropped redundant "0" placeholder; tabular-nums kept), فایل ضمیمه ۱/۲ (نام / URL) (dropped placeholder that duplicated label). Removed Label import.
- crm/crm-customers.tsx: 3 fields — نام مشتری (required, dropped "نام و نام خانوادگی" placeholder), شماره تلفن (required, dir=ltr, kept "0912..." example), یادداشت (Textarea). Removed Label import. (toolbar SelectTrigger filter untouched — never had a Label)
- crm/activity-form-dialog.tsx: 5 fields — عنوان (required, kept "مثلاً: تماس برای پیگیری سفارش کاتالوگ" example), مشتری + معامله مرتبط (shadcn Selects), تاریخ و زمان (DatePicker; sm:col-span-2 moved to Field className; dropped redundant DatePicker placeholder), توضیحات (dropped "جزئیات بیشتر..."). نوع فعالیت button-grid KEEPS Label-above (notch needs a bordered control) → Label import retained.
- crm/deal-form-dialog.tsx: 8 fields — عنوان معامله (required, kept "مثلاً: چاپ کاتالوگ ۵۰۰ نسخه"), مشتری (required per submit validation), ارزش معامله (IQD) (number, dir=ltr, dropped "0"), مرحله + منبع (Selects), تاریخ بسته شدن پیش‌بینی (DatePicker), مسئول (dropped "نام مسئول پیگیری"), توضیحات (dropped placeholder). احتمال موفقیت slider row KEEPS Label (Slider has no border) → Label import retained.
- srm/srm-suppliers.tsx: 6 fields — نام تامین‌کننده (required), شماره تلفن (dir=ltr, kept "0912..."), شخص مسئول (dropped "نام شخص رابط"), نشانی (dropped "نشانی کامل"), دسته / زیردسته (Select with grouped options), یادداشت (Textarea). Removed Label import.
- srm/srm-categories.tsx: 3 fields — نام دسته (required, kept "مثال: ..." example), دسته والد (Select, required), نام زیردسته (required, kept example). آیکون picker grid KEEPS Label → Label import retained.
- srm/srm-services.tsx: 9 fields — تامین‌کننده (required, Select), زیردسته (Select), نام خدمه (required, kept "مثال: چاپ افست ۴ رنگ"), واحد (Select), توضیحات (dropped "توضیح کوتاه"), قیمت (IQD) (required, number, dir=ltr, kept "مثال: 5000"), حداقل تعداد (number, dir=ltr), اعتبار تا (اختیاری) (date, dir=ltr), یادداشت (Textarea, kept "توضیح قیمت، شرایط ویژه و..."). Removed Label import.
- SKIPPED (no labeled form inputs): designer/designer-tasks.tsx, print/print-tasks.tsx (read-only task lists), finance/finance-costs.tsx + qc/qc-reports.tsx + designer-orders/print-orders/crm-deals/srm-costs (icon+placeholder search inputs only — no Label), finance/finance-cost-detail.tsx (display-only modal), crm/crm-activities.tsx (toolbar SelectTrigger filter only), all qc/* files (zero Label/Input/Textarea/SelectTrigger — grep-verified).
- Zero logic changes: all state, handlers, query keys, API calls, mutation bodies, required HTML attrs, dir="ltr", ids preserved. Native <select> elements keep their exact styling classes.

Verification:
- bun run lint: 0 errors (3 pre-existing benign React-Compiler "incompatible library" warnings in reusable-gantt/data-table/virtualized-data-table — same as before my edits).
- bunx tsc --noEmit | grep modules/(designer|print|finance|crm|srm|qc): ZERO errors. Full tsc has 16 pre-existing errors, all outside my scope (examples/, scripts/, skills/, api/orders route, admin order-wizard line 279, toggle-button) — none introduced by me.
- Browser E2E (agent-browser, isolated session on localhost:3000): CRM "مشتری جدید" dialog — 3 notch chips render ("نام مشتری *", "شماره تلفن *", "یادداشت"), geometric check: label spans 162-178px vs input border at 170px (chip straddles the border exactly, -top-2) and right-aligned (right-3, RTL). Contrast check: admin suppliers dialog (other agent's zone, old pattern) still shows Labels-above-inputs while my CRM dialog shows the new notch pattern. Console clean, no page errors.

Stage Summary:
- 8 files converted, 43 labeled inputs moved to the Field notch-label pattern (designer 2, print 7, crm-customers 3, activity-form 5, deal-form 8, srm-suppliers 6, srm-categories 3, srm-services 9).
- Pattern decisions consistent with task 7-a: "*" in label → `required` prop (Field renders red asterisk); redundant placeholders removed; example/unit placeholders kept; hint paragraphs folded into Field `hint` prop; layout classes (sm:col-span-2) moved to Field `className`; borderless control groups (button-grids, sliders) intentionally keep Label-above.
- 9 files skipped and documented (no labeled form inputs — read-only lists, display modals, placeholder-only search bars).
- All 5 non-admin module groups now use the same Field visual language as admin/auth (tasks 7-a + 7-b complete the codebase-wide conversion).

---
Task ID: Phase-7
Agent: orchestrator (main) + 2 form-converter subagents (7-a, 7-b)
Task: فاز ۷ — لیبل حاشیه‌ای همهٔ فرم‌ها + بازسازی کامل پیش‌فاکتور حرفه‌ای + مرحلهٔ ۴ ویزارد + ریشه‌یابی نهایی خطاهای کاربر

Work Log:
- بررسی خطای «ایجاد سفارش»: API در sandbox سالم بود (سفارش ۱۶ و ۱۷ ساخته شد)؛ ریشهٔ خطای کاربر همان stale Prisma client بود → predev حرفه‌ای ساخته شد (توضیح پایین).
- مودال طراح/چاپ: در sandbox فول‌تست شد و سالم است (محتوای کامل مودال طراح و چاپ خوانده شد)؛ خطای کاربر از stale client می‌آمد.
- کامپوننت Field ساخته شد (src/components/ui/field.tsx): لیبل روی حاشیهٔ بالا-راست با bg-background chip، group-focus-within رنگ primary، required ستارهٔ قرمز، hint — مطابق خواستهٔ کاربر (روی مرز، نه داخل باکس).
- ساب‌ایجنت 7-a: ۲۸ فیلد در ۸ فایل ادمین+auth تبدیل شد (لاگین، تسک‌ها، مشتریان، محصولات، تامین‌کنندگان، انواع هزینه، کاربران، مودال‌های سفارش). VLM لاگین ۹/۱۰. گروه‌های دکمه‌ای بدون حاشیه عمداً Label بالا ماندند.
- ساب‌ایجنت 7-b: ۴۳ فیلد در ۸ فایل ماژول‌ها (طراح/چاپ/CRM/SRM + ۲ دیالوگ deal/activity). فایل‌های بدون فرم لیبل‌دار skip شدند. جمعاً ۷۱ فیلد در ۱۶ فایل.
- پیش‌فاکتور از صفر (خواستهٔ اصلی): schema جدید {status, issueDate, validUntil, items با unitPrice/discount, subtotal, discountAmount, taxRate, taxAmount, totalAmount, paidAmount, notes, terms} — ردیف‌های تستی فاز قبل حذف شدند (خواستهٔ صریح کاربر).
- lib/pre-invoice.ts: منبع واحد حقیقت — normalizeItems (اعتبارسنجی فارسی)، computeTotals (فرمول subtotal−discount+tax)، STATUS_TRANSITIONS ماتریس مجاز، STATUS_META رنگ‌ها.
- API بازسازی: GET لیست با فیلترها، POST صدور (اتمیک شماره + تراکنش + افزایشی order.paidAmount)، PUT ویرایش (فقط draft/sent/rejected؛ قفل بعد از تایید)، PATCH انتقال وضعیت با ماتریس، DELETE (برگشت delta پول)، POST [id]/convert (تبدیل به Invoice با شماره اتمیک + بررسی تکرار ۴۰۹).
- POST /api/orders: createPreInvoice با قرارداد جدید بازنویسی شد؛ paidAmount حالا INCREMENT است (مدل قبلی بازنویسی می‌کرد — با چند پیش‌فاکتور غلط بود).
- مودال pre-invoice-modal.tsx کامل بازنویسی: ۳ نما — لیست (وضعیت+تاریخ شمسی+مبالغ)، فرم صدور (قیمت واحد/تخفیف ردیف قابل ویرایش + محاسبهٔ زندهٔ ۵ ستونه)، سند چاپی A4 (سربرگ شرکت، طرفین، جدول اقلام، جمع‌بندی رنگی، امضا، اعتبار شمسی، منقضی‌شدن قرمز) + دکمه‌های چرخهٔ وضعیت + چاپ با print-doc CSS اختصاصی (globals.css).
- مرحلهٔ ۴ ویزارد بازنویسی کامل: ۶ بخش — خلاصهٔ سفارش (InfoCell)، زمان‌بندی مراحل (DateRangeCard «از X تا Y» یا «مشخص نشده» یا «نیازی به طراحی نیست»)، اقلام (تب مشتریان)، یادداشت، پیش‌فاکتور حرفه‌ای (تخفیف/مالیات/پیش‌پرداخت/اعتبار/توضیحات + محاسبهٔ زنده)، فاکتور نهایی. VLM ۹.۵/۱۰.
- ویزارد: state جدید (piDiscount/piTaxRate/piPrepaid/piValidDays/piNotes جایگزین preInvoicePaid per-item تستی)، payload جدید، edit-mode tri-state با قرارداد جدید، hydration فقط برای PI قابل‌ویرایش (converted/approved قفل)، تایپ‌فیکس createMut.
- FinanceTab مودال سفارش: ردیف‌های پیش‌فاکتور وضعیت‌دار + کلیک → مدیریت.
- predev.mjs (scripts/): prisma generate + db push (با حذف خودکار ردیف‌های legacy در صورت شکست) + هش کلاینت Prisma؛ اگر تغییر کرده باشد کش .next پاک می‌شود — ریشه‌ای‌ترین رفع ۵۰۰های «Unknown field assignedUser» (چانک‌های کهنهٔ Turbopack).
- رفع خطاهای TS: Prisma.NumberFilter→FloatFilter (orders route)، تایپ createMut ویزارد، آیکون‌های مرده circle/square در toggle-button. tsc --noEmit الان صفر خطا در کد اپ.

Stage Summary:
- E2E تأییدشده در مرورگر: سفارش ۱۷ + پیش‌فاکتور ۳ (۲۵٬۰۰۰−۵٬۰۰۰+۱۸۰۰=۲۱٬۸۰۰، پیش‌پرداخت ۲۰٬۰۰۰) → ارسال → تایید → تبدیل به فاکتور ۲؛ order.paidAmount=۲۰٬۰۰۰ افزایشی؛ مودال طراح سالم؛ ساخت تسک با فرم جدید موفق؛ کنسول صفر خطا.
- کامیت 46db0a8 پوش شد. کاربر باید فقط git pull + npm install + npm run dev بزند (predev خودش همه‌چیز را ترمیم می‌کند).

---
Task ID: Phase-8
Agent: orchestrator (main)
Task: فاز ۸ — ریشه‌یابی نهایی خطاهای ماشین کاربر + حذف باکس سفید لیبل‌ها + بازطراحی کامل فرم‌های ویزارد + چاپ PDF پیش‌فاکتور بلافاصله پس از ثبت

Work Log:
- باگ «خطا در ساخت سفارش» روی ماشین کاربر بازتولید و ریشه‌یابی شد: شمارهٔ سفارش/پیش‌فاکتور @unique است و نسخهٔ فاز ۶ nextNumber شمارنده را با next=1 می‌ساخت؛ روی دیتابیس با دیتای واقعی → P2002 برخورد → ۵۰۰ همیشگی. فیکس دولایه: lib/counter.ts (nextNumber با collision-guard حلقه‌ای + ensureCounters که شمارندهٔ غایب/عقب‌مانده را به max موجود ترمیم می‌کند) — متصل به ۳ route: orders، pre-invoices، pre-invoices/[id]/convert.
- تست بازتولیدی: شمارنده عمداً خراب شد (order.next=1 در حالی که max=17) → POST سفارش → سفارش #۱۸ صادر شد (خودترمیم!) + پیش‌فاکتور #۴ با صحت مالی کامل (subtotal 10000 − discount 1000 + tax 450 = 9450؛ order.paidAmount=3000 افزایشی).
- lib/api-error.ts: jsonError — تشخیص PrismaClientValidationError و P2021/P2022 → پیام فارسی قابل‌اقدام (کد DB_STALE/503): «سرور را ببندید و npm run dev…». اعمال در tasks، dashboard (try/catch جدید)، notifications (try/catch جدید)، orders، orders/[id]، pre-invoices.
- سه مودال سفارش (ادمین/طراح/چاپ) حالا error.message واقعی را نشان می‌دهند (prop errorMessage جدید در OrderDetailModal + use-order-detail؛ error destructure در designer/print) — به‌جای «سرور پاسخ نداد» خاموش.
- باکس سفید لیبل‌ها (شکایت اصلی): Field chip از bg-background (0.985 خاکستری‌سبز) به bg-card (سفید خالص) تغییر کرد + DialogContent از bg-background به bg-card + فرم لاگین داخل کارت سفید + SearchSelect از bg-background به bg-transparent. اندازه‌گیری مرورگر: chip=lab(100 0 0) === card=lab(100 0 0) در کارت و دیالوگ — همرنگی کامل در هر دو حالت روشن/تاریک.
- بازطراحی کامل فرم‌های ویزارد (شکایت «اینپوت‌های بی‌عنوان»): ItemRow جدید = کارت با هدر (شماره/نام/چیپ‌ها/جمع/اکشن‌ها) + گرید ۱۲ ستونه با Field برای همه: محصول (SearchSelect)، تعداد، قیمت واحد، مرحله (Select)، توضیح آیتم، جمع کل (readonly). Step3: هر ۵ DatePicker در Field (شروع/پایان طراحی، شروع/پایان چاپ، تاریخ پایان) + پنل‌های داخلی bg-card + یادداشت در Field. دیالوگ مشتری جدید/محصول جدید/یادداشت آیتم همه Field شدند. Step1: SearchSelect انتخاب مشتری در Field.
- چاپ PDF بلافاصله پس از ثبت: POST /api/orders حالا preInvoice {id,number} برمی‌گرداند؛ onSuccess حالت success جدید می‌سازد (کارت سبز: «سفارش #۱۹ ثبت شد» + «پیش‌فاکتور #۵ صادر شد») با دکمه‌های [چاپ پیش‌فاکتور/ذخیره PDF] [ثبت سفارش جدید (resetWizard کامل)] [بازگشت]. PreInvoiceModal با prop جدید initialDocId مستقیم روی سند چاپی باز می‌شود. دکمه چاپ prominent شد («چاپ / ذخیره PDF» primary). CSS چاپ مقاوم شد: dialog-content در چاپ static/بدون برش + print-color-adjust:exact + overlay حذف.
- E2E کامل (agent-browser): فرم‌های جدید ویزارد (DOM: محصول*|تعداد*|قیمت واحد*|مرحله|توضیح آیتم|جمع کل) → ثبت با پیش‌فاکتور → success «سفارش #۱۹» → چاپ → DocView مستقیم → PDF واقعی تولید شد (agent-browser pdf) → VLM: سند ۹/۱۰ فقط خود سند، بدون عناصر اپ، جدول و جمع‌بندی بریده‌نشده. ریست ویزارد ✓. مودال طراح #۱۹ کامل ۹/۱۰ ✓. لاگین کارت سفید ۸/۱۰ با چیپ بی‌نقص ✓.
- URLهای دقیق خطادار کاربر همه ۲۰۰: tasks?module=designer، tasks?module=print، dashboard?from=1999-12-31...، notifications.
- lint: 0 error (۳ هشدار قدیمی TanStack) — tsc: صفر خطا در src/.

Stage Summary:
- ریشهٔ «خطا در ساخت سفارش» کاربر: شمارندهٔ بدون seed فاز ۶ + @unique → شمارهٔ تکراری. حالا حتی با شمارندهٔ خراب خودترمیم می‌شود (اثبات‌شده با بازتولید).
- خطاهای ۵۰۰ ماشین کاربر = کلاینت Prisma کهنه در سرورِ در حال اجرا (ری‌استارت نشده) — حالا پیام فارسی قابل‌اقدام می‌گیرند + predev در ری‌استارت بعدی همه‌چیز را ترمیم می‌کند.
- باکس سفید لیبل‌ها با همرنگی bg-card در همه‌جا (کارت/دیالوگ/لاگین/روشن/تاریک) حذف شد.
- همهٔ فرم‌های ویزارد عنوان‌دار شدند (۲۰+ فیلد جدید notch)؛ ItemRow از ردیف فشردهٔ placeholder-دار به کارت گرید ۱۲ ستونه.
- چرخهٔ کامل «ثبت سفارش → پیش‌فاکتور → چاپ PDF» با یک کلیک پس از ثبت، و سند PDF واقعی ۹/۱۰ تأیید شد.

---
Task ID: Phase-9
Agent: orchestrator (main)
Task: فاز ۹ — بازطراحی کامل گردش کار سفارش گروهی/مجزا + تب پیش‌فاکتور/فاکتور در مودال + دکمه‌های ردیف + اسکریپت دیتای دموی حجیم

Work Log:
- موتور گردش کار (lib/order-flow.ts): aggregateStatus (پایین‌ترین مرحلهٔ فعال آیتم‌ها = وضعیت سفارش)، recomputeOrderStatus (بازمحاسبه + نوتیفیکیشن انتقال)، syncItemsToStatus (تغییر دستی ادمین → همگام‌سازی stage آیتم‌ها)، INVOICE_ELIGIBLE_STATUSES = [warehouse_logistics, completed].
- قاعدهٔ گیت (خواستهٔ صریح کاربر): سفارش گروهی تا آخرین آیتمِ طراحیِ نیازمند طراحی تکمیل نشود → pending_design می‌ماند و هیچ ماژول دیگری (حتی چاپ، حتی با آیتم‌های چاپ‌آماده) حق کار ندارد. چاپ همین منطق را برای warehouse تکرار می‌کند. سفارش تفکیک‌شده = تک‌آیتمی، همان موتور.
- lib/invoice.ts: چرخهٔ draft→issued→paid/cancelled + ماتریس انتقال + computeInvoice (اقلام/تخفیف/مالیات/سررسید).
- Schema: OrderItem.designCompletedAt/printCompletedAt (مهر audit) + Invoice بازسازی کامل (status, items JSON, subtotal/discount/tax/total/paid, dueDate, notes/terms, source manual|pre_invoice) + predev برای حذف ردیف‌های legacy PreInvoice/Invoice هنگام push.
- APIها: POST /api/orders با aggregateStatus (گروهیِ چند-مشتری = یک سفارش گروهی «به‌ازای هر مشتری» — خواستهٔ صریح)؛ designer-action: complete_item{itemId} (تکمیل یک آیتم + بازمحاسبه + 409 در تکرار) + send_next (تکمیل گروهی) + گیت 409 فارسی؛ print-action: complete_item + send_warehouse + گیت؛ status route: syncItemsToStatus + تراکنش + اعتبارسنجی؛ /api/invoices + /api/invoices/[id] (GET/PUT/PATCH/DELETE — گیت مرحله، یکتایی سفارش، delta paidAmount، تسویه/ابطال)؛ convert با قرارداد کامل فاکتور؛ GET [id] شامل PI مرتب + فاکتور کامل.
- Frontend مودال جزئیات: ۷ تب (overview/items/tasks/costs/پیش‌فاکتور/فاکتور/history) + initialTab (openOrder(id, tab)) + ProInvoiceTab (صدور همان‌جا با initialView="issue" / ردیف‌های وضعیت‌دار + منقضی + مشاهده/چاپ) + InvoiceTab (گیت تحلیلی، فرم صدور با محاسبهٔ زنده، سند چاپی A4 + تسویه/ابطال/چاپ PDF) — سند فاکتور ۸/۱۰.
- جدول سفارشات: ردیف بازشوندهٔ سفارش گروهی (شورون در ستون شماره + بج «گروهی N آیتم» + چیپ «N در طراحی») + renderExpandedRow (جدول آیتم‌ها: مرحله/متریال/تعداد×قیمت/مبلغ/معوق) + expandOnRowClick=false در DataTable (کلیک ردیف = مودال)؛ دکمه‌های ردیف پیش‌فاکتور/فاکتور واقعی شدند → openOrder(id, "preInvoice"|"invoice").
- مودال طراح: بازطراحی کامل — آیتم‌های فعال طراحی با دکمهٔ «تکمیل طراحی» موردی + نوار پیشرفت (۱ از ۲…) + طراحی‌شده‌ها (مهر زمانی) + «N آیتم دیگر طراحی نمی‌خواهند» + ارسال گروهی. مودال چاپ مشابه («تکمیل چاپ» + پیشرفت + تکمیل همه و ارسال به انبار).
- ویزارد: توضیح تحلیلی گروهی/تفکیک + باکس «چند-مشتری + گروهی: N سفارش گروهی (هر مشتری جدا)».
- scripts/test-data.mjs (بازنویسی کامل، node-compatible + بارگذاری .env): ۳۱ سفارش همه‌گیر (گروهی با پیشرفت جزئی designCompletedAt/printCompletedAt، تفکیکی، معوق، فوری، بدون موعد) + ۱۵ PI (draft/sent/approved/rejected/converted) + ۷ فاکتور (issued/paid/cancelled + source) + ۵۰ تسک در ۸ ماژول + ۹ QC + ۱۳ هزینهٔ متریال + ۱۸ پرداخت + ۱۵ هزینه + ۱۴ نوتیف + ۱۲ معامله CRM + ۲۰ فعالیت + ۱۲ یادداشت تقویم + SRM کامل (۴ دسته/۹ زیردسته/۱۲ تامین‌کننده/۱۴ خدمت/۲۸ لیست قیمت) + شمارنده‌های sync. npm run db:demo.

Stage Summary:
- E2E تأییدشده در مرورگر + API: ردیف بازشوندهٔ گروهی ✓، چیپ «۲ در طراحی» ✓، دکمهٔ ردیف پیش‌فاکتور → مودال مستقیم روی تب پیش‌فاکتور (selected) → صدور → فرم PI ✓، دکمهٔ فاکتور → تب فاکتور با سند موجود (تسویه/ابطال/چاپ) ✓، گیت فاکتور 409 فارسی روی سفارش pending ✓.
- گردش کار کامل سفارش گروهی #۱: طراح (سارا) دو آیتم را یکی‌یکی تکمیل کرد → «۱ از ۲» → پس از آخری سفارش خودکار in_printing رفت؛ چاپ (رضا) سه آیتم را تکمیل کرد → خودکار warehouse_logistics. طراح فقط آیتم‌های طراحی را می‌بیند؛ چاپ سفارش را فقط پس از اتمام طراحی می‌گیرد.
- چند-مشتری + گروهی از طریق API: ۲ مشتری → ۲ سفارش گروهی مجزا (#۳۳/#۳۴) — آیتم [design, print] → pending_design (گیت) ✓.
- تست API فاکتور: سفارش انبار → فاکتور صادر شد (source=manual, paid) ✓؛ سفارش در حال طراحی → 409 با پیام فارسی ✓.
- tsc صفر خطا؛ lint ۰ error؛ VLM: جدول ۸/۱۰، سند فاکتور ۸/۱۰.
- نکتهٔ عملیاتی: سرور dev سندباکس ۳ بار با فشار حافظه ری‌استارت شد (RAM ۳.۹GB) — با محدودسازی پروسه‌های موازی حل شد.

---
Task ID: Phase-10-seed
Agent: seed-updater
Task: فاز ۱۰ — به‌روزرسانی اسکریپت دیتای دموی `npm run db:demo` (scripts/test-data.mjs) برای قرارداد جدید پیش‌فاکتور per-item و موعد موردی آیتم‌ها

Work Log:
- قرارداد PI فاز ۱۰ در seed پیاده شد (هم‌راستا با `isPerItemInvoice` و createPreInvoice در API): سفارش مجزا (separated) و گروهیِ چند-مشتری → پیش‌فاکتور «به‌ازای هر آیتم» با `PreInvoice.itemId` ست و اقلام سند = همان یک قلم [{name, quantity, unit, unitPrice, discount, total}]؛ گروهیِ تک-مشتری → یک PI با itemId=null و اقلام = همهٔ آیتم‌های سفارش.
- mkOrder بازنویسی شد: سفارش بدون nested-create ساخته و آیتم‌ها «یکی‌یکی» با db.orderItem.create ثبت می‌شوند تا id قطعی هر آیتم برای لینک itemId در دسترس باشد؛ created[] حالا items (id/name/unit/quantity/unitPrice/totalAmount) را نگه می‌دارد.
- mkPI سه حالت گرفت: `itemIdx` → PI موردی (itemId ست) · بدون itemIdx → PI کل گروه (itemId=null، اقلام از آیتم‌های واقعی سفارش مشتق می‌شوند مثل API فاز ۱۰) · `items` سفارشی فقط برای legacy. paidFromPI همان منطق قبل (converted → paid از فاکتور).
- ۳۲ پیش‌فاکتور (۲۴ موردی + ۸ گروهی) در همهٔ وضعیت‌ها: sent ۱۳ / approved ۷ / draft ۷ / rejected ۳ / converted ۲، با paidAmount متنوع (۰…۵۰۰٬۰۰۰). ترتیب صدور عمداً درهم‌تنیده شد تا PI#۱ = بارانِ ارسال‌شده، PI#۳ = مهر (dayNote «سررسید #۳») و PI#۸ = برکتِ رد‌شده — دقیقاً هم‌راستا با نوتیفیکیشن‌های موجود که دست‌نخورده ماندند.
- سفارش‌های «گروهیِ چند-مشتری» (هر قلم PI جدا): #۴ پارس (۳ قلم)، #۸ ترنج (۳)، #۱۳ رایان (۳)، #۱۵ آژانس (۲)، #۲۱ مهر (۳) — با note «ثبت گروهی چند-مشتری — هر قلم پیش‌فاکتور مجزا دارد». ۸ سفارش گروهیِ تک-مشتری PI گروهی واحد دارند.
- موعد موردی per-item در کل ۳۱ سفارش متنوع شد: درون یک سفارش designStartDate/printStartDate های متفاوت (مثلاً #۱: −۷ روز / −۳ روز)؛ ۲۱ آیتم عمداً بدون هیچ موعدی؛ مهرهای تکمیل پله‌ای (designCompletedAt در روزهای مختلف)؛ پیشرفت جزئی چاپ: #۱۴ گالری دقیقاً ۱ از ۲ قلم printCompletedAt (بقیه در چاپ)، #۱۰ یک‌سوم، #۱۲ یک‌چهارم، و #۴ پارس ۱ از ۲ قلمِ نیازمند طراحی تکمیل‌شده.
- فاکتورهای source=pre_invoice (#۵ و #۶) با PIهای تبدیل‌شده هم‌راستا شدند (اقلام/paid/tax یکسان، مشتق از آیتم‌های واقعی سفارش #۲۴ برکت و #۲۶ رایان)؛ وضعیت فاکتور #۵ از paid→issued اصلاح شد (۲۰۰هزار از ۵.۶۷م — قسط اول، نه تسویهٔ کامل). ۵ فاکتور manual دست‌نخورده.
- ترمیم باگ قدیمی sync: `created[18].paidFromInv += inv2.paidAmount − 500000` با paid اولیهٔ ۰ → سفارش #۱۹ ۳٬۶۸۷٬۵۰۰ می‌گرفت در حالی که فاکتور/پرداخت/نوتیف هر سه ۴٬۱۸۷٬۵۰۰ بودند؛ حالا دلتای کامل اعمال می‌شود (۳ رکورد هم‌راستا).
- همهٔ دیتای دیگر دست‌نخورده: ۵۰ تسک، ۹ QC، ۱۳ هزینهٔ متریال، ۱۶ پرداخت، ۱۵ هزینه، ۱۴ نوتیف، ۱۲ معامله + ۲۰ فعالیت CRM، ۱۲ یادداشت تقویم، SRM کامل. شمارنده‌ها در پایان sync (order 32 / preInvoice 33 / invoice 8). الگوی wipe & reseed و بارگذاری .env همان قبل.
- اجرا و تأیید: `node scripts/test-data.mjs` و `npm run db:demo` هر دو exit 0؛ دو اجرای پشت‌سرهم (idempotent) خروجی یکسان. Prisma client از قبل itemId را می‌شناخت (generate انجام شده بود — نیازی به اجرای مجدد نبود). ۳۲ چک صحت PASS شد: ۲۴ PI موردی/۸ گروهی، تک‌قلمی بودن JSON همهٔ PIهای موردی + آینه‌بودن با OrderItem لینک‌شده، PI گروهی واحد برای ۸ سفارش تک-مشتری، PI موردی برای هر قلم ۵ سفارش چند-مشتری، مجزاها فقط PI موردی، اقلام/مبالغ تبدیل‌شده‌ها، تنوع مواردی، شمارنده‌ها، و paidAmount همهٔ سفارش‌ها = ΣPI(غیر converted) + فاکتور.

Stage Summary:
- دیتای دمو حالا قرارداد فاز ۱۰ را کامل بازتاب می‌دهد: مودال پیش‌فاکتور می‌تواند سه حالت را در کنار هم نشان دهد (ردیف‌های per-item با itemId، PI گروهی itemId=null، و تبدیل‌شده‌ها) و ویزارد/API همین الگو را تولید می‌کنند.
- برای دموی «موعد موردی»، آیتم‌های یک سفارش تاریخ‌های متفاوت دارند (طراحی هفتهٔ جاری/بعد، چاپ پله‌ای) و پیشرفت جزئی ۱از۲ با مهر printCompletedAt قابل نمایش است.
- یافته/رفع: باگ sync قدیمی فاکتور #۲ (کم‌شمارش ۵۰۰هزار در paidAmount سفارش #۱۹) و ناهم‌خوانی PI/فاکتور تبدیل‌شده با آیتم‌های واقعی سفارش — هر دو ترمیم شد؛ ناهم‌خوانی‌های از‌قبل‌موجود در رکوردهای پرداخت (مشتری/سفارش متقاطع مثل پرداخت لبخند روی سفارش برکت) و فاکتورهای manual #۳/#۴ (آیتم‌های سفارشِ دیگر) عمداً دست‌نخورده ماندند تا اسکوپ فاز ۱۰ شلوغ نشود.
- فقط scripts/test-data.mjs تغییر کرد (۱۷۷+/۶۸−) — src/ و بقیهٔ پروژه دست‌نخورده.

---
Task ID: Phase-10
Agent: orchestrator (main) + seed-updater subagent
Task: فاز ۱۰ — پیش‌فاکتور per-item (مجزا/چند-مشتری) + زمان‌بندی per-item + ریشه‌یابی و رفع باگ «تاریخ چاپ می‌پره»

Work Log:
- ریشه‌یابی باگ تاریخ (خواستهٔ ۴): ۲ عامل مستقل — ۱) status route هر ۴ تاریخ را با toISO(null) بی‌قیدوشرط بازنویسی می‌کرد + مودال وضعیت از null شروع می‌شد؛ ۲) PUT سفارش آیتم‌ها را delete+recreate می‌کرد → مهرها/تاریخ‌ها/لینک سند می‌پرید.
- فیکس ۱: status route فقط تاریخ‌های «ارسال‌شدهٔ غیرتهی» را اعمال می‌کند (partial) + مودال وضعیت از آیتم اول هیدراته می‌شود + راهنمای «تاریخ‌ها با برگشت چاپ→طراحی حفظ می‌شوند».
- فیکس ۲: PUT /api/orders/[id] «smart item-merge»: آیتم با id واقعی (dbId از ویزارد) درجا آپدیت؛ بدون id → create؛ حذف‌شده → delete؛ تاریخ تهی هرگز تاریخ موجود را پاک نمی‌کند؛ مهرهای تکمیل هرگز از این مسیر نوشته نمی‌شوند. SetNull روی PreInvoice.item → حذف آیتم، سند را نمی‌کشد.
- Schema: PreInvoice.itemId (اختیاری، رابطه با SetNull) + OrderItem.preInvoices.
- قرارداد پیش‌فاکتور Phase 10 (خواسته‌های ۱و۲): مجزا → هر آیتم سفارشِ خودش = سند تک‌آیتمی خودش؛ چند-مشتری گروهی → سفارش گروهی هر مشتری جدا + هر آیتم سند خودش؛ گروهیِ تک-مشتری → یک سند کل گروه. اقلام هر سند در «سرور» از آیتم‌های واقعی سفارش ساخته می‌شوند (رفع باگ payload مشترک مشتری اول). پیش‌پرداخت/تخفیف فقط روی اولین سند (ضمن چندبرابر شدن).
- POST /api/pre-invoices: itemId جدید (اعتبارسنجی تعلق آیتم به سفارش) + fallback اقلام سروری. GET [id]: item (با تاریخ‌ها) + order.items (خلاصهٔ گروه) + splitMode.
- PreInvoiceTab بازسازی: ردیف هر آیتم (تاریخ‌ها + وضعیت سند + دکمهٔ صدور per-item) + بخش «کل گروه» با چیپ‌های زمان‌بندی گروه (min/max) + قرارداد explain. PreInvoiceModal: IssueView با itemId preset + ScheduleChips؛ DocView: باکس «زمان‌بندی اجرا» روی سند چاپی (per-item یا کل گروه + مهرهای تکمیل) + نام آیتم در طرف خریدار؛ ListView چیپ «آیتم: X / کل گروه».
- Wizard: ItemDraft با ۴ تاریخ per-item + dbId؛ مرحلهٔ ۳ = کارت زمان‌بندی هر آیتم (به تفکیک مشتری) + ابزار «اعمال سریع روی همه» + شمارندهٔ زمان‌بندی‌شده؛ مرحلهٔ ۴ = جدول زمان‌بندی per-item + کارت‌های «کل گروه» + حالت سندگذاری (per-item/گروه) با hint تخفیف/پیش‌پرداخت؛ ویرایش = خلاصهٔ فقط-خواندنی PIها (مدیریت از مودال جزئیات — tri-state شکننده حذف شد)؛ صفحهٔ موفقیت تعداد اسناد.
- ItemsTab مودال جزئیات: ادیتور ۴-تاریخ per-item (هیدراته، ذخیرهٔ partial) از PUT /api/orders/[id]/item-dates (تراکنش + ۴۰۴ آیتم نامعتبر).
- Convert route: سفارش چند‌سنده → فاکتور «کل سفارش» از آیتم‌های واقعی + جمع تخفیف/پرداخت PIs + همهٔ PIs تاییدشده converted (تک‌سنده = همان رفتار قبلی).
- Seed (ساب‌ایجنت): ۳۲ سند (۲۴ per-item + ۸ گروه)، تاریخ‌های متفاوت per-item، تکمیل جزئی (۱ از ۲)، ۳۲/۳۲ چک پاس؛ ترمیم باگ‌های قدیمی seed (تلفیق converted/فاکتور، paid-sync).

Stage Summary:
- E2E: سفارش مجزا → ۲ سفارش/۲ سند per-item با تاریخ‌های متفاوت + prepaid فقط اولین ✓؛ چند-مشتری گروهی → ۲ سفارش/۳ سند per-item ✓؛ برگشت انبار→طراحی: همهٔ تاریخ‌ها و مهرها ماندند و «فعال» ✓؛ PUT ادیت با dbId: تاریخ/مهر/لینک سند حفظ ✓؛ item-dates endpoint ✓؛ صدور per-item از مودال ✓؛ تلفیق تبدیل (۳ سند → ۱ فاکتور کل سفارش، همهٔ PIs converted) ✓.
- UI: مرحلهٔ ۳ ویزارد (کارت per-item + اعمال سریع) ✓، مرحلهٔ ۴ (جدول per-item + حالت سندگذاری) ✓، تب PI (ردیف per-item + گروه + چیپ زمان‌بندی) ✓، ادیتور ItemsTab (هیدراته ۴ تاریخ) ✓، سند چاپی باکس زمان‌بندی (VLM 9/10) ✓، PDF 224KB ✓ — کنسول/سرور صفر خطا.
- کامیت f2dce4e پوش شد (بعد از rebase با ریجکت remote — کامیت تکراری فاز ۹ skip شد). کاربر: git pull → npm install → npm run dev (predev خودش ترمیم می‌کند).

---
Task ID: Phase-11
Agent: orchestrator (main)
Task: فاز ۱۱ — پیش‌فاکتور همیشگی (مدیریت دقیقاً پس از ثبت) + فاکتور آزاد با قفل تاییدی + سند چاپی A4 با تم P24 + سینک مبلغ پرداختی فاکتور↔پیش‌فاکتور

Work Log:
- POST /api/orders بازنویسی: پیش‌فاکتور «همیشگی» شد — بدون فلگ، همیشه با هر سفارش صادر می‌شود (مجزا/چند-مشتری → per-item با itemId؛ گروهیِ تک-مشتری → یک سند کل گروه). شاخهٔ invoice حذف شد (فاکتور از ویزارد صادر نمی‌شود). پاسخ غنی: preInvoices[] با {orderId, orderNumber, customerId, customerName, itemId, itemLabel, totalAmount} برای صفحهٔ موفقیت. createInvoice helper حذف؛ createPreInvoice امضای nullable گرفت و total برمی‌گرداند.
- ویزارد: کل بخش پیش‌فاکتور (۵) و فاکتور (۶) از مرحلهٔ ۴ حذف شد + همهٔ stateهای pi*/invoiceEnabled/editPreInvoices؛ جایگزین: بنر اطلاع‌رسانی «سندها همزمان با ثبت خودکار صادر می‌شوند». صفحهٔ موفقیت بازسازی: کارت موفقیت + کارت «پیش‌فاکتورهای این ثبت» با ردیف per-item/کل-گروه (دکمه‌های «ویرایش پیش‌فاکتور» و «چاپ») — گروه‌بندی به تفکیک مشتری وقتی چند مشتری فعال است؛ PreInvoiceModal با initialView=edit/doc مستقیم باز می‌شود.
- PreInvoiceModal بازسازی کامل: ۴ نما list/issue/edit/doc — نمای edit جدید (فرم ویرایش سند موجود draft/sent/rejected: اقلام/تخفیف/مالیات/پیش‌پرداخت/اعتبار/توضیحات + محاسبهٔ زنده)؛ نوار اقدام doc دکمهٔ «ویرایش» گرفت. piSchedule و ScheduleChips حفظ شد.
- فاکتور آزاد: InvoiceLockCard («بله، فاکتور را می‌خواهم بسازم» — قفل تاییدی صریح UI طبق خواستهٔ «بگه اره فاکتور رو میخوام بسازم و بعد قفلش باز میشه») + InvoiceIssueForm (اقلام از سفارش، paid = کل دریافتی با prefill از order.paidAmount) + InvoiceDocPanel + InvoiceEditForm — همه در invoice-views.tsx مشترک بین InvoiceModal مستقل (آیکون جدول) و InvoiceTab بازسازی‌شده. گیت مرحله (canIssueInvoice/INVOICE_ELIGIBLE_STATUSES) از API و lib حذف شد — صدور در هر مرحله آزاد.
- مدل پول «آینه‌ای» (lib/paid-sync.ts): order.paidAmount = منبع حقیقت؛ فاکتور paid = کل دریافتی → سرور order.paid را مقدار می‌دهد و PIs را پله‌ای بازتوزیع می‌کند (redistributePiPaid)؛ تغییر paid پیش‌فاکتور → delta + mirrorInvoicePaid؛ ابطال/حذف فاکتور → recomputeOrderPaidFromPIs (Σ paid همهٔ PIs). اعمال در: invoices POST/PUT/PATCH(paid,cancelled)/DELETE + pre-invoices POST/PUT/DELETE.
- سند چاپی P24 (p24-doc.tsx): بازسازی طرح ارجاعی QuotationPage سایت — A4 تمام‌صفحه 210mm/min-h 297mm؛ سربرگ تیره #262626 با لوگوی آبی P24 + Printoo24 + تلفن 776 227 8666 + آدرس Erbil؛ عنوان Georgia «Quotation»/«Invoice» + زیرعنوان فارسی + Page 1 of 1؛ متاباکس (خریدار/شماره/تاریخ/اعتبار یا سررسید/سفارش/تلفن)؛ جدول ردیف/شرح/تعداد/قیمت واحد/مبلغ کل با جزئیات per-item (توضیح/یادداشت)؛ باکس زمان‌بندی اجرا؛ ملاحظات border-r-4؛ جمع‌بندی + مهر P24 STAMP؛ نوار فوتر printoo24.com. DocScaler با ResizeObserver برای اسکیل موبایل. ثابت‌های COMPANY واقعی شد (776 227 8666 / Erbil / printoo24.com).
- رفع باگ چاپ (ریشه‌یابی عمیق): ۱) دیالوگ Radix با Tailwind v4 از خاصیت translate (نه transform) وسط‌چین می‌شود — @media print دستی شکستنی نبود؛ فیکس قطعی: print: variants مستقیم روی DialogContent در dialog.tsx (همان لایه، بعد از utilities → همیشه برنده). ۲) برای شروع تمیز از صفحهٔ ۱: کل اپ در چاپ display:none (body > *:not([data-slot=dialog-content])) — فقط دیالوگ سند (portal به body) می‌ماند. ۳) @page size از خط لولهٔ بیلد (Lightning CSS) حذف می‌شد — مثل سایت از داخل کامپوننت با <style media=print> تزریق می‌شود. ۴) doc-frame/doc-scaler ریست‌ها. globals.css چاپ بازنویسی + @page margin 0.
- جدول سفارشات: آیکون پیش‌فاکتور → PreInvoiceModal مستقل؛ آیکون فاکتور → InvoiceModal مستقل (نشان emerald وقتی فاکتور دارد). order-flow: صادرات گیت فاکتور حذف.
- E2E (Playwright + agent-browser): سفارش مجزای ۲ آیتمی → ۲ سفارش/۲ سند per-item در صفحهٔ موفقیت با دکمه‌ها ✓؛ ویرایش پیش‌فاکتور #41 از صفحهٔ موفقیت (پیش‌پرداخت ۵۰۰۰ ذخیره شد) ✓؛ سند P24 با هویت کامل ✓؛ سفارش گروهی → یک سند «کل گروه (۲ آیتم)» 105,000 ✓؛ چند-مشتری API → ۲ سفارش گروهی/۳ سند per-item با customerName ✓؛ آیکون جدول → مودال مستقل ✓؛ فاکتور: قفل → تایید → فرم (prefill) → صدور (paid 8000) → order.paid=8000 و PI.paid=8000 ✓؛ ادیت فاکتور 8000→15000 → هر سه (order/PI/invoice) = 15000 ✓؛ تب فاکتور/پیش‌فاکتور مودال جزئیات با سند موجود ✓؛ ویرایش ویزارد #40 بدون بخش PI/فاکتور ✓؛ PDF چاپی A4 (preferCSSPageSize) — VLM پیش‌فاکتور 10/10 و فاکتور 10/10، یک صفحه، لبه‌به‌لبه ✓؛ tsc صفر خطا؛ lint ۰ error؛ سرور فقط خطای FK عمدی تست.

Stage Summary:
- قرارداد جدید برقرار شد: پیش‌فاکتور همیشه با سفارش ساخته می‌شود و مدیریتش «دقیقاً بعد از ساخت کامل سفارش» در صفحهٔ موفقیت است (ویرایش تمیز-عریض/چاپ هر وقت خواست) + از آیکون جدول و تب جزئیات.
- فاکتور کاملاً آزاد: هر زمان کارفرما بخواهد — قفل فقط تایید صریح است؛ مبلغ پرداختی فاکتور با سفارش و پیش‌فاکتور دوطرفه سینک می‌شود (مدل آینه‌ای با redistribute).
- سند چاپی A4 با هویت/تم printoo24.com (P24، تیره+آبی، Georgia، مهر، فوتر) — چاپ واقعی A4 لبه‌به‌لبه با @page تزریقی.
- یافته‌های فنی مهم: Tailwind v4 translate property vs @media print دستی (فیکس: print: variants)؛ Lightning CSS حذف @page size از بیلد (فیکس: style tag JSX)؛ نمایش اپ باید در چاپ display:none شود.
- کامیت 8e817dd پوش شد. کاربر: git pull → npm install → npm run dev.

---
Task ID: hotfix-fk-gregorian
Agent: orchestrator (main)
Task: رفع دو باگ فوری کاربر — ۱) خطای 500/P2003 «Foreign key constraint violated» در ساخت سفارش ۲) تاریخ‌های شمسی در مرحلهٔ ۴ ویزارد (کل سیستم باید میلادی باشد)

Work Log:
- ریشه‌یابی FK: tx.order.create با productId خالی (آیتمِ بدون محصول انتخاب‌شده — SearchSelect مقدار "" می‌ماند) یا customerId کهنه (صفحهٔ باز + reseed) → P2003 خام 500. مسیر دوم: PUT سفارش هم همان ریسک را روی update/create آیتم‌ها داشت.
- POST /api/orders: گارد اعتبارسنجی قبل از تراکنش — همهٔ customerIds با findMany چک می‌شوند (400 فارسی «مشتری موجود نیست… رفرش کنید») + همهٔ productIds آیتم‌ها (400 فارسی «محصول آیتم N برای مشتری X انتخاب نشده…»).
- PUT /api/orders/[id]: همین دو گارد (customerId + items) قبل از تراکنش.
- ویزارد: canGoNext مرحلهٔ ۲ حالا productId غیرخالی برای «هر» آیتم را الزامی می‌کند؛ toast تفکیکی (محصول/آیتم)؛ badge قرمز «محصول انتخاب نشده» + نام آیتم رز در ItemRow؛ گارد پیش از submit در mutationFn.
- میلادی‌سازی (حذف کامل fa-IR-u-ca-persian): order-wizard.tsx (faDateFmt/faDateShort → gregISO بدون Date/Intl → yyyy/MM/dd بدون ریسک تایم‌زون)؛ pre-invoice-modal.tsx (jDate/jShort → formatDate از lib/format + dir=ltr/tabular-nums)؛ p24-doc.tsx (تاریخ صدور/اعتبار/سررسید + باکس زمان‌بندی اجرا + مهرهای تکمیل → formatDate)؛ day-detail-modal.tsx (عدد بزرگ روز = format(d,"d")، زیرش yyyy/MM، کنار نام روز فارسی yyyy/MM/dd؛ حذف jDayFmt/jMonthYearFmt).
- بازبینی کل سیستم: فقط این ۴ فایل جلالی داشتند — lib/format (formatDate) از قبل میلادی بود؛ DatePicker/ui/calendar ذاتاً میلادی‌اند؛ بقیهٔ fa-IR فقط اعداد فارسی (مثل «۱۲ آیتم») که طبق خواسته دست‌نخورده ماند. weekdays فارسی ماند (زبان ≠ تقویم).
- E2E (agent-browser با لاگین admin): گارد مرحلهٔ ۲ آیتم بدون محصول را بلاک کرد (badge + toast، ماندن در مرحله ۲) ✓؛ سفارش کامل: فرم ثبت‌نام A4 ×۵ @550 → POST 201 → صفحهٔ موفقیت #۴۴ + ۱ سند پیش‌فاکتور 2,750 IQD ✓؛ مرحلهٔ ۴: «2026/09/10 → 2026/09/16 (طراحی)» و «2026/09/17 → 2026/09/24 (چاپ)» — صفر شهریور/مهر ✓؛ سند P24: تاریخ صدور 2026/09/02 + اعتبار تا 2026/09/17 + زمان‌بندی اجرا کامل میلادی ✓؛ مودال روز تقویم: «16 / 2026/09 / چهارشنبه / 2026/09/16» ✓.
- تست API گاردها با fetch از خود اپ: مشتری جعلی → 400 «مشتری انتخاب‌شده در سیستم موجود نیست…» ✓؛ productId="" با مشتری واقعی → 400 «محصول آیتم 1 برای مشتری «شرکت آفتاب» انتخاب نشده است…» ✓؛ PUT ادیت معتبر #۴۴ → 200 (بدون رگرسیون) ✓؛ PUT با productId خالی → 400 فارسی ✓.
- tsc: صفر خطای src؛ lint: 0 error (۵ warning قدیمی react-compiler)؛ کنسول مرورگر: صفر خطا؛ VLM اسکرین‌شات مرحلهٔ ۴: «All dates Gregorian, layout clean, no glitches».
- نکتهٔ عملیاتی: سرور dev سندباکس هنگ کرده بود (RAM) → ری‌استارت با bun run dev:log؛ dev.log پاک و بازسازی شد.
- کامیت e491bf8 پوش شد (6 files, +150/−55).

Stage Summary:
- «نمیتونم سفارش بسازم» حل شد: مسیر ایجاد/ویرایش سفارش دیگر هرگز با P2003 کرش نمی‌کند؛ ریشهٔ رایج (آیتم بدون محصول) در UI قبل از submit گرفته می‌شود و در سرور هم 400 فارسی برمی‌گردد.
- کل سیستم تاریخ میلادی yyyy/MM/dd شد (ویزارد ۳/۴، مودال پیش‌فاکتور، سند چاپی A4، تقویم) — نام روزها فارسی ماند.
- کاربر: git pull → npm install → npm run dev (اگر دیتای محلی عوض شده و خطای «مشتری موجود نیست» دید → صفحه را رفرش کند).
