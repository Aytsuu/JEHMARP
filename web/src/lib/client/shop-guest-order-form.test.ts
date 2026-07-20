import { describe, expect, it } from "vitest";

describe("shop guest order form", () => {
  it("updates totals and submit state when items are added and removed", async () => {
    const { initShopGuestOrderForm } = await import("./shop-guest-order-form");

    document.body.innerHTML = `
      <form class="shop-guest-order-form">
        <script type="application/json" data-shop-order-catalog>
          [{"id":"one","name":"Pork Belly","defaultPrice":100,"unitLabel":"kg","stockStatus":"in_stock","imageUrl":"/pork.png"}]
        </script>
        <select data-shop-order-product-select>
          <option value="">Select a product</option>
          <option value="one">Pork Belly</option>
        </select>
        <button type="button" data-shop-order-add-item>Add item</button>
        <div data-shop-order-lines>
          <p data-shop-order-empty>No items added yet.</p>
        </div>
        <template data-shop-order-line-template>
          <article class="shop-order-line" data-shop-order-line>
            <img data-shop-order-line-image />
            <h3 data-shop-order-line-name></h3>
            <p data-shop-order-line-price></p>
            <label data-shop-order-line-quantity-label></label>
            <input data-shop-order-quantity value="1" />
            <label data-shop-order-line-details-label></label>
            <input data-shop-order-details />
            <strong data-shop-order-line-total></strong>
            <button type="button" data-shop-order-remove-item>Remove</button>
          </article>
        </template>
        <strong data-shop-order-total-value></strong>
        <button type="submit" data-shop-order-submit disabled>Submit order</button>
      </form>
    `;

    initShopGuestOrderForm();

    const form = document.querySelector<HTMLFormElement>(".shop-guest-order-form");
    const productSelect = form?.querySelector<HTMLSelectElement>("[data-shop-order-product-select]");
    const addButton = form?.querySelector<HTMLButtonElement>("[data-shop-order-add-item]");
    const submitButton = form?.querySelector<HTMLButtonElement>("[data-shop-order-submit]");
    const emptyState = form?.querySelector<HTMLElement>("[data-shop-order-empty]");

    expect(emptyState?.hidden).toBe(false);
    expect(submitButton?.disabled).toBe(true);

    productSelect!.value = "one";
    addButton!.click();

    const line = form?.querySelector<HTMLElement>("[data-shop-order-line]");
    const quantityInput = line?.querySelector<HTMLInputElement>("[data-shop-order-quantity]");
    const orderTotal = form?.querySelector("[data-shop-order-total-value]");

    expect(line).not.toBeNull();
    expect(quantityInput?.name).toBe("quantity:one");
    expect(emptyState?.hidden).toBe(true);
    expect(submitButton?.disabled).toBe(false);
    expect(orderTotal?.textContent).toBe("₱100.00");

    quantityInput!.value = "2";
    quantityInput!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(orderTotal?.textContent).toBe("₱200.00");

    line?.querySelector<HTMLButtonElement>("[data-shop-order-remove-item]")?.click();
    expect(form?.querySelector("[data-shop-order-line]")).toBeNull();
    expect(emptyState?.hidden).toBe(false);
    expect(submitButton?.disabled).toBe(true);
    expect(orderTotal?.textContent).toBe("₱0.00");
  });
});
