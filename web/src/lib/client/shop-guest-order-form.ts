export type ShopOrderCatalogProduct = {
  id: string;
  name: string;
  defaultPrice: number;
  unitLabel: string;
  stockStatus: string;
  imageUrl: string;
};

function formatOrderAmount(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function parseQuantity(value: string) {
  const quantity = Number(value);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 0;
  }

  return quantity;
}

function readShopOrderCatalog(form: HTMLFormElement): ShopOrderCatalogProduct[] {
  const catalogElement = form.querySelector<HTMLScriptElement>("[data-shop-order-catalog]");
  if (!catalogElement?.textContent) return [];

  try {
    const parsed = JSON.parse(catalogElement.textContent) as ShopOrderCatalogProduct[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function updateShopGuestOrderTotals(form: HTMLFormElement) {
  const totalElement = form.querySelector<HTMLElement>("[data-shop-order-total-value]");
  const lines = form.querySelectorAll<HTMLElement>("[data-shop-order-line]");
  let orderTotal = 0;

  lines.forEach((line) => {
    const unitPrice = Number(line.dataset.productPrice ?? "0");
    const quantityInput = line.querySelector<HTMLInputElement>("[data-shop-order-quantity]");
    const lineTotalElement = line.querySelector<HTMLElement>("[data-shop-order-line-total]");
    const quantity = parseQuantity(quantityInput?.value ?? "");
    const lineTotal = unitPrice * quantity;

    orderTotal += lineTotal;

    if (lineTotalElement) {
      lineTotalElement.textContent = formatOrderAmount(lineTotal);
    }
  });

  if (totalElement) {
    totalElement.textContent = formatOrderAmount(orderTotal);
  }
}

function syncEmptyState(form: HTMLFormElement) {
  const linesContainer = form.querySelector<HTMLElement>("[data-shop-order-lines]");
  const emptyState = form.querySelector<HTMLElement>("[data-shop-order-empty]");
  if (!linesContainer || !emptyState) return;

  const hasItems = linesContainer.querySelector("[data-shop-order-line]") !== null;
  emptyState.hidden = hasItems;
}

function syncSubmitState(form: HTMLFormElement) {
  const submitButton = form.querySelector<HTMLButtonElement>("[data-shop-order-submit]");
  if (!submitButton || submitButton.dataset.shopOrderSubmitLocked === "true") return;

  const hasItems = form.querySelector("[data-shop-order-line]") !== null;
  submitButton.disabled = !hasItems;
}

function populateOrderLine(line: HTMLElement, product: ShopOrderCatalogProduct) {
  line.dataset.productId = product.id;
  line.dataset.productPrice = String(product.defaultPrice);

  const image = line.querySelector<HTMLImageElement>("[data-shop-order-line-image]");
  const name = line.querySelector<HTMLElement>("[data-shop-order-line-name]");
  const price = line.querySelector<HTMLElement>("[data-shop-order-line-price]");
  const quantityLabel = line.querySelector<HTMLElement>("[data-shop-order-line-quantity-label]");
  const detailsLabel = line.querySelector<HTMLElement>("[data-shop-order-line-details-label]");
  const quantityInput = line.querySelector<HTMLInputElement>("[data-shop-order-quantity]");
  const detailsInput = line.querySelector<HTMLInputElement>("[data-shop-order-details]");
  const removeButton = line.querySelector<HTMLButtonElement>("[data-shop-order-remove-item]");

  if (image) {
    image.src = product.imageUrl;
    image.alt = product.name;
  }

  if (name) {
    name.textContent = product.name;
    name.id = `order-product-${product.id}`;
  }

  if (price) {
    price.textContent = `PHP ${product.defaultPrice.toFixed(2)} per ${product.unitLabel}`;
  }

  if (quantityLabel) {
    quantityLabel.setAttribute("for", `quantity-${product.id}`);
  }

  if (detailsLabel) {
    detailsLabel.setAttribute("for", `details-${product.id}`);
  }

  if (quantityInput) {
    quantityInput.id = `quantity-${product.id}`;
    quantityInput.name = `quantity:${product.id}`;
    quantityInput.value = "1";
  }

  if (detailsInput) {
    detailsInput.id = `details-${product.id}`;
    detailsInput.name = `details:${product.id}`;
    detailsInput.value = "";
  }

  if (removeButton) {
    removeButton.setAttribute("aria-label", `Remove ${product.name}`);
  }
}

function createOrderLine(
  form: HTMLFormElement,
  product: ShopOrderCatalogProduct,
): HTMLElement | null {
  const template = form.querySelector<HTMLTemplateElement>("[data-shop-order-line-template]");
  const linesContainer = form.querySelector<HTMLElement>("[data-shop-order-lines]");
  if (!template || !linesContainer) return null;

  const existingLine = linesContainer.querySelector<HTMLElement>(
    `[data-shop-order-line][data-product-id="${product.id}"]`,
  );
  if (existingLine) {
    existingLine.scrollIntoView({ block: "nearest", behavior: "smooth" });
    existingLine.querySelector<HTMLInputElement>("[data-shop-order-quantity]")?.focus();
    return existingLine;
  }

  const line = template.content.firstElementChild?.cloneNode(true);
  if (!(line instanceof HTMLElement)) return null;

  populateOrderLine(line, product);
  linesContainer.appendChild(line);
  return line;
}

function removeOrderLine(form: HTMLFormElement, line: HTMLElement) {
  line.remove();
  syncEmptyState(form);
  syncSubmitState(form);
  updateShopGuestOrderTotals(form);
}

function addSelectedProduct(form: HTMLFormElement, catalog: ShopOrderCatalogProduct[]) {
  const productSelect = form.querySelector<HTMLSelectElement>("[data-shop-order-product-select]");
  if (!productSelect) return;

  const productId = productSelect.value.trim();
  if (!productId) {
    productSelect.focus();
    return;
  }

  const product = catalog.find((entry) => entry.id === productId);
  if (!product) return;

  const line = createOrderLine(form, product);
  if (!line) return;

  syncEmptyState(form);
  syncSubmitState(form);
  updateShopGuestOrderTotals(form);
  line.querySelector<HTMLInputElement>("[data-shop-order-quantity]")?.focus();
}

export function initShopGuestOrderForm() {
  const form = document.querySelector<HTMLFormElement>(".shop-guest-order-form");
  if (!form || form.dataset.shopGuestOrderInitialized === "true") return;
  form.dataset.shopGuestOrderInitialized = "true";

  const catalog = readShopOrderCatalog(form);

  const updateTotals = () => {
    updateShopGuestOrderTotals(form);
  };

  form.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-shop-order-quantity], [data-shop-order-details]")) return;
    updateTotals();
  });

  form.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const addButton = target.closest<HTMLButtonElement>("[data-shop-order-add-item]");
    if (addButton) {
      event.preventDefault();
      addSelectedProduct(form, catalog);
      return;
    }

    const removeButton = target.closest<HTMLButtonElement>("[data-shop-order-remove-item]");
    if (removeButton) {
      event.preventDefault();
      const line = removeButton.closest<HTMLElement>("[data-shop-order-line]");
      if (line) removeOrderLine(form, line);
      return;
    }

    const stepButton = target.closest<HTMLButtonElement>("[data-shop-order-qty-step]");
    if (!stepButton) return;

    event.preventDefault();

    const line = stepButton.closest<HTMLElement>("[data-shop-order-line]");
    const quantityInput = line?.querySelector<HTMLInputElement>("[data-shop-order-quantity]");
    if (!quantityInput || quantityInput.disabled) return;

    const step = Number(quantityInput.step || "1") || 1;
    const minQuantity = Number(quantityInput.min || "0.001") || 0.001;
    const currentQuantity = parseQuantity(quantityInput.value) || minQuantity;
    const nextQuantity =
      stepButton.dataset.shopOrderQtyStep === "up"
        ? currentQuantity + step
        : Math.max(minQuantity, currentQuantity - step);

    quantityInput.value = String(Number(nextQuantity.toFixed(3)));
    updateTotals();
  });

  syncEmptyState(form);
  syncSubmitState(form);
  updateTotals();
}
