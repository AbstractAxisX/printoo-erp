"use client";

import * as React from "react";
import { QcReportDetailModal } from "@/components/modules/qc/qc-report-detail";

/**
 * Hook to open the QcReportDetailModal by report ID.
 *
 * Usage:
 *   const { openReport, modal } = useQcReportDetail();
 *   <button onClick={() => openReport(reportId)}>...</button>
 *   {modal}
 */
export function useQcReportDetail() {
  const [reportId, setReportId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const openReport = React.useCallback((id: string) => {
    setReportId(id);
    setOpen(true);
  }, []);

  const modal = (
    <QcReportDetailModal
      reportId={reportId}
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setReportId(null);
      }}
    />
  );

  return { openReport, modal };
}
