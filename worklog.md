# Printoo24 ERP — Worklog

Project: Printoo24 Printing ERP (Next.js 16, shadcn/ui, hugeicons, Persian RTL, Gregorian dates, English numerals)

Shared conventions:
- Single route only: everything rendered via `src/app/page.tsx` with client-side nav (Zustand store `src/stores/app-store.ts`).
- Icons: `@hugeicons/react` (`HugeiconsIcon`) + icon objects from `@hugeicons/core-free-icons`. Central export at `src/lib/icons.ts`.
- Theme: emerald/green brand primary, RTL (`dir="rtl"`), Vazirmatn font, dark mode via next-themes.
- DB: Prisma + SQLite (`@/lib/db`). Schema in `prisma/schema.prisma`.
- API: Next.js Route Handlers under `src/app/api/...`. Always return JSON.
- Currency: Toman (تومان). Dates: Gregorian (date-fns, English numerals).
- Status flow: pending_design → in_printing → warehouse_logistics → completed. Plus archived / cancelled.

---
Task ID: 1
Agent: main
Task: Foundation — packages, theme, layout, Prisma schema, types, constants, icons, nav store, auth helper

Work Log:
- Installed @hugeicons/react and @hugeicons/core-free-icons
- (writing files next)

Stage Summary:
- (in progress)

---
Task ID: 1-9
Agent: main
Task: Full Printoo24 ERP build + verification

Work Log:
- Installed @hugeicons/react + @hugeicons/core-free-icons (verified all icon names)
- Set up emerald/green brand theme, RTL (dir=rtl), Vazirmatn font, dark mode via next-themes
- Wrote comprehensive Prisma schema (User, Customer, Supplier, Product, Order, OrderItem, PreInvoice, Invoice, Task, Notification, Expense, Payment, AuditLog) — pushed to SQLite
- Built auth: cookie session (UTF-8 safe base64), login/logout/me APIs, beautiful split-screen login page
- Built app shell: ERP sidebar (8 modules, grouped menus with submenus, module switcher), header (real notifications with unread badge + 15s auto-refresh, theme toggle, user menu with logout), command palette (Cmd+K)
- Built admin module fully:
  * Dashboard: 8 KPI cards + recent orders with day-remaining/overdue coloring
  * Orders list: searchable dropdowns (customer/product), status filter, detailed table (ID, customer+phone, status-changeable, end date with colored day counts, total, created), expandable grouped rows, row actions (note/edit/pre-invoice/invoice/delete), note modal, status-change modal with module date pickers
  * Order wizard (4 steps): customer select + multi-customer toggle + inline create; items table (product dropdown, qty, price/unit, auto-total, note modal, stage dropdown, description, needs_material checkbox, copy/delete); timing (grouped/separated, priority, module date pickers for design+print based on stages, end date with no-end-date toggle); review (customer tabs, pre-invoice table with paid amounts + totals, invoice option if completed)
  * Open orders, Tasks (kanban), Calendar (monthly + upcoming deadlines), Customers (CRM), Suppliers (SRM), Products, Archive
- Built generic placeholder pages for designer/print/warehouse/finance/qc/crm/srm modules
- Seeded demo data (5 customers, 3 suppliers, 6 products, 5 orders, 3 notifications)
- Fixed: icons.tsx JSX extension, AddCircle01Icon/CircleAlertIcon missing exports, btoa UTF-8 Persian crash (Buffer-based encoding), module variable lint errors
- Agent Browser verification: login works, dashboard renders with data, orders list with search dropdowns + filters + table, order wizard 4-step stepper, create-order API creates orders successfully, no console/runtime errors

Stage Summary:
- All 8 modules accessible via ERP sidebar; admin module fully functional with detailed order wizard
- Single-route SPA (Zustand nav store) — everything via src/app/page.tsx
- Lint clean, no runtime errors, server runs on port 3000 (respawn loop keeps it alive)
- Demo login: admin@printoo24.com / admin123
