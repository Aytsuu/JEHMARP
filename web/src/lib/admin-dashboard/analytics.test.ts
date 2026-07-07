import { describe, expect, it } from "vitest";

import { buildAdminAnalytics } from "./analytics";

import type { AdminDashboardData, AdminOrder, AdminOrderItem } from "./data";

describe("buildAdminAnalytics", () => {
  it("builds sales, payment, product, lead, and agent commission metrics", () => {
    const analytics = buildAdminAnalytics(createAnalyticsData(), new Date("2026-07-04T12:00:00.000Z"));

    expect(analytics.summary).toEqual({
      totalPaidAmount: 310,
      outstandingBalance: 90,
      orderCount: 3,
      newResellerApplications: 1,
      newContactInquiries: 1,
      agentMonthlyEarnings: 88.5,
      agentEarnedToday: 38.5,
      agentExpectedCommission: 31.5,
      assignedCustomerCount: 2,
    });
    expect(analytics.salesByDay).toEqual([
      { label: "2026-06-28", orderCount: 1, grossSales: 80 },
      { label: "2026-07-03", orderCount: 1, grossSales: 120 },
      { label: "2026-07-04", orderCount: 1, grossSales: 200 },
    ]);
    expect(analytics.salesByMonth).toEqual([
      { label: "2026-06", orderCount: 1, grossSales: 80 },
      { label: "2026-07", orderCount: 2, grossSales: 320 },
    ]);
    expect(analytics.ordersByStatus.find((item) => item.label === "approved")).toEqual({
      label: "approved",
      count: 2,
    });
    expect(analytics.paymentsByStatus.find((item) => item.label === "partial")).toEqual({
      label: "partial",
      count: 1,
    });
    expect(analytics.topProducts[0]).toEqual({
      label: "Chicken Thigh",
      quantitySold: 3,
      grossSales: 270,
    });
    expect(analytics.salesByCategory).toEqual([
      { label: "chicken", quantitySold: 3, grossSales: 270 },
      { label: "pork", quantitySold: 3, grossSales: 130 },
    ]);
    expect(analytics.salesByAgent).toEqual([
      {
        label: "JEHMARP Agent",
        orderCount: 2,
        grossSales: 320,
        paidAmount: 230,
        earnedCommission: 88.5,
        expectedCommission: 31.5,
      },
    ]);
  });

  it("excludes cancelled orders from outstanding balance totals", () => {
    const data = createAnalyticsData();

    data.orders = [
      ...data.orders,
      order({
        id: "cancelled-order",
        agentId: null,
        status: "cancelled",
        paymentStatus: "unpaid",
        createdAt: "2026-07-04T11:00:00.000Z",
        paymentAmounts: [],
        items: [
          item("product-pork", "Pork Belly", "pork", 1, 500, 0, "unset"),
        ],
      }),
    ];

    const analytics = buildAdminAnalytics(data, new Date("2026-07-04T12:00:00.000Z"));

    expect(analytics.summary.outstandingBalance).toBe(90);
    expect(analytics.ordersByStatus.find((item) => item.label === "cancelled")).toEqual({
      label: "cancelled",
      count: 1,
    });
  });
});

function createAnalyticsData(): AdminDashboardData {
  return {
    pages: [],
    pageSections: [],
    products: [
      product("product-pork", "Pork Belly", "pork"),
      product("product-chicken", "Chicken Thigh", "chicken"),
    ],
    agents: [{
      id: "agent-id",
      user_id: "22222222-2222-2222-2222-222222222222",
      display_name: "JEHMARP Agent",
      status: "active",
      email: null,
      contact: null,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    }],
    customers: [
      customer("customer-one", "Ada", "Buyer", "agent-id"),
      customer("customer-two", "Ben", "Buyer", "agent-id"),
      customer("customer-three", "Cat", "Buyer", null),
    ],
    orders: [
      order({
        id: "order-1",
        agentId: "agent-id",
        status: "approved",
        paymentStatus: "partial",
        createdAt: "2026-07-04T09:00:00.000Z",
        paymentAmounts: [110],
        items: [
          item("product-chicken", "Chicken Thigh", "chicken", 2, 90, 60, "set"),
          item("product-pork", "Pork Belly", "pork", 1, 20, 10, "set"),
        ],
      }),
      order({
        id: "order-2",
        agentId: "agent-id",
        status: "fulfilled",
        paymentStatus: "paid",
        createdAt: "2026-07-03T10:00:00.000Z",
        paymentAmounts: [120],
        items: [
          item("product-chicken", "Chicken Thigh", "chicken", 1, 90, 50, "paid"),
          item("product-pork", "Pork Belly", "pork", 1, 30, 0, "unset"),
        ],
      }),
      order({
        id: "order-3",
        agentId: null,
        status: "approved",
        paymentStatus: "paid",
        createdAt: "2026-06-28T11:00:00.000Z",
        paymentAmounts: [80],
        items: [
          item("product-pork", "Pork Belly", "pork", 1, 80, 0, "unset"),
        ],
      }),
    ],
    contactInquiries: [{
      id: "inquiry-id",
      name: "Contact Lead",
      email: "lead@example.com",
      phone_number: null,
      message: "Question",
      inquiry_status: "new",
      internal_notes: null,
      created_at: "2026-07-04T08:00:00.000Z",
      updated_at: "2026-07-04T08:00:00.000Z",
    }],
    resellerApplications: [{
      id: "reseller-id",
      name: "Reseller Lead",
      email: "reseller@example.com",
      contact_number: "09170000000",
      planned_transaction_type: "retail_resale",
      expected_quantity_per_week: "50 kg",
      application_status: "submitted",
      email_delivery_status: "sent",
      price_list_sent_at: "2026-07-04T08:30:00.000Z",
      email_error: null,
      created_at: "2026-07-04T08:30:00.000Z",
      updated_at: "2026-07-04T08:30:00.000Z",
    }],
    summary: {
      submittedOrders: 0,
      openInquiries: 1,
      customers: 3,
      activeProducts: 2,
      newResellerApplications: 1,
    },
  };
}

function product(id: string, name: string, category: "pork" | "chicken" | "egg") {
  return {
    id,
    name,
    category,
    description: null,
    unit_label: "kg",
    default_price: 100,
    reseller_price: 90,
    stock_status: "in_stock" as const,
    image_path: null,
    is_active: true,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
}

function customer(
  id: string,
  firstName: string,
  lastName: string,
  assignedAgentId: string | null,
) {
  return {
    id,
    first_name: firstName,
    last_name: lastName,
    phone_number: "09170000000",
    email: `${firstName.toLowerCase()}@example.com`,
    address: "123 Road",
    assigned_agent_id: assignedAgentId,
    is_reseller: false,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
}

function order(params: {
  id: string;
  agentId: string | null;
  status: "approved" | "fulfilled" | "cancelled";
  paymentStatus: "unpaid" | "partial" | "paid";
  createdAt: string;
  paymentAmounts: number[];
  items: AdminOrderItem[];
}): AdminOrder {
  const source: AdminOrder["source"] = params.agentId ? "agent_submitted" : "admin_manual";

  return {
    id: params.id,
    customer_id: "customer-one",
    agent_id: params.agentId,
    source,
    order_status: params.status,
    payment_status: params.paymentStatus,
    approved_at: params.createdAt,
    created_at: params.createdAt,
    updated_at: params.createdAt,
    customer: null,
    agent: params.agentId ? { id: params.agentId, display_name: "JEHMARP Agent" } : null,
    customer_order_item: params.items,
    payment: params.paymentAmounts.map((amount, index) => ({
      id: `${params.id}-payment-${index}`,
      amount,
      payment_method: "cash",
      payment_date: params.createdAt.slice(0, 10),
      reference_number: null,
      notes: null,
      created_at: params.createdAt,
    })),
    invoice: [],
    customer_order_status_history: [],
  };
}

function item(
  productId: string,
  productName: string,
  _category: "pork" | "chicken" | "egg",
  quantity: number,
  unitPrice: number,
  commissionAmount: number,
  commissionStatus: "unset" | "set" | "paid",
): AdminOrderItem {
  return {
    id: `${productId}-${unitPrice}`,
    product_id: productId,
    partial_quantity: quantity,
    final_quantity: quantity,
    unit_price: unitPrice,
    price_type: "retail" as const,
    add_details: null,
    agent_commission_amount: commissionAmount,
    agent_commission_status: commissionStatus,
    agent_commission_notes: null,
    product: {
      id: productId,
      name: productName,
      unit_label: "kg",
      default_price: unitPrice,
    },
  };
}
