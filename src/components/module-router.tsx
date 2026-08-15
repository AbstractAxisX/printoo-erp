"use client";

import * as React from "react";
import { useAppStore } from "@/stores/app-store";
import { findModule } from "@/lib/nav";
import { PageHeader, EmptyState } from "@/components/shared";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

// Admin pages
import { AdminDashboard } from "@/components/modules/admin/dashboard/admin-dashboard";
import { OrdersPage } from "@/components/modules/admin/orders/orders-page";
import { OrderWizardPage } from "@/components/modules/admin/orders/order-wizard-page";
import { OpenOrdersPage } from "@/components/modules/admin/open-orders";
import { TasksPage } from "@/components/modules/admin/tasks-page";
import { CalendarPage } from "@/components/modules/admin/calendar-page";
import { CustomersPage } from "@/components/modules/admin/customers-page";
import { SuppliersPage } from "@/components/modules/admin/suppliers-page";
import { ProductsPage } from "@/components/modules/admin/products-page";
import { ArchivePage } from "@/components/modules/admin/archive-page";

// Generic module page for designer/print/warehouse/finance/qc/crm/srm
import { GenericModulePage } from "@/components/modules/generic-module-page";

/**
 * Registry: (module, page) → component.
 * Returns null for unknown pages (placeholder will be used).
 */
function getPageComponent(moduleKey: string, page: string): React.ComponentType | null {
  if (moduleKey === "admin") {
    switch (page) {
      case "dashboard": return AdminDashboard;
      case "orders": return OrdersPage;
      case "orders-new": return OrderWizardPage;
      case "open-orders": return OpenOrdersPage;
      case "tasks": return TasksPage;
      case "calendar": return CalendarPage;
      case "customers": return CustomersPage;
      case "suppliers": return SuppliersPage;
      case "products": return ProductsPage;
      case "archive": return ArchivePage;
      default: return null;
    }
  }
  // For non-admin modules, use generic page but we need a stable component per (module,page)
  // Use a wrapper that passes props
  return () => <GenericModulePage moduleKey={moduleKey} page={page} />;
}

function pageTitle(mod: ReturnType<typeof findModule>, page: string) {
  for (const g of mod.groups) {
    const item = g.items.find((i) => i.page === page);
    if (item) return item.label;
  }
  return page;
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} icon="grid" />
      <EmptyState
        icon="tool"
        title="این صفحه به‌زودی فعال می‌شود"
        description="این بخش در دست توسعه است و به‌زودی کامل خواهد شد."
      />
    </div>
  );
}

/**
 * ModuleRouter with KEEP-ALIVE: all open tabs stay mounted.
 * Only the active tab is visible; others are hidden via CSS (display:none).
 * This preserves each tab's internal state (forms, scroll, filters) when switching.
 */
export function ModuleRouter() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const moduleKey = useAppStore((s) => s.module);
  const page = useAppStore((s) => s.page);

  return (
    <div className="tab-keepalive-container">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const Comp = getPageComponent(tab.module, tab.page);
        const mod = findModule(tab.module);
        return (
          <div
            key={tab.id}
            className={cn(isActive ? "block" : "hidden")}
            aria-hidden={!isActive}
          >
            {Comp ? (
              <Comp />
            ) : (
              <PlaceholderPage title={pageTitle(mod, tab.page)} />
            )}
          </div>
        );
      })}
      {/* If no tabs open (shouldn't happen normally), show current module/page */}
      {tabs.length === 0 && (() => {
        const Comp = getPageComponent(moduleKey, page);
        const mod = findModule(moduleKey);
        return Comp ? <Comp /> : <PlaceholderPage title={pageTitle(mod, page)} />;
      })()}
    </div>
  );
}
