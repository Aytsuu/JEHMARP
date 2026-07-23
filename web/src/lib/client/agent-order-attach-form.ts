import { calculateOrderItemsTotal } from "@/lib/client/order-total";
import { initOrderCustomerPicker } from "@/lib/client/order-customer-picker";
import { getOrderCreditLimitWarning, type OrderCreditLimitWarning } from "@/lib/client/order-credit-limit";

type CustomerPickerController = ReturnType<typeof initOrderCustomerPicker>;

type CustomerEntryController = {
  root: HTMLElement;
  picker: CustomerPickerController;
  refreshTitle: () => void;
  destroy: () => void;
};

const defaultNewCustomerCreditLimit = 1000;

function formatCurrencyForClient(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

function formatCompactCurrencyForClient(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
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
  const customerId = entry.querySelector<HTMLInputElement>("input[data-customer-id]")?.value.trim() ?? "";
  const firstName = entry.querySelector<HTMLInputElement>("input[data-customer-first-name]")?.value.trim() ?? "";
  const lastName = entry.querySelector<HTMLInputElement>("input[data-customer-last-name]")?.value.trim() ?? "";
  const phoneNumber = entry.querySelector<HTMLInputElement>("input[data-customer-phone-number]")?.value.trim() ?? "";
  const emailValue = entry.querySelector<HTMLInputElement>("input[data-customer-email]")?.value.trim() ?? "";
  const address = entry.querySelector<HTMLTextAreaElement>("textarea[data-customer-address]")?.value.trim() ?? "";

  const items = Array.from(entry.querySelectorAll<HTMLElement>("[data-order-item-row]"))
    .map((row) => {
      const select = row.querySelector<HTMLSelectElement>("[data-order-product-select]");
      const quantityInput = row.querySelector<HTMLInputElement>("[data-order-quantity]");
      const detailsInput = row.querySelector<HTMLTextAreaElement>("[data-order-add-details]");
      const productId = select?.value.trim() ?? "";
      const quantity = Number(quantityInput?.value ?? 0);
      const addDetails = detailsInput?.value.trim() ?? "";

      if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
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

function collectOrderItems(entry: HTMLElement) {
  return Array.from(entry.querySelectorAll<HTMLElement>("[data-order-item-row]")).map((row) => {
    const select = row.querySelector<HTMLSelectElement>("[data-order-product-select]");
    const quantityInput = row.querySelector<HTMLInputElement>("[data-order-quantity]");
    const selectedOption = select?.selectedOptions?.[0];

    return {
      quantity: Number(quantityInput?.value ?? 0),
      unitPrice: Number(selectedOption?.dataset.productPrice ?? 0),
    };
  });
}

function getCustomerEntryFallbackLabel(entry: HTMLElement) {
  const selectedCustomerLabel = entry.querySelector<HTMLInputElement>("[data-customer-search]")?.value.trim() ?? "";
  if (selectedCustomerLabel.length > 0) {
    return selectedCustomerLabel;
  }

  const firstName = entry.querySelector<HTMLInputElement>("[data-customer-first-name]")?.value.trim() ?? "";
  const lastName = entry.querySelector<HTMLInputElement>("[data-customer-last-name]")?.value.trim() ?? "";
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || "New customer";
}

function getSelectedCustomerOption(entry: HTMLElement) {
  const selectedCustomerId = entry.querySelector<HTMLInputElement>("input[data-customer-id]")?.value.trim() ?? "";
  if (!selectedCustomerId) return null;

  return Array.from(entry.querySelectorAll<HTMLElement>("[data-customer-options] [data-customer-id]"))
    .find((option) => option.dataset.customerId === selectedCustomerId) ?? null;
}

function getCustomerEntryCreditLimitWarning(entry: HTMLElement) {
  const selectedCustomer = getSelectedCustomerOption(entry);
  const orderTotal = calculateOrderItemsTotal(collectOrderItems(entry));
  const warning = getOrderCreditLimitWarning({
    currentBalance: selectedCustomer
      ? Number(selectedCustomer.dataset.customerBalance ?? 0)
      : 0,
    creditLimit: selectedCustomer
      ? Number(selectedCustomer.dataset.customerCreditLimit ?? defaultNewCustomerCreditLimit)
      : defaultNewCustomerCreditLimit,
    orderTotal,
    downpaymentAmount: 0,
    isAgentOrder: false,
  });

  return warning
    ? {
        customerName: getCustomerEntryFallbackLabel(entry),
        ...warning,
      }
    : null;
}

function formatCreditLimitConfirmationMessage(
  warnings: Array<OrderCreditLimitWarning & { customerName: string }>,
) {
  const details = warnings.map((warning) => [
    warning.customerName,
    `Current balance: ${formatCompactCurrencyForClient(warning.currentBalance)}.`,
    `New unpaid amount: ${formatCompactCurrencyForClient(warning.addedBalance)}.`,
    `Projected balance: ${formatCompactCurrencyForClient(warning.projectedBalance)}.`,
    `Credit limit: ${formatCompactCurrencyForClient(warning.creditLimit)}.`,
  ].join("\n"));

  return [
    "This customer order will exceed the customer's credit limit.",
    ...details,
    "Proceed with this customer order?",
  ].join("\n\n");
}

export function initAgentOrderAttachForm(root: ParentNode = document) {
  root.querySelectorAll<HTMLFormElement>("[data-agent-order-attach-form]").forEach((form) => {
    if (form.dataset.initialized === "true") return;

    const formId = form.id;
    const submitButton = formId
      ? root.querySelector<HTMLButtonElement>(`[data-agent-order-attach-submit][form="${formId}"]`)
      : root.querySelector<HTMLButtonElement>("[data-agent-order-attach-submit]");
    const customerEntries = form.querySelector<HTMLElement>("[data-customer-entries]");
    const customerEntryTemplate = form.querySelector<HTMLTemplateElement>("[data-customer-entry-template]");
    const customerOptionTemplate = form.querySelector<HTMLTemplateElement>("[data-customer-option-template]");
    const orderItemTemplate = form.querySelector<HTMLTemplateElement>("[data-order-item-template]");
    const attachEntriesInput = form.querySelector<HTMLInputElement>("[data-attach-customer-entries]");
    const totalValue = form
      .closest<HTMLElement>("[data-sheet-root], .drawer-sheet")
      ?.querySelector<HTMLElement>("[data-agent-order-attach-total]")
      ?? root.querySelector<HTMLElement>("[data-agent-order-attach-total]");

    if (!customerEntries || !customerEntryTemplate || !customerOptionTemplate || !orderItemTemplate) {
      return;
    }

    form.dataset.initialized = "true";

    const entriesContainer = customerEntries;
    const entryTemplate = customerEntryTemplate;
    const optionTemplate = customerOptionTemplate;
    const itemTemplate = orderItemTemplate;
    const canSubmit = form.dataset.canSubmit !== "false";
    const entryControllers: CustomerEntryController[] = [];

    function updateOrderItemTitle(scope: ParentNode) {
      const title = scope.querySelector<HTMLElement>("[data-order-item-title]");
      const select = scope.querySelector<HTMLSelectElement>("[data-order-product-select]");
      const selectedOption = select?.selectedOptions?.[0];
      if (title) {
        title.textContent = selectedOption?.dataset.productName?.trim() || "Select product";
      }
    }

    function updateProductOptionAvailability(entry: HTMLElement) {
      const selects = Array.from(entry.querySelectorAll<HTMLSelectElement>("[data-order-product-select]"));

      selects.forEach((select) => {
        const selectedProductIds = new Set(
          selects
            .filter((otherSelect) => otherSelect !== select)
            .map((otherSelect) => otherSelect.value.trim())
            .filter((productId) => productId.length > 0),
        );

        Array.from(select.options).forEach((option) => {
          if (option.value.length === 0 || option.value === select.value) {
            option.hidden = false;
            option.disabled = false;
            return;
          }

          const isSelectedInSiblingItem = selectedProductIds.has(option.value);
          option.hidden = isSelectedInSiblingItem;
          option.disabled = isSelectedInSiblingItem;
        });
      });
    }

    function updateOrderItemControls(entry: HTMLElement) {
      const itemAccordions = Array.from(
        entry.querySelectorAll<HTMLElement>(".order-item-accordion, [data-order-item-accordion]"),
      );
      const productOptionIds = new Set(
        Array.from(entry.querySelectorAll<HTMLSelectElement>("[data-order-product-select]"))
          .flatMap((select) => Array.from(select.options))
          .map((option) => option.value.trim())
          .filter((productId) => productId.length > 0),
      );
      const addItemButton = entry.querySelector<HTMLButtonElement>("[data-add-order-item]");

      itemAccordions.forEach((item, index) => {
        const removeButton = item.querySelector<HTMLButtonElement>("[data-remove-order-item]");
        if (!removeButton) return;

        const isFirstItem = index === 0;
        removeButton.hidden = isFirstItem;
        removeButton.disabled = isFirstItem;
      });

      if (addItemButton) {
        addItemButton.disabled = !canSubmit || productOptionIds.size === 0 || itemAccordions.length >= productOptionIds.size;
      }
    }

    function refreshOrderItemEntryState(entry: HTMLElement) {
      updateProductOptionAvailability(entry);
      updateOrderItemControls(entry);
    }

    function updateEntryTotal(entry: HTMLElement) {
      const totalNode = entry.querySelector<HTMLElement>("[data-customer-entry-total]");
      if (!totalNode) return;
      totalNode.textContent = formatCurrencyForClient(calculateOrderItemsTotal(collectOrderItems(entry)));
    }

    function updateTotal() {
      const items = Array.from(form.querySelectorAll<HTMLElement>("[data-order-item-row]")).map((row) => {
        const select = row.querySelector<HTMLSelectElement>("[data-order-product-select]");
        const quantityInput = row.querySelector<HTMLInputElement>("[data-order-quantity]");
        const selectedOption = select?.selectedOptions?.[0];
        return {
          quantity: Number(quantityInput?.value ?? 0),
          unitPrice: Number(selectedOption?.dataset.productPrice ?? 0),
        };
      });

      if (totalValue) {
        totalValue.textContent = formatCurrencyForClient(calculateOrderItemsTotal(items));
      }

      entriesContainer.querySelectorAll<HTMLElement>("[data-customer-entry]").forEach((entry) => {
        updateEntryTotal(entry);
      });
    }

    function bindOrderItem(scope: ParentNode) {
      const select = scope.querySelector<HTMLSelectElement>("[data-order-product-select]");
      const quantityInput = scope.querySelector<HTMLInputElement>("[data-order-quantity]");
      select?.addEventListener("change", () => {
        updateOrderItemTitle(scope);
        const entry = select.closest<HTMLElement>("[data-customer-entry]");
        if (entry) {
          refreshOrderItemEntryState(entry);
        }
        updateTotal();
      });
      quantityInput?.addEventListener("input", updateTotal);
      updateOrderItemTitle(scope);
    }

    function bindCustomerEntry(entry: HTMLElement): CustomerEntryController {
      const newCustomerFields = entry.querySelector<HTMLElement>("[data-new-customer-fields]");
      const orderItems = entry.querySelector<HTMLElement>("[data-order-items]");
      const title = entry.querySelector<HTMLElement>("[data-customer-entry-title]");
      let picker: CustomerPickerController | null = null;

      function refreshTitle() {
        if (title) {
          title.textContent = picker?.getSelectedCustomerLabel() ?? getCustomerEntryFallbackLabel(entry);
        }
        updateEntryTotal(entry);
      }

      const pickerController = initOrderCustomerPicker({
        scope: entry,
        customerOptionTemplate: optionTemplate,
        newCustomerFields,
        showPaymentNotice: true,
        onChange: () => {
          refreshTitle();
          updateTotal();
        },
      });
      picker = pickerController;

      orderItems?.querySelectorAll<HTMLElement>("[data-order-item-accordion], .order-item-accordion").forEach((item) => {
        bindOrderItem(item);
      });
      refreshOrderItemEntryState(entry);

      entry.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "[data-customer-first-name], [data-customer-last-name]",
      ).forEach((field) => {
        field.addEventListener("input", refreshTitle);
      });

      refreshTitle();

      return {
        root: entry,
        picker: pickerController,
        refreshTitle,
        destroy() {
          pickerController.destroy();
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
      const entries = entriesContainer.querySelectorAll<HTMLElement>("[data-customer-entry]");
      const showRemove = entries.length > 1;
      entries.forEach((entry) => {
        const removeButton = entry.querySelector<HTMLButtonElement>("[data-remove-customer-entry]");
        if (removeButton) {
          removeButton.hidden = !showRemove;
        }
      });
    }

    function addCustomerEntry(open = true) {
      const templateEntry = entryTemplate.content.firstElementChild;
      if (!templateEntry) return;
      const clonedEntry = templateEntry.cloneNode(true);
      if (!(clonedEntry instanceof HTMLElement)) return;
      entriesContainer.append(clonedEntry);
      if (clonedEntry instanceof HTMLDetailsElement && open) {
        clonedEntry.open = true;
      }
      registerCustomerEntry(clonedEntry);
    }

    function addOrderItem(entry: HTMLElement) {
      const orderItems = entry.querySelector<HTMLElement>("[data-order-items]");
      const templateItem = itemTemplate.content.firstElementChild;
      if (!orderItems || !templateItem) return;

      const clonedItem = templateItem.cloneNode(true);
      if (!(clonedItem instanceof HTMLElement)) return;
      orderItems.append(clonedItem);
      bindOrderItem(clonedItem);
      if (clonedItem instanceof HTMLDetailsElement) {
        clonedItem.open = true;
      }
      refreshOrderItemEntryState(entry);
      updateTotal();
    }

    entriesContainer.querySelectorAll<HTMLElement>("[data-customer-entry]").forEach((entry) => {
      registerCustomerEntry(entry);
    });

    form.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const addCustomerButton = target.closest<HTMLButtonElement>("[data-add-customer-entry]");
      if (addCustomerButton && form.contains(addCustomerButton)) {
        event.preventDefault();
        addCustomerEntry(true);
        return;
      }

      const addOrderItemButton = target.closest<HTMLButtonElement>("[data-add-order-item]");
      if (addOrderItemButton && form.contains(addOrderItemButton)) {
        event.preventDefault();
        if (addOrderItemButton.disabled) return;
        const entry = addOrderItemButton.closest<HTMLElement>("[data-customer-entry]");
        if (entry) {
          addOrderItem(entry);
        }
        return;
      }

      const removeCustomerButton = target.closest<HTMLButtonElement>("[data-remove-customer-entry]");
      if (removeCustomerButton && entriesContainer.contains(removeCustomerButton)) {
        event.preventDefault();
        event.stopPropagation();

        const entry = removeCustomerButton.closest<HTMLElement>("[data-customer-entry]");
        if (!entry) return;

        const remainingEntries = entriesContainer.querySelectorAll("[data-customer-entry]").length;
        if (remainingEntries <= 1) return;

        const controllerIndex = entryControllers.findIndex((controller) => controller.root === entry);
        if (controllerIndex >= 0) {
          entryControllers[controllerIndex]?.destroy();
          entryControllers.splice(controllerIndex, 1);
        }

        entry.remove();
        updateRemoveCustomerButtons();
        updateTotal();
        return;
      }

      const removeOrderItemButton = target.closest<HTMLElement>("[data-remove-order-item]");
      if (removeOrderItemButton) {
        const orderItems = removeOrderItemButton.closest<HTMLElement>("[data-order-items]");
        if (!orderItems || !form.contains(orderItems)) return;

        event.preventDefault();
        event.stopPropagation();

        const itemAccordion = removeOrderItemButton.closest(".order-item-accordion, [data-order-item-accordion]");
        const remainingItems = orderItems.querySelectorAll(".order-item-accordion, [data-order-item-accordion]").length;
        if (remainingItems <= 1) return;
        itemAccordion?.remove();
        const entry = orderItems.closest<HTMLElement>("[data-customer-entry]");
        if (entry) {
          refreshOrderItemEntryState(entry);
        }
        updateTotal();
      }
    });

    function prepareFormForSubmit() {
      entryControllers.forEach((controller) => {
        controller.picker.refresh();
      });
      revealInvalidFields(form);

      const entries = Array.from(
        entriesContainer.querySelectorAll<HTMLElement>("[data-customer-entry]"),
      ).map((entry) => serializeCustomerEntry(entry));

      if (attachEntriesInput) {
        attachEntriesInput.value = JSON.stringify(entries);
      }
    }

    function confirmCreditLimitWarnings() {
      const warnings = Array.from(
        entriesContainer.querySelectorAll<HTMLElement>("[data-customer-entry]"),
      ).map((entry) => getCustomerEntryCreditLimitWarning(entry))
        .filter((warning): warning is NonNullable<typeof warning> => warning !== null);

      if (warnings.length === 0) return true;

      return window.confirm(formatCreditLimitConfirmationMessage(warnings));
    }

    form.addEventListener("invalid", () => {
      revealInvalidFields(form);
    }, true);

    form.addEventListener("submit", (event) => {
      prepareFormForSubmit();

      if (!confirmCreditLimitWarnings()) {
        event.preventDefault();
        return;
      }

      const serializedEntries = attachEntriesInput?.value.trim() ?? "";
      if (!serializedEntries || serializedEntries === "[]") {
        event.preventDefault();
        return;
      }

      try {
        const parsed = JSON.parse(serializedEntries) as Array<{ items?: unknown[] }>;
        const hasValidEntry = parsed.some((entry) => Array.isArray(entry.items) && entry.items.length > 0);
        if (!hasValidEntry) {
          event.preventDefault();
        }
      } catch {
        event.preventDefault();
      }
    }, { capture: true });

    submitButton?.addEventListener("click", () => {
      prepareFormForSubmit();
    }, true);

    updateTotal();
  });
}

document.addEventListener("DOMContentLoaded", () => initAgentOrderAttachForm());
document.addEventListener("astro:after-swap", () => initAgentOrderAttachForm());
if (document.readyState === "complete" || document.readyState === "interactive") {
  initAgentOrderAttachForm();
}
