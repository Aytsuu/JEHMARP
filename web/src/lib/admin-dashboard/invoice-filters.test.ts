import { describe, expect, it } from "vitest";

import {
  parseAdminInvoiceFilters,
  serializeAdminInvoiceFilters,
} from "./invoice-filters";

describe("parseAdminInvoiceFilters", () => {
  it("parses supported search and balance filters", () => {
    const filters = parseAdminInvoiceFilters(
      new URL("https://example.test/admin/invoices?search= inv-0042   maria cruz &balanceStatus=partial"),
    );

    expect(filters).toEqual({
      search: "inv-0042 maria cruz",
      balanceStatus: "partial",
    });
  });

  it("ignores unsupported or invalid invoice filter values", () => {
    const filters = parseAdminInvoiceFilters(
      new URL("https://example.test/admin/invoices?balanceStatus=refunded"),
    );

    expect(filters).toEqual({});
  });
});

describe("serializeAdminInvoiceFilters", () => {
  it("serializes filters in a stable query order", () => {
    expect(
      serializeAdminInvoiceFilters({
        search: "INV-42 maria",
        balanceStatus: "paid",
      }),
    ).toBe("search=INV-42+maria&balanceStatus=paid");
  });
});
