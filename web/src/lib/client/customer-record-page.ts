import {
  initOrderBulkPdf,
  ORDER_SELECTION_CHANGED_EVENT,
} from "@/lib/client/admin-order-bulk-pdf";
import { initDashboardCellPopovers } from "@/lib/client/dashboard-cell-popover";
import { initDashboardFragmentTable } from "@/lib/client/dashboard-fragment-table";
import { initDashboardSheets } from "@/lib/client/dashboard-sheet";

type SelectedOrderSummary = {
  id: string;
  code: string;
  date: string;
  amount: string;
};

type CustomerRecordTab = "orders" | "sales" | "invoices" | "payments";

const CUSTOMER_PAYMENT_SHEET_ID = "customer-record-payment-sheet";

function formatCurrencyForClient(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number.isFinite(value) ? value : 0,
  );
}

function getCustomerRecordSection() {
  return document.querySelector<HTMLElement>("[data-customer-record-page]");
}

function getCustomerPaymentSheet() {
  return document.getElementById(CUSTOMER_PAYMENT_SHEET_ID);
}

function getActiveCustomerRecordTab(): CustomerRecordTab {
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "sales" || tab === "invoices" || tab === "payments") {
    return tab;
  }

  return "orders";
}

function getOrderCheckboxes(section: HTMLElement) {
  return Array.from(
    section.querySelectorAll<HTMLInputElement>("[data-order-row-checkbox]"),
  );
}

function isPaymentEligibleOrderCheckbox(checkbox: HTMLInputElement) {
  return checkbox.dataset.orderPaymentEligible === "true";
}

function getPaymentEligibleOrderCheckboxes(section: HTMLElement) {
  return getOrderCheckboxes(section).filter(isPaymentEligibleOrderCheckbox);
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

function updateCustomerRecordToolbarState(section: HTMLElement) {
  const hasPaymentEligibleSelection = getSelectedPaymentEligibleOrderCheckboxes(section).length > 0;

  section.querySelectorAll<HTMLButtonElement>("[data-customer-add-payment]").forEach((button) => {
    button.disabled = !hasPaymentEligibleSelection;
  });
}

function getSelectedOrderTotalBalance(section: HTMLElement) {
  return getSelectedPaymentEligibleOrderCheckboxes(section).reduce((total, checkbox) => {
    const balance = Number(checkbox.dataset.orderBalanceValue ?? 0);
    return total + (Number.isFinite(balance) ? balance : 0);
  }, 0);
}

function renderSelectedOrdersList(section: HTMLElement) {
  const sheet = getCustomerPaymentSheet();
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

function refreshCustomerRecordPaymentSelection(section: HTMLElement) {
  renderSelectedOrdersList(section);
  updateCustomerRecordToolbarState(section);
}

function bindCustomerPaymentSheet(section: HTMLElement) {
  const paymentForm = getCustomerPaymentSheet()?.querySelector<HTMLFormElement>(
    "[data-customer-payment-form]",
  );
  const orderIdsHost = getCustomerPaymentSheet()?.querySelector<HTMLElement>(
    "[data-customer-payment-order-ids]",
  );

  section.querySelectorAll<HTMLButtonElement>("[data-customer-add-payment]").forEach((button) => {
    button.addEventListener("click", () => {
      refreshCustomerRecordPaymentSelection(section);
    });
  });

  paymentForm?.addEventListener("submit", () => {
    if (!orderIdsHost) return;

    orderIdsHost.replaceChildren();
    getSelectedPaymentEligibleOrderCheckboxes(section).forEach((checkbox) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "orderId";
      input.value = checkbox.value;
      orderIdsHost.append(input);
    });
  });

  section.addEventListener(ORDER_SELECTION_CHANGED_EVENT, () => {
    refreshCustomerRecordPaymentSelection(section);
  });

  bindCustomerPaymentOrdersCard();
}

function bindCustomerPaymentOrdersCard() {
  const sheet = getCustomerPaymentSheet();
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

function initCustomerRecordFragmentTables(section: HTMLElement) {
  const customerId = section.dataset.customerId;
  if (!customerId) return;

  const pagePath = `/admin/customers/${customerId}`;
  const fragmentPath = `${pagePath}/fragment`;
  const activeTab = getActiveCustomerRecordTab();

  if (activeTab === "orders" && document.querySelector("[data-customer-record-orders-filter-form]")) {
    initDashboardFragmentTable({
      cacheKey: `customer-record-orders-${customerId}-v1`,
      fragmentPath,
      pagePath,
      formSelector: "[data-customer-record-orders-filter-form]",
      tableShellSelector: "[data-customer-record-orders-table-shell]",
      skeletonTemplateSelector: "[data-customer-record-orders-filter-skeleton]",
      filterKeys: ["tab", "search", "source", "orderStatus", "paymentStatus"],
      searchInputSelector: "[data-customer-record-orders-search]",
      historyStateKey: "customerRecordQuery",
      updatedEvents: ["customer-record:table-updated"],
    });
    return;
  }

  if (activeTab === "sales" && document.querySelector("[data-customer-record-sales-filter-form]")) {
    initDashboardFragmentTable({
      cacheKey: `customer-record-sales-${customerId}-v1`,
      fragmentPath,
      pagePath,
      formSelector: "[data-customer-record-sales-filter-form]",
      tableShellSelector: "[data-customer-record-sales-table-shell]",
      skeletonTemplateSelector: "[data-customer-record-sales-filter-skeleton]",
      filterKeys: ["tab", "search", "source"],
      searchInputSelector: "[data-customer-record-sales-search]",
      historyStateKey: "customerRecordQuery",
      updatedEvents: ["customer-record:table-updated"],
    });
    return;
  }

  if (activeTab === "invoices" && document.querySelector("[data-customer-record-invoices-filter-form]")) {
    initDashboardFragmentTable({
      cacheKey: `customer-record-invoices-${customerId}-v1`,
      fragmentPath,
      pagePath,
      formSelector: "[data-customer-record-invoices-filter-form]",
      tableShellSelector: "[data-customer-record-invoices-table-shell]",
      skeletonTemplateSelector: "[data-customer-record-invoices-filter-skeleton]",
      filterKeys: ["tab", "search"],
      searchInputSelector: "[data-customer-record-invoices-search]",
      historyStateKey: "customerRecordQuery",
      updatedEvents: ["customer-record:table-updated"],
    });
    return;
  }

  if (activeTab === "payments" && document.querySelector("[data-customer-record-payments-filter-form]")) {
    initDashboardFragmentTable({
      cacheKey: `customer-record-payments-${customerId}-v1`,
      fragmentPath,
      pagePath,
      formSelector: "[data-customer-record-payments-filter-form]",
      tableShellSelector: "[data-customer-record-payments-table-shell]",
      skeletonTemplateSelector: "[data-customer-record-payments-filter-skeleton]",
      filterKeys: ["tab", "search"],
      searchInputSelector: "[data-customer-record-payments-search]",
      historyStateKey: "customerRecordQuery",
      updatedEvents: ["customer-record:table-updated"],
    });
  }
}

function resetCustomerRecordOrdersBulkPdf(section: HTMLElement) {
  initOrderBulkPdf({
    sectionSelector: "[data-customer-record-page]",
    menuTriggerSelector: "#customer-record-document-menu [data-table-action-menu-trigger]",
  });
}

function refreshCustomerRecordOrdersTableState(section: HTMLElement) {
  resetCustomerRecordOrdersBulkPdf(section);
  refreshCustomerRecordPaymentSelection(section);
}

export function initCustomerRecordPage() {
  const section = getCustomerRecordSection();
  if (!section) return;

  initDashboardSheets();
  initDashboardCellPopovers();
  initCustomerRecordFragmentTables(section);

  if (section.dataset.customerPaymentSheetInitialized !== "true") {
    section.dataset.customerPaymentSheetInitialized = "true";
    bindCustomerPaymentSheet(section);

    document.addEventListener("customer-record:table-updated", () => {
      refreshCustomerRecordOrdersTableState(section);
    });

    document.addEventListener("dashboard:interactive-table-updated", () => {
      refreshCustomerRecordOrdersTableState(section);
    });
  }

  resetCustomerRecordOrdersBulkPdf(section);
  refreshCustomerRecordPaymentSelection(section);
}
