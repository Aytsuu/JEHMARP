import { resetFormSubmissionState } from "@/lib/client/form-submission-state";
import { getOrderCreditLimitWarning } from "@/lib/client/order-credit-limit";
import { initOrderCustomerPicker, type InitOrderCustomerPickerOptions } from "@/lib/client/order-customer-picker";
import { calculateOrderItemsTotal } from "@/lib/client/order-total";

const defaultNewCustomerCreditLimit = 1000;

type OrderCustomerPickerController = ReturnType<typeof initOrderCustomerPicker>;

function formatCurrencyForClient(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(value);
}

function formatCompactCurrencyForClient(value: number) {
  const normalizedValue = Number.isFinite(value) ? value : 0;
  const absoluteValue = Math.abs(normalizedValue);
  const sign = normalizedValue < 0 ? "-" : "";
  const currencySymbol = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).formatToParts(0).find((part) => part.type === "currency")?.value ?? "PHP";

  if (absoluteValue >= 1000) {
    const compactValue = new Intl.NumberFormat("en-PH", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    }).format(absoluteValue / 1000);

    return `${sign}${currencySymbol}${compactValue}k`;
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(normalizedValue);
}

export function initAdminCreateOrderSheet() {
  const form = document.querySelector<HTMLFormElement>("#create-order-form");
  if (!form || form.dataset.orderSheetInitialized === "true") return;
  const orderForm = form;

  const orderItems = form.querySelector<HTMLElement>("[data-order-items]");
  const orderItemTemplate = form.querySelector<HTMLTemplateElement>("[data-order-item-template]");
  const addOrderItemButton = form.querySelector<HTMLButtonElement>("[data-add-order-item]");
  const releaseDateInput = form.querySelector<HTMLInputElement>("[data-release-date]");
  const releaseTimeInput = form.querySelector<HTMLInputElement>("[data-release-time]");
  const downpaymentAmountInput = form.querySelector<HTMLInputElement>("[data-downpayment-amount]");
  const downpaymentSection = form.querySelector<HTMLElement>("[data-downpayment-section]");
  const agentOrderAgentInput = form.querySelector<HTMLInputElement>("[data-agent-order-agent-id]");
  const agentOrderFields = form.querySelector<HTMLElement>("[data-agent-order-fields]");
  const agentOrderTypeSelect = form.querySelector<HTMLSelectElement>("[data-agent-order-type]");
  const newCustomerFields = form.querySelector<HTMLElement>("[data-new-customer-fields]");
  const isResellerCheckbox = form.querySelector<HTMLInputElement>("[data-customer-is-reseller]");

  // Declared before init because picker onChange runs during initOrderCustomerPicker.
  // eslint-disable-next-line prefer-const -- assigned after options; must stay undefined during init callback
  let profilePicker: OrderCustomerPickerController | undefined;

  function selectedCustomerIsReseller() {
    return profilePicker?.isSelectedCustomerReseller()
      ?? isResellerCheckbox?.checked
      ?? false;
  }

  function calculateOrderTotal() {
    const items = Array.from(orderForm.querySelectorAll<HTMLElement>("[data-order-item-row]")).map((row) => {
      const select = row.querySelector<HTMLSelectElement>("[data-order-product-select]");
      const quantityInput = row.querySelector<HTMLInputElement>("input[name='quantity']");
      const selectedOption = select?.selectedOptions?.[0];

      return {
        quantity: Number(quantityInput?.value ?? 0),
        unitPrice: Number(
          selectedCustomerIsReseller()
            ? selectedOption?.dataset.productResellerPrice
            : selectedOption?.dataset.productRetailPrice,
        ),
      };
    });

    return calculateOrderItemsTotal(items);
  }

  function updateOrderTotal() {
    const formatted = formatCurrencyForClient(calculateOrderTotal());
    document
      .querySelectorAll<HTMLElement>("#create-order-sheet [data-order-total-value]")
      .forEach((node) => {
        node.textContent = formatted;
      });
  }

  function refreshAgentOrderMode() {
    const hasAgentTarget = Boolean(agentOrderAgentInput?.value);
    const isDistributionOrder = hasAgentTarget && agentOrderTypeSelect?.value === "distribution";

    if (agentOrderFields) agentOrderFields.hidden = !hasAgentTarget;
    if (agentOrderTypeSelect) agentOrderTypeSelect.disabled = !hasAgentTarget;

    const paymentFields = downpaymentSection?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input, select, textarea",
    );
    paymentFields?.forEach((field) => {
      field.disabled = isDistributionOrder;
    });
    downpaymentSection?.toggleAttribute("data-disabled", isDistributionOrder);
    if (isDistributionOrder && downpaymentAmountInput) {
      downpaymentAmountInput.value = "";
    }

    updateOrderTotal();
  }

  const profilePickerOptions: InitOrderCustomerPickerOptions = {
    scope: form,
    apiEndpoint: "/admin/order-target-profiles.json",
    profileScope: "customer-agent",
    cacheKey: "admin-order-target-profiles-v1",
    newCustomerFields,
    showPaymentNotice: true,
    agentIdInput: agentOrderAgentInput,
    onChange: () => {
      refreshAgentOrderMode();
    },
  };

  profilePicker = initOrderCustomerPicker(profilePickerOptions);

  function daysUntilReleaseDate() {
    if (!releaseDateInput?.value) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const releaseDate = new Date(`${releaseDateInput.value}T${releaseTimeInput?.value || "00:00"}:00`);
    const difference = Math.round((releaseDate.getTime() - today.getTime()) / 86_400_000);

    return Number.isFinite(difference) ? difference : null;
  }

  function shouldConfirmCreditLimit() {
    if (agentOrderAgentInput?.value) return null;

    const selectedCustomer = profilePicker?.getSelectedCustomerProfile();
    const orderTotal = calculateOrderTotal();
    const downpaymentAmount = Number(downpaymentAmountInput?.value ?? 0);

    return getOrderCreditLimitWarning({
      currentBalance: selectedCustomer?.balance ?? 0,
      creditLimit: selectedCustomer?.creditLimit ?? defaultNewCustomerCreditLimit,
      orderTotal,
      downpaymentAmount,
      isAgentOrder: false,
    });
  }

  function cancelOrderSubmit(event: SubmitEvent) {
    event.preventDefault();
    resetFormSubmissionState(orderForm);
  }

  form.addEventListener("submit", (event) => {
    const downpaymentAmount = Number(downpaymentAmountInput?.value ?? 0);
    const releaseDays = daysUntilReleaseDate();

    if (
      (!Number.isFinite(downpaymentAmount) || downpaymentAmount <= 0) &&
      releaseDays !== null &&
      releaseDays >= 1 &&
      releaseDays <= 2
    ) {
      const shouldProceed = window.confirm(
        "The release date is 1-2 days away and no downpayment has been recorded. Proceed with this order?",
      );

      if (!shouldProceed) {
        cancelOrderSubmit(event);
        return;
      }
    }

    const creditLimitWarning = shouldConfirmCreditLimit();

    if (creditLimitWarning) {
      const shouldProceed = window.confirm(
        [
          "This order will exceed the customer's credit limit.",
          `Current balance: ${formatCompactCurrencyForClient(creditLimitWarning.currentBalance)}.`,
          `New unpaid amount: ${formatCompactCurrencyForClient(creditLimitWarning.addedBalance)}.`,
          `Projected balance: ${formatCompactCurrencyForClient(creditLimitWarning.projectedBalance)}.`,
          `Credit limit: ${formatCompactCurrencyForClient(creditLimitWarning.creditLimit)}.`,
          "Proceed with this order?",
        ].join("\n"),
      );

      if (!shouldProceed) {
        cancelOrderSubmit(event);
      }
    }
  });

  function updateOrderItemTitle(scope: ParentNode) {
    const title = scope.querySelector<HTMLElement>("[data-order-item-title]");
    const select = scope.querySelector<HTMLSelectElement>("[data-order-product-select]");
    const selectedOption = select?.selectedOptions?.[0];
    const productName = selectedOption?.dataset.productName?.trim() || "Select product";
    if (title) title.textContent = productName;
  }

  function bindOrderItem(scope: ParentNode) {
    const select = scope.querySelector<HTMLSelectElement>("[data-order-product-select]");
    const quantityInput = scope.querySelector<HTMLInputElement>("input[name='quantity']");
    select?.addEventListener("change", () => {
      updateOrderItemTitle(scope);
      updateOrderTotal();
    });
    quantityInput?.addEventListener("input", updateOrderTotal);
    updateOrderItemTitle(scope);
  }

  orderItems?.querySelectorAll<HTMLElement>(".order-item-accordion").forEach((item) => {
    bindOrderItem(item);
  });

  addOrderItemButton?.addEventListener("click", () => {
    const templateItem = orderItemTemplate?.content.firstElementChild;

    if (!orderItems || !templateItem) return;

    const clonedItem = templateItem.cloneNode(true);
    orderItems.append(clonedItem);

    if (clonedItem instanceof HTMLElement) {
      bindOrderItem(clonedItem);
    }

    if (clonedItem instanceof HTMLDetailsElement) {
      clonedItem.open = true;
    }

    updateOrderTotal();
  });

  orderItems?.addEventListener("click", (event) => {
    const target = event.target;
    const removeButton = target instanceof HTMLElement
      ? target.closest<HTMLElement>("[data-remove-order-item]")
      : null;

    if (!removeButton) return;

    event.preventDefault();
    event.stopPropagation();
    removeButton.closest(".order-item-accordion")?.remove();
    updateOrderTotal();
  });

  isResellerCheckbox?.addEventListener("change", updateOrderTotal);
  agentOrderTypeSelect?.addEventListener("change", refreshAgentOrderMode);

  refreshAgentOrderMode();
  updateOrderTotal();
  form.dataset.orderSheetInitialized = "true";
}
