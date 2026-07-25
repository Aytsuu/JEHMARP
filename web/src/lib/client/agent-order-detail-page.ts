import {
  initOrderBulkPdf,
  ORDER_SELECTION_CHANGED_EVENT,
} from "@/lib/client/admin-order-bulk-pdf";
import { initAdminAgentPaymentDistributionForms } from "@/lib/client/admin-agent-payment-distribution-form";
import { initDashboardCellPopovers } from "@/lib/client/dashboard-cell-popover";
import { initDashboardSheets } from "@/lib/client/dashboard-sheet";
import { initOrderProductsList } from "@/lib/client/order-products-list";

type SelectedOrderSummary = {
  id: string;
  code: string;
  date: string;
  amount: string;
};

const AGENT_PAYMENT_SHEET_ID = "agent-order-payment-sheet";

function formatCurrencyForClient(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number.isFinite(value) ? value : 0);
}

function getAgentOrderDetailSection() {
  return document.querySelector<HTMLElement>("[data-agent-order-detail-page]");
}

function getAgentPaymentSheet() {
  return document.getElementById(AGENT_PAYMENT_SHEET_ID);
}

function getOrderCheckboxes(section: HTMLElement) {
  return Array.from(
    section.querySelectorAll<HTMLInputElement>("[data-order-row-checkbox]"),
  );
}

function isPaymentEligibleOrderCheckbox(checkbox: HTMLInputElement) {
  return checkbox.dataset.orderPaymentEligible === "true";
}

function getSelectedOrderCheckboxes(section: HTMLElement) {
  return getOrderCheckboxes(section).filter((checkbox) => checkbox.checked);
}

function getSelectedPaymentEligibleOrderCheckboxes(section: HTMLElement) {
  return getSelectedOrderCheckboxes(section).filter(isPaymentEligibleOrderCheckbox);
}

function getSelectedOrderSummaries(section: HTMLElement): SelectedOrderSummary[] {
  return getSelectedPaymentEligibleOrderCheckboxes(section).map((checkbox) => ({
    id: checkbox.value,
    code: checkbox.dataset.orderCode ?? checkbox.value,
    date: checkbox.dataset.orderDate ?? "",
    amount: checkbox.dataset.orderBalance ?? "",
  }));
}

function getSelectedOrderTotalBalance(section: HTMLElement) {
  return getSelectedPaymentEligibleOrderCheckboxes(section).reduce((total, checkbox) => {
    const balance = Number(checkbox.dataset.orderBalanceValue ?? 0);
    return total + (Number.isFinite(balance) ? balance : 0);
  }, 0);
}

function updateAgentOrderToolbarState(section: HTMLElement) {
  const hasPaymentEligibleSelection =
    getSelectedPaymentEligibleOrderCheckboxes(section).length > 0;

  section.querySelectorAll<HTMLButtonElement>("[data-agent-order-add-payment]").forEach((button) => {
    button.disabled = !hasPaymentEligibleSelection;
  });
}

function renderSelectedOrdersList(section: HTMLElement) {
  const sheet = getAgentPaymentSheet();
  if (!sheet) return;

  const list = sheet.querySelector<HTMLElement>("[data-customer-payment-selected-orders]");
  if (!list) return;

  const selectedOrders = getSelectedOrderSummaries(section);
  const title = sheet.querySelector<HTMLElement>("[data-customer-payment-orders-title]");
  if (title) {
    title.textContent = `Selected Orders (${selectedOrders.length})`;
  }

  list.replaceChildren();

  if (selectedOrders.length === 0) {
    const empty = document.createElement("p");
    empty.className = "customer-payment-sheet__empty";
    empty.textContent = "Select one or more unpaid orders to distribute payment.";
    list.append(empty);
  } else {
    selectedOrders.forEach((order) => {
      const row = document.createElement("div");
      row.className = "customer-payment-sheet__order-row";
      row.innerHTML = `
        <div class="customer-payment-sheet__order-top">
          <span class="customer-payment-sheet__order-code">${order.code}</span>
          <strong class="customer-payment-sheet__order-amount">${order.amount}</strong>
        </div>
        <span class="customer-payment-sheet__order-date">${order.date}</span>
      `;
      list.append(row);
    });
  }

  const totalBalance = getSelectedOrderTotalBalance(section);
  const totalValue = sheet.querySelector<HTMLElement>("[data-customer-payment-total-value]");
  if (totalValue) {
    totalValue.textContent = formatCurrencyForClient(totalBalance);
  }

  const amountInput = sheet.querySelector<HTMLInputElement>("[data-customer-payment-amount]");
  if (amountInput) {
    amountInput.max = totalBalance > 0 ? String(totalBalance) : "";
  }
}

function refreshAgentOrderPaymentSelection(section: HTMLElement) {
  renderSelectedOrdersList(section);
  updateAgentOrderToolbarState(section);
}

function bindAgentPaymentSheet(section: HTMLElement) {
  section.querySelectorAll<HTMLButtonElement>("[data-agent-order-add-payment]").forEach((button) => {
    button.addEventListener("click", () => {
      refreshAgentOrderPaymentSelection(section);
    });
  });

  section.addEventListener(ORDER_SELECTION_CHANGED_EVENT, () => {
    refreshAgentOrderPaymentSelection(section);
  });

  bindAgentPaymentOrdersCard();
}

function bindAgentPaymentOrdersCard() {
  const sheet = getAgentPaymentSheet();
  if (!sheet || sheet.dataset.customerPaymentOrdersCardInitialized === "true") {
    return;
  }

  sheet.dataset.customerPaymentOrdersCardInitialized = "true";

  sheet.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const toggle = target.closest<HTMLElement>("[data-customer-payment-orders-toggle]");
    if (!toggle || !sheet.contains(toggle)) return;

    const card = sheet.querySelector<HTMLElement>("[data-customer-payment-orders-card]");
    if (!card) return;

    const isCollapsed = card.classList.toggle("is-collapsed");
    toggle.setAttribute("aria-expanded", String(!isCollapsed));
  });
}

function bindAgentOrderPagination(section: HTMLElement) {
  const container = section.querySelector<HTMLElement>("[data-interactive-table]");
  if (!container || container.dataset.agentOrderPaginationInitialized === "true") {
    return;
  }

  container.dataset.agentOrderPaginationInitialized = "true";

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const button = target.closest<HTMLButtonElement>(
      "[data-pagination-prev], [data-pagination-next]",
    );
    if (!button || button.disabled) return;

    const page = button.dataset.page;
    if (!page) return;

    const params = new URLSearchParams(window.location.search);
    if (Number(page) > 1) {
      params.set("page", page);
    } else {
      params.delete("page");
    }

    const query = params.toString();
    window.location.assign(
      query.length > 0 ? `${window.location.pathname}?${query}` : window.location.pathname,
    );
  });

  container.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || !target.matches("[data-limit-select]")) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (target.value !== "10") {
      params.set("pageSize", target.value);
    } else {
      params.delete("pageSize");
    }
    params.delete("page");

    const query = params.toString();
    window.location.assign(
      query.length > 0 ? `${window.location.pathname}?${query}` : window.location.pathname,
    );
  });

  const pageInput = container.querySelector<HTMLInputElement>("[data-pagination-page-input]");
  pageInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    const footer = container.querySelector<HTMLElement>("[data-server-pagination-footer]");
    const totalPages = Number(footer?.dataset.totalPages ?? "1");
    const page = Math.min(
      Math.max(Number(pageInput.value), 1),
      Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
    );
    const params = new URLSearchParams(window.location.search);

    if (page > 1) {
      params.set("page", String(page));
    } else {
      params.delete("page");
    }

    const query = params.toString();
    window.location.assign(
      query.length > 0 ? `${window.location.pathname}?${query}` : window.location.pathname,
    );
  });
}

function bindAgentOrderCustomerFilters(section: HTMLElement) {
  const form = section.querySelector<HTMLFormElement>(
    "[data-agent-order-customers-filter-form]",
  );
  const searchInput = section.querySelector<HTMLInputElement>(
    "[data-agent-order-customers-search]",
  );

  if (!form || !searchInput || form.dataset.agentOrderFiltersInitialized === "true") {
    return;
  }

  form.dataset.agentOrderFiltersInitialized = "true";

  let searchTimer: number | undefined;

  const submitFilters = () => {
    const params = new URLSearchParams(new FormData(form) as unknown as URLSearchParams);
    params.delete("page");
    const query = params.toString();
    window.location.assign(
      query.length > 0 ? `${window.location.pathname}?${query}` : window.location.pathname,
    );
  };

  form.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
    select.addEventListener("change", submitFilters);
  });

  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(submitFilters, 300);
  });
}

function bindAgentOrderTableSelection(section: HTMLElement) {
  section.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    if (
      target.matches("[data-order-row-checkbox]") ||
      target.matches("[data-order-select-all]")
    ) {
      refreshAgentOrderPaymentSelection(section);
      section.dispatchEvent(new CustomEvent(ORDER_SELECTION_CHANGED_EVENT));
    }
  });

  refreshAgentOrderPaymentSelection(section);
}

export function initAgentOrderDetailPage() {
  const section = getAgentOrderDetailSection();
  if (!section) {
    return;
  }

  const isFirstInit = section.dataset.agentOrderDetailInitialized !== "true";

  if (isFirstInit) {
    section.dataset.agentOrderDetailInitialized = "true";
    bindAgentPaymentSheet(section);
    bindAgentOrderCustomerFilters(section);
    bindAgentOrderPagination(section);
    bindAgentOrderTableSelection(section);
  }

  initDashboardCellPopovers();
  initDashboardSheets();
  initAdminAgentPaymentDistributionForms();
  initOrderProductsList();
  initOrderBulkPdf({
    sectionSelector: "[data-agent-order-detail-page]",
    menuTriggerSelector:
      "#agent-order-customers-document-menu [data-table-action-menu-trigger]",
  });

  if (isFirstInit) {
    refreshAgentOrderPaymentSelection(section);
  }
}
