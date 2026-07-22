import {
  consumeDashboardFragmentRefreshNeeded,
  readDashboardFragmentCache,
  writeDashboardFragmentCache,
} from "./dashboard-fragment-cache";

type DashboardFragmentTableConfig = {
  cacheKey: string;
  fragmentPath: string;
  pagePath: string;
  formSelector: string;
  tableShellSelector: string;
  skeletonTemplateSelector: string;
  filterKeys: readonly string[];
  searchInputSelector?: string;
  historyStateKey: string;
  updatedEvents?: readonly string[];
};

const pageSizes = [10, 50, 100];

export function initDashboardFragmentTable(config: DashboardFragmentTableConfig) {
  const form = document.querySelector<HTMLFormElement>(config.formSelector);
  const tableShell = document.querySelector<HTMLElement>(config.tableShellSelector);
  const skeletonTemplate = document.querySelector<HTMLTemplateElement>(
    config.skeletonTemplateSelector,
  );
  const container = tableShell?.closest<HTMLElement>("[data-interactive-table]");

  if (!form || !tableShell || !skeletonTemplate || !container) return;
  if (form.dataset.fragmentTableInitialized === "true") return;
  form.dataset.fragmentTableInitialized = "true";

  const activeForm = form;
  const activeTableShell = tableShell;
  const activeSkeletonTemplate = skeletonTemplate;
  const activeContainer = container;
  let submitTimer: number | undefined;
  let searchTimer: number | undefined;
  let activeFetchController: AbortController | undefined;

  function applyPaginationParams(
    params: URLSearchParams,
    page: number,
    pageSize: number,
  ) {
    if (page > 1) {
      params.set("page", String(page));
    } else {
      params.delete("page");
    }

    if (pageSize !== 10) {
      params.set("pageSize", String(pageSize));
    } else {
      params.delete("pageSize");
    }
  }

  function normalizeParams(params: URLSearchParams) {
    const normalized = new URLSearchParams();

    config.filterKeys.forEach((key) => {
      const value = params.get(key)?.trim();
      if (value) normalized.set(key, value);
    });

    const page = Number(params.get("page") ?? "1");
    const pageSize = Number(params.get("pageSize") ?? "10");
    applyPaginationParams(
      normalized,
      Number.isInteger(page) && page > 0 ? page : 1,
      pageSizes.includes(pageSize) ? pageSize : 10,
    );

    return normalized.toString();
  }

  function currentPageSize() {
    const value = Number(
      activeContainer.querySelector<HTMLSelectElement>("[data-limit-select]")?.value ?? "10",
    );

    return pageSizes.includes(value) ? value : 10;
  }

  function currentTotalPages() {
    const footer = activeContainer.querySelector<HTMLElement>("[data-server-pagination-footer]");
    const totalPages = Number(footer?.dataset.totalPages ?? "1");

    return Number.isInteger(totalPages) && totalPages > 0 ? totalPages : 1;
  }

  function navigateToPage(page: number) {
    const totalPages = currentTotalPages();
    const nextPage = Math.min(Math.max(page, 1), totalPages);

    void applyQuery(normalizeFormQuery({
      page: nextPage,
      pageSize: currentPageSize(),
    }));
  }

  function normalizeFormQuery(options: { page?: number; pageSize?: number } = {}) {
    const params = new URLSearchParams();
    const formData = new FormData(activeForm);

    config.filterKeys.forEach((key) => {
      const value = formData.get(key);
      if (typeof value === "string" && value.trim()) {
        params.set(key, value.trim());
      }
    });

    applyPaginationParams(
      params,
      options.page ?? 1,
      options.pageSize ?? currentPageSize(),
    );

    return params.toString();
  }

  function buildUrl(path: string, targetQuery: string) {
    return targetQuery ? `${path}?${targetQuery}` : path;
  }

  function showSkeletonForQuery(targetQuery: string) {
    const currentQuery = normalizeParams(new URLSearchParams(window.location.search));
    const cachedFragment = readDashboardFragmentCache(config.cacheKey, targetQuery);

    if (targetQuery === currentQuery || cachedFragment) return;

    const skeleton = activeSkeletonTemplate.content.firstElementChild?.cloneNode(true);
    if (skeleton) activeTableShell.replaceChildren(skeleton);
  }

  function copyDataset(source: HTMLElement, target: HTMLElement) {
    Object.keys(target.dataset).forEach((key) => {
      delete target.dataset[key];
    });
    Object.entries(source.dataset).forEach(([key, value]) => {
      target.dataset[key] = value;
    });
  }

  function replaceFragment(fragmentHtml: string) {
    const parsed = new DOMParser().parseFromString(fragmentHtml, "text/html");
    const nextTableShell = parsed.querySelector<HTMLElement>(config.tableShellSelector);
    const nextFooter = parsed.querySelector<HTMLElement>("[data-server-pagination-footer]");
    const currentFooter = activeContainer.querySelector<HTMLElement>("[data-server-pagination-footer]");

    if (!nextTableShell) {
      throw new Error("Dashboard fragment did not include the expected table.");
    }

    activeTableShell.innerHTML = nextTableShell.innerHTML;
    if (nextFooter && currentFooter) {
      currentFooter.innerHTML = nextFooter.innerHTML;
      copyDataset(nextFooter, currentFooter);
    }

    document.dispatchEvent(new Event("dashboard:interactive-table-updated"));
    config.updatedEvents?.forEach((eventName) => {
      document.dispatchEvent(new Event(eventName));
    });
  }

  async function applyQuery(
    targetQuery: string,
    options: { force?: boolean } = {},
  ) {
    const currentQuery = normalizeParams(new URLSearchParams(window.location.search));

    if (!options.force && targetQuery === currentQuery) return;

    if (!options.force) {
      const cachedFragment = readDashboardFragmentCache(config.cacheKey, targetQuery);
      if (cachedFragment) {
        window.history.replaceState(
          { [config.historyStateKey]: targetQuery },
          "",
          buildUrl(config.pagePath, targetQuery),
        );
        replaceFragment(cachedFragment);
        activeForm.dataset.currentFilterQuery = targetQuery;
        return;
      }
    }

    showSkeletonForQuery(targetQuery);
    activeFetchController?.abort();

    const fetchController = new AbortController();
    activeFetchController = fetchController;

    try {
      const response = await fetch(buildUrl(config.fragmentPath, targetQuery), {
        cache: "no-store",
        headers: {
          "X-Requested-With": "fetch",
        },
        signal: fetchController.signal,
      });

      const fragmentHtml = await window.readDashboardFragmentResponse(response);
      window.history.replaceState(
        { [config.historyStateKey]: targetQuery },
        "",
        buildUrl(config.pagePath, targetQuery),
      );
      replaceFragment(fragmentHtml);
      activeForm.dataset.currentFilterQuery = targetQuery;
      writeDashboardFragmentCache(config.cacheKey, targetQuery, fragmentHtml);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;

      window.location.href = buildUrl(config.pagePath, targetQuery);
    } finally {
      if (activeFetchController === fetchController) {
        activeFetchController = undefined;
      }
    }
  }

  function submitFilters() {
    window.clearTimeout(submitTimer);
    submitTimer = window.setTimeout(() => {
      void applyQuery(normalizeFormQuery({ page: 1 }));
    }, 120);
  }

  const initialQuery = normalizeParams(new URLSearchParams(window.location.search));

  if (consumeDashboardFragmentRefreshNeeded()) {
    void applyQuery(initialQuery, { force: true });
  } else {
    writeDashboardFragmentCache(
      config.cacheKey,
      initialQuery,
      activeContainer.outerHTML,
    );
  }

  activeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void applyQuery(normalizeFormQuery({ page: 1 }));
  });

  activeForm.querySelectorAll<HTMLSelectElement>("select").forEach((field) => {
    field.addEventListener("change", submitFilters);
  });

  if (config.searchInputSelector) {
    activeForm.querySelector<HTMLInputElement>(config.searchInputSelector)?.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(submitFilters, 450);
    });
  }

  activeContainer.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || !target.matches("[data-limit-select]")) {
      return;
    }

    const pageSize = Number(target.value);
    void applyQuery(normalizeFormQuery({
      page: 1,
      pageSize: pageSizes.includes(pageSize) ? pageSize : 10,
    }));
  });

  activeContainer.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof Element
      ? target.closest<HTMLButtonElement>("[data-page]")
      : null;

    if (!button || button.disabled) return;

    const page = Number(button.dataset.page ?? "1");
    navigateToPage(Number.isInteger(page) && page > 0 ? page : 1);
  });

  activeContainer.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-pagination-page-input]")) {
      return;
    }

    const page = Number(target.value);
    navigateToPage(Number.isInteger(page) && page > 0 ? page : 1);
  });

  activeContainer.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-pagination-page-input]")) {
      return;
    }

    if (event.key !== "Enter") return;

    event.preventDefault();
    const page = Number(target.value);
    navigateToPage(Number.isInteger(page) && page > 0 ? page : 1);
  });
}
