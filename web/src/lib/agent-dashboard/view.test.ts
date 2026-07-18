import { describe, expect, it } from "vitest";

import {
  agentOrderPaymentStatus,
  buildAgentPaymentSummary,
  buildAgentSummary,
  formatCurrency,
  formatPaymentStatus,
  orderBalance,
  orderEarnedCommission,
  orderExpectedCommission,
  orderPaymentTotal,
  orderTotal,
} from "./view";
import type { AgentDashboardData, AgentOrder } from "./data";

const agentId = "64568f81-108b-42bd-b926-7e825dad67c6";

function createOrder(overrides: Partial<AgentOrder> = {}): AgentOrder {
  return {
    id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
    agent_order_id: null,
    customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
    agent_id: agentId,
    source: "agent_submitted",
    order_status: "processing",
    payment_status: "partial",
    approved_at: "2026-07-01T00:00:00.000Z",
    created_at: "2026-07-03T00:00:00.000Z",
    updated_at: "2026-07-03T00:00:00.000Z",
    customer: {
      id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      first_name: "Ana",
      last_name: "Buyer",
      phone_number: "09170000000",
      email: "ana@example.test",
      address: "Market stall",
      is_reseller: false,
    },
    customer_order_item: [
      {
        id: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
        product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
        partial_quantity: 2,
        final_quantity: 2,
        unit_price: 100,
        price_type: "retail",
        add_details: null,
        agent_commission_amount: 80,
        agent_commission_paid: false,
        product: {
          id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          name: "Pork Belly",
          unit_label: "kg",
          default_price: 100,
        },
      },
      {
        id: "d348c963-d88e-41f4-bccd-07238d9baa2c",
        product_id: "9ad456ad-1d2e-41b2-b297-8ddf6304ece0",
        partial_quantity: 1,
        final_quantity: 1,
        unit_price: 200,
        price_type: "retail",
        add_details: "Packed separately",
        agent_commission_amount: 20,
        agent_commission_paid: true,
        product: {
          id: "9ad456ad-1d2e-41b2-b297-8ddf6304ece0",
          name: "Chicken",
          unit_label: "kg",
          default_price: 200,
        },
      },
    ],
    payment: [
      {
        id: "f31976e6-b478-41b6-9b85-9b830154f962",
        amount: 187.5,
        payment_method: "cash",
        payment_terms: "Cash on Delivery (COD)",
        payment_date: "2026-07-03",
        reference_number: null,
        notes: null,
        created_at: "2026-07-03T02:00:00.000Z",
      },
    ],
    invoice: [],
    customer_order_status_history: [],
    ...overrides,
  };
}

describe("agent dashboard calculations", () => {
  it("uses final quantity and item price snapshots for totals and proportional earned commission", () => {
    const order = createOrder();

    expect(orderTotal(order, "final_quantity")).toBe(400);
    expect(orderExpectedCommission(order)).toBe(100);
    expect(orderEarnedCommission(order)).toBe(46.88);
    expect(orderBalance(order)).toBe(212.5);
  });

  it("counts monthly and daily earnings for the current agent only", () => {
    const now = new Date("2026-07-03T10:00:00.000Z");
    const data = {
      agent: {
        id: agentId,
        user_id: "22222222-2222-2222-2222-222222222222",
        display_name: "NMC Agent",
        status: "active",
      },
      customers: [
        {
          id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
          first_name: "Ana",
          last_name: "Buyer",
          phone_number: "09170000000",
          email: null,
          address: "Market stall",
          assigned_agent_id: agentId,
          is_reseller: false,
          created_at: "2026-07-01T00:00:00.000Z",
          updated_at: "2026-07-01T00:00:00.000Z",
        },
      ],
      agentOrders: [
        { id: "11111111-1111-4111-8111-111111111111" },
        { id: "22222222-2222-4222-8222-222222222222" },
      ],
      orders: [
        createOrder(),
        createOrder({
          id: "668fa41a-9325-4f28-80b7-c4de32451ec1",
          agent_id: null,
          payment_status: "unpaid",
          payment: [],
        }),
        createOrder({
          id: "4f1d97bc-6175-4ee7-aa5c-9a26bef2845d",
          created_at: "2026-06-30T00:00:00.000Z",
        }),
      ],
    } as Pick<AgentDashboardData, "agent" | "customers" | "agentOrders" | "orders">;

    expect(buildAgentSummary(data, now)).toEqual({
      assignedCustomers: 1,
      submittedOrders: 2,
      monthlyEarnings: 46.88,
      earnedToday: 46.88,
      expectedCommission: 106.24,
      outstandingBalance: 825,
    });
  });

  it("keeps closed unpaid orders in aggregate outstanding balance", () => {
    const now = new Date("2026-07-03T10:00:00.000Z");
    const data = {
      agent: {
        id: agentId,
        user_id: "22222222-2222-2222-2222-222222222222",
        display_name: "NMC Agent",
        status: "active",
      },
      customers: [],
      agentOrders: [],
      orders: [
        createOrder(),
        createOrder({
          id: "7c140d7d-8cb6-465d-a5ef-9bd8ea796d51",
          order_status: "closed",
          payment_status: "unpaid",
          payment: [],
        }),
      ],
    } as Pick<AgentDashboardData, "agent" | "customers" | "agentOrders" | "orders">;

    expect(buildAgentSummary(data, now).outstandingBalance).toBe(612.5);
  });

  it("summarizes orders by payment status", () => {
    expect(buildAgentPaymentSummary([
      createOrder({ payment_status: "unpaid" }),
      createOrder({ payment_status: "partial" }),
      createOrder({ payment_status: "partial" }),
      createOrder({ payment_status: "paid" }),
      createOrder({ payment_status: "refunded" }),
    ])).toEqual({
      unpaid: 1,
      partial: 2,
      paid: 1,
      refunded: 1,
    });
  });

  it("aggregates agent order payment status from linked customer orders", () => {
    expect(agentOrderPaymentStatus({ customer_order: [] })).toBe("unpaid");
    expect(agentOrderPaymentStatus({
      customer_order: [
        createOrder({ payment_status: "unpaid" }),
        createOrder({ payment_status: "unpaid" }),
      ],
    })).toBe("unpaid");
    expect(agentOrderPaymentStatus({
      customer_order: [
        createOrder({ payment_status: "unpaid" }),
        createOrder({ payment_status: "partial" }),
      ],
    })).toBe("partial");
    expect(agentOrderPaymentStatus({
      customer_order: [
        createOrder({ payment_status: "paid" }),
        createOrder({ payment_status: "unpaid" }),
      ],
    })).toBe("partial");
    expect(agentOrderPaymentStatus({
      customer_order: [
        createOrder({ payment_status: "paid" }),
        createOrder({ payment_status: "paid" }),
      ],
    })).toBe("paid");
  });

  it("formats payment statuses for balance tracking tables", () => {
    expect(formatPaymentStatus("unpaid")).toBe("Unpaid");
    expect(formatPaymentStatus("partial")).toBe("Partial");
    expect(formatPaymentStatus("paid")).toBe("Paid");
    expect(formatPaymentStatus("refunded")).toBe("Refunded");
  });

  it("keeps zero-payment orders useful for balance tracking", () => {
    const unpaidOrder = createOrder({
      payment_status: "unpaid",
      payment: [],
    });

    expect(orderPaymentTotal(unpaidOrder)).toBe(0);
    expect(orderBalance(unpaidOrder)).toBe(400);
  });

  it("formats Philippine peso values consistently", () => {
    expect(formatCurrency(1250)).toBe("₱1,250.00");
  });
});
