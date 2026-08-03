import { describe, expect, it } from "vitest";

import type { AdminAgentOrder, AdminOrder } from "./data";
import {
  agentCustomerBalance,
  agentOrderCommissionTotal,
  agentOrderPaidTotal,
  agentOrderPaymentStatus,
  agentOrderReceivableTotal,
  agentOrderRemainingReceivable,
  canConvertPromotedCustomerOrderToDistribution,
  canManageOrderCommissions,
  customerOrderDistributionConversionBlockMessage,
  defaultProductCommissionAmount,
  formatCompactCurrency,
  formatWholeCurrency,
  formatDateTime,
  formatSalePaymentSummary,
  getCustomerOrderDistributionConversionBlockReason,
  isOrderCommissionEffective,
  orderBalance,
  orderCommissionTotal,
  orderDistributionConversionAgentId,
  orderItemEffectiveCommissionAmount,
  orderPaymentTotal,
  orderReceivableTotal,
  orderTotal,
  productAgentCommissionLabel,
  productDisplayLabel,
  shouldShowCustomerOrderDistributionConversionCard,
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

describe("formatWholeCurrency", () => {
  it("formats currency values without decimal places", () => {
    expect(formatWholeCurrency(0)).toBe("\u20b10");
    expect(formatWholeCurrency(70)).toBe("\u20b170");
    expect(formatWholeCurrency(1234.56)).toBe("\u20b11,235");
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

describe("orderCommissionTotal", () => {
  it("sums item-level commission for a customer order linked to an agent", () => {
    const order = {
      agent_id: "64568f81-108b-42bd-b926-7e825dad67c6",
      customer_order_item: [
        {
          final_quantity: 3,
          unit_price: 300,
          agent_commission_amount: 60,
        },
        {
          final_quantity: 1,
          unit_price: 120,
          agent_commission_amount: 15,
        },
      ],
    } as AdminOrder;

    expect(orderCommissionTotal(order)).toBe(75);
    expect(orderReceivableTotal(order, "final_quantity")).toBe(945);
  });

  it("uses the product default commission when the stored customer order commission is zero", () => {
    const order = {
      agent_id: "64568f81-108b-42bd-b926-7e825dad67c6",
      customer_order_item: [
        {
          final_quantity: 3,
          unit_price: 300,
          agent_commission_amount: 0,
          product: {
            agent_commission_type: "value",
            agent_commission_value: 20,
          },
        },
      ],
    } as AdminOrder;

    expect(orderItemEffectiveCommissionAmount(
      order.customer_order_item[0],
      "final_quantity",
    )).toBe(60);
    expect(orderCommissionTotal(order)).toBe(60);
    expect(orderReceivableTotal(order, "final_quantity")).toBe(840);
  });

  it("uses product default commission for promoted customer processing orders attached to the new agent", () => {
    const order = {
      agent_id: "agent-1",
      parent_order_id: null,      customer: {
        promoted_to_agent_id: "agent-1",
      },
      customer_order_item: [
        {
          final_quantity: 3,
          unit_price: 300,
          agent_commission_amount: 0,
          product: {
            agent_commission_type: "value",
            agent_commission_value: 20,
          },
        },
      ],
    } as AdminOrder;

    expect(orderCommissionTotal(order)).toBe(60);
    expect(orderReceivableTotal(order, "final_quantity")).toBe(840);
  });

  it("does not use commission for direct customer orders just because the customer has an assigned agent", () => {
    const order = {
      agent_id: null,
      parent_order_id: null,      customer: {
        assigned_agent_id: "agent-1",
      },
      customer_order_item: [
        {
          final_quantity: 3,
          unit_price: 300,
          agent_commission_amount: 60,
          product: {
            agent_commission_type: "value",
            agent_commission_value: 20,
          },
        },
      ],
    } as AdminOrder;

    expect(isOrderCommissionEffective(order)).toBe(false);
    expect(orderCommissionTotal(order)).toBe(0);
    expect(orderReceivableTotal(order, "final_quantity")).toBe(900);
  });

  it("does not use product default commission for regular customer orders", () => {
    const order = {
      agent_id: null,
      parent_order_id: null,      customer_order_item: [
        {
          final_quantity: 3,
          unit_price: 300,
          agent_commission_amount: 0,
          product: {
            agent_commission_type: "value",
            agent_commission_value: 20,
          },
        },
      ],
    } as AdminOrder;

    expect(orderCommissionTotal(order)).toBe(0);
    expect(orderReceivableTotal(order, "final_quantity")).toBe(900);
  });

  it("does not display a negative customer order receivable", () => {
    const order = {
      agent_id: "agent-1",
      customer_order_item: [
        {
          final_quantity: 1,
          unit_price: 50,
          agent_commission_amount: 75,
        },
      ],
    } as AdminOrder;

    expect(orderReceivableTotal(order, "final_quantity")).toBe(0);
  });
});

describe("agentOrderReceivableTotal", () => {
  it("deducts distribution order commission from the gross order amount", () => {
    const order = {
      agent_order_item: [
        {
          quantity: 3,
          agent_commission_amount: 60,
          product: {
            default_price: 300,
          },
        },
        {
          quantity: 2,
          agent_commission_amount: 20,
          product: {
            default_price: 125,
          },
        },
      ],
    } as AdminAgentOrder;

    expect(agentOrderCommissionTotal(order)).toBe(80);
    expect(agentOrderReceivableTotal(order)).toBe(1070);
  });

  it("uses the product default commission when the stored agent order commission is zero", () => {
    const order = {
      agent_order_item: [
        {
          quantity: 3,
          agent_commission_amount: 0,
          product: {
            default_price: 300,
            agent_commission_type: "value",
            agent_commission_value: 20,
          },
        },
      ],
    } as AdminAgentOrder;

    expect(agentOrderCommissionTotal(order)).toBe(60);
    expect(agentOrderReceivableTotal(order)).toBe(840);
  });
});

describe("agentOrderRemainingReceivable", () => {
  it("subtracts linked customer order payments from the agent receivable total", () => {
    const order = {
      agent_order_item: [
        {
          quantity: 3,
          agent_commission_amount: 20,
          product: { default_price: 300 },
        },
      ],
      customer_order: [
        {
          payment: [{ amount: 200 }],
        },
      ],
    } as AdminAgentOrder;

    expect(agentOrderPaidTotal(order)).toBe(200);
    expect(agentOrderRemainingReceivable(order)).toBe(680);
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

describe("agentCustomerBalance", () => {
  it("sums unpaid balances from customer orders linked to the agent's own customer record only", () => {
    const agentCustomerId = "customer-agent";
    const orders = [
      {
        customer_id: agentCustomerId,
        customer_order_item: [
          {
            final_quantity: 2,
            unit_price: 150,
          },
        ],
        payment: [
          { amount: 75 },
        ],
      },
      {
        customer_id: "assigned-customer",
        customer_order_item: [
          {
            final_quantity: 3,
            unit_price: 100,
          },
        ],
        payment: [],
      },
      {
        customer_id: agentCustomerId,
        customer_order_item: [
          {
            final_quantity: 1,
            unit_price: 80,
          },
        ],
        payment: [
          { amount: 100 },
        ],
      },
    ] as AdminOrder[];

    expect(agentCustomerBalance(orders, agentCustomerId)).toBe(225);
  });

  it("returns zero when the agent does not have a customer record", () => {
    expect(agentCustomerBalance([], null)).toBe(0);
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

  it("uses the commission-adjusted receivable for agent orders", () => {
    const order = {
      agent_id: "agent-1",
      customer_order_item: [
        {
          final_quantity: 3,
          unit_price: 300,
          agent_commission_amount: 0,
          product: {
            agent_commission_type: "value",
            agent_commission_value: 20,
          },
        },
      ],
      payment: [
        { amount: 840 },
      ],
    } as AdminOrder;

    expect(orderReceivableTotal(order, "final_quantity")).toBe(840);
    expect(orderBalance(order)).toBe(0);
  });
});

describe("canManageOrderCommissions", () => {
  it("requires a directly linked agent on a processing order", () => {
    expect(canManageOrderCommissions({ agent_id: null } as AdminOrder)).toBe(false);
    expect(canManageOrderCommissions({
      agent_id: "64568f81-108b-42bd-b926-7e825dad67c6",
      order_status: "closed",
    } as AdminOrder)).toBe(false);
    expect(canManageOrderCommissions({
      agent_id: "64568f81-108b-42bd-b926-7e825dad67c6",
      order_status: "processing",
    } as AdminOrder)).toBe(true);
  });
});

describe("canConvertPromotedCustomerOrderToDistribution", () => {
  const baseOrder = {
    customer_order_item: [{ final_quantity: 1, unit_price: 100 }],
    payment: [],
    agent_received_payment: [],
    invoice: [],
    order_status: "processing",
    payment_status: "unpaid",
    parent_order_id: null,  } as unknown as AdminOrder;

  it("allows unpaid promoted customer orders without payment records", () => {
    expect(canConvertPromotedCustomerOrderToDistribution(baseOrder, "agent-1")).toBe(true);
    expect(getCustomerOrderDistributionConversionBlockReason(baseOrder, "agent-1")).toBeNull();
  });

  it("does not hide conversion for invoice-only orders without payment records", () => {
    const order = {
      ...baseOrder,
      invoice: [{ id: "invoice-1" }],
    } as AdminOrder;

    expect(canConvertPromotedCustomerOrderToDistribution(order, "agent-1")).toBe(true);
    expect(getCustomerOrderDistributionConversionBlockReason(order, "agent-1")).toBeNull();
  });

  it("derives the conversion agent from the promoted customer when the order has no direct agent id", () => {
    const order = {
      ...baseOrder,
      agent_id: null,
      customer: {
        promoted_to_agent_id: "agent-1",
      },
    } as AdminOrder;

    const promotedAgentId = orderDistributionConversionAgentId(order);

    expect(promotedAgentId).toBe("agent-1");
    expect(shouldShowCustomerOrderDistributionConversionCard(order, promotedAgentId)).toBe(true);
    expect(canConvertPromotedCustomerOrderToDistribution(order, promotedAgentId)).toBe(true);
  });

  it("keeps the conversion card visible for promoted-customer orders even when payment blocks submission", () => {
    const order = {
      ...baseOrder,
      agent_id: null,
      payment_status: "partial",
      payment: [{ id: "payment-1", amount: 25 }],
      customer: {
        promoted_to_agent_id: "agent-1",
      },
    } as AdminOrder;
    const promotedAgentId = orderDistributionConversionAgentId(order);
    const blockReason = getCustomerOrderDistributionConversionBlockReason(order, promotedAgentId);

    expect(shouldShowCustomerOrderDistributionConversionCard(order, promotedAgentId)).toBe(true);
    expect(canConvertPromotedCustomerOrderToDistribution(order, promotedAgentId)).toBe(false);
    expect(customerOrderDistributionConversionBlockMessage(blockReason)).toBe(
      "This order already has a payment record, so it cannot be converted.",
    );
  });

  it("describes blocked conversion reasons", () => {
    expect(getCustomerOrderDistributionConversionBlockReason(baseOrder, null)).toBe("Not promoted");
    expect(getCustomerOrderDistributionConversionBlockReason({
      ...baseOrder,
      parent_order_id: "agent-order-1",
      converted_at: "2026-07-01T00:00:00.000Z",
    } as AdminOrder, "agent-1")).toBe("Converted");
    expect(getCustomerOrderDistributionConversionBlockReason({
      ...baseOrder,
      payment_status: "partial",
    } as AdminOrder, "agent-1")).toBe("Has payment");
    expect(getCustomerOrderDistributionConversionBlockReason({
      ...baseOrder,
      customer_order_item: [],
    } as AdminOrder, "agent-1")).toBe("No items");
  });
});

describe("formatDateTime", () => {
  it("formats ISO timestamps for the Philippines timezone", () => {
    expect(formatDateTime("2026-07-11T18:54:27.430254+00:00")).toBe("Jul 12, 2026, 2:54 AM");
    expect(formatDateTime(null)).toBe("Not set");
  });
});

describe("formatSalePaymentSummary", () => {
  it("describes how many payment records completed the sale", () => {
    expect(formatSalePaymentSummary(0)).toBe("No payments recorded");
    expect(formatSalePaymentSummary(1)).toBe("Paid in full once");
    expect(formatSalePaymentSummary(3)).toBe("Paid 3 times");
  });
});

describe("productDisplayLabel", () => {
  it("combines product name and unit for product table display", () => {
    expect(productDisplayLabel({ name: "Chicken Breast", unit_label: "kg" })).toBe("Chicken Breast (kg)");
  });
});
