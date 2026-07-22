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
  const paidTotal = Number(form.dataset.paymentPaidTotal ?? 0);
  const commissionTotal = Number(form.dataset.paymentCommissionTotal ?? 0);

  if (!amountInput) return;
  const paymentAmountInput = amountInput;

  function currentOrderTotal() {
    const pricedTotal = Array.from(form.querySelectorAll<HTMLElement>("[data-payment-pricing-item]")).reduce(
      (total, item) => {
        const quantity = Number(item.dataset.finalQuantity ?? 0);
        const defaultPrice = Number(item.dataset.defaultPrice ?? 0);
        const resellerPrice = Number(item.dataset.resellerPrice ?? defaultPrice);
        const unitPrice = customerTypeSelect?.value === "reseller" ? resellerPrice : defaultPrice;

        if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return total;

        return total + quantity * unitPrice;
      },
      0,
    );

    if (pricedTotal > 0) {
      return pricedTotal;
    }

    const datasetTotal = Number(form.dataset.paymentOrderTotal ?? 0);
    return Number.isFinite(datasetTotal) ? datasetTotal : 0;
  }

  function formatAmount(value: number) {
    return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
  }

  function refreshPaymentAmounts() {
    const orderTotal = currentOrderTotal();
    const balance = Math.max(
      orderTotal -
        (Number.isFinite(commissionTotal) ? commissionTotal : 0) -
        (Number.isFinite(paidTotal) ? paidTotal : 0),
      0,
    );
    const formattedBalance = formatAmount(balance);

    paymentAmountInput.min = "0.01";
    paymentAmountInput.max = formattedBalance;

    const currentAmount = Number(paymentAmountInput.value);
    if (!paymentAmountInput.value || !Number.isFinite(currentAmount) || currentAmount < 0) {
      paymentAmountInput.value = "0.00";
    }
  }

  customerTypeSelect?.addEventListener("change", refreshPaymentAmounts);
  refreshPaymentAmounts();
}
