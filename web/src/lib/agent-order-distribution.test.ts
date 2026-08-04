import { describe, expect, it } from "vitest";

import {
  attachCustomerBlockMessage,
  buildAgentOrderProductDistributions,
  canAttachCustomerToAgentOrder,
  canDecreaseAgentOrderItemQuantity,
  formatAgentOrderDistributionStatus,
  getAgentOrderProductDistribution,
  minimumAgentOrderItemQuantity,
  sumPendingCustomerOrderAmount,
} from "./agent-order-distribution";

const agentOrder = {
  agent_order_item: [
    { product_id: "product-a", quantity: 10 },
    { product_id: "product-b", quantity: 5 },
  ],
  customer_order: [
    {
      order_status: "processing",
      customer_order_item: [
        { product_id: "product-a", partial_quantity: 7, unit_price: 100 },
      ],
    },
    {
      order_status: "pending",
      customer_order_item: [
        {
          product_id: "product-a",
          partial_quantity: 5,
          agent_order_quantity_increase: 2,
          unit_price: 100,
        },
        {
          product_id: "product-b",
          partial_quantity: 1,
          agent_order_quantity_increase: 0,
          unit_price: 50,
        },
      ],
    },
  ],
};

describe("agent-order-distribution", () => {
  it("calculates approved distributed and pending increases per product", () => {
    expect(buildAgentOrderProductDistributions(agentOrder)).toEqual([
      {
        productId: "product-a",
        totalQuantity: 10,
        approvedDistributedQuantity: 7,
        remainingQuantity: 3,
        pendingQuantityIncrease: 2,
        displayQuantity: 12,
      },
      {
        productId: "product-b",
        totalQuantity: 5,
        approvedDistributedQuantity: 0,
        remainingQuantity: 5,
        pendingQuantityIncrease: 0,
        displayQuantity: 5,
      },
    ]);
  });

  it("blocks decreases that exceed remaining undistributed quantity", () => {
    const distribution = getAgentOrderProductDistribution(agentOrder, "product-a");

    expect(canDecreaseAgentOrderItemQuantity({
      currentQuantity: distribution.totalQuantity,
      newQuantity: 8,
      approvedDistributedQuantity: distribution.approvedDistributedQuantity,
    })).toBe(true);

    expect(canDecreaseAgentOrderItemQuantity({
      currentQuantity: distribution.totalQuantity,
      newQuantity: 6,
      approvedDistributedQuantity: distribution.approvedDistributedQuantity,
    })).toBe(false);
  });

  it("uses approved distributed quantity as the minimum editable quantity", () => {
    expect(minimumAgentOrderItemQuantity(7)).toBe(7);
  });

  it("formats fully distributed product status", () => {
    expect(formatAgentOrderDistributionStatus({
      remainingQuantity: 0,
      unitLabel: "kg",
    })).toBe("Fully Distributed");
  });

  it("formats remaining product quantity for distribution", () => {
    expect(formatAgentOrderDistributionStatus({
      remainingQuantity: 3,
      unitLabel: "kg",
    })).toBe("3 kg remaining for distribution");
  });

  it("sums pending customer order amounts only", () => {
    expect(sumPendingCustomerOrderAmount(agentOrder)).toBe(550);
  });

  it("blocks attaching customers when the agent order is closed and fully paid", () => {
    expect(canAttachCustomerToAgentOrder({
      order_status: "pending_order",
      customer_order: [],
    })).toBe(false);
    expect(attachCustomerBlockMessage({
      order_status: "pending_order",
      customer_order: [],
    })).toBe("This distribution order is awaiting admin approval.");

    expect(canAttachCustomerToAgentOrder({
      order_status: "closed",
      customer_order: [
        { payment_status: "paid" },
        { payment_status: "paid" },
      ],
    })).toBe(false);

    expect(canAttachCustomerToAgentOrder({
      order_status: "closed",
      customer_order: [{ payment_status: "partial" }],
    })).toBe(true);

    expect(canAttachCustomerToAgentOrder({
      order_status: "processing",
      customer_order: [{ payment_status: "paid" }],
    })).toBe(true);
  });
});
