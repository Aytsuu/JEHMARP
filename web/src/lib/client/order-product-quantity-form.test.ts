import { beforeEach, describe, expect, it, vi } from "vitest";

import { initOrderProductQuantityForms } from "./order-product-quantity-form";

function renderQuantityForm() {
  document.body.innerHTML = `
    <form
      data-order-product-quantity-form
      data-order-quantity-original="3"
      data-order-quantity-paid-total="600"
      data-order-quantity-subtotal-without-item="0"
      data-order-quantity-commission-without-item="0"
      data-order-quantity-unit-price="300"
      data-order-quantity-agent-commission-amount="0"
      data-order-quantity-agent-commission-type="value"
      data-order-quantity-agent-commission-value="0"
    >
      <input name="quantity" type="number" min="0.001" step="0.001" value="3" required />
      <button type="submit">Save</button>
    </form>
  `;
}

function getForm() {
  return document.querySelector<HTMLFormElement>("[data-order-product-quantity-form]")!;
}

function getQuantityInput() {
  return document.querySelector<HTMLInputElement>('input[name="quantity"]')!;
}

function getSaveButton() {
  return document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
}

function dispatchQuantityInput(value: string) {
  const input = getQuantityInput();
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return input;
}

function submitForm() {
  const form = getForm();
  const event = new SubmitEvent("submit", { cancelable: true });
  const reportValidity = vi.spyOn(getQuantityInput(), "reportValidity").mockReturnValue(false);

  form.dispatchEvent(event);

  return { event, reportValidity };
}

describe("initOrderProductQuantityForms", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("disables save while the quantity is unchanged", () => {
    renderQuantityForm();

    initOrderProductQuantityForms();

    expect(getSaveButton().disabled).toBe(true);
  });

  it("enables save when the quantity changes and disables it again when reverted", () => {
    renderQuantityForm();

    initOrderProductQuantityForms();
    dispatchQuantityInput("4");

    expect(getSaveButton().disabled).toBe(false);

    dispatchQuantityInput("3");

    expect(getSaveButton().disabled).toBe(true);
  });

  it("uses native constraint validation for zero quantities before submitting", () => {
    renderQuantityForm();

    initOrderProductQuantityForms();
    const input = dispatchQuantityInput("0");
    const { event, reportValidity } = submitForm();

    expect(getSaveButton().disabled).toBe(false);
    expect(input.validationMessage).toBe("Quantity must be greater than zero.");
    expect(event.defaultPrevented).toBe(true);
    expect(reportValidity).toHaveBeenCalledTimes(1);
  });

  it("blocks reductions that would make receivable lower than recorded payments", () => {
    renderQuantityForm();

    initOrderProductQuantityForms();
    const input = dispatchQuantityInput("1.5");
    const { event, reportValidity } = submitForm();

    expect(input.validationMessage).toBe(
      "Order product quantities cannot be reduced below the recorded payment total.",
    );
    expect(event.defaultPrevented).toBe(true);
    expect(reportValidity).toHaveBeenCalledTimes(1);
  });

  it("allows changed quantities when projected receivable still covers payments", () => {
    renderQuantityForm();

    initOrderProductQuantityForms();
    const input = dispatchQuantityInput("2");
    const { event, reportValidity } = submitForm();

    expect(input.validationMessage).toBe("");
    expect(event.defaultPrevented).toBe(false);
    expect(reportValidity).not.toHaveBeenCalled();
  });

  it("deducts projected commission before checking payment coverage", () => {
    renderQuantityForm();
    const form = getForm();
    form.dataset.orderQuantityPaidTotal = "840";
    form.dataset.orderQuantityAgentCommissionType = "value";
    form.dataset.orderQuantityAgentCommissionValue = "20";
    form.dataset.orderQuantityCommissionTrigger = "true";

    initOrderProductQuantityForms();
    const input = dispatchQuantityInput("2.8");
    const { event } = submitForm();

    expect(input.validationMessage).toBe(
      "Order product quantities cannot be reduced below the recorded payment total.",
    );
    expect(event.defaultPrevented).toBe(true);
  });
});
