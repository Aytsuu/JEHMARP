import { describe, expect, it } from "vitest";

import {
  parseAdminOrderFilters,
  serializeAdminOrderFilters,
} from "./order-filters";

describe("parseAdminOrderFilters", () => {
  it("parses supported search, source, status, and payment filters", () => {
    const filters = parseAdminOrderFilters(
      new URL("https://example.test/admin/orders?search= maria   cruz &source=guest_shop&orderStatus=pending&paymentStatus=partial"),
    );

    expect(filters).toEqual({
      search: "maria cruz",
      source: "guest_shop",
      orderStatus: "pending",
      paymentStatus: "partial",
    });
  });

  it("ignores unsupported or invalid filter values", () => {
    const filters = parseAdminOrderFilters(
      new URL("https://example.test/admin/orders?source=marketplace&orderStatus=missing&paymentStatus=unknown"),
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
        orderStatus: "processing",
        source: "agent_submitted",
      }),
    ).toBe("search=order+42&source=agent_submitted&orderStatus=processing&paymentStatus=paid");
  });
});
