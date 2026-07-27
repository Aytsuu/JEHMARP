import { describe, expect, it } from "vitest";

import type { AdminAgentOrder, AdminOrder, AdminProduct } from "./data";
import {
  agentRecordCommissionTotal,
  agentRecordEstimatedInvoiceTotal,
  buildAgentPerformanceQuickStats,
  buildAgentReceivableSegments,
  formatKgSoldTrendDiff,
} from "./agent-record";

const products = [
  { id: "product-pork", category: "pork" },
  { id: "product-chicken", category: "chicken" },
] as const;

type AgentOrderProduct = Pick<
  AdminProduct,
  "id" | "name" | "unit_label" | "default_price" | "agent_commission_type" | "agent_commission_value"
>;

function createAgentOrderProduct(
  overrides: Partial<AgentOrderProduct> & Pick<AgentOrderProduct, "default_price">,
): AgentOrderProduct {
  return {
    id: "product-test",
    name: "Test Product",
    unit_label: "kg",
    agent_commission_type: "value",
    agent_commission_value: 0,
    ...overrides,
  };
}

function createCustomerOrder(
  overrides: Partial<AdminOrder> & Pick<AdminOrder, "id">,
): AdminOrder {
  return {
    customer_id: "customer-1",
    agent_id: "agent-1",
    source: "agent_submitted",
    order_status: "processing",
    payment_status: "unpaid",
    notes: null,
    approved_at: null,
    release_date: null,
    sale_date: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    customer_order_item: [],
    payment: [],
    invoice: [],
    customer_order_status_history: [],
    agent_received_payment: [],
    ...overrides,
  } as AdminOrder;
}

function createAgentOrder(
  overrides: Partial<AdminAgentOrder> & Pick<AdminAgentOrder, "id">,
): AdminAgentOrder {
  return {
    agent_id: "agent-1",
    order_status: "processing",
    release_date: null,
    sale_date: null,
    notes: null,
    submitted_by: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    agent: null,
    agent_order_item: [],
    customer_order: [],
    ...overrides,
  } as AdminAgentOrder;
}

describe("buildAgentPerformanceQuickStats", () => {
  it("totals kg sold and top category from closed orders only", () => {
    const stats = buildAgentPerformanceQuickStats(
      "agent-1",
      [
        createCustomerOrder({
          id: "order-open",
          order_status: "processing",
          customer_order_item: [{
            id: "item-1",
            product_id: "product-pork",
            partial_quantity: 5,
            final_quantity: 5,
            unit_price: 100,
            price_type: "retail",
            add_details: null,
            agent_commission_amount: 0,
            agent_commission_paid: false,
            product: null,
          }],
        }),
        createCustomerOrder({
          id: "order-closed",
          order_status: "closed",
          payment_status: "paid",
          customer_order_item: [{
            id: "item-2",
            product_id: "product-pork",
            partial_quantity: 12,
            final_quantity: 12,
            unit_price: 100,
            price_type: "retail",
            add_details: null,
            agent_commission_amount: 50,
            agent_commission_paid: false,
            product: null,
          }],
        }),
      ],
      [
        createAgentOrder({
          id: "agent-order-closed",
          order_status: "closed",
          agent_order_item: [{
            id: "agent-item-1",
            product_id: "product-chicken",
            quantity: 8,
            add_details: null,
            agent_commission_amount: 20,
            agent_commission_updated_by: null,
            agent_commission_updated_at: null,
            created_at: "2026-07-01T00:00:00.000Z",
            updated_at: "2026-07-01T00:00:00.000Z",
            product: null,
          }],
        }),
      ],
      [...products],
      encodeURIComponent("/admin/agents/agent-1"),
    );

    expect(stats.kgSold).toBe(20);
    expect(stats.topCategory).toEqual({
      label: "Pork",
      quantity: 12,
    });
  });

  it("calculates kg sold trend from the last 30 days versus the prior 30 days", () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const recentSaleDate = new Date(now - (10 * dayMs)).toISOString().slice(0, 10);
    const priorSaleDate = new Date(now - (40 * dayMs)).toISOString().slice(0, 10);

    const stats = buildAgentPerformanceQuickStats(
      "agent-1",
      [
        createCustomerOrder({
          id: "order-recent",
          order_status: "closed",
          sale_date: recentSaleDate,
          customer_order_item: [{
            id: "item-recent",
            product_id: "product-pork",
            partial_quantity: 120,
            final_quantity: 120,
            unit_price: 100,
            price_type: "retail",
            add_details: null,
            agent_commission_amount: 0,
            agent_commission_paid: false,
            product: null,
          }],
        }),
        createCustomerOrder({
          id: "order-prior",
          order_status: "closed",
          sale_date: priorSaleDate,
          customer_order_item: [{
            id: "item-prior",
            product_id: "product-pork",
            partial_quantity: 70,
            final_quantity: 70,
            unit_price: 100,
            price_type: "retail",
            add_details: null,
            agent_commission_amount: 0,
            agent_commission_paid: false,
            product: null,
          }],
        }),
      ],
      [],
      [...products],
      encodeURIComponent("/admin/agents/agent-1"),
    );

    expect(stats.kgSoldTrend).toMatchObject({
      current30Days: 120,
      previous30Days: 70,
      diff: 50,
    });
    expect(formatKgSoldTrendDiff(stats.kgSoldTrend.diff)).toBe("+50");
    expect(stats.kgSoldTrend.tooltip).toContain("+50 compared to the previous 30 days");
  });

  it("tracks remittance speed and confirmation quality", () => {
    const stats = buildAgentPerformanceQuickStats(
      "agent-1",
      [
        createCustomerOrder({
          id: "order-remit",
          created_at: "2026-07-01T00:00:00.000Z",
          agent_received_payment: [{
            id: "remit-1",
            order_id: "order-remit",
            agent_id: "agent-1",
            amount: 500,
            payment_method: "cash",
            payment_terms: "full",
            payment_date: "2026-07-04",
            reference_number: null,
            notes: null,
            status: "confirmed",
            confirmed_at: "2026-07-04T08:00:00.000Z",
            created_at: "2026-07-04T08:00:00.000Z",
            updated_at: "2026-07-04T08:00:00.000Z",
            agent: null,
          }],
        }),
      ],
      [],
      [...products],
      encodeURIComponent("/admin/agents/agent-1"),
    );

    expect(stats.remittance).toMatchObject({
      submissionCount: 1,
      confirmedCount: 1,
      confirmationRate: 100,
      averageDaysToRemit: 3,
      totalRemitted: 500,
      performanceLabel: "Excellent",
    });
    expect(stats.remittance.performanceTooltip).toContain("Rated Excellent");
    expect(stats.remittance.performanceTooltip).toContain("90%");
  });

  it("only counts commission when orders are closed and fully paid", () => {
    const stats = buildAgentPerformanceQuickStats(
      "agent-1",
      [
        createCustomerOrder({
          id: "order-unpaid",
          order_status: "closed",
          payment_status: "partial",
          customer_order_item: [{
            id: "item-1",
            product_id: "product-pork",
            partial_quantity: 1,
            final_quantity: 1,
            unit_price: 100,
            price_type: "retail",
            add_details: null,
            agent_commission_amount: 25,
            agent_commission_paid: false,
            product: null,
          }],
        }),
        createCustomerOrder({
          id: "order-earned",
          order_status: "closed",
          payment_status: "paid",
          sale_date: "2026-07-10",
          payment: [{
            id: "payment-1",
            amount: 100,
            payment_method: "cash",
            payment_terms: "full",
            payment_date: "2026-07-10",
            reference_number: null,
            notes: null,
            created_at: "2026-07-10T08:00:00.000Z",
          }],
          customer_order_item: [{
            id: "item-2",
            product_id: "product-pork",
            partial_quantity: 2,
            final_quantity: 2,
            unit_price: 100,
            price_type: "retail",
            add_details: null,
            agent_commission_amount: 40,
            agent_commission_paid: false,
            product: null,
          }],
        }),
      ],
      [],
      [...products],
      encodeURIComponent("/admin/agents/agent-1"),
    );

    expect(stats.commissionEntries).toHaveLength(1);
    expect(stats.commissionEntries[0]).toMatchObject({
      id: "order-earned",
      amount: 40,
      earned_at: "2026-07-10",
    });
    expect(stats.commissionEarnedTotal).toBe(40);
  });
});

describe("agentRecordCommissionTotal", () => {
  it("only counts commission from closed and fully paid orders", () => {
    const total = agentRecordCommissionTotal(
      [
        createCustomerOrder({
          id: "order-open",
          order_status: "processing",
          payment_status: "unpaid",
          customer_order_item: [{
            id: "item-1",
            product_id: "product-pork",
            partial_quantity: 1,
            final_quantity: 1,
            unit_price: 100,
            price_type: "retail",
            add_details: null,
            agent_commission_amount: 30,
            agent_commission_paid: false,
            product: null,
          }],
        }),
        createCustomerOrder({
          id: "order-earned",
          order_status: "closed",
          payment_status: "paid",
          customer_order_item: [{
            id: "item-2",
            product_id: "product-pork",
            partial_quantity: 2,
            final_quantity: 2,
            unit_price: 100,
            price_type: "retail",
            add_details: null,
            agent_commission_amount: 40,
            agent_commission_paid: false,
            product: null,
          }],
        }),
      ],
      [
        createAgentOrder({
          id: "agent-order-open",
          order_status: "processing",
          agent_order_item: [{
            id: "agent-item-1",
            product_id: "product-chicken",
            quantity: 1,
            add_details: null,
            agent_commission_amount: 25,
            agent_commission_updated_by: null,
            agent_commission_updated_at: null,
            created_at: "2026-07-01T00:00:00.000Z",
            updated_at: "2026-07-01T00:00:00.000Z",
            product: createAgentOrderProduct({ default_price: 100 }),
          }],
        }),
        createAgentOrder({
          id: "agent-order-earned",
          order_status: "closed",
          customer_order: [{
            ...createCustomerOrder({
              id: "child-paid",
              order_status: "closed",
              payment_status: "paid",
            }),
            customer_order_item: [],
            payment: [],
            invoice: [],
          }],
          agent_order_item: [{
            id: "agent-item-2",
            product_id: "product-chicken",
            quantity: 1,
            add_details: null,
            agent_commission_amount: 15,
            agent_commission_updated_by: null,
            agent_commission_updated_at: null,
            created_at: "2026-07-01T00:00:00.000Z",
            updated_at: "2026-07-01T00:00:00.000Z",
            product: createAgentOrderProduct({ default_price: 100 }),
          }],
        }),
      ],
    );

    expect(total).toBe(55);
  });
});

describe("agent record receivable summaries", () => {
  it("merges pending customer orders and pending agent distributions into one pending segment", () => {
    const customerOrders = [
      createCustomerOrder({
        id: "customer-pending",
        order_status: "pending",
        payment_status: "unpaid",
        customer_order_item: [{
          id: "item-1",
          product_id: "product-pork",
          partial_quantity: 1,
          final_quantity: 1,
          unit_price: 100,
          price_type: "retail",
          add_details: null,
          agent_commission_amount: 0,
          agent_commission_paid: false,
          product: null,
        }],
      }),
    ];
    const agentOrders = [
      createAgentOrder({
        id: "agent-pending-customers",
        order_status: "pending_customers",
        agent_order_item: [{
          id: "agent-item-1",
          product_id: "product-chicken",
          quantity: 2,
          add_details: null,
          agent_commission_amount: 20,
          agent_commission_updated_by: null,
          agent_commission_updated_at: null,
          created_at: "2026-07-01T00:00:00.000Z",
          updated_at: "2026-07-01T00:00:00.000Z",
          product: createAgentOrderProduct({ default_price: 300 }),
        }],
      }),
      createAgentOrder({
        id: "agent-pending-order",
        order_status: "pending_order",
        agent_order_item: [{
          id: "agent-item-2",
          product_id: "product-chicken",
          quantity: 1,
          add_details: null,
          agent_commission_amount: 10,
          agent_commission_updated_by: null,
          agent_commission_updated_at: null,
          created_at: "2026-07-01T00:00:00.000Z",
          updated_at: "2026-07-01T00:00:00.000Z",
          product: createAgentOrderProduct({ default_price: 200 }),
        }],
      }),
    ];

    expect(agentRecordEstimatedInvoiceTotal(customerOrders, agentOrders)).toBe(870);
    expect(buildAgentReceivableSegments(customerOrders, agentOrders)).toEqual([
      expect.objectContaining({
        bucket: "pending",
        label: "Pending",
        color: "#f97316",
        receivable: 870,
        invoiceCount: 3,
        tooltip: expect.stringContaining("Personal orders:"),
      }),
    ]);
    expect(buildAgentReceivableSegments(customerOrders, agentOrders)[0]?.tooltip).toContain(
      "Unallocated distribution orders:",
    );
  });

  it("does not double count attached customer orders on pending agent distributions", () => {
    const attachedOrder = createCustomerOrder({
      id: "attached-pending",
      order_status: "pending",
      payment_status: "unpaid",
      customer_order_item: [{
        id: "item-1",
        product_id: "product-pork",
        partial_quantity: 1,
        final_quantity: 1,
        unit_price: 100,
        price_type: "retail",
        add_details: null,
        agent_commission_amount: 0,
        agent_commission_paid: false,
        product: null,
      }],
    });
    const customerOrders = [attachedOrder];
    const agentOrders = [
      createAgentOrder({
        id: "agent-pending-customers",
        order_status: "pending_customers",
        customer_order: [attachedOrder],
        agent_order_item: [{
          id: "agent-item-1",
          product_id: "product-chicken",
          quantity: 1,
          add_details: null,
          agent_commission_amount: 0,
          agent_commission_updated_by: null,
          agent_commission_updated_at: null,
          created_at: "2026-07-01T00:00:00.000Z",
          updated_at: "2026-07-01T00:00:00.000Z",
          product: createAgentOrderProduct({
            default_price: 100,
            agent_commission_value: 0,
          }),
        }],
      }),
    ];

    expect(agentRecordEstimatedInvoiceTotal(customerOrders, agentOrders)).toBe(100);
    const segments = buildAgentReceivableSegments(customerOrders, agentOrders);

    expect(segments).toEqual([
      expect.objectContaining({
        bucket: "pending",
        label: "Pending",
        color: "#f97316",
        receivable: 100,
        invoiceCount: 1,
      }),
    ]);
    expect(segments[0]?.tooltip).toContain("Allocated on distributions:");
    expect(segments[0]?.tooltip).not.toContain("Personal orders:");
    expect(segments[0]?.tooltip).not.toContain("Unallocated distribution orders:");
  });
});
