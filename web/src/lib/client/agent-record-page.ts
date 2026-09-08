import { initOrderBulkPdf } from "@/lib/client/admin-order-bulk-pdf";
import { initAgentCommissionPreview } from "@/lib/client/agent-commission-preview";
import { initDashboardCellPopovers } from "@/lib/client/dashboard-cell-popover";
import { initDashboardFragmentTable } from "@/lib/client/dashboard-fragment-table";
import { initDashboardSheets } from "@/lib/client/dashboard-sheet";
import { initRecordPageTabs } from "@/lib/client/record-page-tabs";

function getAgentRecordSection() {
  return document.querySelector<HTMLElement>("[data-agent-record-page]");
}

function initAgentRecordFragmentTables(section: HTMLElement) {
  const agentId = section.dataset.agentId;
  if (!agentId) return;

  const pagePath = `/admin/agents/${agentId}`;
  const fragmentPath = `${pagePath}/fragment`;

  const tableConfigs = [
    {
      formSelector: "[data-agent-record-orders-filter-form]",
      cacheKey: `agent-record-orders-${agentId}-v3`,
      tableShellSelector: "[data-agent-record-orders-table-shell]",
      skeletonTemplateSelector: "[data-agent-record-orders-filter-skeleton]",
      filterKeys: ["tab", "search", "orderType", "source", "orderStatus", "paymentStatus"] as const,
      searchInputSelector: "[data-agent-record-orders-search]",
    },
    {
      formSelector: "[data-customer-record-sales-filter-form]",
      cacheKey: `agent-record-sales-${agentId}-v1`,
      tableShellSelector: "[data-customer-record-sales-table-shell]",
      skeletonTemplateSelector: "[data-customer-record-sales-filter-skeleton]",
      filterKeys: ["tab", "search", "source"] as const,
      searchInputSelector: "[data-customer-record-sales-search]",
    },
    {
      formSelector: "[data-customer-record-invoices-filter-form]",
      cacheKey: `agent-record-invoices-${agentId}-v1`,
      tableShellSelector: "[data-customer-record-invoices-table-shell]",
      skeletonTemplateSelector: "[data-customer-record-invoices-filter-skeleton]",
      filterKeys: ["tab", "search"] as const,
      searchInputSelector: "[data-customer-record-invoices-search]",
    },
    {
      formSelector: "[data-customer-record-payments-filter-form]",
      cacheKey: `agent-record-payments-${agentId}-v1`,
      tableShellSelector: "[data-customer-record-payments-table-shell]",
      skeletonTemplateSelector: "[data-customer-record-payments-filter-skeleton]",
      filterKeys: ["tab", "search"] as const,
      searchInputSelector: "[data-customer-record-payments-search]",
    },
    {
      formSelector: "[data-agent-record-customers-filter-form]",
      cacheKey: `agent-record-customers-${agentId}-v1`,
      tableShellSelector: "[data-agent-record-customers-table-shell]",
      skeletonTemplateSelector: "[data-agent-record-customers-filter-skeleton]",
      filterKeys: ["tab", "search"] as const,
      searchInputSelector: "[data-agent-record-customers-search]",
    },
    {
      formSelector: "[data-agent-record-previous-orders-filter-form]",
      cacheKey: `agent-record-previous-orders-${agentId}-v1`,
      tableShellSelector: "[data-agent-record-previous-orders-table-shell]",
      skeletonTemplateSelector: "[data-agent-record-previous-orders-filter-skeleton]",
      filterKeys: ["tab", "search"] as const,
      searchInputSelector: "[data-agent-record-previous-orders-search]",
    },
  ];

  tableConfigs.forEach((tableConfig) => {
    if (!document.querySelector(tableConfig.formSelector)) {
      return;
    }

    initDashboardFragmentTable({
      cacheKey: tableConfig.cacheKey,
      fragmentPath,
      pagePath,
      formSelector: tableConfig.formSelector,
      tableShellSelector: tableConfig.tableShellSelector,
      skeletonTemplateSelector: tableConfig.skeletonTemplateSelector,
      filterKeys: tableConfig.filterKeys,
      searchInputSelector: tableConfig.searchInputSelector,
      historyStateKey: "agentRecordQuery",
      updatedEvents: ["agent-record:table-updated"],
    });
  });
}

function initAgentRecordTabs() {
  initRecordPageTabs();
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
  initAgentRecordTabs();
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
