import { describe, expect, it } from "vitest";

import {
  parseAdminOrderFilters,
  serializeAdminOrderFilters,
} from "./order-filters";

describe("parseAdminOrderFilters", () => {
  it("parses supported search, source, status, payment, and total range filters", () => {
    const filters = parseAdminOrderFilters(
      new URL("https://example.test/admin/orders?search= maria   cruz &source=guest_shop&orderStatus=submitted&paymentStatus=partial&minTotal=1000&maxTotal=2500.75"),
    );

    expect(filters).toEqual({
      search: "maria cruz",
      source: "guest_shop",
      orderStatus: "submitted",
      paymentStatus: "partial",
      minTotal: 1000,
      maxTotal: 2500.75,
    });
  });

  it("ignores unsupported or invalid filter values", () => {
    const filters = parseAdminOrderFilters(
      new URL("https://example.test/admin/orders?source=marketplace&orderStatus=missing&paymentStatus=unknown&minTotal=-1&maxTotal=bad"),
    );

    expect(filters).toEqual({});
  });
});

describe("serializeAdminOrderFilters", () => {
  it("serializes filters in a stable query order", () => {
    expect(
      serializeAdminOrderFilters({
        search: "order 42",
        paymentStatus: "paid",
        orderStatus: "fulfilled",
        source: "agent_submitted",
        maxTotal: 3000,
        minTotal: 500,
      }),
    ).toBe("search=order+42&source=agent_submitted&orderStatus=fulfilled&paymentStatus=paid&minTotal=500&maxTotal=3000");
  });
});
