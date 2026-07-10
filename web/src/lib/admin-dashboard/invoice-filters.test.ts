import { describe, expect, it } from "vitest";

import {
  parseAdminInvoiceFilters,
  serializeAdminInvoiceFilters,
} from "./invoice-filters";

describe("parseAdminInvoiceFilters", () => {
  it("parses supported search, balance, and total range filters", () => {
    const filters = parseAdminInvoiceFilters(
      new URL("https://example.test/admin/invoices?search= inv-0042   maria cruz &balanceStatus=partial&minTotal=1000&maxTotal=2500.75"),
    );

    expect(filters).toEqual({
      search: "inv-0042 maria cruz",
      balanceStatus: "partial",
      minTotal: 1000,
      maxTotal: 2500.75,
    });
  });

  it("ignores unsupported or invalid invoice filter values", () => {
    const filters = parseAdminInvoiceFilters(
      new URL("https://example.test/admin/invoices?balanceStatus=refunded&minTotal=-1&maxTotal=bad"),
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
        minTotal: 500,
        maxTotal: 3000,
      }),
    ).toBe("search=INV-42+maria&balanceStatus=paid&minTotal=500&maxTotal=3000");
  });
});
