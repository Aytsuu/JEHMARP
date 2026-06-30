import { describe, expect, it } from "vitest";

import {
  PRODUCT_PUBLIC_COLUMNS,
  buildPagination,
  parseShopFilters,
} from "./shop";

describe("parseShopFilters", () => {
  it("parses supported category, stock, price, sorting, and page filters", () => {
    const filters = parseShopFilters(
      new URL(
        "https://example.test/shop?category=chicken&stockStatus=limited&minPrice=100&maxPrice=250&sort=price_desc&page=3",
      ),
    );

    expect(filters).toEqual({
      category: "chicken",
      stockStatus: "limited",
      minPrice: 100,
      maxPrice: 250,
      sort: "price_desc",
      page: 3,
      pageSize: 12,
    });
  });

  it("falls back to safe defaults for unsupported filters", () => {
    const filters = parseShopFilters(
      new URL(
        "https://example.test/shop?category=beef&stockStatus=hidden&minPrice=-1&maxPrice=bad&sort=reseller_price&page=0",
      ),
    );

    expect(filters).toEqual({
      category: undefined,
      stockStatus: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      sort: "name_asc",
      page: 1,
      pageSize: 12,
    });
  });
});

describe("PRODUCT_PUBLIC_COLUMNS", () => {
  it("does not request reseller pricing for public product UI", () => {
    expect(PRODUCT_PUBLIC_COLUMNS).toContain("default_price");
    expect(PRODUCT_PUBLIC_COLUMNS).not.toContain("reseller_price");
  });
});

describe("buildPagination", () => {
  it("calculates page metadata from count and page size", () => {
    expect(buildPagination({ count: 25, page: 2, pageSize: 12 })).toEqual({
      count: 25,
      currentPage: 2,
      totalPages: 3,
      previousPage: 1,
      nextPage: 3,
    });
  });

  it("clamps empty results to one page", () => {
    expect(buildPagination({ count: 0, page: 9, pageSize: 12 })).toEqual({
      count: 0,
      currentPage: 1,
      totalPages: 1,
      previousPage: undefined,
      nextPage: undefined,
    });
  });
});
