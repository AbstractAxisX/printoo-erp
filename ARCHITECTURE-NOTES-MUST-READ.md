# ⚠️ ARCHITECTURE-NOTES-MUST-READ.md

> **اگر روی این پروژه کار می‌کنی — این فایل را اول بخوان.**
> This file is the single source of truth for architectural decisions, deferred work,
> sensitivities, and future infrastructure on **Printoo24 ERP**.
> Maintained by the lead architect. Last updated: Phase 1 → Phase 2 transition.

---

## 0. How to use this file

- **Before touching any file**, read the «حساسیت‌ها» (Sensitivities) section — it lists contracts that MUST NOT break.
- **«موکولی‌ها» (Deferred)** lists work intentionally postponed and WHY.
- **«زیرساخت برای آینده» (Infrastructure for future)** lists the foundations laid now so future features don't require painful migration.
- **«تسک‌های آینده» (Future tasks)** is the backlog.

---

## 1. Current Architecture Snapshot

- **Framework**: Next.js 16 (App Router, Turbopack, `output: "standalone"`), TypeScript 5 strict.
- **Single exposed route**: `/` only (sandbox constraint). SPA-style: `page.tsx` → session check → LoginForm or AppShell.
- **State**: Zustand (persisted: user, module, page, tabs) + TanStack Query (server state, cross-tab BroadcastChannel invalidation).
- **Nav**: client-side `navigate(module, page)` — no route refresh. 8 modules: admin, designer, print, warehouse, finance, qc, crm, srm.
- **Data**: Prisma 6 + SQLite (`db/custom.db`). 22 models.
- **Auth (baseline, post-Phase-1.5)**: bcrypt-hashed password + HMAC-signed session cookie + middleware route-guard. (See §3.)
- **Icons**: Hugeicons (centralized in `src/lib/icons.tsx`). NOT lucide.
- **Tables**: `@tanstack/react-table` 8 + custom `DataTable` wrapper. Virtualization landing in Phase 3 (`@tanstack/react-virtual`).
- **Calendar/Gantt**: custom SVG/CSS impl (replaced `gantt-task-react` which crashed). Reusable across modules.

---

## 2. The 6-Phase Atomic Upgrade Plan (Admin Module)

| Phase | Target | Files (≤3) | Bug IDs fixed | Status |
|---|---|---|---|---|
| **1.5 (baseline)** | Run setup + baseline security | middleware.ts, auth.ts, login/route.ts, seed.ts, .env | R26 (partial) | ✅ done |
| **2** | Rebuild Order Detail Modal (tabbed, lazy, skeleton) | order-detail-modal.tsx, order-detail-tabs.tsx, use-order-detail.tsx | R5, R22, scenario-2 | ✅ done |
| **3** | All Orders + Open Orders (virtualization, pro filters) | data-table.tsx, orders-page.tsx, open-orders.tsx, shared/search-combobox.tsx, shared/filter-toggle.tsx, api/orders/route.ts, api/orders/[id]/route.ts | R13, R14, R21, R4 (orders), R26 (orders) | ✅ done |
| **4** | Tasks + cross-panel assignment logic | tasks-page.tsx, api/tasks/route.ts, api/tasks/[id]/route.ts, lib/task-validation.ts [new], api/users/route.ts [new], order-detail-tabs.tsx (TasksTab), schema.prisma (FK), lib/constants.ts (USER_ROLE), lib/icons.tsx (search) | R9, R10, R12, R26 (tasks), scenario-3 | ✅ done |
| **5** | Rebuild shared Calendar + Gantt | reusable-gantt.tsx, reusable-calendar.tsx, day-detail-modal.tsx | R8, R15, R16, R17, R23, R24 | ⏳ pending |
| **6** | Dashboard optimization + New Order wizard fixes | kpi-cards.tsx, dashboard-sections.tsx, order-wizard.tsx | R1, R2, R6, R7, R11, R18-20, R25, R3, R4 | ⏳ pending |

**Bug catalog (R1–R26)** lives in the Phase-1 analysis (chat history) and is summarized in §6 below.

---

## 3. Auth — Baseline (done) vs Full RBAC (deferred)

### 3.1 Baseline security (DONE in Phase 1.5)
- **Password hashing**: `bcryptjs` (10 rounds). `seed.ts` and any user-create path must hash. `auth/login` uses `bcrypt.compare`.
- **Signed session**: cookie `printoo24_session` = `base64(payload).base64(HMAC-SHA256(payload, SESSION_SECRET))`. Verified on read via `getSession()`. `SESSION_SECRET` from env (dev default provided).
- **Route guard (middleware.ts)**: gates `/api/*` except `/api/auth/login` by cookie presence (edge-safe). Full HMAC verification happens server-side in `getSession()`/`requireUser()`.
- **`requireUser()` helper** (`lib/auth.ts`): routes call `const user = await requireUser();` → returns user or responds 401. Being added per-route as each phase touches that route.

> ⚠️ **NOT yet done in baseline**: per-route `requireUser()` calls on all 44 routes, rate-limiting, CSRF (not needed — same-origin + cookie SameSite=lax), 2FA. These land as each phase touches its routes.

### 3.2 Full RBAC — Architectural vision (DEFERRED, infrastructure laid)

**The user's vision** (verbatim, paraphrased):
> Master admin creates Roles, Modules, and order-stage flows. Then creates Employees with progressive access:
> 1. Just a person with page access.
> 2. View/Edit/Delete access.
> 3. Filtered field-level view (e.g. can see dashboard but not KPIs; can see orders but not customer phone).
> Future: salary, attendance.
> The order flow (admin→designer→print→warehouse) is currently hardcoded; Master should be able to add a module anywhere or change the flow.

This is a **system-level feature**, deeply intertwined with every module. It is NOT part of the 6 admin-UX phases. Doing it correctly requires its own architecture phase. The infrastructure laid now (§4) ensures it can be added later without painful migration.

#### Proposed full-RBAC data model (for the future phase)
```prisma
model Role {
  id          String       @id @default(cuid())
  name        String       @unique
  key         String       @unique   // "master" | "designer" | custom
  isSystem    Boolean      @default(false)  // master is non-deletable
  modules     ModuleAccess[]
  users       User[]
  createdAt   DateTime     @default(now())
}

model ModuleAccess {
  id         String   @id @default(cuid())
  roleId     String
  role       Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)
  moduleKey  String   // "admin" | "designer" | custom (FK to ModuleDefinition once dynamic)
  canView    Boolean  @default(false)
  canCreate  Boolean  @default(false)
  canEdit    Boolean  @default(false)
  canDelete  Boolean  @default(false)
  fieldFilters String? // JSON: { "order.customerPhone": "hide", "dashboard.kpi": "hide" }
  createdAt  DateTime @default(now())
  @@unique([roleId, moduleKey])
}

model ModuleDefinition {
  id        String   @id @default(cuid())
  key       String   @unique   // "admin" | "designer" | custom
  label     String
  faLabel   String
  icon       String
  orderIndex Int     @default(0)  // for sidebar ordering
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
}

model WorkflowStage {
  id         String   @id @default(cuid())
  moduleKey  String   // which module owns this stage
  stageKey   String   // "design" | "print" | custom
  label      String
  orderIndex Int      @default(0)   // position in the flow
  nextStageKey String? // for linear flows; null = terminal
  createdAt  DateTime @default(now())
  @@unique([moduleKey, stageKey])
}

model Employee {
  id         String   @id @default(cuid())
  userId     String   @unique
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  roleId     String?
  role       Role?   @relation(fields: [roleId], references: [id])
  salary     Float?
  hiredAt    DateTime?
  isActive   Boolean  @default(true)
  attendance Attendance[]
  createdAt  DateTime @default(now())
}

model Attendance {
  id          String   @id @default(cuid())
  employeeId  String
  employee    Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  date        DateTime
  checkIn     DateTime?
  checkOut    DateTime?
  status      String   @default("present") // present | absent | leave | remote
  createdAt   DateTime @default(now())
  @@unique([employeeId, date])
}
```

#### Proposed permission engine (for the future phase)
- `lib/permissions.ts`: `can(user, action, moduleKey, field?)` → boolean. Reads role's ModuleAccess + fieldFilters. Cached in request context.
- `requirePermission(action, moduleKey)` — server-side guard replacing the simple `requireUser()` once RBAC lands.
- Client: `useCan(action, moduleKey)` hook → hides/disables UI elements.
- The hardcoded `NAV` array (`lib/nav.ts`) gets replaced by a `useNav()` hook that fetches `ModuleDefinition` + the user's accessible modules.

#### Migration path (when RBAC lands)
1. Add the models above via `prisma db push`.
2. Seed: master role (all-access), default roles per current `MODULES` enum.
3. Migrate `User.role` (String) → `User.roleId` (FK) — backfill from string→role.
4. Replace `requireUser()` calls with `requirePermission(...)`.
5. Replace `NAV` static with `useNav()` dynamic.
6. Replace hardcoded order-flow status transitions with `WorkflowStage`-driven.

> **Until RBAC lands**: keep `User.role` as String (master|admin|designer|...), keep `NAV` static, keep `MODULES` enum. The Phase 4 `assignedTo` FK-wiring (to User.id) is the FIRST concrete step toward RBAC — it makes Employees referenceable.

---

## 4. Infrastructure laid NOW for future changes

| Foundation | What's done | Why it matters for the future |
|---|---|---|
| `requireUser()` helper | in `lib/auth.ts` | Every route will call it; swapping to `requirePermission()` is a 1-line change per route when RBAC lands. |
| HMAC-signed session | `getSession()` verifies signature | Session can't be forged; when RBAC lands, the session payload can safely carry `roleId`. |
| bcrypt password hashing | `auth.ts`, `seed.ts`, `login/route.ts` | User table is ready for many users (RBAC prerequisite). |
| Query-key conventions | `["tasks"]`, `["orders"]`, `["dashboard"]` prefixes (see §5) | TanStack prefix-matching means a single `invalidate(["tasks"])` refreshes all module task lists — essential when multiple modules read tasks. |
| `module` field as the routing field | Task.module determines which panel sees it | When RBAC makes modules dynamic, the `module` FK to `ModuleDefinition` replaces the string — UI doesn't change. |
| Calendar/Gantt as Presentational | Phase 5 rebuild splits data-fetching from rendering | A future dynamic-module system can render its calendar without touching the shared component. |
| Modal as tabbed Open-Closed | Phase 2 rebuild | Adding a "salary" or "attendance" tab later = 1 new file, no modal rewrite. |

---

## 5. Sensitivities — Contracts that MUST NOT break

### 5.1 API request-body shapes (consumers depend on these)
- `POST /api/orders`: `{customers[], itemsByCustomer{}, splitMode, priority, endDate?, noEndDate?, note?, moduleDates?, preInvoice?, invoice?, markCompleted?}`
- `PUT /api/orders/[id]`: `{note?, endDate?, noEndDate?, priority?, totalAmount?, status?, customerId?, splitMode?, items?, moduleDates?}` ← Phase 6 must ADD preInvoice/invoice editing (via separate `/api/pre-invoices` POST/PUT, NOT by bloating this route).
- `POST /api/tasks`: `{title, description?, priority?, dueDate?, module?, orderId?, customerId?, assignedTo?}`
- `PUT /api/tasks/[id]`: `{title?, description?, status?, priority?, module?, dueDate?, assignedTo?}` ← Phase 4 ADDED `assignedTo` (R9 fixed: null=unassign, userId=validated-against-active-users).
- `GET /api/tasks?module=X`: the `module` filter contract — designer-tasks:36, print-tasks:50 depend on it.

### 5.2 Enums (do NOT change values)
- `OrderStatus`: pending_design | in_printing | warehouse_logistics | completed | archived | cancelled
- `ItemStage`: design | print | warehouse | completed | archive
- `Priority`: normal | urgent
- `SplitMode`: grouped | separated
- `ModuleKey`: admin | designer | print | warehouse | finance | qc | crm | srm
> A typoed `module` value ORPHANS a task (it becomes invisible to every panel). This is the #1 cross-panel risk — Phase 4 adds server-side enum validation as a fence.

### 5.3 Query-key prefixes (TanStack prefix-matching)
- `["tasks"]` — invalidating refreshes ALL `["tasks", *]` (admin, designer, print, calendar).
- `["orders"]` — 8 invalidators.
- `["open-orders"]` — separate (has 30s refetchInterval operators rely on).
- `["order", id]` — per-order detail.
- `["dashboard"]` — 4 invalidators.
- `["notifications"]` — 2 invalidators.
> ⚠️ BUG (R11): `["tasks-calendar"]` and `["dashboard-tasks"]` are single-string keys NOT prefix-matched. Phase 5/6 renames them to `["tasks","calendar"]` and `["dashboard","tasks"]`.

### 5.4 Component interfaces (drop-in rebuild boundary)
- `OrderDetailModal` props: `{order: OrderDetail|null, open, onOpenChange}` + exports `type OrderDetail`. Phase 2 rebuild MUST keep this (or migrate the 2 consumers: `use-order-detail.tsx`, `open-orders.tsx:632`).
- `ReusableCalendar` props: `{events, notes?, onDayClick?, onEventClick?, filters?, className?}`. 4 consumers.
- `ReusableGantt` props: `{events, onEventClick?, className?, title?, emptyMessage?, filters?}`. 3 consumers.
- `DataTable` props: 18 props (see Phase-1 report). Phase 3 virtualization MUST be opt-in (`enableVirtualization?`, `rowHeight?`, `overscan?`, `manualPagination?`) — no breaking change to 18 call-sites.

### 5.5 Navigation contract
`navigate("admin", page)` with page ∈ the `NAV` items. Module-router switches on these. Adding a page = adding to `NAV` + a case in `module-router.tsx`.

---

## 6. Bug catalog (root-cause, from Phase-1 analysis)

| ID | Severity | Bug | File:line | Phase that fixes it |
|---|---|---|---|---|
| R1 | 🔴 | `preInvoicePaid` map silently dropped on wizard submit | order-wizard.tsx:315-320 | 6 |
| R2 | 🔴 | Edit-mode PUT drops preInvoice/invoice/markCompleted, only customers[0] | order-wizard.tsx:257,273-285 | 6 |
| R3 | 🔴 | `nextNumber` race (read-then-write, non-atomic) | api/orders/route.ts:45-56 | 6 (atomic Counter model) — Phase 3 wraps it inside `$transaction` so concurrent writers serialize on the SQLite write lock; full atomicity (Counter model) lands in Phase 6 |
| R4 | 🔴 | Zero `db.$transaction` — multi-writes non-atomic | all multi-write routes | 2,4,6 (per-route) — Phase 3: `api/orders` POST + `api/orders/[id]` PUT/DELETE wrapped in `$transaction` |
| R5 | 🟠 | "فاکتور" button no-op in modal | order-detail-modal.tsx:286 | **2** |
| R6 | 🟠 | Dashboard 12× redundant /api/dashboard calls on mount + staleTime:0 | kpi-cards.tsx:117-122 | 6 |
| R7 | 🟠 | `["customers-list"]`/`["products-list"]` not invalidated after inline create | order-wizard.tsx:538-539,697-698 | 6 |
| R8 | 🟠 | Task click in calendar orphan (only order handled) | calendar-page.tsx:119-121 | 5 |
| R9 | 🟠 | `assignedTo` dead column (no FK, no UI, no validation) | schema:253; api/tasks/[id]:11-26 | **4** ✅ FK wired (TaskAssignee relation) + assignee UI (picker/chip/filter) + server validation (active users only) |
| R10 | 🟠 | Admin tasks-page missing `["dashboard"]` invalidation | tasks-page.tsx:196,256,267,297,309 | **4** ✅ all mutations now invalidate [tasks, dashboard, order] |
| R11 | 🟠 | Wrong query-key shape `["tasks-calendar"]`/`["dashboard-tasks"]` | calendar-page.tsx:81; dashboard-sections.tsx:85 | 5,6 |
| R12 | 🟠 | No server-side enum validation on module/status/priority/assignedTo | api/tasks/route.ts:21-33; [id]:21-23 | **4** ✅ lib/task-validation.ts — Persian 400s; typoed module can no longer orphan a task |
| R13 | 🟠 | DataTable: single click fires BOTH expand AND onRowClick | data-table.tsx:108,216-221 | **3** ✅ |
| R14 | 🟠 | DataTable `totalCount` prop silently dropped | data-table.tsx:63,256 | **3** ✅ |
| R15 | 🟡 | Gantt no virtualization (100+ bars rendered) | reusable-gantt.tsx:158-163,206-261 | 5 |
| R16 | 🟡 | Gantt SyncScroll queries a class no element has | reusable-gantt.tsx:276 | 5 |
| R17 | 🟡 | DayDetailModal dynamic `bg-${color}-500` purged in prod | day-detail-modal.tsx:172 | 5 |
| R18 | 🟡 | Wizard 25 useState, no RHF+Zod (both in deps) | order-wizard.tsx:87-110 | 6 |
| R19 | 🟡 | Wizard prop-drilling 52 props across Steps | order-wizard.tsx:520,672,902,1009 | 6 |
| R20 | 🟡 | Wizard no useMemo on needsDesign/anyCompleted/totals | order-wizard.tsx:243,244,706,916 | 6 |
| R21 | 🟡 | Duplicated SearchCombobox/FilterToggle in 2 files | orders-page.tsx:413-499; open-orders.tsx:723-845 | **3** ✅ |
| R22 | 🟡 | PreInvoiceModal JSON.parse silent fallback (paid lost) | pre-invoice-modal.tsx:49-54 | **2** |
| R23 | 🟡 | CalendarEvent.meta loose `Record<string,unknown>` | reusable-calendar.tsx:17 | 5 |
| R24 | 🟡 | Dead `/api/day-notes` + DayNote + notes prop (zero consumers) | grep-confirmed | 5 |
| R25 | 🟡 | 8 hardcoded navigate() strings in dashboard (drift risk) | admin-dashboard.tsx; dashboard-sections.tsx | 6 |
| R26 | 🔴 | No auth on 44/45 routes + plaintext password + unsigned cookie | all routes; auth.ts | 1.5 (baseline done) + per-phase (requireUser per route) — Phase 3 added requireUser to `api/orders` GET/POST + `api/orders/[id]` GET/PUT/DELETE (4 routes) |

---

## 7. Deferred items (intentionally postponed)

| Item | Why deferred | Lands in |
|---|---|---|
| Full RBAC (roles/modules/stages/field-filters/salary/attendance) | System-level feature, needs dedicated phase; not part of admin-UX upgrade | Future phase (post-6) — infrastructure in §3.2/§4 |
| Warehouse module (6 pages, all unbuilt) | Out of scope (admin module upgrade). Orders sent via `send_warehouse` currently vanish | Future phase |
| Finance invoices/payments/expenses (3 of 5 pages placeholders) | Out of scope | Future phase |
| Real file upload (`/api/upload`, designer proofs, cost receipts) | Out of scope; cost form uses text URL fields | Future phase |
| WebSocket real-time notifications | Currently poll-based (15s/30s refetch). Fine for now | Future phase |
| i18n (next-intl is installed but unused) | Persian-only currently | Future phase |
| PDF export of invoices/pre-invoices | Finance module unbuilt | Future phase |
| Recharts dashboard charts | Dashboard has KPIs but limited charts | Phase 6 (partial) |
| AuditLog writing (model exists, never written) | Should wrap every CUD with `withAudit()` once RBAC lands (needs actor identity) | Future phase (with RBAC) |
| per-route `requireUser()` on all 44 routes | Baseline middleware gates by cookie; per-route user-load lands as each phase touches its routes | 2,3,4,6 (incremental) |
| Rate limiting on login | Needs a Redis-like store or in-memory limiter; not critical for internal ERP | Future phase |

---

## 8. Future tasks backlog

1. **RBAC engine** — implement §3.2.
2. **Warehouse module** — build 6 pages (dashboard/tasks/calendar/orders/inventory/materials). Critical: orders sent via `send_warehouse` currently vanish from UI.
3. **Finance completion** — invoices/payments/expenses pages + PDF export.
4. **File upload** — `/api/upload` (multipart, disk or S3), wire into cost form + designer proofs.
5. **AuditLog** — `withAudit()` Prisma extension, log every CUD with session actor.
6. **Real-time** — WebSocket (socket.io mini-service per sandbox rules) for notifications + order status changes.
7. **Pagination** — server-side cursor pagination on `/api/orders`, `/api/customers`, `/api/suppliers`, `/api/products`, `/api/srm/compare-prices`.
8. **i18n** — activate next-intl; currently hardcoded Persian.
9. **Counter model** — atomic sequential numbers for Order/PreInvoice/Invoice (replaces `aggregate _max + 1`).
10. **Jalali calendar** — README claims "date-fns (میلادی)"; if Persian business calendar needed, add `jalaali` or `moment-jalaali`.

---

## 9. Performance notes

- **Dashboard** (R6): 8 KpiCards each fire their own `useQuery(["dashboard-kpi", ...])` + 4 more from sections = **12 simultaneous `/api/dashboard` calls on mount**, each running 22 Prisma awaits = **264 awaits on mount**, then 176 every 15s + 88 every 30s. Phase 6 consolidates into ONE shared `useQuery` + `staleTime: 60s`.
- **All Orders** (R13/R14): DataTable has no virtualization; `/api/orders` has no server-side pagination. Phase 3 adds opt-in virtualization + Phase 6 (or sooner) adds cursor pagination.
- **Gantt** (R15): `.map()` over all events, no virtualization. 100+ events = 100+ DOM bars. Phase 5 adds opt-in virtualization.
- **Cross-tab** (good): BroadcastChannel invalidation works; TanStack prefix-matching means one `invalidate(["tasks"])` refreshes all module task lists. Preserve this.

---

## 10. Change log

- **Phase 4**: ✅ DONE — Tasks + cross-panel assignment. 8 files (schema.prisma, api/users/route.ts [new], lib/task-validation.ts [new], api/tasks/route.ts, api/tasks/[id]/route.ts, tasks-page.tsx, order-detail-tabs.tsx TasksTab, lib/constants.ts + icons.tsx). Fixed R9 (assignedTo FK → User + full assignment UI: picker/chip/header-filter + PUT handling + active-user validation), R10 (mutations invalidate [tasks, dashboard, order]), R12 (server enum fences in lib/task-validation.ts — Persian 400s, no more orphaned tasks), R26 partial (requireUser on tasks + users routes, 404 fences). Scenario-3 delivered: order-modal TasksTab quick-create (orderId pre-linked + smart module default by order status + assignee) — ارجاع زیر ۵ ثانیه بدون خروج از مودال. NEW /api/users (active-only, password never selected). Seed: 4 demo employees + idempotency fix (orders/notifications no longer duplicated on re-run). icons: "search" registered (was imported but unmapped — invisible icon + 7 TS errors). API GET /api/tasks gains ?assignedTo= & ?orderId= filters; responses now include task.assignedUser (additive).
- **Phase 3**: ✅ DONE — All Orders + Open Orders rebuild. 7 files touched (data-table.tsx, orders-page.tsx, open-orders.tsx, shared/search-combobox.tsx [new], shared/filter-toggle.tsx [new], api/orders/route.ts, api/orders/[id]/route.ts). Fixed R13 (row click no longer double-fires expand), R14 (totalCount wired), R21 (SearchCombobox/FilterToggle extracted to shared), R4 (orders POST/PUT/DELETE wrapped in `$transaction`), R26 partial (requireUser on 4 order routes). Server-side filters: status[], priority[], stage[], dateFrom, dateTo, q — previously client-side. Virtualization opt-in via `enableVirtualization` (threshold 200 rows) — backward-compatible (all 18 call-sites untouched).
- **Phase 1.5**: ✅ DONE — baseline security (bcrypt + HMAC-signed session + proxy.ts route-guard) + run setup (printoo-erp synced to sandbox, seeded, dev server persistent on :3000).
- **Phase 1**: full ecosystem analysis delivered; 26 bugs catalogued; contracts documented.
- **Phase 0**: project cloned, deeply analyzed (4 parallel Explore agents).
