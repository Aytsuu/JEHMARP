import { beforeEach, describe, expect, it, vi } from "vitest";

import { initAdminAgentPaymentDistributionForms } from "./admin-agent-payment-distribution-form";

function renderPaymentDistributionForm() {
  document.body.innerHTML = `
    <section id="agent-order-customers">
      <form data-admin-agent-payment-distribution-form>
        <div data-selected-payment-order-inputs hidden></div>
        <input name="amount" type="number" min="0.01" step="0.01" required />
        <button type="submit">Record selected payments</button>
      </form>
      <input
        type="checkbox"
        value="49d07a2e-a8bb-4dc9-8df5-8ee5464286fb"
        data-payment-order-checkbox
        data-payment-order-balance="100"
      />
      <input
        type="checkbox"
        value="0d805818-837b-42d9-996e-79a6a3559f9b"
        data-payment-order-checkbox
        data-payment-order-balance="200"
      />
    </section>
  `;
}

function getAmountInput() {
  return document.querySelector<HTMLInputElement>('input[name="amount"]')!;
}

function getCheckboxes() {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>("[data-payment-order-checkbox]"),
  );
}

function getHiddenOrderInputs() {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      '[data-selected-payment-order-inputs] input[name="orderId"]',
    ),
  );
}

function submitForm() {
  const form = document.querySelector<HTMLFormElement>(
    "[data-admin-agent-payment-distribution-form]",
  )!;
  const event = new SubmitEvent("submit", { cancelable: true });
  const reportValidity = vi.spyOn(getAmountInput(), "reportValidity").mockReturnValue(false);

  form.dispatchEvent(event);

  return { event, reportValidity };
}

describe("initAdminAgentPaymentDistributionForms", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("syncs selected customer orders into the admin payment form", () => {
    renderPaymentDistributionForm();

    initAdminAgentPaymentDistributionForms();
    const [first, second] = getCheckboxes();
    first.checked = true;
    first.dispatchEvent(new Event("change", { bubbles: true }));
    second.checked = true;
    second.dispatchEvent(new Event("change", { bubbles: true }));

    expect(getHiddenOrderInputs().map((input) => input.value)).toEqual([
      "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      "0d805818-837b-42d9-996e-79a6a3559f9b",
    ]);
  });

  it("uses native validation when the amount cannot partially pay the last selected order", () => {
    renderPaymentDistributionForm();

    initAdminAgentPaymentDistributionForms();
    getCheckboxes().forEach((checkbox) => {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    });
    getAmountInput().value = "100";
    const { event, reportValidity } = submitForm();

    expect(getAmountInput().validationMessage).toBe(
      "Payment amount must be at least 100.01 so the last selected customer order receives a payment.",
    );
    expect(event.defaultPrevented).toBe(true);
    expect(reportValidity).toHaveBeenCalledTimes(1);
  });

  it("allows submission once the last selected customer order can be partially paid", () => {
    renderPaymentDistributionForm();

    initAdminAgentPaymentDistributionForms();
    getCheckboxes().forEach((checkbox) => {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    });
    getAmountInput().value = "100.01";
    const { event, reportValidity } = submitForm();

    expect(getAmountInput().validationMessage).toBe("");
    expect(event.defaultPrevented).toBe(false);
    expect(reportValidity).not.toHaveBeenCalled();
  });
});
