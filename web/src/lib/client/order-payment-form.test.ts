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
      <form
        data-payment-form
        hidden
        data-payment-paid-total="50"
        data-payment-order-total="350"
      >
        <select name="customerType" data-payment-customer-type>
          <option value="regular" selected>Regular</option>
          <option value="wholesale">Wholesale</option>
          <option value="reseller">Reseller</option>
        </select>
        <input name="amount" type="number" data-payment-amount />
        <div data-payment-pricing-items>
          <span data-payment-pricing-item data-final-quantity="2" data-default-price="100" data-reseller-price="80"></span>
          <span data-payment-pricing-item data-final-quantity="3" data-default-price="50" data-reseller-price="40"></span>
        </div>
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

  it("keeps payment amount at zero by default and updates max when customer type changes", () => {
    renderPaymentPanelWithPricing();

    initOrderPaymentFormToggle();

    const form = getPaymentForm();
    const customerType = form.querySelector<HTMLSelectElement>("[data-payment-customer-type]")!;
    const amount = form.querySelector<HTMLInputElement>("[data-payment-amount]")!;

    expect(amount.value).toBe("0.00");
    expect(amount.max).toBe("300.00");

    customerType.value = "reseller";
    customerType.dispatchEvent(new Event("change"));

    expect(amount.value).toBe("0.00");
    expect(amount.max).toBe("230.00");
  });

  it("keeps payment amount at zero and caps it to the commission-adjusted remaining receivable", () => {
    document.body.innerHTML = `
      <section class="payment-panel">
        <button type="button" data-toggle-payment-form>
          Create Payment Record
        </button>
        <form
          data-payment-form
          hidden
          data-payment-paid-total="100"
          data-payment-order-total="900"
          data-payment-commission-total="60"
        >
          <input name="amount" type="number" data-payment-amount />
          <div data-payment-pricing-items>
            <span data-payment-pricing-item data-final-quantity="3" data-default-price="300" data-reseller-price="300"></span>
          </div>
        </form>
      </section>
    `;

    initOrderPaymentFormToggle();

    const amount = document.querySelector<HTMLInputElement>("[data-payment-amount]")!;

    expect(amount.value).toBe("0.00");
    expect(amount.max).toBe("740.00");
  });
});
