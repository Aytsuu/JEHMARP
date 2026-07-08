import { describe, expect, it } from "vitest";

import {
  parseAdminProductFilters,
  serializeAdminProductFilters,
} from "./product-filters";

describe("parseAdminProductFilters", () => {
  it("parses supported search, category, status, and price range filters", () => {
    const filters = parseAdminProductFilters(
      new URL("https://example.test/admin/products?search= belly &category=pork&stockStatus=limited&minPrice=100&maxPrice=250.50"),
    );

    expect(filters).toEqual({
      search: "belly",
      category: "pork",
      stockStatus: "limited",
      minPrice: 100,
      maxPrice: 250.5,
    });
  });

  it("ignores unsupported or invalid filter values", () => {
    const filters = parseAdminProductFilters(
      new URL("https://example.test/admin/products?category=beef&stockStatus=hidden&minPrice=-1&maxPrice=bad"),
    );

    expect(filters).toEqual({});
  });
});

describe("serializeAdminProductFilters", () => {
  it("serializes filters in a stable query order", () => {
    expect(
      serializeAdminProductFilters({
        search: "egg tray",
        stockStatus: "in_stock",
        category: "egg",
        maxPrice: 300,
        minPrice: 50,
      }),
    ).toBe("search=egg+tray&category=egg&stockStatus=in_stock&minPrice=50&maxPrice=300");
  });
});
