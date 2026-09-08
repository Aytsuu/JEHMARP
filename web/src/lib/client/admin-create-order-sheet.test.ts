import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initAdminCreateOrderSheet } from "./admin-create-order-sheet";

function renderCreateOrderForm() {
  document.body.innerHTML = `
    <div id="create-order-sheet">
      <form id="create-order-form">
        <div data-customer-picker>
          <input data-customer-search />
          <button type="button" data-customer-picker-toggle" aria-expanded="false"></button>
          <div hidden data-customer-picker-menu>
            <p hidden data-customer-picker-summary></p>
            <div data-customer-options></div>
            <p hidden data-customer-options-empty></p>
            <div hidden data-customer-picker-footer>
              <span data-customer-picker-total-records></span>
              <div hidden data-customer-picker-pagination-controls>
                <button type="button" data-customer-picker-prev></button>
                <input data-customer-picker-page />
                <span data-customer-picker-total></span>
                <button type="button" data-customer-picker-next></button>
              </div>
            </div>
          </div>
        </div>
        <input type="hidden" data-customer-id />
        <input type="hidden" data-agent-order-agent-id />
        <section data-new-customer-fields></section>
        <section data-downpayment-section>
          <input data-downpayment-amount />
        </section>
        <select hidden data-agent-order-type>
          <option value="personal">Personal</option>
          <option value="distribution">Distribution</option>
        </select>
        <div data-order-items>
          <details class="ui-accordion order-item-accordion" open>
            <summary></summary>
            <div class="ui-accordion__content">
              <div class="order-item-accordion__fields" data-order-item-row>
                <select data-order-product-select>
                  <option value="">Select product</option>
                  <option
                    value="product-1"
                    data-product-name="Pork"
                    data-product-retail-price="100"
                    data-product-reseller-price="80"
                  >
                    Pork
                  </option>
                </select>
                <input name="quantity" type="number" />
              </div>
            </div>
          </details>
        </div>
        <button type="button" data-add-order-item>Add item</button>
        <template data-order-item-template>
          <details class="ui-accordion order-item-accordion">
            <summary><span data-order-item-title>Select product</span></summary>
            <div class="ui-accordion__content">
              <div class="order-item-accordion__fields" data-order-item-row>
                <select data-order-product-select>
                  <option value="">Select product</option>
                  <option
                    value="product-1"
                    data-product-name="Pork"
                    data-product-retail-price="100"
                    data-product-reseller-price="80"
                  >
                    Pork
                  </option>
                </select>
                <input name="quantity" type="number" />
              </div>
            </div>
          </details>
        </template>
      </form>
      <footer>
        <strong data-order-total-value>₱0.00</strong>
      </footer>
    </div>
  `;
}

describe("initAdminCreateOrderSheet", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [],
        page: 1,
        pageSize: 10,
        totalPages: 1,
        totalRecords: 0,
        search: "",
        summary: "0 records",
      }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("updates the footer total when product and quantity change", () => {
    renderCreateOrderForm();
    initAdminCreateOrderSheet();

    const select = document.querySelector<HTMLSelectElement>("[data-order-product-select]")!;
    const quantityInput = document.querySelector<HTMLInputElement>("input[name='quantity']")!;

    select.value = "product-1";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    quantityInput.value = "3";
    quantityInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(document.querySelector("[data-order-total-value]")?.textContent).toBe("₱300.00");
  });

  it("updates the footer total when items are added from the template", () => {
    renderCreateOrderForm();
    initAdminCreateOrderSheet();

    document.querySelector<HTMLButtonElement>("[data-add-order-item]")!.click();

    const rows = document.querySelectorAll("[data-order-item-row]");
    expect(rows).toHaveLength(2);

    const secondRow = rows[1]!;
    const select = secondRow.querySelector<HTMLSelectElement>("[data-order-product-select]")!;
    const quantityInput = secondRow.querySelector<HTMLInputElement>("input[name='quantity']")!;

    select.value = "product-1";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    quantityInput.value = "2";
    quantityInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(document.querySelector("[data-order-total-value]")?.textContent).toBe("₱200.00");
  });
});
