import { describe, expect, it } from "vitest";

import {
  parseAdminProductFilters,
  serializeAdminProductFilters,
} from "./product-filters";

describe("parseAdminProductFilters", () => {
  it("parses supported search, category, and status filters", () => {
    const filters = parseAdminProductFilters(
      new URL("https://example.test/admin/products?search= belly &category=pork&stockStatus=limited"),
    );

    expect(filters).toEqual({
      search: "belly",
      category: "pork",
      stockStatus: "limited",
    });
  });

  it("ignores unsupported or invalid filter values", () => {
    const filters = parseAdminProductFilters(
      new URL("https://example.test/admin/products?category=beef&stockStatus=hidden"),
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
      }),
    ).toBe("search=egg+tray&category=egg&stockStatus=in_stock");
  });
});
