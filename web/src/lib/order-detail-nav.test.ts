import { describe, expect, it } from "vitest";

import {
  buildOrderDetailNavEntries,
  formatOrderCode,
} from "./order-detail-nav";

describe("formatOrderCode", () => {
  it("formats order ids into order codes", () => {
    expect(formatOrderCode("49d07a2e-a8bb-4dc9-8df5-8ee5464286fb")).toBe("Order-49D07A");
  });
});

describe("buildOrderDetailNavEntries", () => {
  it("sorts orders newest first and marks the current order", () => {
    expect(buildOrderDetailNavEntries({
      orders: [
        { id: "11111111-1111-4111-8111-111111111111", created_at: "2026-07-01T00:00:00.000Z" },
        { id: "22222222-2222-4222-8222-222222222222", created_at: "2026-07-03T00:00:00.000Z" },
      ],
      currentOrderId: "11111111-1111-4111-8111-111111111111",
      buildHref: (order) => `/orders/${order.id}`,
    })).toEqual([
      {
        id: "22222222-2222-4222-8222-222222222222",
        code: "Order-222222",
        createdAt: "2026-07-03T00:00:00.000Z",
        href: "/orders/22222222-2222-4222-8222-222222222222",
        isCurrent: false,
      },
      {
        id: "11111111-1111-4111-8111-111111111111",
        code: "Order-111111",
        createdAt: "2026-07-01T00:00:00.000Z",
        href: "/orders/11111111-1111-4111-8111-111111111111",
        isCurrent: true,
      },
    ]);
  });
});
