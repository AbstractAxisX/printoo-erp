# Printoo24 — سامانه یکپارچه مدیریت چاپ (ERP)

> یک سیستم ERP سبک و مدرن برای کسب‌وکارهای واسطه‌ای چاپ، ساخته‌شده با Next.js 16، TypeScript، Tailwind CSS 4، shadcn/ui، Prisma و Hugeicons.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8) ![Prisma](https://img.shields.io/badge/Prisma-6-2d3748) ![License](https://img.shields.io/badge/License-MIT-green)

---

## فهرست

- [معرفی](#معرفی)
- [ماژول‌ها](#ماژولها)
- [تکنولوژی‌ها](#تکنولوژی‌ها)
- [معماری پروژه](#معماری-پروژه)
- [پیش‌نیازها](#پیشنیازها)
- [نصب و اجرا](#نصب-و-اجرا)
- [دسترسی دمو](#دسترسی-دمو)
- [ساختار پوشه‌ها](#ساختار-پوشهها)
- [پایگاه داده و Prisma](#پایگاه-داده-و-prisma)
- [API ها](#api-ها)
- [ویزارد ساخت سفارش](#ویزارد-ساخت-سفارش)
- [جداول حرفه‌ای](#جداول-حرفه‌ای)
- [نوتیفیکیشن‌ها](#نوتیفیکیشنها)
- [تم و طراحی](#تم-و-طراحی)
- [اسکریپت‌ها](#اسکریپتها)
- [مسیرهای توسعه](#مسیرهای-توسعه)

---

## معرفی

**Printoo24** یک سامانه مدیریت یکپارچه (ERP) برای کسب‌وکارهای واسطه‌ای چاپ است. این سیستم چرخه کامل سفارش — از دریافت درخواست مشتری تا طراحی، چاپ، انبار، تحویل و صدور فاکتور — را دیجیتال می‌کند.

**ویژگی‌های کلیدی:**
- ۸ ماژول مستقل (ادمین، طراح، چاپ، انبار، مالی، کنترل کیفی، CRM، SRM)
- ویزارد ۴ مرحله‌ای ساخت سفارش با پشتیبانی از چندمشتری و تفکیک آیتم
- جداول حرفه‌ای با مرتب‌سازی، صفحه‌بندی، فیلتر و قابلیت مخفی‌کردن ستون‌ها
- تقویم ماهانه برای زمان‌بندی سفارشات
- نوتیفیکیشن‌های بلادرنگ با badge خوانده‌نشده
- پشتیبانی کامل از RTL و فارسی
- تم روشن/تاریک

---

## ماژول‌ها

سیستم از ۸ ماژول تشکیل شده که هرکدام از طریق سایدبار ERP قابل دسترس‌اند:

| ماژول | توضیح | وضعیت |
|-------|-------|-------|
| **ادمین داخلی** | ساخت و مدیریت سفارشات، داشبورد، مشتریان، محصولات، تقویم | ✅ کامل |
| **طراح** | مدیریت تسک‌ها و سفارشات طراحی | 🚧 پایه |
| **چاپ** | مدیریت سفارشات چاپ | 🚧 پایه |
| **انبار و لجستیک** | مدیریت موجودی و ارسال | 🚧 پایه |
| **مالی** | فاکتورها، پرداخت‌ها، هزینه‌ها | 🚧 پایه |
| **کنترل کیفی** | بررسی‌های کیفی | 🚧 پایه |
| **CRM** | مدیریت ارتباط با مشتری | 🚧 پایه |
| **SRM** | مدیریت تامین‌کنندگان | 🚧 پایه |

**نقش مدیر مستر (Master)** دسترسی کامل به همه ماژول‌ها دارد.

---

## تکنولوژی‌ها

| لایه | تکنولوژی |
|------|----------|
| فریم‌ورک | Next.js 16 (App Router, Turbopack) |
| زبان | TypeScript 5 |
| استایل | Tailwind CSS 4 |
| کامپوننت‌ها | shadcn/ui (سبک New York) |
| آیکون‌ها | Hugeicons (`@hugeicons/react` + `@hugeicons/core-free-icons`) |
| ORM | Prisma 6 (SQLite) |
| مدیریت وضعیت | Zustand (client) + TanStack Query (server) |
| جداول | @tanstack/react-table 8 |
| فرم‌ها | React Hook Form + Zod |
| احراز هویت | Cookie-based session (ساده، بدون NextAuth) |
| تم | next-themes (روشن/تاریک) |
| نوتیفیکیشن | sonner + سیستم داخلی |
| تاریخ | date-fns (میلادی، اعداد انگلیسی) |
| فونت | Vazirmatn (فارسی RTL) |

---

## معماری پروژه

این پروژه از یک **معماری تک‌صفحه‌ای (SPA-style)** با ناوبری client-side استفاده می‌کند:

```
┌─────────────────────────────────────────────────────────┐
│                    src/app/page.tsx                     │
│   (تنها مسیر کاربر — /)                                 │
│   ├── بررسی session → اگر لاگین نبود: LoginForm          │
│   └── اگر لاگین بود: AppShell                            │
└─────────────────────────┬───────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
     AppShell (Layout)        API Routes (/api/...)
     ├── Sidebar (8 ماژول)    ├── /api/auth/{login,logout,me}
     ├── Header               ├── /api/customers
     ├── Command Palette      ├── /api/products
     └── ModuleRouter         ├── /api/suppliers
         └── صفحه فعال         ├── /api/orders (+ [id], [id]/status)
                              ├── /api/tasks
                              ├── /api/notifications (+ [id])
                              └── /api/dashboard
```

**چرا تک‌صفحه‌ای؟** چون محیط sandbox فقط یک مسیر `/` را暴露 می‌کند. ناوبری بین صفحات از طریق Zustand store (`module` + `page`) انجام می‌شود و هیچ رفرش کامل صفحه‌ای نیاز نیست. این الگو برای ERP داخلی با ناوبری سریع ایده‌آل است.

**جریان داده:**
```
React Component → TanStack Query → fetch(/api/...) → Prisma → SQLite
                       ↓
                  Zustand (nav state)
```

---

## پیش‌نیازها

- **Node.js** 18.17+ (توصیه: 20+)
- **Bun** (برای اجرای سریع‌تر — اختیاری ولی توصیه‌شده)
- **npm** یا **pnpm** یا **yarn** (به‌عنوان جایگزین Bun)

---

## نصب و اجرا

### ۱. کلون کردن ریپو

```bash
git clone https://github.com/AbstractAxisX/printoo-erp.git
cd printoo-erp
```

### ۲. نصب وابستگی‌ها

با Bun (توصیه‌شده):
```bash
bun install
```

یا با npm:
```bash
npm install
```

### ۳. تنظیم متغیرهای محیطی

فایل `.env` در ریشه پروژه بسازید:

```env
DATABASE_URL="file:./db/custom.db"
```

> برای PostgreSQL، به‌جای SQLite:
> ```env
> DATABASE_URL="postgresql://user:pass@localhost:5432/printoo24?schema=public"
> ```
> و در `prisma/schema.prisma` مقدار `provider` را به `postgresql` تغییر دهید.

### ۴. راه‌اندازی پایگاه داده

```bash
# ساخت schema در دیتابیس
bun run db:push

# (اختیاری) تولید Prisma Client
bun run db:generate
```

### ۵. (اختیاری) بارگذاری داده‌های نمونه

```bash
bun run scripts/seed.ts
```

این دستور ۵ مشتری، ۳ تامین‌کننده، ۶ محصول، ۵ سفارش و ۳ نوتیفیکیشن نمونه ایجاد می‌کند.

### ۶. اجرای سرور توسعه

```bash
bun run dev
```

سپس مرورگر را روی [http://localhost:3000](http://localhost:3000) باز کنید.

### ۷. (تولید) Build و اجرا

```bash
bun run build
bun run start
```

---

## دسترسی دمو

پس از اجرای seed، با اطلاعات زیر وارد شوید:

| فیلد | مقدار |
|------|-------|
| ایمیل | `admin@printoo24.com` |
| رمز عبور | `admin123` |
| نقش | مدیر کل (Master) |

---

## ساختار پوشه‌ها

```
printoo-erp/
├── prisma/
│   └── schema.prisma              # مدل‌های داده (User, Customer, Order, ...)
├── db/
│   └── custom.db                  # فایل SQLite (خودکار ساخته می‌شود)
├── scripts/
│   └── seed.ts                    # اسکریپت داده‌های نمونه
├── public/
│   └── logo.svg
├── src/
│   ├── app/
│   │   ├── layout.tsx             # ریشه RTL، فونت Vazirmatn، ThemeProvider
│   │   ├── page.tsx               # تنها مسیر کاربر (Auth gate + AppShell)
│   │   ├── globals.css            # تم سبز، scrollbar سفارشی، print styles
│   │   └── api/                   # Route Handlers (REST API)
│   │       ├── auth/{login,logout,me}/route.ts
│   │       ├── customers/route.ts
│   │       ├── products/route.ts
│   │       ├── suppliers/route.ts
│   │       ├── orders/route.ts
│   │       ├── orders/[id]/route.ts
│   │       ├── orders/[id]/status/route.ts
│   │       ├── tasks/route.ts
│   │       ├── notifications/route.ts
│   │       ├── notifications/[id]/route.ts
│   │       └── dashboard/route.ts
│   ├── components/
│   │   ├── ui/                    # shadcn/ui + data-table.tsx (TanStack Table)
│   │   ├── layout/
│   │   │   ├── app-sidebar.tsx    # سایدبار ERP با ۸ ماژول و زیرمنوها
│   │   │   ├── header.tsx         # نوتیف، تم toggle، منوی کاربر
│   │   │   └── command-palette.tsx # جستجوی سراسری (⌘K)
│   │   ├── shared/
│   │   │   ├── index.tsx          # PageHeader, EmptyState, StatusBadge, ...
│   │   │   └── search-select.tsx  # دراپ‌داون سرچی
│   │   ├── auth/
│   │   │   └── login-form.tsx     # صفحه لاگین دوستونه
│   │   ├── modules/
│   │   │   ├── admin/
│   │   │   │   ├── admin-dashboard.tsx
│   │   │   │   ├── orders-page.tsx          # جدول سفارشات (DataTable)
│   │   │   │   ├── orders/
│   │   │   │   │   ├── order-wizard.tsx     # ویزارد ۴ مرحله‌ای
│   │   │   │   │   └── order-wizard-page.tsx
│   │   │   │   ├── open-orders.tsx
│   │   │   │   ├── tasks-page.tsx
│   │   │   │   ├── calendar-page.tsx
│   │   │   │   ├── customers-page.tsx       # جدول مشتریان (DataTable)
│   │   │   │   ├── suppliers-page.tsx       # جدول تامین‌کنندگان (DataTable)
│   │   │   │   ├── products-page.tsx        # جدول/کارت محصولات (DataTable)
│   │   │   │   └── archive-page.tsx         # جدول آرشیو (DataTable)
│   │   │   └── generic-module-page.tsx      # placeholder برای ماژول‌های دیگر
│   │   ├── app-shell.tsx
│   │   ├── module-router.tsx      # سوییچ صفحات بر اساس Zustand state
│   │   ├── providers.tsx          # QueryClientProvider
│   │   └── theme-provider.tsx
│   ├── lib/
│   │   ├── db.ts                  # Prisma client singleton
│   │   ├── auth.ts                # cookie session (UTF-8 safe)
│   │   ├── icons.tsx              # مرکزی‌سازی Hugeicons + کامپوننت <Icon>
│   │   ├── constants.ts           # ORDER_STATUS, ITEM_STAGE, PRIORITY, ...
│   │   ├── format.ts              # formatCurrency, formatDate, daysRemaining
│   │   ├── nav.ts                 # ساختار سایدبار (NAV config)
│   │   ├── api.ts                 # fetch helper
│   │   └── utils.ts               # cn() و سایر ابزارها
│   ├── stores/
│   │   └── app-store.ts           # Zustand (user, module, page, sidebar)
│   └── hooks/
│       ├── use-mobile.ts
│       └── use-toast.ts
├── .env
├── .gitignore
├── components.json                # پیکربندی shadcn/ui
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
└── README.md
```

---

## پایگاه داده و Prisma

مدل‌های اصلی در `prisma/schema.prisma`:

```
User          → کاربران و احراز هویت
Customer      → مشتریان (CRM) — name, phone, isFavorite, balanceDue
Supplier      → تامین‌کنندگان (SRM) — name, phone, contactPerson, balanceDue
Product       → محصولات/خدمات — name, unit, basePrice
Order         → سفارش — number (ترتیبی), status, endDate, totalAmount, splitMode, priority
OrderItem     → آیتم سفارش — stage, needsMaterial, design/print dates
PreInvoice    → پیش‌فاکتور — items (JSON), totalAmount, paidAmount
Invoice       → فاکتور رسمی
Task          → تسک — title, status, priority, module, dueDate
Notification  → اعلان — title, message, type, read, link
Expense       → هزینه عملیاتی
Payment       → پرداخت دریافتی — status (awaiting/validated)
AuditLog      → لاگ بازرسی
```

**وضعیت‌های سفارش (Order Status):**
- `pending_design` — در حال طراحی
- `in_printing` — در حال چاپ
- `warehouse_logistics` — انبار و لجستیک
- `completed` — پایان یافته
- `archived` — آرشیو
- `cancelled` — لغو شده

**مرحله آیتم (Item Stage):** `design` | `print` | `warehouse` | `completed` | `archive`

دستورات مفید:
```bash
bun run db:push      # sync schema با دیتابیس
bun run db:generate  # regenerate Prisma Client
bun run db:migrate   # ساخت migration (برای production)
bun run db:reset     # reset کامل (محیط توسعه)
```

---

## API ها

تمام API ها به‌صورت Next.js Route Handler در `src/app/api/` پیاده‌سازی شده‌اند و JSON برمی‌گردانند.

| متد | مسیر | توضیح |
|-----|------|-------|
| POST | `/api/auth/login` | ورود (ایمیل + رمز) |
| POST | `/api/auth/logout` | خروج |
| GET | `/api/auth/me` | کاربر فعلی |
| GET/POST | `/api/customers` | لیست / ایجاد مشتری |
| GET/POST | `/api/products` | لیست / ایجاد محصول |
| GET/POST | `/api/suppliers` | لیست / ایجاد تامین‌کننده |
| GET/POST | `/api/orders` | لیست (با فیلتر) / ایجاد سفارش |
| GET/PUT/DELETE | `/api/orders/[id]` | جزئیات / ویرایش / حذف |
| PUT | `/api/orders/[id]/status` | تغییر وضعیت + تاریخ ماژول‌ها |
| GET/POST | `/api/tasks` | لیست / ایجاد تسک |
| GET/POST | `/api/notifications` | لیست / ایجاد اعلان |
| PUT | `/api/notifications/[id]` | علامت‌گذاری به‌عنوان خوانده‌شده |
| GET | `/api/dashboard` | آمار داشبورد (KPI + سفارشات اخیر) |

**مثال ایجاد سفارش:**
```json
POST /api/orders
{
  "customers": ["customer_id_1"],
  "itemsByCustomer": {
    "customer_id_1": [
      {
        "productId": "product_id",
        "quantity": 10,
        "pricePerUnit": 25000,
        "totalAmount": 250000,
        "stage": "design",
        "needsMaterial": true,
        "note": "محتاج طراحی لوگو",
        "description": "100x150"
      }
    ]
  },
  "splitMode": "grouped",
  "priority": "normal",
  "noEndDate": true,
  "note": "سفارش فوری مشتری آفتاب"
}
```

---

## ویزارد ساخت سفارش

قلب سیستم، ویزارد ۴ مرحله‌ای ساخت سفارش است:

### مرحله ۱ — انتخاب مشتری
- انتخاب از لیست موجود یا ساخت inline (مودال)
- toggle **چندمشتری** برای ثبت سفارش همزمان برای چند مشتری
- به‌محض ساخت مشتری جدید، خودکار انتخاب می‌شود

### مرحله ۲ — آیتم‌های سفارش
برای هر مشتری (در صورت چندمشتری، با تب جدا):
- دراپ‌داون سرچی محصول (+ ساخت inline محصول جدید)
- تعداد، قیمت واحد، **مبلغ کل خودکار**
- دکمه **یادداشت** (مودال) برای هر ردیف
- دراپ‌داون **انتخاب مرحله** (طراح / چاپ / انبار / تکمیل / آرشیو)
- فیلد توضیح کوتاه
- تیک **نیازمند متریال؟**
- دکمه‌های **کپی** و **حذف** برای هر ردیف
- دکمه **افزودن آیتم جدید**

> اگر یک مشتری بدون آیتم بماند، عبور به مرحله بعد ممکن نیست.

### مرحله ۳ — زمان‌دهی و اولویت (اختیاری)
- انتخاب **گروهی** یا **تفکیک شده**
- اولویت **معمولی** یا **فوری** (برای کل سفارش)
- تعیین تاریخ شروع/پایان برای ماژول طراحی (فقط اگر آیتمی نیاز به طراحی داشته باشد)
- تعیین تاریخ شروع/پایان برای ماژول چاپ
- تاریخ پایان کلی سفارش با تیک **بدون زمان پایان**
- یادداشت کلی سفارش

### مرحله ۴ — بازنگری و ثبت
- نمایش خلاصه (تعداد مشتری، آیتم، نوع، اولویت، ...)
- تب مشتریان (در صورت چندمشتری)
- جدول آیتم‌ها به تفکیک مشتری
- **صدور پیش‌فاکتور** (تیک‌دار): جدول با پرداختی اختیاری هر آیتم، مبلغ کل و پرداخت‌نشده
- **صدور فاکتور** (فقط اگر سفارش تکمیل‌شده باشد)

پس از ثبت:
- اگر چندمشتری → N سفارش مجزا
- اگر تفکیک شده → هر آیتم یک سفارش
- در غیر این صورت → یک سفارش با همه آیتم‌ها

---

## جداول حرفه‌ای

تمام جداول لیستی از کامپوننت **`DataTable`** (ساخته‌شده روی `@tanstack/react-table 8`) استفاده می‌کنند:

**امکانات:**
- ✅ مرتب‌سازی (Sort) روی ستون‌ها — با آیکون جهت‌دار
- ✅ صفحه‌بندی (Pagination) با انتخاب تعداد ردیف در صفحه
- ✅ فیلتر سراسری (Global Filter) و فیلتر ستون
- ✅ نمایش/مخفی کردن ستون‌ها (Column Visibility) از منوی «ستون‌ها»
- ✅ ردیف‌های قابل بسط‌دادن (Expandable Rows) — برای سفارشات گروهی
- ✅ Loading state با اسپینر
- ✅ Empty state قابل سفارشی‌سازی
- ✅ اکشن‌های ردیف (ویرایش، حذف، یادداشت، ...)
- ✅ RTL-friendly و واکنش‌گرا

**استفاده:**
```tsx
import { DataTable, type ColumnDef } from "@/components/ui/data-table";

const columns: ColumnDef<MyType>[] = [
  { accessorKey: "name", header: "نام", enableSorting: true },
  { id: "actions", cell: ({ row }) => <Actions data={row.original} />, meta: { hideable: false } },
];

<DataTable columns={columns} data={data} pageSize={10} />
```

---

## نوتیفیکیشن‌ها

سیستم نوتیفیکیشن **واقعی** و کارآمد:

- ذخیره در دیتابیس (جدول `Notification`)
- badge تعداد خوانده‌نشده در هدر
- auto-refresh هر ۱۵ ثانیه (TanStack Query `refetchInterval`)
- کلیک روی اعلان → ناوبری به صفحه مرتبط + علامت‌گذاری به‌عنوان خوانده‌شده
- انواع: `info` / `success` / `warning` / `error` (با رنگ و آیکون متفاوت)
- ایجاد خودکار هنگام تغییر وضعیت سفارش

---

## تم و طراحی

- **رنگ برند:** سبز مرمری (emerald) — متغیر در `globals.css`
- **پشتیبانی RTL:** `dir="rtl"` در `<html>`، چیدمان راست‌به‌چپ
- **فونت:** Vazirmatn (فارسی) + اعداد لاتین (tabular-nums)
- **تاریخ:** میلادی (date-fns) با اعداد انگلیسی
- **واحد پول:** تومان
- **دارک مود:** از طریق next-themes (سیستم / روشن / تاریک)
- **آیکون‌ها:** همگی از Hugeicons — مرکزی‌شده در `src/lib/icons.tsx`

---

## اسکریپت‌ها

در `package.json`:

| دستور | توضیح |
|-------|-------|
| `bun run dev` | اجرای سرور توسعه روی پورت 3000 |
| `bun run build` | build تولید |
| `bun run start` | اجرای سرور تولید |
| `bun run lint` | بررسی ESLint |
| `bun run db:push` | sync schema با دیتابیس |
| `bun run db:generate` | regenerate Prisma Client |
| `bun run db:migrate` | ساخت migration |
| `bun run db:reset` | reset دیتابیس |

---

## مسیرهای توسعه

موارد زیر در نسخه فعلی پایه‌گذاری شده‌اند و آماده توسعه‌اند:

- [ ] احراز هویت کامل با NextAuth.js + RBAC ماتریسی
- [ ] ماژول طراح: صف طراحی، آپلود فایل، تایید مشتری
- [ ] ماژول چاپ: مدیریت صف چاپ، تخصیص به چاپخانه
- [ ] ماژول انبار: موجودی، ورود/خروج کالا
- [ ] ماژول مالی: پرداخت‌ها، تایید صندوق‌دار، هزینه‌ها
- [ ] ماژول کنترل کیفی: چک‌لیست کیفیت
- [ ] خروجی PDF فاکتور و پیش‌فاکتور
- [ ] گزارش‌های نموداری (Recharts)
- [ ] WebSocket برای نوتیفیکیشن بلادرنگ
- [ ] پشتیبانی از چندزبانه (i18n)

---

## مجوز

MIT License — استفاده آزاد.

---

## نویسنده

**Printoo24 ERP** — ساخته‌شده برای کسب‌وکارهای واسطه‌ای چاپ.

اگر سوال یا پیشنهادی دارید، issue باز کنید. 🚀
