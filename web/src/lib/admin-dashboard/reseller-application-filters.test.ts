import { describe, expect, it } from "vitest";

import {
  parseAdminResellerApplicationFilters,
  serializeAdminResellerApplicationFilters,
} from "./reseller-application-filters";

describe("parseAdminResellerApplicationFilters", () => {
  it("parses supported search and status filters", () => {
    expect(
      parseAdminResellerApplicationFilters(
        new URL("https://example.test/admin/reseller-applications?search= maria   cruz &status=submitted"),
      ),
    ).toEqual({
      search: "maria cruz",
      status: "submitted",
    });
  });
});

describe("serializeAdminResellerApplicationFilters", () => {
  it("serializes filters in a stable query order", () => {
    expect(
      serializeAdminResellerApplicationFilters({
        search: "Ana",
        status: "contacted",
      }),
    ).toBe("search=Ana&status=contacted");
  });
});
