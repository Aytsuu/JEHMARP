import { beforeEach, describe, expect, it, vi } from "vitest";

import { initAgentOrderAttachForm } from "./agent-order-attach-form";

function renderAttachForm() {
  document.body.innerHTML = `
    <div class="drawer-sheet" data-sheet-root>
      <form id="attach-form" data-agent-order-attach-form>
        <input type="hidden" data-attach-customer-entries />

        <div data-customer-entries>
          <details class="customer-entry-accordion" data-customer-entry open>
            <summary>
              <span data-customer-entry-title>New customer</span>
              <strong data-customer-entry-total>PHP 0.00</strong>
              <button type="button" data-remove-customer-entry hidden>Remove customer</button>
            </summary>
            <div data-customer-picker>
              <input data-customer-search />
              <button type="button" data-customer-picker-toggle aria-expanded="false">Toggle</button>
              <div hidden data-customer-picker-menu>
                <div data-customer-options></div>
                <p hidden data-customer-options-empty></p>
              </div>
            </div>
            <p hidden data-customer-order-notice></p>
            <input type="hidden" data-customer-id />
            <section data-new-customer-fields>
              <input data-customer-first-name required />
              <input data-customer-last-name required />
              <input data-customer-phone-number required />
              <textarea data-customer-address required></textarea>
            </section>
            <div data-order-items>
              <details class="order-item-accordion" data-order-item-accordion open>
                <summary>
                  <span data-order-item-title>Select product</span>
                  <button type="button" data-remove-order-item>
                    <svg><path data-remove-order-item-icon></path></svg>
                    Remove item
                  </button>
                </summary>
                <div data-order-item-row>
                  <select data-order-product-select required>
                    <option value="">Select product</option>
                    <option value="product-1" data-product-name="Chicken Breast" data-product-price="300">
                      Chicken Breast
                    </option>
                    <option value="product-2" data-product-name="Chicken Thigh" data-product-price="200">
                      Chicken Thigh
                    </option>
                    <option value="product-3" data-product-name="Whole Chicken" data-product-price="180">
                      Whole Chicken
                    </option>
                  </select>
                  <input type="number" data-order-quantity required />
                  <textarea data-order-add-details></textarea>
                </div>
              </details>
            </div>
            <button type="button" data-add-order-item>Add item</button>
          </details>
        </div>

        <button type="button" data-add-customer-entry>Add customer</button>

        <template data-customer-entry-template>
          <details class="customer-entry-accordion" data-customer-entry>
            <summary>
              <span data-customer-entry-title>New customer</span>
              <strong data-customer-entry-total>PHP 0.00</strong>
              <button type="button" data-remove-customer-entry>Remove customer</button>
            </summary>
            <div data-customer-picker>
              <input data-customer-search />
              <button type="button" data-customer-picker-toggle aria-expanded="false">Toggle</button>
              <div hidden data-customer-picker-menu>
                <div data-customer-options></div>
                <p hidden data-customer-options-empty></p>
              </div>
            </div>
            <p hidden data-customer-order-notice></p>
            <input type="hidden" data-customer-id />
            <section data-new-customer-fields>
              <input data-customer-first-name required />
              <input data-customer-last-name required />
              <input data-customer-phone-number required />
              <textarea data-customer-address required></textarea>
            </section>
            <div data-order-items>
              <details class="order-item-accordion" data-order-item-accordion open>
                <summary>
                  <span data-order-item-title>Select product</span>
                  <button type="button" data-remove-order-item>
                    <svg><path data-remove-order-item-icon></path></svg>
                    Remove item
                  </button>
                </summary>
                <div data-order-item-row>
                  <select data-order-product-select required>
                    <option value="">Select product</option>
                    <option value="product-1" data-product-name="Chicken Breast" data-product-price="300">
                      Chicken Breast
                    </option>
                    <option value="product-2" data-product-name="Chicken Thigh" data-product-price="200">
                      Chicken Thigh
                    </option>
                    <option value="product-3" data-product-name="Whole Chicken" data-product-price="180">
                      Whole Chicken
                    </option>
                  </select>
                  <input type="number" data-order-quantity required />
                  <textarea data-order-add-details></textarea>
                </div>
              </details>
            </div>
            <button type="button" data-add-order-item>Add item</button>
          </details>
        </template>

        <template data-order-item-template>
          <details class="order-item-accordion" data-order-item-accordion>
            <summary>
              <span data-order-item-title>Select product</span>
              <button type="button" data-remove-order-item>
                <svg><path data-remove-order-item-icon></path></svg>
                Remove item
              </button>
            </summary>
            <div data-order-item-row>
              <select data-order-product-select required>
                <option value="">Select product</option>
                <option value="product-1" data-product-name="Chicken Breast" data-product-price="300">
                  Chicken Breast
                </option>
                <option value="product-2" data-product-name="Chicken Thigh" data-product-price="200">
                  Chicken Thigh
                </option>
                <option value="product-3" data-product-name="Whole Chicken" data-product-price="180">
                  Whole Chicken
                </option>
              </select>
              <input type="number" data-order-quantity required />
              <textarea data-order-add-details></textarea>
            </div>
          </details>
        </template>
      </form>
      <strong data-agent-order-attach-total>PHP 0.00</strong>
      <button type="submit" form="attach-form" data-agent-order-attach-submit>Submit</button>
    </div>
  `;
}

function firstEntry() {
  return document.querySelector<HTMLElement>("[data-customer-entry]")!;
}

function selectProduct(entry: HTMLElement, index: number, value: string) {
  const select = entry.querySelectorAll<HTMLSelectElement>("[data-order-product-select]")[index]!;
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function setQuantity(entry: HTMLElement, index: number, value: string) {
  const quantity = entry.querySelectorAll<HTMLInputElement>("[data-order-quantity]")[index]!;
  quantity.value = value;
  quantity.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderedCustomerOption(input: { balance?: string; creditLimit?: string } = {}) {
  const option = document.createElement("button");
  option.type = "button";
  option.dataset.orderTargetOption = "";
  option.dataset.orderTargetType = "customer";
  option.dataset.customerId = "customer-1";
  option.dataset.customerLabel = "Juan Dela Cruz";
  option.dataset.customerFirstName = "Juan";
  option.dataset.customerLastName = "Dela Cruz";
  option.dataset.customerPhoneNumber = "09170000000";
  option.dataset.customerEmail = "";
  option.dataset.customerAddress = "Manila";
  option.dataset.customerPaymentNotice = "";
  option.dataset.customerBalance = input.balance ?? "0";
  option.dataset.customerCreditLimit = input.creditLimit ?? "1000";
  option.textContent = "Juan Dela Cruz";
  return option;
}

function clickRenderedCustomerOption(entry: HTMLElement, option: HTMLButtonElement) {
  const options = entry.querySelector<HTMLElement>("[data-customer-options]")!;
  options.append(option);
  option.click();
}

describe("initAgentOrderAttachForm", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("adds customer entries and item rows from the attach customer sheet", () => {
    renderAttachForm();

    initAgentOrderAttachForm();

    expect(firstEntry().querySelector<HTMLButtonElement>("[data-remove-order-item]")!.hidden).toBe(true);

    document.querySelector<HTMLButtonElement>("[data-add-customer-entry]")!.click();
    expect(document.querySelectorAll("[data-customer-entry]")).toHaveLength(2);

    firstEntry().querySelector<HTMLButtonElement>("[data-add-order-item]")!.click();
    expect(firstEntry().querySelectorAll("[data-order-item-row]")).toHaveLength(2);
    expect(firstEntry().querySelectorAll<HTMLButtonElement>("[data-remove-order-item]")[0]!.hidden).toBe(true);
    expect(firstEntry().querySelectorAll<HTMLButtonElement>("[data-remove-order-item]")[1]!.hidden).toBe(false);
  });

  it("removes added item rows and recalculates totals", () => {
    renderAttachForm();

    initAgentOrderAttachForm();

    const entry = firstEntry();
    selectProduct(entry, 0, "product-1");
    setQuantity(entry, 0, "3");
    entry.querySelector<HTMLButtonElement>("[data-add-order-item]")!.click();
    selectProduct(entry, 1, "product-2");
    setQuantity(entry, 1, "2");

    entry.querySelectorAll<Element>("[data-remove-order-item-icon]")[1]!.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );

    expect(entry.querySelectorAll("[data-order-item-row]")).toHaveLength(1);
    expect(entry.querySelector("[data-customer-entry-total]")).toHaveTextContent("900.00");
    expect(document.querySelector("[data-agent-order-attach-total]")).toHaveTextContent("900.00");
  });

  it("hides products already selected in sibling item cards", () => {
    renderAttachForm();

    initAgentOrderAttachForm();

    const entry = firstEntry();
    selectProduct(entry, 0, "product-1");
    entry.querySelector<HTMLButtonElement>("[data-add-order-item]")!.click();

    const selects = entry.querySelectorAll<HTMLSelectElement>("[data-order-product-select]");
    const firstSelectProduct = selects[0]!.querySelector<HTMLOptionElement>('option[value="product-1"]')!;
    const secondSelectProduct = selects[1]!.querySelector<HTMLOptionElement>('option[value="product-1"]')!;

    expect(firstSelectProduct.hidden).toBe(false);
    expect(firstSelectProduct.disabled).toBe(false);
    expect(secondSelectProduct.hidden).toBe(true);
    expect(secondSelectProduct.disabled).toBe(true);

    selectProduct(entry, 0, "product-2");

    expect(secondSelectProduct.hidden).toBe(false);
    expect(secondSelectProduct.disabled).toBe(false);
    expect(selects[1]!.querySelector<HTMLOptionElement>('option[value="product-2"]')!.hidden).toBe(true);
    expect(selects[1]!.querySelector<HTMLOptionElement>('option[value="product-3"]')!.hidden).toBe(false);
  });

  it("disables add item when every product has been selected for the customer", () => {
    renderAttachForm();

    initAgentOrderAttachForm();

    const entry = firstEntry();
    const addItemButton = entry.querySelector<HTMLButtonElement>("[data-add-order-item]")!;

    expect(addItemButton.disabled).toBe(false);

    selectProduct(entry, 0, "product-1");
    entry.querySelector<HTMLButtonElement>("[data-add-order-item]")!.click();
    selectProduct(entry, 1, "product-2");
    entry.querySelector<HTMLButtonElement>("[data-add-order-item]")!.click();

    expect(addItemButton.disabled).toBe(true);

    selectProduct(entry, 2, "product-3");

    expect(addItemButton.disabled).toBe(true);

    entry.querySelectorAll<Element>("[data-remove-order-item-icon]")[2]!.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );

    expect(addItemButton.disabled).toBe(false);
  });

  it("serializes the hidden existing customer id when picker options are rendered", () => {
    renderAttachForm();

    initAgentOrderAttachForm();

    const entry = firstEntry();
    const options = entry.querySelector<HTMLElement>("[data-customer-options]")!;
    const search = entry.querySelector<HTMLInputElement>("[data-customer-search]")!;
    const payloadInput = document.querySelector<HTMLInputElement>("[data-attach-customer-entries]")!;
    const form = document.querySelector<HTMLFormElement>("[data-agent-order-attach-form]")!;
    options.append(renderedCustomerOption());
    search.value = "Juan Dela Cruz";
    selectProduct(entry, 0, "product-1");
    setQuantity(entry, 0, "2");

    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    expect(JSON.parse(payloadInput.value)).toMatchObject([
      {
        customerId: "customer-1",
        firstName: "Juan",
        items: [
          {
            productId: "product-1",
            quantity: 2,
          },
        ],
      },
    ]);
  });

  it("keeps new customer details when the external submit button prepares the form", () => {
    renderAttachForm();

    initAgentOrderAttachForm();

    const entry = firstEntry();
    const payloadInput = document.querySelector<HTMLInputElement>("[data-attach-customer-entries]")!;
    entry.querySelector<HTMLInputElement>("[data-customer-first-name]")!.value = "Maria";
    entry.querySelector<HTMLInputElement>("[data-customer-last-name]")!.value = "Santos";
    entry.querySelector<HTMLInputElement>("[data-customer-phone-number]")!.value = "09170000002";
    entry.querySelector<HTMLTextAreaElement>("[data-customer-address]")!.value = "Quezon City";
    selectProduct(entry, 0, "product-1");
    setQuantity(entry, 0, "2");

    document.querySelector<HTMLButtonElement>("[data-agent-order-attach-submit]")!.click();

    expect(entry.querySelector<HTMLInputElement>("[data-customer-first-name]")!.value).toBe("Maria");
    expect(JSON.parse(payloadInput.value)).toMatchObject([
      {
        customerId: null,
        firstName: "Maria",
        lastName: "Santos",
        phoneNumber: "09170000002",
        address: "Quezon City",
        items: [
          {
            productId: "product-1",
            quantity: 2,
          },
        ],
      },
    ]);
  });

  it("asks for confirmation before submitting a new customer order that exceeds the default credit limit", () => {
    renderAttachForm();

    initAgentOrderAttachForm();

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const entry = firstEntry();
    const form = document.querySelector<HTMLFormElement>("[data-agent-order-attach-form]")!;
    entry.querySelector<HTMLInputElement>("[data-customer-first-name]")!.value = "Maria";
    entry.querySelector<HTMLInputElement>("[data-customer-last-name]")!.value = "Santos";
    entry.querySelector<HTMLInputElement>("[data-customer-phone-number]")!.value = "09170000002";
    entry.querySelector<HTMLTextAreaElement>("[data-customer-address]")!.value = "Quezon City";
    selectProduct(entry, 0, "product-1");
    setQuantity(entry, 0, "4");

    const event = new SubmitEvent("submit", { bubbles: true, cancelable: true });
    const wasDispatched = form.dispatchEvent(event);

    expect(wasDispatched).toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("This customer order will exceed the customer's credit limit."));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Projected balance:"));

    confirm.mockRestore();
  });

  it("asks for confirmation before submitting an existing customer order that exceeds the customer's credit limit", () => {
    renderAttachForm();

    initAgentOrderAttachForm();

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const entry = firstEntry();
    const options = entry.querySelector<HTMLElement>("[data-customer-options]")!;
    const search = entry.querySelector<HTMLInputElement>("[data-customer-search]")!;
    const form = document.querySelector<HTMLFormElement>("[data-agent-order-attach-form]")!;
    options.append(renderedCustomerOption({ balance: "700", creditLimit: "1000" }));
    search.value = "Juan Dela Cruz";
    selectProduct(entry, 0, "product-1");
    setQuantity(entry, 0, "2");

    const event = new SubmitEvent("submit", { bubbles: true, cancelable: true });
    const wasDispatched = form.dispatchEvent(event);

    expect(wasDispatched).toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Current balance:"));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Projected balance:"));

    confirm.mockRestore();
  });

  it("shows an unpaid or partially paid notice when an existing customer is selected", () => {
    renderAttachForm();

    initAgentOrderAttachForm();

    const entry = firstEntry();
    const option = renderedCustomerOption({ balance: "300", creditLimit: "1000" });
    const notice = entry.querySelector<HTMLElement>("[data-customer-order-notice]")!;
    option.dataset.customerPaymentNotice = "partial";
    clickRenderedCustomerOption(entry, option);

    expect(notice.hidden).toBe(false);
    expect(notice.dataset.noticeKind).toBe("partial");
    expect(notice.textContent).toContain("partially paid order");
    expect(notice.textContent).toContain("Overall balance:");
    expect(notice.textContent).toContain("Credit limit:");
  });

  it("does not warn about credit limit when attaching an order for the distribution agent", () => {
    renderAttachForm();

    initAgentOrderAttachForm();

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const entry = firstEntry();
    const form = document.querySelector<HTMLFormElement>("[data-agent-order-attach-form]")!;
    const option = document.createElement("button");
    option.type = "button";
    option.dataset.orderTargetOption = "";
    option.dataset.orderTargetType = "agent";
    option.dataset.agentId = "agent-1";
    option.dataset.customerId = "agent-customer-1";
    option.dataset.attachCustomerId = "agent-customer-1";
    option.dataset.customerLabel = "Carlos Agent";
    option.dataset.customerBalance = "9000";
    option.dataset.customerCreditLimit = "1000";
    option.textContent = "Carlos Agent";
    clickRenderedCustomerOption(entry, option);
    selectProduct(entry, 0, "product-1");
    setQuantity(entry, 0, "10");

    const event = new SubmitEvent("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(event);

    expect(confirm).not.toHaveBeenCalled();

    confirm.mockRestore();
  });

  it("updates each customer total and the footer total when products and quantities change", () => {
    renderAttachForm();

    initAgentOrderAttachForm();

    const entry = firstEntry();
    selectProduct(entry, 0, "product-1");
    setQuantity(entry, 0, "3");

    expect(entry.querySelector("[data-customer-entry-total]")).toHaveTextContent("₱900.00");
    expect(document.querySelector("[data-agent-order-attach-total]")).toHaveTextContent("₱900.00");

    entry.querySelector<HTMLButtonElement>("[data-add-order-item]")!.click();
    selectProduct(entry, 1, "product-2");
    setQuantity(entry, 1, "2");

    expect(entry.querySelector("[data-customer-entry-total]")).toHaveTextContent("₱1,300.00");
    expect(document.querySelector("[data-agent-order-attach-total]")).toHaveTextContent("₱1,300.00");
  });
});
