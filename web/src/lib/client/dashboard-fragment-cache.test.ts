import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDashboardFragmentCaches,
  readDashboardFragmentCache,
  writeDashboardFragmentCache,
} from "./dashboard-fragment-cache";

describe("dashboard fragment cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined when a query has no cached fragment", () => {
    expect(readDashboardFragmentCache("products", "search=chicken")).toBeUndefined();
  });

  it("stores and reads a fragment for the same cache key and query", () => {
    writeDashboardFragmentCache(
      "products",
      "search=chicken",
      '<div data-product-table-shell>Chicken</div>',
    );

    expect(readDashboardFragmentCache("products", "search=chicken")).toBe(
      '<div data-product-table-shell>Chicken</div>',
    );
  });

  it("keeps cache keys and query strings isolated", () => {
    writeDashboardFragmentCache("products", "search=chicken", "products");
    writeDashboardFragmentCache("orders", "search=chicken", "orders");

    expect(readDashboardFragmentCache("products", "search=chicken")).toBe(
      "products",
    );
    expect(readDashboardFragmentCache("orders", "search=chicken")).toBe(
      "orders",
    );
    expect(readDashboardFragmentCache("products", "search=pork")).toBeUndefined();
  });

  it("replaces an existing fragment instead of duplicating the query", () => {
    writeDashboardFragmentCache("products", "search=chicken", "old");
    writeDashboardFragmentCache("products", "search=chicken", "new");

    expect(readDashboardFragmentCache("products", "search=chicken")).toBe("new");
  });

  it("evicts the oldest entries when the cache reaches the max entry count", () => {
    writeDashboardFragmentCache("products", "one", "one", 2);
    vi.setSystemTime(new Date("2026-07-13T00:00:01.000Z"));
    writeDashboardFragmentCache("products", "two", "two", 2);
    vi.setSystemTime(new Date("2026-07-13T00:00:02.000Z"));
    writeDashboardFragmentCache("products", "three", "three", 2);

    expect(readDashboardFragmentCache("products", "one")).toBeUndefined();
    expect(readDashboardFragmentCache("products", "two")).toBe("two");
    expect(readDashboardFragmentCache("products", "three")).toBe("three");
  });

  it("ignores malformed cache entries", () => {
    sessionStorage.setItem(
      "dashboard-fragment-cache:products",
      JSON.stringify({ version: 1, entries: [{ query: "x" }] }),
    );

    expect(readDashboardFragmentCache("products", "x")).toBeUndefined();
  });

  it("clears only dashboard fragment cache entries", () => {
    writeDashboardFragmentCache("products", "search=chicken", "products");
    sessionStorage.setItem("other-cache", "keep");

    clearDashboardFragmentCaches();

    expect(
      readDashboardFragmentCache("products", "search=chicken"),
    ).toBeUndefined();
    expect(sessionStorage.getItem("other-cache")).toBe("keep");
  });
});
