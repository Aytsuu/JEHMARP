type SelectedPaymentOrder = {
  id: string;
  balance: number;
};

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseBalance(value: string | undefined) {
  const balance = Number(value ?? 0);
  return Number.isFinite(balance) ? Math.max(roundCurrency(balance), 0) : 0;
}

function minimumPaymentAmountForSelectedOrders(orders: SelectedPaymentOrder[]) {
  if (orders.length === 0) {
    return 0;
  }

  const priorOrderTotal = orders
    .slice(0, -1)
    .reduce((total, order) => total + order.balance, 0);

  return roundCurrency(priorOrderTotal + 0.01);
}

export function initAdminAgentPaymentDistributionForms() {
  document
    .querySelectorAll<HTMLFormElement>("[data-admin-agent-payment-distribution-form]")
    .forEach((form) => {
      if (form.dataset.adminAgentPaymentDistributionInitialized === "true") {
        return;
      }

      form.dataset.adminAgentPaymentDistributionInitialized = "true";
      initAdminAgentPaymentDistributionForm(form);
    });
}

function initAdminAgentPaymentDistributionForm(form: HTMLFormElement) {
  const section = form.closest<HTMLElement>("[data-admin-agent-payment-distribution-section]")
    ?? document;
  const amountInput = form.querySelector<HTMLInputElement>('input[name="amount"]');
  const selectedOrderInputContainer = form.querySelector<HTMLElement>(
    "[data-selected-payment-order-inputs]",
  );

  if (!amountInput || !selectedOrderInputContainer) {
    return;
  }

  const selectedOrderIds: string[] = [];

  const getCheckboxes = () => Array.from(
    section.querySelectorAll<HTMLInputElement>("[data-payment-order-checkbox]"),
  );

  const getSelectedOrders = (): SelectedPaymentOrder[] => selectedOrderIds.flatMap((orderId) => {
    const checkbox = getCheckboxes().find((candidate) => candidate.value === orderId);
    const balance = parseBalance(checkbox?.dataset.paymentOrderBalance);

    return checkbox && balance > 0
      ? [{ id: orderId, balance }]
      : [];
  });

  const syncHiddenInputs = () => {
    const selectedOrders = getSelectedOrders();

    selectedOrderInputContainer.replaceChildren(
      ...selectedOrders.map((order) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "orderId";
        input.value = order.id;
        return input;
      }),
    );
  };

  const syncAmountConstraints = () => {
    const selectedOrders = getSelectedOrders();
    const maximumAmount = roundCurrency(
      selectedOrders.reduce((total, order) => total + order.balance, 0),
    );
    const minimumAmount = minimumPaymentAmountForSelectedOrders(selectedOrders);

    amountInput.min = minimumAmount > 0 ? minimumAmount.toFixed(2) : "0.01";
    amountInput.max = maximumAmount > 0 ? maximumAmount.toFixed(2) : "";
    amountInput.setCustomValidity("");
  };

  const syncFromCheckedBoxes = () => {
    selectedOrderIds.splice(0, selectedOrderIds.length);

    getCheckboxes().forEach((checkbox) => {
      if (checkbox.checked && !selectedOrderIds.includes(checkbox.value)) {
        selectedOrderIds.push(checkbox.value);
      }
    });

    syncHiddenInputs();
    syncAmountConstraints();
  };

  const validateAmount = () => {
    const selectedOrders = getSelectedOrders();
    const amount = Number(amountInput.value);

    amountInput.setCustomValidity("");

    if (selectedOrders.length === 0) {
      amountInput.setCustomValidity("Select at least one customer order with a remaining balance.");
      return false;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      amountInput.setCustomValidity("Payment amount must be greater than zero.");
      return false;
    }

    const minimumAmount = minimumPaymentAmountForSelectedOrders(selectedOrders);
    if (amount < minimumAmount) {
      amountInput.setCustomValidity(
        `Payment amount must be at least ${minimumAmount.toFixed(2)} so the last selected customer order receives a payment.`,
      );
      return false;
    }

    const maximumAmount = roundCurrency(
      selectedOrders.reduce((total, order) => total + order.balance, 0),
    );
    if (maximumAmount > 0 && amount > maximumAmount) {
      amountInput.setCustomValidity("Payment amount cannot exceed selected order balances.");
      return false;
    }

    return true;
  };

  section.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.matches("[data-payment-order-checkbox]")) {
      const existingIndex = selectedOrderIds.indexOf(target.value);

      if (target.checked && existingIndex === -1) {
        selectedOrderIds.push(target.value);
      }

      if (!target.checked && existingIndex !== -1) {
        selectedOrderIds.splice(existingIndex, 1);
      }

      syncHiddenInputs();
      syncAmountConstraints();
      return;
    }

    if (target.matches("[data-order-select-all]")) {
      queueMicrotask(syncFromCheckedBoxes);
    }
  });

  amountInput.addEventListener("input", () => {
    amountInput.setCustomValidity("");
  });

  form.addEventListener("submit", (event) => {
    syncFromCheckedBoxes();

    if (!validateAmount()) {
      event.preventDefault();
      amountInput.reportValidity();
    }
  });

  syncFromCheckedBoxes();
}
