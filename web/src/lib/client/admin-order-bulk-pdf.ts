import { closeActiveTableActionMenu } from "@/lib/client/table-action-menu";

type BulkOrderPdfKind = "sales-invoice" | "order-slip";

const bulkPdfEndpoints: Record<BulkOrderPdfKind, string> = {
  "sales-invoice": "/admin/orders/bulk-sales-invoice.pdf",
  "order-slip": "/admin/orders/bulk-order-slip.pdf",
};

const bulkPdfActionMap: Record<string, BulkOrderPdfKind> = {
  "bulk-sales-invoice-pdf": "sales-invoice",
  "bulk-order-slip-pdf": "order-slip",
};

export const ORDER_SELECTION_CHANGED_EVENT = "dashboard:order-selection-changed";

const bulkPdfControllers = new WeakMap<HTMLElement, { refresh: () => void }>();

export type OrderBulkPdfInitOptions = {
  sectionSelector: string;
  menuTriggerSelector: string;
};

export function syncOrderRowSelectionFromSelectAll(
  section: ParentNode,
  selectAll: HTMLInputElement,
) {
  const shouldSelectAll = selectAll.checked;

  section.querySelectorAll<HTMLInputElement>("[data-order-row-checkbox]:not(:disabled)").forEach(
    (checkbox) => {
      checkbox.checked = shouldSelectAll;
    },
  );

  selectAll.indeterminate = false;
}

function notifyOrderSelectionChanged(section: HTMLElement) {
  section.dispatchEvent(
    new CustomEvent(ORDER_SELECTION_CHANGED_EVENT, { bubbles: true }),
  );
}

export function initOrderBulkPdf({
  sectionSelector,
  menuTriggerSelector,
}: OrderBulkPdfInitOptions) {
  const section = document.querySelector<HTMLElement>(sectionSelector);
  if (!section) return;

  const existingController = bulkPdfControllers.get(section);
  if (section.dataset.bulkPdfInitialized === "true") {
    existingController?.refresh();
    return;
  }

  section.dataset.bulkPdfInitialized = "true";
  const activeSection = section;

  const documentMenuTrigger = activeSection.querySelector<HTMLButtonElement>(
    menuTriggerSelector,
  );

  function getRowCheckboxes() {
    return Array.from(
      activeSection.querySelectorAll<HTMLInputElement>("[data-order-row-checkbox]:not(:disabled)"),
    );
  }

  function getSelectAllCheckbox() {
    return activeSection.querySelector<HTMLInputElement>("[data-order-select-all]");
  }

  function getSelectedSelections() {
    return getRowCheckboxes()
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => `${checkbox.dataset.orderRowType}:${checkbox.value}`);
  }

  function updateDocumentMenuState() {
    const hasSelection = getSelectedSelections().length > 0;

    if (documentMenuTrigger) {
      documentMenuTrigger.disabled = !hasSelection;
    }
  }

  function updateSelectAllState() {
    const selectAllCheckbox = getSelectAllCheckbox();
    if (!selectAllCheckbox) return;

    const rowCheckboxes = getRowCheckboxes();
    const checkedCount = rowCheckboxes.filter((checkbox) => checkbox.checked).length;

    selectAllCheckbox.checked = rowCheckboxes.length > 0 && checkedCount === rowCheckboxes.length;
    selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < rowCheckboxes.length;
  }

  function refreshSelectionUi() {
    updateDocumentMenuState();
    updateSelectAllState();
    notifyOrderSelectionChanged(activeSection);
  }

  function resetSelection() {
    getRowCheckboxes().forEach((checkbox) => {
      checkbox.checked = false;
    });

    const selectAllCheckbox = getSelectAllCheckbox();
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }

    closeActiveTableActionMenu();
    refreshSelectionUi();
  }

  function openBulkPdf(kind: BulkOrderPdfKind) {
    const selections = getSelectedSelections();
    if (selections.length === 0) return;

    const params = new URLSearchParams();
    selections.forEach((selection) => {
      params.append("selection", selection);
    });

    window.open(`${bulkPdfEndpoints[kind]}?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  activeSection.addEventListener("change", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement)) return;

    if (target.matches("[data-order-row-checkbox]")) {
      refreshSelectionUi();
      return;
    }

    if (target.matches("[data-order-select-all]")) {
      syncOrderRowSelectionFromSelectAll(activeSection, target);
      refreshSelectionUi();
    }
  });

  activeSection.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const menuItem = target.closest<HTMLElement>("[data-action-menu-item]");
    if (!menuItem || !activeSection.contains(menuItem)) return;

    const action = menuItem.dataset.action;
    const kind = action ? bulkPdfActionMap[action] : undefined;
    if (!kind) return;

    openBulkPdf(kind);
  });

  document.addEventListener("dashboard:interactive-table-updated", resetSelection);

  bulkPdfControllers.set(activeSection, { refresh: refreshSelectionUi });
  refreshSelectionUi();
}

export function initAdminOrderBulkPdf() {
  initOrderBulkPdf({
    sectionSelector: "#admin-orders",
    menuTriggerSelector: "#admin-orders-document-menu [data-table-action-menu-trigger]",
  });
}

export function initAgentOrderCustomerBulkPdf() {
  initOrderBulkPdf({
    sectionSelector: "#agent-order-customers",
    menuTriggerSelector:
      "#agent-order-customers-document-menu [data-table-action-menu-trigger]",
  });
}
