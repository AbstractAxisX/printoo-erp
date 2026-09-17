#!/usr/bin/env bash
# Printoo24 ERP — Restore Script (Phase 23)
# ─────────────────────────────────────────────────────────────────
# بازیابی سریع بکاپ دیتابیس ERP:
#   restore-backup.sh                → فهرست بکاپ‌ها
#   restore-backup.sh latest         → بازیابی آخرین بکاپ
#   restore-backup.sh 2026-09-17/15-00 → بازیابی بکاپ مشخص
#
# مراحل: توقف اپ → بکاپ ایمنی از DB فعلی → جایگزینی → راه‌اندازی →
# صحت‌سنجی (integrity + HTTP health) → گزارش.
# فقط پروژهٔ ERP — به Docker کاری ندارد.

set -euo pipefail

ROOT="/opt/printoo24-admin"
BACKUP_ROOT="$ROOT/backups"
DB_PATH="$ROOT/db/custom.db"
SERVICE="printoo24-admin.service"
STAMP() { date '+%Y-%m-%d %H:%M:%S'; }

log()  { echo "[$(STAMP)] [restore] $*"; }
err()  { echo "[$(STAMP)] [restore] خطا: $*" >&2; }

# ─── انتخاب بکاپ ───────────────────────────────────────────────────
list_backups() {
  echo "بکاپ‌های موجود (جدیدترین اول):"
  find "$BACKUP_ROOT" -name custom.db -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | cut -d' ' -f2- \
    | sed "s|$BACKUP_ROOT/||; s|/custom.db||" \
    | head -60
}

if [ $# -eq 0 ]; then
  list_backups
  echo
  echo "استفاده: $0 latest | $0 YYYY-MM-DD/HH-MM"
  exit 0
fi

if [ "$1" = "latest" ]; then
  SEL=$(find "$BACKUP_ROOT" -name custom.db -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2-)
  if [ -z "$SEL" ]; then
    err "هیچ بکاپی پیدا نشد"
    exit 1
  fi
else
  SEL="$BACKUP_ROOT/$1/custom.db"
fi

if [ ! -f "$SEL" ]; then
  err "فایل بکاپ پیدا نشد: $SEL"
  exit 1
fi

# ─── صحت بکاپ قبل از هر کاری ───────────────────────────────────────
log "بکاپ انتخاب‌شده: $SEL ($(stat -c%s "$SEL") bytes)"

if command -v sqlite3 >/dev/null 2>&1; then
  CHK=$(sqlite3 "$SEL" "PRAGMA integrity_check;" 2>/dev/null || echo "error")
  if [ "$CHK" != "ok" ]; then
    err "بکاپ سالم نیست (integrity_check=$CHK) — بازیابی متوقف شد"
    exit 1
  fi
  log "integrity_check بکاپ: ok ✓"
else
  # بدون sqlite3 CLI — بررسی sha256 اگر فایل کنارش هست
  SHA_FILE="${SEL%custom.db}custom.db.sha256"
  if [ -f "$SHA_FILE" ]; then
    ( cd "$(dirname "$SEL")" && sha256sum -c custom.db.sha256 >/dev/null 2>&1 ) \
      && log "sha256 بکاپ: ok ✓" \
      || { err "sha256 بکاپ مطابقت ندارد — بازیابی متوقف شد"; exit 1; }
  else
    log "هشدار: sqlite3 و sha256 موجود نیست — بدون صحت‌سنجی ادامه می‌دهیم"
  fi
fi

# ─── توقف اپ ────────────────────────────────────────────────────────
log "توقف $SERVICE ..."
systemctl stop "$SERVICE"

# ─── بکاپ ایمنی از DB فعلی (قبل از جایگزینی) ───────────────────────
if [ -f "$DB_PATH" ]; then
  SAFETY="$ROOT/db/custom.db.pre-restore-$(date '+%Y%m%d-%H%M%S')"
  cp -a "$DB_PATH" "$SAFETY"
  log "نسخهٔ ایمنی از DB فعلی: $SAFETY"
fi

# ─── جایگزینی ──────────────────────────────────────────────────────
INSTALL_DIR="$(dirname "$SEL")"
cp -a "$SEL" "$DB_PATH"
log "بکاپ جایگزین $DB_PATH شد"

# پیوست‌ها هم اگر داخل بکاپ بودند
if [ -f "$INSTALL_DIR/uploads.tar.gz" ]; then
  tar -xzf "$INSTALL_DIR/uploads.tar.gz" -C "$ROOT"
  log "پیوست‌ها (uploads) بازیابی شد"
fi

chown root:root "$DB_PATH" 2>/dev/null || true
chmod 755 "$DB_PATH"

# ─── راه‌اندازی ──────────────────────────────────────────────────────
log "راه‌اندازی $SERVICE ..."
systemctl start "$SERVICE"
sleep 3

# ─── صحت‌سنجی بعد از راه‌اندازی ────────────────────────────────────
if systemctl is-active --quiet "$SERVICE"; then
  log "سرویس فعال ✓"
else
  err "سرویس بالا نیامد! لاگ:"
  journalctl -u "$SERVICE" -n 20 --no-pager || tail -20 /var/log/printoo24-admin.log || true
  err "دیتابیس جایگزین شده ولی سرویس بالا نیست — لاگ را ببینید. نسخهٔ ایمنی: ${SAFETY:-n/a}"
  exit 1
fi

HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/ || echo 000)
if [ "$HTTP" = "200" ] || [ "$HTTP" = "307" ] || [ "$HTTP" = "302" ]; then
  log "سلامت HTTP: $HTTP ✓"
else
  err "پاسخ HTTP غیرمنتظره: $HTTP — لاگ سرویس را بررسی کنید"
  exit 1
fi

log "بازیابی کامل شد ✓ (بکاپ: $(basename "$(dirname "$SEL")"))"
