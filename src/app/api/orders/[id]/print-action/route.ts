import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Print actions: confirm material, send to warehouse, report to QC
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action, description } = body;

    if (action === "confirm_material") {
      await db.orderItem.updateMany({
        where: { orderId: id },
        data: { materialConfirmed: true },
      });
      await db.notification.create({
        data: {
          title: "تایید تأمین متریال",
          message: `متریال سفارش تأمین شد و به چاپ منتقل شد.`,
          type: "success",
          link: "print:orders",
        },
      });
      return NextResponse.json({ ok: true, action: "confirm_material" });
    }

    if (action === "send_warehouse") {
      await db.order.update({ where: { id }, data: { status: "warehouse_logistics" } });
      await db.notification.create({
        data: {
          title: "ارسال به انبار",
          message: `سفارش از چاپ به انبار و لجستیک ارسال شد.`,
          type: "success",
          link: "warehouse:dashboard",
        },
      });
      return NextResponse.json({ ok: true, action: "send_warehouse" });
    }

    if (action === "report_qc") {
      await db.qcReport.create({
        data: {
          orderId: id,
          fromModule: "print",
          description: description || "",
          reportedBy: "print",
        },
      });
      await db.notification.create({
        data: {
          title: "گزارش کنترل کیفیت از چاپ",
          message: `چاپ گزارشی را برای کنترل کیفیت ثبت کرد.`,
          type: "warning",
          link: "qc:dashboard",
        },
      });
      return NextResponse.json({ ok: true, action: "report_qc" });
    }

    return NextResponse.json({ error: "action نامعتبر" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}
