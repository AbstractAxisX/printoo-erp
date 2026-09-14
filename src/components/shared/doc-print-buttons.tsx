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
 */
export function DocPrintButtons({ fileName }: { fileName: string }) {
  const [downloading, setDownloading] = React.useState(false);

  const handlePrint = () => {
    const res = printElementClean("#printable-invoice", fileName);
    if (!res.ok && res.error === "popup-blocked") {
      toast.error("پنجرهٔ چاپ مسدود شد — پاپ‌آپ را برای این سایت مجاز کنید");
    }
  };

  const handleDownload = async () => {
    if (downloading) return;
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
