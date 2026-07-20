const initializedFlag = "paymentFormToggleInitialized";

export function initOrderPaymentFormToggle(root: ParentNode = document) {
  root.querySelectorAll<HTMLButtonElement>("[data-toggle-payment-form]").forEach((button) => {
    if (button.dataset[initializedFlag] === "true") return;

    const container = button.closest(".payment-panel") ?? root;
    const paymentForm = container.querySelector<HTMLFormElement>("[data-payment-form]");
    if (!paymentForm) return;

    button.dataset[initializedFlag] = "true";
    initPaymentPricing(paymentForm);
    button.addEventListener("click", () => {
      paymentForm.hidden = !paymentForm.hidden;
    });
  });
}

function initPaymentPricing(form: HTMLFormElement) {
  if (form.dataset.paymentPricingInitialized === "true") return;
  form.dataset.paymentPricingInitialized = "true";

  const customerTypeSelect = form.querySelector<HTMLSelectElement>("[data-payment-customer-type]");
  const amountInput = form.querySelector<HTMLInputElement>("[data-payment-amount]");
  const totalValue = form.querySelector<HTMLElement>("[data-payment-total-value]");
  const balanceValue = form.querySelector<HTMLElement>("[data-payment-balance-value]");
  const paidTotalInput = form.querySelector<HTMLInputElement>("[data-payment-paid-total]");

  if (!customerTypeSelect || !amountInput || !totalValue || !balanceValue) return;

  const activeCustomerTypeSelect = customerTypeSelect;
  const activeAmountInput = amountInput;
  const activeTotalValue = totalValue;
  const activeBalanceValue = balanceValue;

  function currentOrderTotal() {
    return Array.from(form.querySelectorAll<HTMLElement>("[data-payment-pricing-item]")).reduce(
      (total, item) => {
        const quantity = Number(item.dataset.finalQuantity ?? 0);
        const defaultPrice = Number(item.dataset.defaultPrice ?? 0);
        const resellerPrice = Number(item.dataset.resellerPrice ?? defaultPrice);
        const unitPrice = activeCustomerTypeSelect.value === "reseller" ? resellerPrice : defaultPrice;

        if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return total;

        return total + quantity * unitPrice;
      },
      0,
    );
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(value);
  }

  function formatAmount(value: number) {
    return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
  }

  function refreshPaymentAmounts() {
    const paidTotal = Number(paidTotalInput?.value ?? 0);
    const orderTotal = currentOrderTotal();
    const balance = Math.max(orderTotal - (Number.isFinite(paidTotal) ? paidTotal : 0), 0);
    const formattedBalance = formatAmount(balance);

    activeTotalValue.textContent = formatCurrency(orderTotal);
    activeBalanceValue.textContent = formatCurrency(balance);
    activeAmountInput.max = formattedBalance;

    const currentAmount = Number(activeAmountInput.value);
    if (!activeAmountInput.value || !Number.isFinite(currentAmount) || currentAmount > balance) {
      activeAmountInput.value = formattedBalance;
    }
  }

  activeCustomerTypeSelect.addEventListener("change", refreshPaymentAmounts);
  refreshPaymentAmounts();
}
