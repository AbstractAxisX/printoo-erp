# Printoo24 ERP — سیستم بکاپ دیتابیس

بکاپ خودکار و **کامل** دیتابیس SQLite پروژهٔ ERP (Printo) — هر ۳ ساعت، به وقت ایران.

## زمان‌بندی
- ساعت‌های رند ایران: **00:00، 03:00، 06:00، 09:00، 12:00، 15:00، 18:00، 21:00** (هر روز ۸ بکاپ)
- نگهداری: **۷ روز** (حدود ۵۶ بکاپ) — قدیمی‌ترها خودکار حذف می‌شوند
- اگر سرور لحظهٔ بکاپ خاموش بود، بعد از روشن شدن جبران می‌شود (`Persistent=true`)

## ساختار پوشه‌ها
```
/opt/printoo24-admin/backups/
├── README.txt                        ← همین راهنما
├── 2026-09-17/
│   ├── 12-00/
│   │   ├── custom.db                 ← snapshot کامل دیتابیس (قابل بازیابی مستقیم)
│   │   ├── custom.db.sha256          ← چک‌سام برای راستی‌آزمایی
│   │   ├── manifest.json             ← متادیتا: ساعت ایران، سایز، شمار جدول‌ها/ردیف‌ها
│   │   └── uploads.tar.gz            ← پیوست‌های هزینه (فایل‌های آپلودی)
│   ├── 15-00/
│   └── ...
```

## صحت بکاپ
هر بکاپ قبل از قبول شدن:
1. با `VACUUM INTO` به‌صورت **سازگار** (consistent) گرفته می‌شود — حتی وقتی اپ روشن است و می‌نویسد
2. با `PRAGMA integrity_check` روی خودِ فایل بکاپ تأیید می‌شود
3. sha256 آن محاسبه و ذخیره می‌شود

## بازیابی
```bash
# فهرست بکاپ‌ها
/opt/printoo24-admin/scripts/server/restore-backup.sh

# بازیابی آخرین بکاپ (سریع‌ترین راه هنگام مشکل)
/opt/printoo24-admin/scripts/server/restore-backup.sh latest

# بازیابی بکاپ مشخص
/opt/printoo24-admin/scripts/server/restore-backup.sh 2026-09-17/15-00
```
اسکریپت بازیابی: اپ را می‌خواباند → از DB فعلی نسخهٔ ایمنی می‌گیرد → بکاپ را
جایگزین می‌کند → اپ را بالا می‌آورد → سلامت HTTP را چک می‌کند.

## مدیریت
```bash
systemctl status  printoo24-backup.timer    # وضعیت تایمر
systemctl list-timers | grep printoo        # زمان اجرای بعدی
journalctl -u printoo24-backup.service -n 50  # لاگ آخرین بکاپ‌ها
systemctl start  printoo24-backup.service  # بکاپ دستی همین حالا
systemctl stop   printoo24-backup.timer     # توقف بکاپ خودکار
systemctl start  printoo24-backup.timer     # فعال‌سازی مجدد
```

## نکته‌ها
- این سیستم **فقط** پروژهٔ ERP را بکاپ می‌گیرد — به کانتینرهای Docker سرور کاری ندارد.
- دیتابیس لایو: `/opt/printoo24-admin/db/custom.db` — خودِ سرویس از همان می‌خواند.
- قبل از هر بازیابی، از وضعیت فعلی DB نسخهٔ ایمنی با پسوند `pre-restore-…` گرفته می‌شود.
