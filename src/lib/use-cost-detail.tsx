"use client";

import * as React from "react";
import { FinanceCostDetailModal } from "@/components/modules/finance/finance-cost-detail";

/**
 * Hook to open the FinanceCostDetailModal by cost ID.
 *
 * Usage:
 *   const { openCost, modal } = useCostDetail();
 *   <button onClick={() => openCost(costId)}>...</button>
 *   {modal}
 */
export function useCostDetail() {
  const [costId, setCostId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const openCost = React.useCallback((id: string) => {
    setCostId(id);
    setOpen(true);
  }, []);

  const modal = (
    <FinanceCostDetailModal
      costId={costId}
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setCostId(null);
      }}
    />
  );

  return { openCost, modal };
}
