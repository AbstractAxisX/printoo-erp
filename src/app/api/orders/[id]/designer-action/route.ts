import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Designer actions: send to next stage OR report to QC
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action, note, description } = body;

    if (action === "send_next") {
      // Designer finished → move to printing stage
      await db.order.update({
        where: { id },
        data: {
          status: "in_printing",
          designerNote: note || null,
        },
      });
      // Notify
      await db.notification.create({
        data: {
          title: "سفارش به چاپ ارسال شد",
          message: `طراحی سفارش تکمیل شد و به مرحله چاپ ارسال شد.`,
          type: "success",
          link: "admin:orders",
        },
      });
      return NextResponse.json({ ok: true, action: "send_next" });
    }

    if (action === "report_qc") {
      // Report to QC with description
      await db.qcReport.create({
        data: {
          orderId: id,
          fromModule: "designer",
          description: description || "",
          reportedBy: "designer",
        },
      });
      await db.notification.create({
        data: {
          title: "گزارش کنترل کیفیت",
          message: `طراح گزارشی را برای کنترل کیفیت ثبت کرد.`,
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
