import { describe, expect, it } from "vitest";

import { computeAdminOrderStatusCounts } from "./summary";

describe("computeAdminOrderStatusCounts", () => {
  it("combines customer and agent order status counts", () => {
    expect(computeAdminOrderStatusCounts(
      [
        { order_status: "pending" },
        { order_status: "processing" },
        { order_status: "closed" },
      ],
      [
        { order_status: "pending_customers" },
        { order_status: "pending_order" },
        { order_status: "processing" },
        { order_status: "closed" },
      ],
    )).toEqual({
      totalOrders: 7,
      pendingOrders: 3,
      processingOrders: 2,
      pendingOrder: 2,
      pendingCustomer: 1,
      processing: 2,
      closed: 2,
    });
  });
});
