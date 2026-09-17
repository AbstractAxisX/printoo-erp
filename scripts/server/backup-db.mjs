// Printoo24 ERP — Backup Script (Phase 23)
// ─────────────────────────────────────────────────────────────────
// بکاپ کامل و سازگار (consistent) از دیتابیس SQLite پروژهٔ ERP:
//   1. VACUUM INTO → snapshot تمیز حتی هنگام نوشتنِ هم‌زمان اپ
//   2. PRAGMA integrity_check روی خودِ snapshot (قبل از قبول بکاپ)
//   3. sha256 + manifest.json (ساعت ایران، تعداد جدول‌ها، تعداد ردیف‌های کلیدی)
//   4. آرشیو پیوست‌های هزینه (uploads) — تا هر بکاپ یک restore کامل باشد
//   5. پاک‌سازی بکاپ‌های قدیمی‌تر از ۷ روز
//
// محل: /opt/printoo24-admin/backups/YYYY-MM-DD/HH-MM/
// اجرا: systemd timer هر ۳ ساعت (ساعت ایران: 00،03،06،09،12،15،18،21)
// فقط و فقط پروژهٔ ERP — به کانتینرهای Docker کاری ندارد.
//
// Node 20+ — بدون وابستگی جدید (Prisma موجود در node_modules پروژه).

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

// ─── پیکربندی ──────────────────────────────────────────────────────
// PRINTOO_ROOT فقط برای تست لوکال — روی سرور پیش‌فرض /opt/printoo24-admin
const ROOT = process.env.PRINTOO_ROOT ?? "/opt/printoo24-admin";
const DB_URL = process.env.DATABASE_URL ?? `file:${ROOT}/db/custom.db`;
const DB_PATH = DB_URL.replace(/^file:/, "");
const BACKUP_ROOT = path.join(ROOT, "backups");
const UPLOADS_DIR = path.join(ROOT, "uploads");
const RETENTION_DAYS = 7;
const IRAN_TZ = "Asia/Tehran";
const LOG_PREFIX = "[printoo24-backup]";

// جدول‌های کلیدی برای شمارش در manifest (اثبات کامل بودن دیتا)
const COUNT_TABLES = [
  "User", "Order", "OrderItem", "Customer", "Invoice", "PreInvoice",
  "Payment", "RevenueLog", "MaterialCost", "Task", "Package",
];

// ─── زمان ایران بدون وابستگی ───────────────────────────────────────
function iranParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: IRAN_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = {};
  for (const p of fmt.formatToParts(d)) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}-${parts.minute}`,
    stamp: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`,
  };
}

function log(msg) {
  console.log(`${LOG_PREFIX} ${msg}`);
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    const stream = fs.createReadStream(file);
    stream.on("error", reject);
    stream.on("data", (c) => h.update(c));
    stream.on("end", () => resolve(h.digest("hex")));
  });
}

async function main() {
  const started = new Date();
  const t = iranParts(started);
  const destDir = path.join(BACKUP_ROOT, t.date, t.time);
  const destDb = path.join(destDir, "custom.db");

  log(`شروع بکاپ — ${t.stamp} (ساعت ایران)`);
  // اگر همین اسلات قبلاً بکاپ دارد (اجرای دستی مجدد) — کل پوشه را تمیز می‌کنیم
  // سپس از نو می‌سازیم (mkdir بعد از rm — وگرنه VACUUM INTO به پوشهٔ ناموجود می‌خورد)
  if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  let tables = 0;
  try {
    // ۱) snapshot سازگار — VACUUM INTO (قفل نمی‌کند، اپ روشن می‌ماند)
    await db.$executeRawUnsafe(`VACUUM INTO '${destDb.replace(/'/g, "''")}'`);
    log(`snapshot ساخته شد: ${destDb} (${fs.statSync(destDb).size.toLocaleString()} bytes)`);

    // ۲) صحت snapshot — بکاپ خراب قبول نیست
    const verify = new PrismaClient({
      datasources: { db: { url: `file:${destDb}` } },
    });
    try {
      const integrity = await verify.$queryRawUnsafe("PRAGMA integrity_check");
      const ok = integrity?.[0]?.integrity_check === "ok";
      if (!ok) throw new Error(`integrity_check ناموفق: ${JSON.stringify(integrity)}`);
      log("integrity_check: ok ✓");

      tables = Number(
        (
          await verify.$queryRawUnsafe(
            "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table'"
          )
        )[0].c
      );
      log(`جدول‌ها: ${tables}`);

      const counts = {};
      for (const tbl of COUNT_TABLES) {
        try {
          const r = await verify.$queryRawUnsafe(
            `SELECT COUNT(*) as c FROM "${tbl}"`
          );
          counts[tbl] = typeof r[0].c === "bigint" ? r[0].c.toString() : r[0].c;
        } catch {
          counts[tbl] = "n/a";
        }
      }
      const manifest = {
        createdAt: started.toISOString(),
        createdAtIran: t.stamp,
        timezone: IRAN_TZ,
        app: "printoo24-admin (Printo ERP)",
        database: {
          file: "custom.db",
          sizeBytes: fs.statSync(destDb).size,
          sha256: await sha256(destDb),
          integrityCheck: "ok",
          tables,
          rowCounts: counts,
        },
        retentionDays: RETENTION_DAYS,
        schedule: "هر ۳ ساعت (00/03/06/09/12/15/18/21 ساعت ایران)",
      };
      fs.writeFileSync(
        path.join(destDir, "manifest.json"),
        JSON.stringify(manifest, null, 2),
        "utf-8"
      );
      fs.writeFileSync(
        path.join(destDir, "custom.db.sha256"),
        `${manifest.database.sha256}  custom.db\n`,
        "utf-8"
      );
    } finally {
      await verify.$disconnect();
    }
  } finally {
    await db.$disconnect();
  }

  // ۳) پیوست‌های هزینه (uploads) — تا بکاپ یک نقطهٔ بازیابیِ کامل باشد
  try {
    if (fs.existsSync(UPLOADS_DIR)) {
      const tarPath = path.join(destDir, "uploads.tar.gz");
      execFileSync("tar", ["-czf", tarPath, "-C", path.dirname(UPLOADS_DIR), "uploads"], {
        stdio: "pipe",
      });
      log(`uploads آرشیو شد: ${fs.statSync(tarPath).size.toLocaleString()} bytes`);
    }
  } catch (e) {
    log(`هشدار: آرشیو uploads ناموفق (${e.message}) — بکاپ DB معتبر است`);
  }

  // ۴) پاک‌سازی قدیمی‌تر از ۷ روز (بر اساس نام پوشهٔ تاریخ)
  const cutoff = new Date(started.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let removed = 0;
  if (fs.existsSync(BACKUP_ROOT)) {
    for (const dayDir of fs.readdirSync(BACKUP_ROOT)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayDir)) continue;
      // مقایسهٔ تاریخِ پوشه با امروز (مقایسه در UTC نیمه‌روز — امن از DST)
      const dayMidnight = new Date(`${dayDir}T12:00:00Z`);
      if (dayMidnight < cutoff) {
        fs.rmSync(path.join(BACKUP_ROOT, dayDir), { recursive: true, force: true });
        removed++;
        log(`حذف بکاپ‌های قدیمی: ${dayDir}`);
      }
    }
  }

  const finished = new Date();
  log(
    `تمام ✓ ${t.date}/${t.time} — ${tables} جدول، ` +
      `${fs.statSync(destDb).size.toLocaleString()} bytes` +
      `${removed ? `، ${removed} روز قدیمی حذف شد` : ""} ` +
      `(${Math.round((finished - started) / 1000)}s)`
  );
}

main().catch((e) => {
  console.error(`${LOG_PREFIX} خطا:`, e.message);
  process.exit(1);
});
