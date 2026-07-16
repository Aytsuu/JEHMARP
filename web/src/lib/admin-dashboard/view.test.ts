import { describe, expect, it } from "vitest";

import type { AdminOrder } from "./data";
import {
  agentOrderPaymentStatus,
  canManageOrderCommissions,
  defaultProductCommissionAmount,
  formatCompactCurrency,
  formatDateTime,
  orderBalance,
  orderPaymentTotal,
  orderTotal,
  productAgentCommissionLabel,
  productDisplayLabel,
} from "./view";

describe("orderTotal", () => {
  it("uses the order item unit price snapshot instead of the current product retail price", () => {
    const order = {
      customer_order_item: [
        {
          partial_quantity: 2,
          final_quantity: 3,
          unit_price: 80,
          product: {
            default_price: 100,
          },
        },
      ],
    } as AdminOrder;

    expect(orderTotal(order, "partial_quantity")).toBe(160);
    expect(orderTotal(order, "final_quantity")).toBe(240);
  });
});

describe("productAgentCommissionLabel", () => {
  it("formats value and percentage commission labels per unit", () => {
    expect(
      productAgentCommissionLabel({
        agent_commission_type: "value",
        agent_commission_value: 12.5,
        unit_label: "kg",
      }),
    ).toBe("₱12.50 / kg");
    expect(
      productAgentCommissionLabel({
        agent_commission_type: "percentage",
        agent_commission_value: 5,
        unit_label: "tray",
      }),
    ).toBe("5% / tray");
  });
});

describe("formatCompactCurrency", () => {
  it("formats credit values without cents and compacts thousands", () => {
    expect(formatCompactCurrency(0)).toBe("\u20b10");
    expect(formatCompactCurrency(999.49)).toBe("\u20b1999");
    expect(formatCompactCurrency(1000)).toBe("\u20b11k");
    expect(formatCompactCurrency(1500)).toBe("\u20b11.5k");
    expect(formatCompactCurrency(1549)).toBe("\u20b11.5k");
  });
});

describe("defaultProductCommissionAmount", () => {
  it("calculates value-based product commission into a total amount", () => {
    expect(defaultProductCommissionAmount({
      product: {
        agent_commission_type: "value",
        agent_commission_value: 12.5,
      },
      quantity: 4,
      unitPrice: 200,
    })).toBe(50);
  });

  it("calculates percentage-based product commission into a total amount", () => {
    expect(defaultProductCommissionAmount({
      product: {
        agent_commission_type: "percentage",
        agent_commission_value: 5,
      },
      quantity: 3,
      unitPrice: 200,
    })).toBe(30);
  });

  it("returns zero when a product is missing", () => {
    expect(defaultProductCommissionAmount({
      product: null,
      quantity: 3,
      unitPrice: 200,
    })).toBe(0);
  });
});

describe("orderPaymentTotal", () => {
  it("sums recorded order payments", () => {
    const order = {
      payment: [
        { amount: 100 },
        { amount: 25.5 },
      ],
    } as AdminOrder;

    expect(orderPaymentTotal(order)).toBe(125.5);
  });
});

describe("agentOrderPaymentStatus", () => {
  it("aggregates linked customer order payment statuses", () => {
    expect(agentOrderPaymentStatus({ customer_order: [] })).toBe("unpaid");
    expect(agentOrderPaymentStatus({
      customer_order: [
        { payment_status: "unpaid" },
        { payment_status: "unpaid" },
      ] as AdminOrder[],
    })).toBe("unpaid");
    expect(agentOrderPaymentStatus({
      customer_order: [
        { payment_status: "unpaid" },
        { payment_status: "partial" },
      ] as AdminOrder[],
    })).toBe("partial");
    expect(agentOrderPaymentStatus({
      customer_order: [
        { payment_status: "paid" },
        { payment_status: "unpaid" },
      ] as AdminOrder[],
    })).toBe("partial");
    expect(agentOrderPaymentStatus({
      customer_order: [
        { payment_status: "paid" },
        { payment_status: "paid" },
      ] as AdminOrder[],
    })).toBe("paid");
  });
});

describe("orderBalance", () => {
  it("returns the unpaid invoice balance without going below zero", () => {
    const order = {
      customer_order_item: [
        {
          final_quantity: 2,
          unit_price: 80,
        },
      ],
      payment: [
        { amount: 200 },
      ],
    } as AdminOrder;

    expect(orderBalance(order)).toBe(0);
  });
});

describe("canManageOrderCommissions", () => {
  it("requires an agent linked directly to the customer order", () => {
    expect(canManageOrderCommissions({ agent_id: null } as AdminOrder)).toBe(false);
    expect(canManageOrderCommissions({ agent_id: "64568f81-108b-42bd-b926-7e825dad67c6" } as AdminOrder)).toBe(true);
  });
});

describe("formatDateTime", () => {
  it("formats ISO timestamps for the Philippines timezone", () => {
    expect(formatDateTime("2026-07-11T18:54:27.430254+00:00")).toBe("Jul 12, 2026, 2:54 AM");
    expect(formatDateTime(null)).toBe("Not set");
  });
});

describe("productDisplayLabel", () => {
  it("combines product name and unit for product table display", () => {
    expect(productDisplayLabel({ name: "Chicken Breast", unit_label: "kg" })).toBe("Chicken Breast (kg)");
  });
});
