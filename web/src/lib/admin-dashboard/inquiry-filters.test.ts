import { describe, expect, it } from "vitest";

import { parseAdminInquiryFilters, serializeAdminInquiryFilters } from "./inquiry-filters";

describe("parseAdminInquiryFilters", () => {
  it("parses supported search and status filters", () => {
    expect(
      parseAdminInquiryFilters(
        new URL("https://example.test/admin/inquiries?search= maria   cruz &status=reviewing"),
      ),
    ).toEqual({
      search: "maria cruz",
      status: "reviewing",
    });
  });
});

describe("serializeAdminInquiryFilters", () => {
  it("serializes filters in a stable query order", () => {
    expect(
      serializeAdminInquiryFilters({
        search: "Ana",
        status: "closed",
      }),
    ).toBe("search=Ana&status=closed");
  });
});
