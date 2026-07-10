import { describe, expect, it } from "vitest";

import {
  parseAdminCustomerFilters,
  serializeAdminCustomerFilters,
} from "./customer-filters";

describe("parseAdminCustomerFilters", () => {
  it("parses supported search and type filters", () => {
    const filters = parseAdminCustomerFilters(
      new URL("https://example.test/admin/customers?search= maria   cruz &customerType=reseller"),
    );

    expect(filters).toEqual({
      search: "maria cruz",
      customerType: "reseller",
    });
  });

  it("ignores unsupported filter values", () => {
    const filters = parseAdminCustomerFilters(
      new URL("https://example.test/admin/customers?customerType=vip"),
    );

    expect(filters).toEqual({});
  });
});

describe("serializeAdminCustomerFilters", () => {
  it("serializes filters in a stable query order", () => {
    expect(
      serializeAdminCustomerFilters({
        search: "Ana Reyes",
        customerType: "retail",
      }),
    ).toBe("search=Ana+Reyes&customerType=retail");
  });
});
