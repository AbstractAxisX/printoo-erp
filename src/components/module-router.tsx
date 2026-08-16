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
import { ExpenseTypesPage } from "@/components/modules/admin/expense-types-page";

// CRM pages
import { CRMDashboard } from "@/components/modules/crm/crm-dashboard";
import { CRMPipeline } from "@/components/modules/crm/crm-pipeline";
import { CRMCustomers } from "@/components/modules/crm/crm-customers";
import { CRMDeals } from "@/components/modules/crm/crm-deals";
import { CRMActivities } from "@/components/modules/crm/crm-activities";

// Designer pages
import { DesignerDashboard } from "@/components/modules/designer/designer-dashboard";
import { DesignerOrders } from "@/components/modules/designer/designer-orders";
import { DesignerCalendar } from "@/components/modules/designer/designer-calendar";
import { DesignerTasks } from "@/components/modules/designer/designer-tasks";

// Print pages
import { PrintDashboard } from "@/components/modules/print/print-dashboard";
import { PrintOrders } from "@/components/modules/print/print-orders";
import { PrintCalendar } from "@/components/modules/print/print-calendar";
import { PrintTasks } from "@/components/modules/print/print-tasks";

// QC pages
import { QcDashboard } from "@/components/modules/qc/qc-dashboard";
import { QcReports } from "@/components/modules/qc/qc-reports";
import { QcCalendar } from "@/components/modules/qc/qc-calendar";

// Finance pages
import { FinanceDashboard } from "@/components/modules/finance/finance-dashboard";
import { FinanceCosts } from "@/components/modules/finance/finance-costs";

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
      case "expense-types": return ExpenseTypesPage;
      case "archive": return ArchivePage;
      default: return null;
    }
  }
  if (moduleKey === "crm") {
    switch (page) {
      case "dashboard": return CRMDashboard;
      case "pipeline": return CRMPipeline;
      case "customers": return CRMCustomers;
      case "deals": return CRMDeals;
      case "activities": return CRMActivities;
      default: return null;
    }
  }
  if (moduleKey === "designer") {
    switch (page) {
      case "dashboard": return DesignerDashboard;
      case "orders": return DesignerOrders;
      case "calendar": return DesignerCalendar;
      case "tasks": return DesignerTasks;
      default: return null;
    }
  }
  if (moduleKey === "print") {
    switch (page) {
      case "dashboard": return PrintDashboard;
      case "orders": return PrintOrders;
      case "calendar": return PrintCalendar;
      case "tasks": return PrintTasks;
      default: return null;
    }
  }
  if (moduleKey === "qc") {
    switch (page) {
      case "dashboard": return QcDashboard;
      case "reports": return QcReports;
      case "calendar": return QcCalendar;
      default: return null;
    }
  }
  if (moduleKey === "finance") {
    switch (page) {
      case "dashboard": return FinanceDashboard;
      case "costs": return FinanceCosts;
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
