import { describe, expect, it } from "vitest";

import { parseAdminActivityFilters, serializeAdminActivityFilters } from "./activity-filters";

describe("parseAdminActivityFilters", () => {
  it("parses supported search filters", () => {
    expect(
      parseAdminActivityFilters(
        new URL("https://example.test/admin/activity?search=  new   order "),
      ),
    ).toEqual({
      search: "new order",
    });
  });

  it("ignores empty search values", () => {
    expect(parseAdminActivityFilters(new URL("https://example.test/admin/activity?search="))).toEqual({});
  });
});

describe("serializeAdminActivityFilters", () => {
  it("serializes search filters", () => {
    expect(
      serializeAdminActivityFilters({
        search: "invoice",
      }),
    ).toBe("search=invoice");
  });
});
