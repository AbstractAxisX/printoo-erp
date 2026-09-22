"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { toast } from "sonner";
import { printElementClean, downloadElementAsPdf } from "@/lib/print-doc";

/**
 * دکمه‌های چاپ + دانلود PDF سند — یکدست برای فاکتور/پیش‌فاکتور/صورت‌حساب.
 * fileName «بدون» پسوند است؛ هم عنوان پنجرهٔ چاپ (نام پیش‌فرض Save as PDF
 * مرورگر) و هم نام فایل دانلودی از همین ساخته می‌شود.
 * فاز ۲۵: onRequest → دکمه‌ها به‌جای چاپ مستقیم، گیت انتخاب ارز را باز
 * می‌کنند؛ چاپ واقعی بعد از انتخاب ارز توسط caller انجام می‌شود.
 */
export function DocPrintButtons({
  fileName,
  onRequest,
}: {
  fileName: string;
  /** فاز ۲۵: اگر داده شود، کلیک چاپ/PDF این را صدا می‌زند (باز کردن گیت ارز) */
  onRequest?: (action: "print" | "pdf") => void;
}) {
  const [downloading, setDownloading] = React.useState(false);

  const handlePrint = () => {
    if (onRequest) {
      onRequest("print");
      return;
    }
    const res = printElementClean("#printable-invoice", fileName);
    if (!res.ok && res.error === "popup-blocked") {
      toast.error("پنجرهٔ چاپ مسدود شد — پاپ‌آپ را برای این سایت مجاز کنید");
    }
  };

  const handleDownload = async () => {
    if (downloading) return;
    if (onRequest) {
      onRequest("pdf");
      return;
    }
    setDownloading(true);
    try {
      const res = await downloadElementAsPdf(
        "#printable-invoice",
        `${fileName}.pdf`
      );
      if (!res.ok) {
        toast.error("ساخت فایل PDF ناموفق بود — دوباره تلاش کنید");
      } else {
        toast.success("فایل PDF دانلود شد");
      }
    } catch {
      toast.error("خطا در ساخت PDF — دوباره تلاش کنید");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={downloading}
        onClick={handleDownload}
        className="gap-1.5 h-8"
      >
        <Icon
          name={downloading ? "refresh" : "download"}
          size={13}
          className={downloading ? "animate-spin" : undefined}
        />
        {downloading ? "در حال ساخت…" : "دانلود PDF"}
      </Button>
      <Button size="sm" onClick={handlePrint} className="gap-1.5 h-8 shadow-sm">
        <Icon name="print" size={13} /> چاپ
      </Button>
    </>
  );
}
