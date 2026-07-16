import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabasePublicClient: vi.fn(),
}));

vi.mock("@/lib/supabase/public", () => ({
  createSupabasePublicClient: mocks.createSupabasePublicClient,
}));

import {
  PRODUCT_PUBLIC_COLUMNS,
  buildPagination,
  listPublicProducts,
  parseShopFilters,
} from "./shop";

beforeEach(() => {
  mocks.createSupabasePublicClient.mockReset();
});

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

describe("listPublicProducts", () => {
  it("uses the non-auth public Supabase client for public shop reads", async () => {
    const range = vi.fn(async () => ({
      data: [],
      error: null,
      count: 0,
    }));
    const order = vi.fn(() => ({ range }));
    const eq = vi.fn(() => ({ order, eq, gte, lte }));
    const gte = vi.fn(() => ({ order, eq, gte, lte }));
    const lte = vi.fn(() => ({ order, eq, gte, lte }));
    const select = vi.fn(() => ({ eq, order, gte, lte }));
    const from = vi.fn(() => ({ select }));
    mocks.createSupabasePublicClient.mockReturnValue({ from });

    const result = await listPublicProducts(
      {
        cookies: {},
        request: new Request("https://example.test/shop"),
      } as never,
      {
        sort: "name_asc",
        page: 1,
        pageSize: 12,
      },
    );

    expect(mocks.createSupabasePublicClient).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("product");
    expect(select).toHaveBeenCalledWith(PRODUCT_PUBLIC_COLUMNS, {
      count: "exact",
    });
    expect(result).toEqual({
      products: [],
      pagination: {
        count: 0,
        currentPage: 1,
        totalPages: 1,
        previousPage: undefined,
        nextPage: undefined,
      },
    });
  });
});
