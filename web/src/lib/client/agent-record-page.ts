import { initOrderBulkPdf } from "@/lib/client/admin-order-bulk-pdf";
import { initAgentCommissionPreview } from "@/lib/client/agent-commission-preview";
import { initDashboardCellPopovers } from "@/lib/client/dashboard-cell-popover";
import { initDashboardFragmentTable } from "@/lib/client/dashboard-fragment-table";
import { initDashboardSheets } from "@/lib/client/dashboard-sheet";
import type { AgentRecordTab } from "@/lib/admin-dashboard/agent-record";

function getAgentRecordSection() {
  return document.querySelector<HTMLElement>("[data-agent-record-page]");
}

function getActiveAgentRecordTab(): AgentRecordTab {
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (
    tab === "sales"
    || tab === "invoices"
    || tab === "payments"
    || tab === "customers"
    || tab === "previous-orders"
    || tab === "agent-orders"
  ) {
    return tab === "agent-orders" ? "orders" : tab;
  }

  return "orders";
}

function initAgentRecordFragmentTables(section: HTMLElement) {
  const agentId = section.dataset.agentId;
  if (!agentId) return;

  const pagePath = `/admin/agents/${agentId}`;
  const fragmentPath = `${pagePath}/fragment`;
  const activeTab = getActiveAgentRecordTab();

  if (activeTab === "orders" && document.querySelector("[data-agent-record-orders-filter-form]")) {
    initDashboardFragmentTable({
      cacheKey: `agent-record-orders-${agentId}-v2`,
      fragmentPath,
      pagePath,
      formSelector: "[data-agent-record-orders-filter-form]",
      tableShellSelector: "[data-agent-record-orders-table-shell]",
      skeletonTemplateSelector: "[data-agent-record-orders-filter-skeleton]",
      filterKeys: ["tab", "search", "orderType", "source", "orderStatus", "paymentStatus"],
      searchInputSelector: "[data-agent-record-orders-search]",
      historyStateKey: "agentRecordQuery",
      updatedEvents: ["agent-record:table-updated"],
    });
    return;
  }

  if (activeTab === "sales" && document.querySelector("[data-customer-record-sales-filter-form]")) {
    initDashboardFragmentTable({
      cacheKey: `agent-record-sales-${agentId}-v1`,
      fragmentPath,
      pagePath,
      formSelector: "[data-customer-record-sales-filter-form]",
      tableShellSelector: "[data-customer-record-sales-table-shell]",
      skeletonTemplateSelector: "[data-customer-record-sales-filter-skeleton]",
      filterKeys: ["tab", "search", "source"],
      searchInputSelector: "[data-customer-record-sales-search]",
      historyStateKey: "agentRecordQuery",
      updatedEvents: ["agent-record:table-updated"],
    });
    return;
  }

  if (activeTab === "invoices" && document.querySelector("[data-customer-record-invoices-filter-form]")) {
    initDashboardFragmentTable({
      cacheKey: `agent-record-invoices-${agentId}-v1`,
      fragmentPath,
      pagePath,
      formSelector: "[data-customer-record-invoices-filter-form]",
      tableShellSelector: "[data-customer-record-invoices-table-shell]",
      skeletonTemplateSelector: "[data-customer-record-invoices-filter-skeleton]",
      filterKeys: ["tab", "search"],
      searchInputSelector: "[data-customer-record-invoices-search]",
      historyStateKey: "agentRecordQuery",
      updatedEvents: ["agent-record:table-updated"],
    });
    return;
  }

  if (activeTab === "payments" && document.querySelector("[data-customer-record-payments-filter-form]")) {
    initDashboardFragmentTable({
      cacheKey: `agent-record-payments-${agentId}-v1`,
      fragmentPath,
      pagePath,
      formSelector: "[data-customer-record-payments-filter-form]",
      tableShellSelector: "[data-customer-record-payments-table-shell]",
      skeletonTemplateSelector: "[data-customer-record-payments-filter-skeleton]",
      filterKeys: ["tab", "search"],
      searchInputSelector: "[data-customer-record-payments-search]",
      historyStateKey: "agentRecordQuery",
      updatedEvents: ["agent-record:table-updated"],
    });
    return;
  }

  if (activeTab === "customers" && document.querySelector("[data-agent-record-customers-filter-form]")) {
    initDashboardFragmentTable({
      cacheKey: `agent-record-customers-${agentId}-v1`,
      fragmentPath,
      pagePath,
      formSelector: "[data-agent-record-customers-filter-form]",
      tableShellSelector: "[data-agent-record-customers-table-shell]",
      skeletonTemplateSelector: "[data-agent-record-customers-filter-skeleton]",
      filterKeys: ["tab", "search"],
      searchInputSelector: "[data-agent-record-customers-search]",
      historyStateKey: "agentRecordQuery",
      updatedEvents: ["agent-record:table-updated"],
    });
    return;
  }

  if (activeTab === "previous-orders" && document.querySelector("[data-agent-record-previous-orders-filter-form]")) {
    initDashboardFragmentTable({
      cacheKey: `agent-record-previous-orders-${agentId}-v1`,
      fragmentPath,
      pagePath,
      formSelector: "[data-agent-record-previous-orders-filter-form]",
      tableShellSelector: "[data-agent-record-previous-orders-table-shell]",
      skeletonTemplateSelector: "[data-agent-record-previous-orders-filter-skeleton]",
      filterKeys: ["tab", "search"],
      searchInputSelector: "[data-agent-record-previous-orders-search]",
      historyStateKey: "agentRecordQuery",
      updatedEvents: ["agent-record:table-updated"],
    });
  }
}

function resetAgentRecordOrdersBulkPdf() {
  initOrderBulkPdf({
    sectionSelector: "[data-agent-record-page]",
    menuTriggerSelector: "#agent-record-document-menu [data-table-action-menu-trigger]",
  });
}

export function initAgentRecordPage() {
  const section = getAgentRecordSection();
  if (!section) return;

  initDashboardSheets();
  initDashboardCellPopovers();
  initAgentCommissionPreview(section);
  initAgentRecordFragmentTables(section);

  if (section.dataset.agentOrdersBulkPdfInitialized !== "true") {
    section.dataset.agentOrdersBulkPdfInitialized = "true";

    document.addEventListener("agent-record:table-updated", () => {
      resetAgentRecordOrdersBulkPdf();
    });

    document.addEventListener("dashboard:interactive-table-updated", () => {
      resetAgentRecordOrdersBulkPdf();
    });
  }

  resetAgentRecordOrdersBulkPdf();
}
