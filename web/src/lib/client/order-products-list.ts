function formatCurrencyForClient(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function syncOrderProductQuantityForm(form: HTMLFormElement) {
  const input = form.querySelector<HTMLInputElement>("[data-order-product-quantity-input]");
  const saveButton = form.querySelector<HTMLButtonElement>("[data-order-product-quantity-save]");
  const lineTotal = form
    .closest(".agent-order-products-modal__item")
    ?.querySelector<HTMLElement>("[data-order-product-line-total]");

  if (!input || !saveButton) {
    return;
  }

  const initialQuantity = Number(input.dataset.initialQuantity ?? 0);
  const currentQuantity = Number(input.value);
  const unitPrice = Number(lineTotal?.dataset.unitPrice ?? 0);
  const hasChange = Number.isFinite(currentQuantity) && currentQuantity !== initialQuantity;
  const isZero = !Number.isFinite(currentQuantity) || currentQuantity <= 0;
  const managesSaveState = !form.hasAttribute("data-order-quantity-paid-total");

  if (managesSaveState && !input.disabled) {
    saveButton.disabled = !hasChange || isZero;
  }

  if (
    lineTotal &&
    Number.isFinite(currentQuantity) &&
    currentQuantity > 0 &&
    Number.isFinite(unitPrice)
  ) {
    lineTotal.textContent = formatCurrencyForClient(currentQuantity * unitPrice);
  } else if (lineTotal && Number.isFinite(initialQuantity) && Number.isFinite(unitPrice)) {
    lineTotal.textContent = formatCurrencyForClient(initialQuantity * unitPrice);
  }
}

function initOrderProductQuantityForms(container: ParentNode) {
  container
    .querySelectorAll<HTMLFormElement>("[data-order-product-quantity-form]")
    .forEach((form) => {
      const input = form.querySelector<HTMLInputElement>("[data-order-product-quantity-input]");
      if (!input) {
        return;
      }

      if (form.dataset.orderProductQuantityUiInitialized !== "true") {
        form.dataset.orderProductQuantityUiInitialized = "true";

        const sync = () => {
          syncOrderProductQuantityForm(form);
        };

        input.addEventListener("input", sync);
        input.addEventListener("change", sync);
      }

      syncOrderProductQuantityForm(form);
    });
}

function resetOrderProductAddForm(
  container: HTMLElement,
  form: HTMLFormElement,
  trigger?: HTMLButtonElement | null,
) {
  const isInlineAdd = container.hasAttribute("data-order-product-add-inline");

  form.reset();
  form.hidden = true;

  if (!isInlineAdd) {
    const emptyState = container.querySelector<HTMLElement>("[data-order-product-empty]");
    if (emptyState) {
      emptyState.hidden = false;
    }
  }

  const panel = container.closest<HTMLElement>("[data-order-products-panel]");
  const resolvedTrigger =
    trigger ??
    container.querySelector<HTMLButtonElement>("[data-order-product-add-trigger]") ??
    panel?.querySelector<HTMLButtonElement>("[data-order-product-add-trigger]") ??
    null;

  if (resolvedTrigger) {
    resolvedTrigger.hidden = false;
  }

  syncOrderProductAddUnitLabel(form);
}

function syncOrderProductAddUnitLabel(form: HTMLFormElement) {
  const select = form.querySelector<HTMLSelectElement>("[data-order-product-add-select]");
  const unitLabel = form.querySelector<HTMLElement>("[data-order-product-add-unit]");

  if (!select || !unitLabel) {
    return;
  }

  const selectedOption = select.selectedOptions[0];
  const nextUnitLabel = selectedOption?.dataset.unitLabel ?? "unit";
  unitLabel.textContent = nextUnitLabel;
}

function initOrderProductAddRow(container: HTMLElement) {
  const form = container.querySelector<HTMLFormElement>("[data-order-product-add-form]");
  const panel = container.closest<HTMLElement>("[data-order-products-panel]");
  const trigger =
    container.querySelector<HTMLButtonElement>("[data-order-product-add-trigger]") ??
    panel?.querySelector<HTMLButtonElement>("[data-order-product-add-trigger]") ??
    null;

  if (!form || !trigger) {
    return;
  }

  if (form.dataset.orderProductAddInitialized !== "true") {
    form.dataset.orderProductAddInitialized = "true";

    const select = form.querySelector<HTMLSelectElement>("[data-order-product-add-select]");
    select?.addEventListener("change", () => {
      syncOrderProductAddUnitLabel(form);
    });

    trigger.addEventListener("click", () => {
      form.hidden = false;
      trigger.hidden = true;

      if (!container.hasAttribute("data-order-product-add-inline")) {
        const emptyState = container.querySelector<HTMLElement>("[data-order-product-empty]");
        if (emptyState) {
          emptyState.hidden = true;
        }
      }

      select?.focus();
    });

    form.querySelector<HTMLButtonElement>("[data-order-product-add-cancel]")?.addEventListener(
      "click",
      () => {
        resetOrderProductAddForm(container, form, trigger);
      },
    );
  }

  syncOrderProductAddUnitLabel(form);
}

export function initOrderProductsList(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-order-products-list]").forEach((container) => {
    initOrderProductAddRow(container);
    initOrderProductQuantityForms(container);
  });
}
