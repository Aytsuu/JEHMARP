import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  consumeDashboardFragmentRefreshNeeded,
  markDashboardFragmentRefreshNeeded,
  readDashboardFragmentCache,
} from "./dashboard-fragment-cache";
import { initDashboardFragmentTable } from "./dashboard-fragment-table";

function createFragmentTableDocument() {
  document.body.innerHTML = `
    <form data-order-filter-form>
      <input name="search" data-order-search-input />
    </form>
    <div data-interactive-table>
      <div data-order-table-shell>
        <table><tbody><tr><td>stale-order</td></tr></tbody></table>
      </div>
      <div data-server-pagination-footer></div>
    </div>
    <template data-order-filter-skeleton>
      <div data-skeleton>loading</div>
    </template>
  `;
}

describe("initDashboardFragmentTable", () => {
  beforeEach(() => {
    vi.stubGlobal("location", {
      href: "https://jehmarp.example/admin/orders",
      origin: "https://jehmarp.example",
      pathname: "/admin/orders",
      search: "",
      assign: vi.fn(),
    });
    vi.stubGlobal("history", {
      replaceState: vi.fn(),
      state: null,
    });
    window.readDashboardFragmentResponse = async (response) => response.text();
    sessionStorage.clear();
    createFragmentTableDocument();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("fetches a fresh fragment after a dashboard mutation instead of caching stale HTML", async () => {
    markDashboardFragmentRefreshNeeded();

    const fetchMock = vi.fn(async () =>
      new Response(
        `
          <div data-interactive-table>
            <div data-order-table-shell>
              <table><tbody><tr><td>fresh-order</td></tr></tbody></table>
            </div>
            <div data-server-pagination-footer></div>
          </div>
        `,
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    initDashboardFragmentTable({
      cacheKey: "admin-orders-filter-cache-v2",
      fragmentPath: "/admin/orders-fragment",
      pagePath: "/admin/orders",
      formSelector: "[data-order-filter-form]",
      tableShellSelector: "[data-order-table-shell]",
      skeletonTemplateSelector: "[data-order-filter-skeleton]",
      filterKeys: ["search", "source", "orderStatus", "paymentStatus"],
      searchInputSelector: "[data-order-search-input]",
      historyStateKey: "orderFilterQuery",
    });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    await vi.waitFor(() => {
      expect(
        document.querySelector("[data-order-table-shell]")?.textContent,
      ).toContain("fresh-order");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/orders-fragment",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(
      document.querySelector("[data-order-table-shell]")?.textContent,
    ).toContain("fresh-order");
    expect(consumeDashboardFragmentRefreshNeeded()).toBe(false);
    expect(
      readDashboardFragmentCache("admin-orders-filter-cache-v2", ""),
    ).toContain("fresh-order");
  });

  it("navigates when the page number input is submitted", async () => {
    document.body.innerHTML = `
      <form data-order-filter-form>
        <input name="search" data-order-search-input />
      </form>
      <div data-interactive-table>
        <div data-order-table-shell>
          <table><tbody><tr><td>order</td></tr></tbody></table>
        </div>
        <footer data-server-pagination-footer data-total-pages="5">
          <input data-pagination-page-input value="1" />
          <select data-limit-select><option value="10" selected>10 rows</option></select>
        </footer>
      </div>
      <template data-order-filter-skeleton>
        <div data-skeleton>loading</div>
      </template>
    `;

    const fetchMock = vi.fn(async () =>
      new Response(
        `
          <div data-interactive-table>
            <div data-order-table-shell>
              <table><tbody><tr><td>page-3-order</td></tr></tbody></table>
            </div>
            <footer data-server-pagination-footer data-total-pages="5"></footer>
          </div>
        `,
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    initDashboardFragmentTable({
      cacheKey: "admin-orders-filter-cache-v2",
      fragmentPath: "/admin/orders-fragment",
      pagePath: "/admin/orders",
      formSelector: "[data-order-filter-form]",
      tableShellSelector: "[data-order-table-shell]",
      skeletonTemplateSelector: "[data-order-filter-skeleton]",
      filterKeys: ["search", "source", "orderStatus", "paymentStatus"],
      searchInputSelector: "[data-order-search-input]",
      historyStateKey: "orderFilterQuery",
    });

    const pageInput = document.querySelector<HTMLInputElement>("[data-pagination-page-input]");
    expect(pageInput).not.toBeNull();

    pageInput!.value = "3";
    pageInput!.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/admin/orders-fragment?page=3",
        expect.objectContaining({ cache: "no-store" }),
      );
    });
  });

  it("rebinds pagination controls when initialization runs again", async () => {
    document.body.innerHTML = `
      <form data-order-filter-form>
        <input name="search" data-order-search-input />
      </form>
      <div data-interactive-table>
        <div data-order-table-shell>
          <table><tbody><tr><td>order</td></tr></tbody></table>
        </div>
        <footer data-server-pagination-footer data-total-pages="4">
          <button type="button" data-page="2" data-pagination-next>Next</button>
        </footer>
      </div>
      <template data-order-filter-skeleton>
        <div data-skeleton>loading</div>
      </template>
    `;

    const fetchMock = vi.fn(async () =>
      new Response(
        `
          <div data-interactive-table>
            <div data-order-table-shell>
              <table><tbody><tr><td>page-2-order</td></tr></tbody></table>
            </div>
            <footer data-server-pagination-footer data-total-pages="4"></footer>
          </div>
        `,
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const config = {
      cacheKey: "admin-orders-filter-cache-v2",
      fragmentPath: "/admin/orders-fragment",
      pagePath: "/admin/orders",
      formSelector: "[data-order-filter-form]",
      tableShellSelector: "[data-order-table-shell]",
      skeletonTemplateSelector: "[data-order-filter-skeleton]",
      filterKeys: ["search", "source", "orderStatus", "paymentStatus"] as const,
      searchInputSelector: "[data-order-search-input]",
      historyStateKey: "orderFilterQuery",
    };

    initDashboardFragmentTable(config);

    const interactiveTable = document.querySelector<HTMLElement>("[data-interactive-table]")!;
    interactiveTable.innerHTML = `
      <div data-order-table-shell>
        <table><tbody><tr><td>swapped-order</td></tr></tbody></table>
      </div>
      <footer data-server-pagination-footer data-total-pages="4">
        <button type="button" data-page="2" data-pagination-next>Next</button>
      </footer>
    `;

    initDashboardFragmentTable(config);

    document.querySelector<HTMLButtonElement>("[data-pagination-next]")?.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/admin/orders-fragment?page=2",
        expect.objectContaining({ cache: "no-store" }),
      );
    });
  });

  it("changes the page size from the rows selector", async () => {
    document.body.innerHTML = `
      <form data-order-filter-form>
        <input name="search" data-order-search-input />
      </form>
      <div data-interactive-table>
        <div data-order-table-shell>
          <table><tbody><tr><td>order</td></tr></tbody></table>
        </div>
        <footer data-server-pagination-footer data-total-pages="4">
          <select data-limit-select>
            <option value="10" selected>10 rows</option>
            <option value="50">50 rows</option>
          </select>
        </footer>
      </div>
      <template data-order-filter-skeleton>
        <div data-skeleton>loading</div>
      </template>
    `;

    const fetchMock = vi.fn(async () =>
      new Response(
        `
          <div data-interactive-table>
            <div data-order-table-shell>
              <table><tbody><tr><td>page-size-order</td></tr></tbody></table>
            </div>
            <footer data-server-pagination-footer data-total-pages="2"></footer>
          </div>
        `,
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    initDashboardFragmentTable({
      cacheKey: "admin-orders-filter-cache-v2",
      fragmentPath: "/admin/orders-fragment",
      pagePath: "/admin/orders",
      formSelector: "[data-order-filter-form]",
      tableShellSelector: "[data-order-table-shell]",
      skeletonTemplateSelector: "[data-order-filter-skeleton]",
      filterKeys: ["search", "source", "orderStatus", "paymentStatus"],
      searchInputSelector: "[data-order-search-input]",
      historyStateKey: "orderFilterQuery",
    });

    const limitSelect = document.querySelector<HTMLSelectElement>("[data-limit-select]")!;
    limitSelect.value = "50";
    limitSelect.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/admin/orders-fragment?pageSize=50",
        expect.objectContaining({ cache: "no-store" }),
      );
    });
  });
});
