import { describe, expect, it } from "vitest";

import type { AdminOrder } from "./data";
import {
  canManageOrderCommissions,
  orderBalance,
  orderPaymentTotal,
  orderTotal,
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
