import { describe, expect, it } from "vitest";

import type { AdminOrder, AdminOrderItem } from "./data";
import {
  buildUnpaidOrderCheckNotifications,
  UNPAID_ORDER_CHECK_THRESHOLDS,
} from "./unpaid-order-checks";

describe("unpaid order check notifications", () => {
  const now = new Date("2026-07-23T12:00:00.000Z");

  it("groups unpaid orders by customer and highest crossed aging threshold", () => {
    const notifications = buildUnpaidOrderCheckNotifications(
      [
        unpaidOrder({
          id: "order-3d",
          customerId: "customer-a",
          approvedAt: "2026-07-20T12:00:00.000Z",
        }),
        unpaidOrder({
          id: "order-1w",
          customerId: "customer-a",
          approvedAt: "2026-07-15T12:00:00.000Z",
        }),
        unpaidOrder({
          id: "order-2w",
          customerId: "customer-b",
          approvedAt: "2026-07-08T12:00:00.000Z",
        }),
        unpaidOrder({
          id: "order-1m",
          customerId: "customer-c",
          approvedAt: "2026-06-20T12:00:00.000Z",
        }),
      ],
      [
        customer("customer-a", "Ada", "Buyer"),
        customer("customer-b", "Ben", "Buyer"),
        customer("customer-c", "Cat", "Buyer"),
      ],
      new Set(),
      now,
    );

    expect(notifications).toEqual([
      expect.objectContaining({
        id: "unpaid-check-customer-c-1m",
        message: "Cat Buyer has 1 unpaid order at 1 month unpaid.",
        link: "/admin/customers/customer-c",
      }),
      expect.objectContaining({
        id: "unpaid-check-customer-b-2w",
        message: "Ben Buyer has 1 unpaid order at 2 weeks unpaid.",
      }),
      expect.objectContaining({
        id: "unpaid-check-customer-a-1w",
        message: "Ada Buyer has 1 unpaid order at 1 week unpaid.",
      }),
      expect.objectContaining({
        id: "unpaid-check-customer-a-3d",
        message: "Ada Buyer has 1 unpaid order at 3 days unpaid.",
      }),
    ]);
  });

  it("ignores paid orders and balances below three days unpaid", () => {
    const notifications = buildUnpaidOrderCheckNotifications(
      [
        unpaidOrder({
          id: "order-paid",
          customerId: "customer-a",
          paymentStatus: "paid",
          approvedAt: "2026-06-01T12:00:00.000Z",
        }),
        unpaidOrder({
          id: "order-fresh",
          customerId: "customer-a",
          approvedAt: "2026-07-22T12:00:00.000Z",
        }),
      ],
      [customer("customer-a", "Ada", "Buyer")],
      new Set(),
      now,
    );

    expect(notifications).toEqual([]);
  });

  it("uses the configured aging thresholds", () => {
    expect(UNPAID_ORDER_CHECK_THRESHOLDS.map((threshold) => threshold.label)).toEqual([
      "3 days unpaid",
      "1 week unpaid",
      "2 weeks unpaid",
      "1 month unpaid",
    ]);
  });
});

function customer(id: string, firstName: string, lastName: string) {
  return {
    id,
    tracking_number: "JHM-ABCD2345",
    first_name: firstName,
    last_name: lastName,
    phone_number: "09170000000",
    email: `${firstName.toLowerCase()}@example.com`,
    address: "123 Road",
    assigned_agent_id: null,
    is_reseller: false,
    credit_limit: 1000,
    credit_limit_exceeded: false,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
}

function unpaidOrder(params: {
  id: string;
  customerId: string;
  approvedAt: string;
  paymentStatus?: "unpaid" | "partial" | "paid";
}): AdminOrder {
  const item: AdminOrderItem = {
    id: `${params.id}-item`,
    product_id: "product-1",
    partial_quantity: 1,
    final_quantity: 1,
    unit_price: 100,
    price_type: "retail",
    add_details: null,
    agent_commission_amount: 0,
    agent_commission_paid: false,
    product: {
      id: "product-1",
      name: "Pork Belly",
      unit_label: "kg",
      default_price: 100,
      agent_commission_type: "value",
      agent_commission_value: 0,
    },
  };

  return {
    id: params.id,
    customer_id: params.customerId,
    agent_id: null,
    source: "admin_manual",
    order_status: "processing",
    payment_status: params.paymentStatus ?? "unpaid",
    notes: null,
    approved_at: params.approvedAt,
    created_at: params.approvedAt,
    updated_at: params.approvedAt,
    customer: null,
    agent: null,
    customer_order_item: [item],
    payment: [],
    invoice: [],
    customer_order_status_history: [],
  };
}
