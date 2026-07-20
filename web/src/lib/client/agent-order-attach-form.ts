import { calculateOrderItemsTotal } from "@/lib/client/order-total";
import { initOrderCustomerPicker } from "@/lib/client/order-customer-picker";

type CustomerPickerController = ReturnType<typeof initOrderCustomerPicker>;

type CustomerEntryController = {
  root: HTMLElement;
  picker: CustomerPickerController;
  refreshTitle: () => void;
  destroy: () => void;
};

function formatCurrencyForClient(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

function revealInvalidFields(form: HTMLFormElement) {
  form.querySelectorAll<HTMLDetailsElement>("details").forEach((details) => {
    details.open = true;
  });
  form.querySelectorAll<HTMLElement>("[data-new-customer-fields]").forEach((section) => {
    section.removeAttribute("hidden");
  });
}

function serializeCustomerEntry(entry: HTMLElement) {
  const customerId = entry.querySelector<HTMLInputElement>("[data-customer-id]")?.value.trim() ?? "";
  const firstName = entry.querySelector<HTMLInputElement>("[data-customer-first-name]")?.value.trim() ?? "";
  const lastName = entry.querySelector<HTMLInputElement>("[data-customer-last-name]")?.value.trim() ?? "";
  const phoneNumber = entry.querySelector<HTMLInputElement>("[data-customer-phone-number]")?.value.trim() ?? "";
  const emailValue = entry.querySelector<HTMLInputElement>("[data-customer-email]")?.value.trim() ?? "";
  const address = entry.querySelector<HTMLTextAreaElement>("[data-customer-address]")?.value.trim() ?? "";

  const items = Array.from(entry.querySelectorAll<HTMLElement>("[data-order-item-row]"))
    .map((row) => {
      const select = row.querySelector<HTMLSelectElement>("[data-order-product-select]");
      const quantityInput = row.querySelector<HTMLInputElement>("[data-order-quantity]");
      const detailsInput = row.querySelector<HTMLTextAreaElement>("[data-order-add-details]");
      const productId = select?.value.trim() ?? "";
      const quantity = Number(quantityInput?.value ?? 0);
      const addDetails = detailsInput?.value.trim() ?? "";

      if (!productId && !quantity && !addDetails) {
        return null;
      }

      return {
        productId,
        quantity,
        addDetails: addDetails.length > 0 ? addDetails : null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    customerId: customerId.length > 0 ? customerId : null,
    firstName,
    lastName,
    phoneNumber,
    email: emailValue.length > 0 ? emailValue : null,
    address,
    items,
  };
}

export function initAgentOrderAttachForm() {
  const form = document.querySelector<HTMLFormElement>("[data-agent-order-attach-form]");
  if (!form || form.dataset.initialized === "true") return;
  form.dataset.initialized = "true";

  const formId = form.id;
  const submitButton = formId
    ? document.querySelector<HTMLButtonElement>(`[data-agent-order-attach-submit][form="${formId}"]`)
    : document.querySelector<HTMLButtonElement>("[data-agent-order-attach-submit]");
  const customerEntries = form.querySelector<HTMLElement>("[data-customer-entries]");
  const customerEntryTemplate = form.querySelector<HTMLTemplateElement>("[data-customer-entry-template]");
  const customerOptionTemplate = form.querySelector<HTMLTemplateElement>("[data-customer-option-template]");
  const orderItemTemplate = form.querySelector<HTMLTemplateElement>("[data-order-item-template]");
  const addCustomerEntryButton = form.querySelector<HTMLButtonElement>("[data-add-customer-entry]");
  const attachEntriesInput = form.querySelector<HTMLInputElement>("[data-attach-customer-entries]");
  const totalValue = document.querySelector<HTMLElement>("[data-agent-order-attach-total]");

  if (!customerEntries || !customerEntryTemplate || !customerOptionTemplate || !orderItemTemplate) {
    return;
  }

  const entryControllers: CustomerEntryController[] = [];

  function updateTotal() {
    if (!totalValue) return;

    const items = Array.from(form.querySelectorAll<HTMLElement>("[data-order-item-row]")).map((row) => {
      const select = row.querySelector<HTMLSelectElement>("[data-order-product-select]");
      const quantityInput = row.querySelector<HTMLInputElement>("[data-order-quantity]");
      const selectedOption = select?.selectedOptions?.[0];
      return {
        quantity: Number(quantityInput?.value ?? 0),
        unitPrice: Number(selectedOption?.dataset.productPrice ?? 0),
      };
    });

    totalValue.textContent = formatCurrencyForClient(calculateOrderItemsTotal(items));
  }

  function updateOrderItemTitle(scope: ParentNode) {
    const title = scope.querySelector<HTMLElement>("[data-order-item-title]");
    const select = scope.querySelector<HTMLSelectElement>("[data-order-product-select]");
    const selectedOption = select?.selectedOptions?.[0];
    if (title) {
      title.textContent = selectedOption?.dataset.productName?.trim() || "Select product";
    }
  }

  function bindOrderItem(scope: ParentNode) {
    const select = scope.querySelector<HTMLSelectElement>("[data-order-product-select]");
    const quantityInput = scope.querySelector<HTMLInputElement>("[data-order-quantity]");
    select?.addEventListener("change", () => {
      updateOrderItemTitle(scope);
      updateTotal();
    });
    quantityInput?.addEventListener("input", updateTotal);
    updateOrderItemTitle(scope);
  }

  function bindCustomerEntry(entry: HTMLElement): CustomerEntryController {
    const newCustomerFields = entry.querySelector<HTMLElement>("[data-new-customer-fields]");
    const orderItems = entry.querySelector<HTMLElement>("[data-order-items]");
    const addOrderItemButton = entry.querySelector<HTMLButtonElement>("[data-add-order-item]");
    const title = entry.querySelector<HTMLElement>("[data-customer-entry-title]");

    const picker = initOrderCustomerPicker({
      scope: entry,
      customerOptionTemplate,
      newCustomerFields,
      onChange: () => {
        refreshTitle();
        updateTotal();
      },
    });

    function refreshTitle() {
      if (title) {
        title.textContent = picker.getSelectedCustomerLabel();
      }
    }

    orderItems?.querySelectorAll<HTMLElement>(".order-item-accordion").forEach((item) => {
      bindOrderItem(item);
    });

    addOrderItemButton?.addEventListener("click", () => {
      const templateItem = orderItemTemplate.content.firstElementChild;
      if (!orderItems || !templateItem) return;
      const clonedItem = templateItem.cloneNode(true);
      orderItems.append(clonedItem);
      if (clonedItem instanceof HTMLElement) {
        bindOrderItem(clonedItem);
      }
      if (clonedItem instanceof HTMLDetailsElement) {
        clonedItem.open = true;
      }
      updateTotal();
    });

    orderItems?.addEventListener("click", (event) => {
      const target = event.target;
      const removeButton = target instanceof HTMLElement
        ? target.closest<HTMLElement>("[data-remove-order-item]")
        : null;
      if (!removeButton) return;
      event.preventDefault();
      event.stopPropagation();
      const itemAccordion = removeButton.closest(".order-item-accordion");
      const remainingItems = orderItems.querySelectorAll(".order-item-accordion").length;
      if (remainingItems <= 1) return;
      itemAccordion?.remove();
      updateTotal();
    });

    entry.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "[data-customer-first-name], [data-customer-last-name]",
    ).forEach((field) => {
      field.addEventListener("input", refreshTitle);
    });

    refreshTitle();

    return {
      root: entry,
      picker,
      refreshTitle,
      destroy() {
        picker.destroy();
      },
    };
  }

  function registerCustomerEntry(entry: HTMLElement) {
    const controller = bindCustomerEntry(entry);
    entryControllers.push(controller);
    updateRemoveCustomerButtons();
    updateTotal();
    return controller;
  }

  function updateRemoveCustomerButtons() {
    const entries = customerEntries.querySelectorAll<HTMLElement>("[data-customer-entry]");
    const showRemove = entries.length > 1;
    entries.forEach((entry) => {
      const removeButton = entry.querySelector<HTMLButtonElement>("[data-remove-customer-entry]");
      if (removeButton) {
        removeButton.hidden = !showRemove;
      }
    });
  }

  function addCustomerEntry(open = true) {
    const templateEntry = customerEntryTemplate.content.firstElementChild;
    if (!templateEntry) return;
    const clonedEntry = templateEntry.cloneNode(true);
    if (!(clonedEntry instanceof HTMLElement)) return;
    customerEntries.append(clonedEntry);
    if (clonedEntry instanceof HTMLDetailsElement && open) {
      clonedEntry.open = true;
    }
    registerCustomerEntry(clonedEntry);
  }

  customerEntries.querySelectorAll<HTMLElement>("[data-customer-entry]").forEach((entry) => {
    registerCustomerEntry(entry);
  });

  addCustomerEntryButton?.addEventListener("click", () => {
    addCustomerEntry(true);
  });

  customerEntries.addEventListener("click", (event) => {
    const target = event.target;
    const removeButton = target instanceof HTMLElement
      ? target.closest<HTMLButtonElement>("[data-remove-customer-entry]")
      : null;
    if (!removeButton) return;

    event.preventDefault();
    event.stopPropagation();

    const entry = removeButton.closest<HTMLElement>("[data-customer-entry]");
    if (!entry) return;

    const remainingEntries = customerEntries.querySelectorAll("[data-customer-entry]").length;
    if (remainingEntries <= 1) return;

    const controllerIndex = entryControllers.findIndex((controller) => controller.root === entry);
    if (controllerIndex >= 0) {
      entryControllers[controllerIndex]?.destroy();
      entryControllers.splice(controllerIndex, 1);
    }

    entry.remove();
    updateRemoveCustomerButtons();
    updateTotal();
  });

  function prepareFormForSubmit() {
    entryControllers.forEach((controller) => {
      controller.picker.refresh();
    });
    revealInvalidFields(form);

    const entries = Array.from(
      customerEntries.querySelectorAll<HTMLElement>("[data-customer-entry]"),
    ).map((entry) => serializeCustomerEntry(entry));

    if (attachEntriesInput) {
      attachEntriesInput.value = JSON.stringify(entries);
    }
  }

  form.addEventListener("invalid", () => {
    revealInvalidFields(form);
  }, true);

  form.addEventListener("submit", () => {
    prepareFormForSubmit();
  });

  submitButton?.addEventListener("click", () => {
    prepareFormForSubmit();
  }, true);

  updateTotal();
}

document.addEventListener("DOMContentLoaded", initAgentOrderAttachForm);
document.addEventListener("astro:after-swap", initAgentOrderAttachForm);
if (document.readyState === "complete" || document.readyState === "interactive") {
  initAgentOrderAttachForm();
}
