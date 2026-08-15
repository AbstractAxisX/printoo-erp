"use client";

import * as React from "react";
import { PageHeader } from "@/components/shared";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { getPreset, type TimeRange } from "@/lib/time-ranges";
import { KpiCardsGrid } from "./kpi-cards";
import { QuickStatsRow } from "./quick-stats";
import { NearDeadlineOrders, LatestTasks, RecentOrders } from "./dashboard-sections";

export function AdminDashboard() {
  const navigate = useAppStore((s) => s.navigate);
  const [globalRange, setGlobalRange] = React.useState<TimeRange>(() => getPreset("this-month"));
  const [showChart, setShowChart] = React.useState(false);

  return (
    <div className="space-y-5">
      <PageHeader
        title="داشبورد"
        description="نمای کلی سامانه مدیریت چاپ Printoo24"
        icon="dashboard"
        actions={
          <Button onClick={() => navigate("admin", "orders-new")} className="gap-2">
            <Icon name="plus" size={16} /> سفارش جدید
          </Button>
        }
      />

      {/* KPI cards with global filter + chart toggle */}
      <KpiCardsGrid
        globalRange={globalRange}
        onGlobalRangeChange={setGlobalRange}
        showChart={showChart}
        onToggleChart={() => setShowChart(!showChart)}
      />

      {/* Quick stat cards */}
      <QuickStatsRow />

      {/* Recent orders */}
      <RecentOrders />

      {/* Two-column: near deadline + latest tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NearDeadlineOrders />
        <LatestTasks />
      </div>
    </div>
  );
}
