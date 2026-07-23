const initializedFlag = "orderProductQuantityValidationInitialized";
const paymentCoverageMessage =
  "Order product quantities cannot be reduced below the recorded payment total.";
const positiveQuantityMessage = "Quantity must be greater than zero.";

export function initOrderProductQuantityForms(root: ParentNode = document) {
  root
    .querySelectorAll<HTMLFormElement>("[data-order-product-quantity-form]")
    .forEach((form) => {
      if (form.dataset[initializedFlag] === "true") return;

      const input = form.querySelector<HTMLInputElement>('input[name="quantity"]');
      const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');

      if (!input || !submitButton) return;

      form.dataset[initializedFlag] = "true";
      initQuantityForm(form, input, submitButton);
    });
}

function initQuantityForm(
  form: HTMLFormElement,
  input: HTMLInputElement,
  submitButton: HTMLButtonElement,
) {
  const originalQuantity = numberFromDataset(form.dataset.orderQuantityOriginal, Number(input.value));
  const isReadonly = input.disabled || submitButton.disabled;

  function refreshValidity() {
    input.setCustomValidity("");

    const quantity = Number(input.value);
    const isChanged = !sameQuantity(quantity, originalQuantity);

    submitButton.disabled = isReadonly || !isChanged;

    if (!input.value.trim() || !Number.isFinite(quantity)) {
      return;
    }

    if (quantity <= 0) {
      input.setCustomValidity(positiveQuantityMessage);
      return;
    }

    if (!projectedReceivableCoversRecordedPayments(form, quantity)) {
      input.setCustomValidity(paymentCoverageMessage);
    }
  }

  input.addEventListener("input", refreshValidity);
  input.addEventListener("change", refreshValidity);
  form.addEventListener("submit", (event) => {
    refreshValidity();

    if (!input.checkValidity()) {
      event.preventDefault();
      input.reportValidity();
    }
  });

  refreshValidity();
}

function projectedReceivableCoversRecordedPayments(form: HTMLFormElement, quantity: number) {
  const paidTotal = numberFromDataset(form.dataset.orderQuantityPaidTotal, 0);

  if (paidTotal <= 0) {
    return true;
  }

  const subtotalWithoutItem = numberFromDataset(form.dataset.orderQuantitySubtotalWithoutItem, 0);
  const commissionWithoutItem = numberFromDataset(form.dataset.orderQuantityCommissionWithoutItem, 0);
  const unitPrice = numberFromDataset(form.dataset.orderQuantityUnitPrice, 0);
  const targetCommission = targetCommissionForQuantity(form, quantity);
  const projectedSubtotal = subtotalWithoutItem + quantity * unitPrice;
  const projectedCommissionTotal = commissionWithoutItem + targetCommission;
  const shouldDeductCommission =
    form.dataset.orderQuantityCommissionTrigger === "true" || projectedCommissionTotal > 0;
  const projectedReceivable = roundCurrency(
    projectedSubtotal - (shouldDeductCommission ? projectedCommissionTotal : 0),
  );

  return projectedReceivable + 0.005 >= paidTotal;
}

function targetCommissionForQuantity(form: HTMLFormElement, quantity: number) {
  const fixedCommission = numberFromDataset(form.dataset.orderQuantityAgentCommissionAmount, 0);

  if (fixedCommission > 0) {
    return Math.max(roundCurrency(fixedCommission), 0);
  }

  const commissionValue = numberFromDataset(form.dataset.orderQuantityAgentCommissionValue, 0);
  const commissionType = form.dataset.orderQuantityAgentCommissionType;
  const unitPrice = numberFromDataset(form.dataset.orderQuantityUnitPrice, 0);

  if (commissionType === "percentage") {
    return roundCurrency(quantity * unitPrice * commissionValue / 100);
  }

  if (commissionType === "value") {
    return roundCurrency(quantity * commissionValue);
  }

  return 0;
}

function numberFromDataset(value: string | undefined, fallback: number) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function sameQuantity(left: number, right: number) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.000001;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
