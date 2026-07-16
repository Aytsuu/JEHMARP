import { beforeEach, describe, expect, it } from "vitest";

import { initOrderPaymentFormToggle } from "./order-payment-form";

function renderPaymentPanel() {
  document.body.innerHTML = `
    <section>
      <button type="button" data-toggle-payment-form>
        Create Payment Record
      </button>
      <form data-payment-form hidden></form>
    </section>
  `;
}

function renderPaymentPanelWithPricing() {
  document.body.innerHTML = `
    <section class="payment-panel">
      <button type="button" data-toggle-payment-form>
        Create Payment Record
      </button>
      <form data-payment-form hidden>
        <select name="customerType" data-payment-customer-type>
          <option value="regular" selected>Regular</option>
          <option value="wholesale">Wholesale</option>
          <option value="reseller">Reseller</option>
        </select>
        <input name="amount" type="number" data-payment-amount />
        <strong data-payment-total-value></strong>
        <strong data-payment-balance-value></strong>
        <div data-payment-pricing-items>
          <span data-payment-pricing-item data-final-quantity="2" data-default-price="100" data-reseller-price="80"></span>
          <span data-payment-pricing-item data-final-quantity="3" data-default-price="50" data-reseller-price="40"></span>
        </div>
        <input type="hidden" data-payment-paid-total value="50" />
      </form>
    </section>
  `;
}

function getToggleButton() {
  return document.querySelector<HTMLButtonElement>("[data-toggle-payment-form]")!;
}

function getPaymentForm() {
  return document.querySelector<HTMLFormElement>("[data-payment-form]")!;
}

describe("initOrderPaymentFormToggle", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reveals the payment form when the create payment record button is clicked", () => {
    renderPaymentPanel();

    initOrderPaymentFormToggle();
    getToggleButton().click();

    expect(getPaymentForm().hidden).toBe(false);
  });

  it("does not install duplicate click listeners when initialized repeatedly", () => {
    renderPaymentPanel();

    initOrderPaymentFormToggle();
    initOrderPaymentFormToggle();

    getToggleButton().click();

    expect(getPaymentForm().hidden).toBe(false);
  });

  it("updates displayed total, balance, and amount when customer type changes to reseller", () => {
    renderPaymentPanelWithPricing();

    initOrderPaymentFormToggle();

    const form = getPaymentForm();
    const customerType = form.querySelector<HTMLSelectElement>("[data-payment-customer-type]")!;
    const amount = form.querySelector<HTMLInputElement>("[data-payment-amount]")!;
    const total = form.querySelector<HTMLElement>("[data-payment-total-value]")!;
    const balance = form.querySelector<HTMLElement>("[data-payment-balance-value]")!;

    expect(amount.value).toBe("300.00");
    expect(amount.max).toBe("300.00");
    expect(total.textContent).toBe("₱350.00");
    expect(balance.textContent).toBe("₱300.00");

    customerType.value = "reseller";
    customerType.dispatchEvent(new Event("change"));

    expect(amount.value).toBe("230.00");
    expect(amount.max).toBe("230.00");
    expect(total.textContent).toBe("₱280.00");
    expect(balance.textContent).toBe("₱230.00");
  });
});
