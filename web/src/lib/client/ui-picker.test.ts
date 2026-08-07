import { afterEach, describe, expect, it } from "vitest";

import { initUiPicker } from "./ui-picker";

function renderMultiPicker() {
  document.body.innerHTML = `
    <form data-remittance-form>
      <div data-selected-remittance-order-inputs hidden></div>
      <div class="ui-picker order-customer-picker order-customer-picker--multiple" data-customer-picker data-ui-picker-multiple>
        <div class="ui-picker__control" data-ui-picker-control>
          <div class="ui-picker__badges" data-ui-picker-badges></div>
          <input
            class="ui-picker__search"
            data-customer-search
            data-customer-search-input
            data-ui-picker-search
            placeholder="Try searching..."
          />
          <button type="button" data-customer-picker-toggle aria-expanded="false"></button>
        </div>
        <div data-customer-picker-menu hidden>
          <div data-customer-options></div>
          <p data-customer-options-empty hidden>No options</p>
        </div>
      </div>
      <template data-remittance-order-picker-template>
        <label
          class="order-customer-picker__option ui-picker__option--checkbox"
          data-ui-picker-option
          data-ui-picker-option-value="order-1"
          data-ui-picker-option-label="Ana Buyer"
          data-ui-picker-option-search="ana buyer balance"
        >
          <input type="checkbox" class="ui-picker__option-checkbox" data-ui-picker-option-checkbox value="order-1" />
          <span class="order-customer-picker__option-name">Ana Buyer</span>
          <span class="order-customer-picker__option-type">Balance PHP 100.00</span>
        </label>
        <label
          class="order-customer-picker__option ui-picker__option--checkbox"
          data-ui-picker-option
          data-ui-picker-option-value="order-2"
          data-ui-picker-option-label="Ben Cruz"
          data-ui-picker-option-search="ben cruz balance"
        >
          <input type="checkbox" class="ui-picker__option-checkbox" data-ui-picker-option-checkbox value="order-2" />
          <span class="order-customer-picker__option-name">Ben Cruz</span>
          <span class="order-customer-picker__option-type">Balance PHP 250.00</span>
        </label>
      </template>
    </form>
  `;

  return document.querySelector<HTMLFormElement>("[data-remittance-form]")!;
}

describe("initUiPicker", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders badges after selecting options and keeps the search input available", () => {
    const form = renderMultiPicker();
    const template = form.querySelector<HTMLTemplateElement>("[data-remittance-order-picker-template]")!;
    const hiddenInputContainer = form.querySelector<HTMLElement>("[data-selected-remittance-order-inputs]")!;
    const searchInput = form.querySelector<HTMLInputElement>("[data-ui-picker-search]")!;

    initUiPicker({
      root: form,
      optionTemplate: template,
      multiple: true,
      hiddenInputContainer,
      hiddenInputName: "orderId",
    });

    const firstCheckbox = form.querySelector<HTMLInputElement>(
      "[data-customer-options] [data-ui-picker-option-checkbox]",
    )!;
    firstCheckbox.checked = true;
    firstCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

    expect(form.querySelectorAll(".ui-picker__badge")).toHaveLength(1);
    expect(form.querySelector(".ui-picker__badge-label")?.textContent).toBe("Ana Buyer");
    expect(hiddenInputContainer.querySelectorAll('input[name="orderId"]')).toHaveLength(1);
    expect(searchInput.placeholder).toBe("Try searching...");

    searchInput.value = "ben";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));

    const visibleCheckboxes = form.querySelectorAll<HTMLInputElement>(
      "[data-customer-options] [data-ui-picker-option-checkbox]",
    );
    expect(visibleCheckboxes).toHaveLength(1);
    expect(visibleCheckboxes[0]?.value).toBe("order-2");
  });

  it("removes a badge when its remove button is clicked", () => {
    const form = renderMultiPicker();
    const template = form.querySelector<HTMLTemplateElement>("[data-remittance-order-picker-template]")!;
    const hiddenInputContainer = form.querySelector<HTMLElement>("[data-selected-remittance-order-inputs]")!;

    initUiPicker({
      root: form,
      optionTemplate: template,
      multiple: true,
      hiddenInputContainer,
      hiddenInputName: "orderId",
    });

    const firstCheckbox = form.querySelector<HTMLInputElement>(
      "[data-customer-options] [data-ui-picker-option-checkbox]",
    )!;
    firstCheckbox.checked = true;
    firstCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

    form.querySelector<HTMLButtonElement>(".ui-picker__badge-remove")?.click();

    expect(form.querySelectorAll(".ui-picker__badge")).toHaveLength(0);
    expect(
      form.querySelector<HTMLInputElement>(
        '[data-customer-options] [data-ui-picker-option-checkbox][value="order-1"]',
      )?.checked,
    ).toBe(false);
    expect(hiddenInputContainer.querySelectorAll('input[name="orderId"]')).toHaveLength(0);
  });

  it("keeps other selections checked when one badge is removed", () => {
    const form = renderMultiPicker();
    const template = form.querySelector<HTMLTemplateElement>("[data-remittance-order-picker-template]")!;

    initUiPicker({
      root: form,
      optionTemplate: template,
      multiple: true,
    });

    const checkboxes = form.querySelectorAll<HTMLInputElement>(
      "[data-customer-options] [data-ui-picker-option-checkbox]",
    );

    checkboxes[0]!.checked = true;
    checkboxes[0]!.dispatchEvent(new Event("change", { bubbles: true }));

    const refreshedCheckboxes = form.querySelectorAll<HTMLInputElement>(
      "[data-customer-options] [data-ui-picker-option-checkbox]",
    );
    refreshedCheckboxes[1]!.checked = true;
    refreshedCheckboxes[1]!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(form.querySelectorAll(".ui-picker__badge")).toHaveLength(2);

    form.querySelector<HTMLButtonElement>(".ui-picker__badge-remove")?.click();

    expect(form.querySelectorAll(".ui-picker__badge")).toHaveLength(1);
    expect(
      form.querySelector<HTMLInputElement>(
        '[data-customer-options] [data-ui-picker-option-checkbox][value="order-1"]',
      )?.checked,
    ).toBe(false);
    expect(
      form.querySelector<HTMLInputElement>(
        '[data-customer-options] [data-ui-picker-option-checkbox][value="order-2"]',
      )?.checked,
    ).toBe(true);
  });

  it("enforces the optional max selection limit", () => {
    const form = renderMultiPicker();
    const template = form.querySelector<HTMLTemplateElement>("[data-remittance-order-picker-template]")!;

    initUiPicker({
      root: form,
      optionTemplate: template,
      multiple: true,
      maxSelections: 1,
    });

    const checkboxes = form.querySelectorAll<HTMLInputElement>(
      "[data-customer-options] [data-ui-picker-option-checkbox]",
    );

    checkboxes[0]!.checked = true;
    checkboxes[0]!.dispatchEvent(new Event("change", { bubbles: true }));

    const refreshedCheckboxes = form.querySelectorAll<HTMLInputElement>(
      "[data-customer-options] [data-ui-picker-option-checkbox]",
    );
    expect(refreshedCheckboxes[1]?.disabled).toBe(true);

    refreshedCheckboxes[1]!.checked = true;
    refreshedCheckboxes[1]!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(form.querySelectorAll(".ui-picker__badge")).toHaveLength(1);
  });
});
