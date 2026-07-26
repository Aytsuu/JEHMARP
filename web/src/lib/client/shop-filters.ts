import {
  SHOP_PAGE_SIZE,
  applyShopFilters,
  type ProductPagination,
  type ProductStockStatus,
  type PublicProduct,
  type ShopFilters,
} from "@/lib/public-website/shop";

export type ShopCatalogProduct = PublicProduct & {
  imageUrl: string;
};

const initializedSections = new WeakSet<HTMLElement>();

const PREV_ARROW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>`;
const NEXT_ARROW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>`;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readShopCatalog(section: HTMLElement): ShopCatalogProduct[] {
  const catalogElement = section.querySelector<HTMLScriptElement>(
    "[data-shop-product-catalog]",
  );
  if (!catalogElement?.textContent) return [];

  try {
    const parsed = JSON.parse(catalogElement.textContent) as ShopCatalogProduct[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseEnum<T extends string>(
  value: string,
  allowed: readonly T[],
): T | undefined {
  return allowed.find((item) => item === value);
}

function readFiltersFromForm(form: HTMLFormElement, page: number): ShopFilters {
  const category = parseEnum(
    (form.querySelector("#category") as HTMLSelectElement | null)?.value ?? "",
    ["pork", "chicken", "egg"] as const,
  );
  const stockStatus = parseEnum(
    (form.querySelector("#stockStatus") as HTMLSelectElement | null)?.value ?? "",
    ["in_stock", "limited", "out_of_stock"] as const,
  );
  const sort =
    parseEnum(
      (form.querySelector("#sort") as HTMLSelectElement | null)?.value ?? "",
      [
        "name_asc",
        "name_desc",
        "price_asc",
        "price_desc",
        "newest",
      ] as const,
    ) ?? "name_asc";
  const minPrice = Number(
    (form.querySelector("#minPrice") as HTMLInputElement | null)?.value ?? "0",
  );
  const maxPrice = Number(
    (form.querySelector("#maxPrice") as HTMLInputElement | null)?.value ??
      (form.querySelector("#maxPrice") as HTMLInputElement | null)?.max ??
      "1000",
  );

  return {
    category,
    stockStatus,
    minPrice: Number.isFinite(minPrice) && minPrice >= 0 ? minPrice : 0,
    maxPrice: Number.isFinite(maxPrice) && maxPrice >= 0 ? maxPrice : 1000,
    sort,
    page,
    pageSize: SHOP_PAGE_SIZE,
  };
}

function getStockStatusLabel(stockStatus: ProductStockStatus) {
  switch (stockStatus) {
    case "in_stock":
      return "In stock";
    case "limited":
      return "Limited Stock";
    case "out_of_stock":
      return "Out of stock";
  }
}

function renderProductCard(product: ShopCatalogProduct) {
  const badge =
    product.stock_status === "out_of_stock"
      ? `<span class="product-card__badge product-card__badge--sold-out">SOLD OUT</span>`
      : product.stock_status === "limited"
        ? `<span class="product-card__badge product-card__badge--limited">LIMITED</span>`
        : "";

  return `<li>
    <article class="product-card">
      <div class="product-card__image-container">
        <img
          src="${escapeHtml(product.imageUrl)}"
          alt="${escapeHtml(product.name)}"
          class="product-card__image"
        />
        ${badge}
      </div>
      <div class="product-card__content">
        <div class="product-card__price-row">
          <span>Price from </span>
          <span class="product-card__price-val">
            PHP ${Number(product.default_price).toFixed(2)}
          </span>
          <span class="product-card__unit-label">
            / ${escapeHtml(product.unit_label)}
          </span>
        </div>
        <h3 class="product-card__title">${escapeHtml(product.name)}</h3>
        <div class="product-card__status-row">
          <span class="product-card__status-text">
            ${escapeHtml(getStockStatusLabel(product.stock_status))}
          </span>
        </div>
      </div>
    </article>
  </li>`;
}

function renderPaginationControls(pagination: ProductPagination) {
  const previousControl = pagination.previousPage
    ? `<button type="button" class="pagination-arrow" data-shop-page="${pagination.previousPage}" aria-label="Previous page">${PREV_ARROW_SVG}</button>`
    : `<span class="pagination-arrow pagination-arrow--disabled" aria-hidden="true">${PREV_ARROW_SVG}</span>`;

  const nextControl = pagination.nextPage
    ? `<button type="button" class="pagination-arrow" data-shop-page="${pagination.nextPage}" aria-label="Next page">${NEXT_ARROW_SVG}</button>`
    : `<span class="pagination-arrow pagination-arrow--disabled" aria-hidden="true">${NEXT_ARROW_SVG}</span>`;

  const dots = Array.from({ length: pagination.totalPages }, (_, index) => {
    const page = index + 1;
    if (page === pagination.currentPage) {
      return `<span class="pagination-indicator pagination-indicator--active" aria-current="page"></span>`;
    }

    return `<button type="button" class="pagination-indicator" data-shop-page="${page}" aria-label="Go to page ${page}"></button>`;
  }).join("");

  return `${previousControl}<div class="pagination-dots">${dots}</div>${nextControl}`;
}

function renderShopProducts(
  section: HTMLElement,
  catalog: ShopCatalogProduct[],
  filters: ShopFilters,
) {
  const summary = section.querySelector<HTMLElement>("[data-shop-products-summary]");
  const grid = section.querySelector<HTMLElement>("[data-shop-product-grid]");
  const emptyState = section.querySelector<HTMLElement>("[data-shop-products-empty]");
  const pagination = section.querySelector<HTMLElement>("[data-shop-pagination]");
  const { products, pagination: pageMeta } = applyShopFilters(catalog, filters);

  if (summary) {
    const productLabel = pageMeta.count === 1 ? "product" : "products";
    summary.textContent = `Showing page ${pageMeta.currentPage} of ${pageMeta.totalPages}. ${pageMeta.count} ${productLabel} found.`;
  }

  if (grid) {
    grid.innerHTML = products.map((product) => renderProductCard(product as ShopCatalogProduct)).join("");
    grid.hidden = products.length === 0;
  }

  if (emptyState) {
    emptyState.hidden = products.length > 0;
  }

  if (pagination) {
    pagination.innerHTML = renderPaginationControls(pageMeta);
  }
}

function syncPriceSliderLabels(form: HTMLFormElement) {
  const minInput = form.querySelector<HTMLInputElement>("#minPrice");
  const maxInput = form.querySelector<HTMLInputElement>("#maxPrice");
  const minVal = form.querySelector<HTMLElement>("#minPriceVal");
  const maxVal = form.querySelector<HTMLElement>("#maxPriceVal");

  if (minInput && minVal) {
    minVal.textContent = minInput.value;
  }

  if (maxInput && maxVal) {
    maxVal.textContent = maxInput.value;
  }
}

function bindPriceSliders(form: HTMLFormElement, onFilterChange: () => void) {
  const minInput = form.querySelector<HTMLInputElement>("#minPrice");
  const maxInput = form.querySelector<HTMLInputElement>("#maxPrice");
  const minVal = form.querySelector<HTMLElement>("#minPriceVal");
  const maxVal = form.querySelector<HTMLElement>("#maxPriceVal");

  if (minInput && minVal) {
    minInput.addEventListener("input", () => {
      minVal.textContent = minInput.value;
      if (maxInput && Number(maxInput.value) < Number(minInput.value)) {
        maxInput.value = minInput.value;
        if (maxVal) maxVal.textContent = minInput.value;
      }
    });
    minInput.addEventListener("change", onFilterChange);
  }

  if (maxInput && maxVal) {
    maxInput.addEventListener("input", () => {
      maxVal.textContent = maxInput.value;
      if (minInput && Number(minInput.value) > Number(maxInput.value)) {
        minInput.value = maxInput.value;
        if (minVal) minVal.textContent = maxInput.value;
      }
    });
    maxInput.addEventListener("change", onFilterChange);
  }
}

export function initShopFilters() {
  const section = document.querySelector<HTMLElement>("[data-shop-products-section]");
  const form = document.querySelector<HTMLFormElement>("[data-shop-filters-form]");
  if (!section || !form) return;
  if (initializedSections.has(section)) return;

  const catalog = readShopCatalog(section);
  if (catalog.length === 0) return;

  initializedSections.add(section);

  let currentPage = 1;

  const applyCurrentFilters = () => {
    const filters = readFiltersFromForm(form, currentPage);
    renderShopProducts(section, catalog, filters);
    syncPriceSliderLabels(form);
  };

  const applyFiltersFromControls = () => {
    currentPage = 1;
    applyCurrentFilters();
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  form.querySelectorAll("select").forEach((element) => {
    element.addEventListener("change", applyFiltersFromControls);
  });

  bindPriceSliders(form, applyFiltersFromControls);

  section.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const pageButton = target.closest<HTMLButtonElement>("[data-shop-page]");
    if (!pageButton) return;

    event.preventDefault();
    const nextPage = Number(pageButton.dataset.shopPage);
    if (!Number.isInteger(nextPage) || nextPage < 1) return;

    currentPage = nextPage;
    applyCurrentFilters();
  });

  applyCurrentFilters();
}
