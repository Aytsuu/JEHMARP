import { describe, expect, it } from "vitest";

import {
  buildAdminAnalytics,
  buildMetricTrend,
  orderActivityCellOpacity,
} from "./analytics";

import type { AdminDashboardData, AdminOrder, AdminOrderItem } from "./data";

describe("buildAdminAnalytics", () => {
  it("builds sales, payment, product, lead, and agent commission metrics", () => {
    const analytics = buildAdminAnalytics(createAnalyticsData(), new Date("2026-07-04T12:00:00.000Z"));

    expect(analytics.summary).toEqual({
      grossSales: 120,
      netIncome: 70,
      totalPaidAmount: 310,
      outstandingBalance: 20,
      pendingOrderPayments: 20,
      pendingOrderPaymentsTrend: {
        previousValue: 0,
        difference: 20,
        direction: "up",
        tooltip: "+₱20 compared to the previous 30 days. Current receivable: ₱20; 30 days ago: ₱0. Based on processing orders with unpaid balance.",
      },
      orderCount: 3,
      newResellerApplications: 1,
      newContactInquiries: 1,
      agentMonthlyEarnings: 109.23,
      agentEarnedToday: 59.23,
      agentExpectedCommission: 10.77,
      assignedCustomerCount: 2,
    });
    expect(analytics.salesByDay).toEqual([
      { label: "2026-07-03", orderCount: 1, grossSales: 120 },
    ]);
    expect(analytics.salesByMonth).toEqual([
      { label: "2026-07", orderCount: 1, grossSales: 120 },
    ]);
    expect(analytics.ordersByStatus.find((item) => item.label === "processing")).toEqual({
      label: "processing",
      count: 2,
    });
    expect(analytics.orderStatusOverview).toEqual({
      totalOrders: 3,
      statuses: [
        { key: "pending_order", label: "Pending Order", count: 1, color: "#f97316" },
        { key: "pending_customers", label: "Pending Customer", count: 0, color: "#ecb55d" },
        { key: "processing", label: "Processing", count: 1, color: "#2563eb" },
        { key: "closed", label: "Closed", count: 1, color: "#10b981" },
      ],
      recentUpdates: [
        {
          id: "order-1",
          orderCode: "Order-ORDER-",
          partyLabel: "Assigned Customer",
          statusLabel: "Processing",
          statusColor: "#2563eb",
          updatedAt: "2026-07-04T11:30:00.000Z",
          updatedLabel: "30m ago",
          href: "/admin/orders/customer/order-1",
        },
        {
          id: "order-2",
          orderCode: "Order-ORDER-",
          partyLabel: "Assigned Customer",
          statusLabel: "Closed",
          statusColor: "#10b981",
          updatedAt: "2026-07-04T10:00:00.000Z",
          updatedLabel: "2h ago",
          href: "/admin/orders/customer/order-2",
        },
      ],
    });
    expect(analytics.paymentsByStatus.find((item) => item.label === "partial")).toEqual({
      label: "partial",
      count: 1,
    });
    expect(analytics.topProducts[0]).toEqual({
      label: "Chicken Thigh",
      quantitySold: 1,
      grossSales: 90,
    });
    expect(analytics.salesByCategory).toEqual([
      { label: "chicken", quantitySold: 1, grossSales: 90 },
      { label: "pork", quantitySold: 1, grossSales: 30 },
    ]);
    expect(analytics.yearlyOrderActivity.defaultYear).toBe(2026);
    expect(analytics.yearlyOrderActivity.availableYears).toEqual([2026]);
    expect(analytics.yearlyOrderActivity.years[2026]).toEqual({
      year: 2026,
      totalOrders: 3,
      maxOrderCount: 1,
      months: expect.arrayContaining([
        expect.objectContaining({ month: 6, label: "Jun" }),
        expect.objectContaining({ month: 7, label: "Jul" }),
      ]),
    });

    const june = analytics.yearlyOrderActivity.years[2026].months.find((month) => month.month === 6);
    const july = analytics.yearlyOrderActivity.years[2026].months.find((month) => month.month === 7);

    expect(june?.cells.find((cell) => cell.date === "2026-06-28")).toEqual({
      date: "2026-06-28",
      dayOfMonth: 28,
      orderCount: 1,
      isPadding: false,
    });
    expect(july?.cells.find((cell) => cell.date === "2026-07-03")).toEqual({
      date: "2026-07-03",
      dayOfMonth: 3,
      orderCount: 1,
      isPadding: false,
    });
    expect(july?.cells.find((cell) => cell.date === "2026-07-04")).toEqual({
      date: "2026-07-04",
      dayOfMonth: 4,
      orderCount: 1,
      isPadding: false,
    });
    expect(july?.cells.find((cell) => cell.date === "2026-07-01")).toEqual({
      date: "2026-07-01",
      dayOfMonth: 1,
      orderCount: 0,
      isPadding: false,
    });
    expect(orderActivityCellOpacity(0, 5)).toBe(0);
    expect(orderActivityCellOpacity(1, 5)).toBeGreaterThan(0);
    expect(orderActivityCellOpacity(5, 5)).toBe(1);
    expect(analytics.salesByAgent).toEqual([
      {
        label: "JEHMARP Agent",
        orderCount: 2,
        grossSales: 120,
        paidAmount: 230,
        earnedCommission: 109.23,
        expectedCommission: 10.77,
      },
    ]);
    expect(analytics.pendingCustomerBalances).toEqual([
      {
        customerId: "customer-one",
        customerName: "Assigned Customer",
        orderCount: 1,
        unpaidBalance: 20,
        grossTotal: 200,
        commissionTotal: 70,
        receivableTotal: 130,
        paidTotal: 110,
        orders: [
          {
            orderId: "order-1",
            orderCode: "Order-ORDER-",
            createdAt: "2026-07-04T09:00:00.000Z",
            grossTotal: 200,
            commissionTotal: 70,
            receivableTotal: 130,
            paidTotal: 110,
            unpaidBalance: 20,
            hasCommissionAdjustment: true,
          },
        ],
      },
    ]);
  });

  it("keeps closed unpaid orders in outstanding balance but not receivables", () => {
    const data = createAnalyticsData();

    data.orders = [
      ...data.orders,
      order({
        id: "closed-order",
        agentId: null,
        status: "closed",
        paymentStatus: "unpaid",
        createdAt: "2026-07-04T11:00:00.000Z",
        paymentAmounts: [],
        items: [
          item("product-pork", "Pork Belly", "pork", 1, 500, 0, false),
        ],
      }),
    ];

    const analytics = buildAdminAnalytics(data, new Date("2026-07-04T12:00:00.000Z"));

    expect(analytics.summary.outstandingBalance).toBe(520);
    expect(analytics.summary.pendingOrderPayments).toBe(20);
    expect(analytics.pendingCustomerBalances).toEqual([
      {
        customerId: "customer-one",
        customerName: "Assigned Customer",
        orderCount: 1,
        unpaidBalance: 20,
        grossTotal: 200,
        commissionTotal: 70,
        receivableTotal: 130,
        paidTotal: 110,
        orders: [
          {
            orderId: "order-1",
            orderCode: "Order-ORDER-",
            createdAt: "2026-07-04T09:00:00.000Z",
            grossTotal: 200,
            commissionTotal: 70,
            receivableTotal: 130,
            paidTotal: 110,
            unpaidBalance: 20,
            hasCommissionAdjustment: true,
          },
        ],
      },
    ]);
    expect(analytics.ordersByStatus.find((item) => item.label === "closed")).toEqual({
      label: "closed",
      count: 2,
    });
  });

  it("does not count a fully paid commission-adjusted order as dashboard receivable", () => {
    const data = createAnalyticsData();

    data.orders = [
      order({
        id: "commission-adjusted-paid-order",
        agentId: "agent-id",
        status: "processing",
        paymentStatus: "paid",
        createdAt: "2026-07-04T13:30:00.000Z",
        paymentAmounts: [840],
        items: [
          item("product-chicken", "Chicken Thigh", "chicken", 3, 300, 60, false),
        ],
      }),
    ];

    const analytics = buildAdminAnalytics(data, new Date("2026-07-04T14:00:00.000Z"));

    expect(analytics.summary.outstandingBalance).toBe(0);
    expect(analytics.summary.pendingOrderPayments).toBe(0);
    expect(analytics.pendingCustomerBalances).toEqual([]);
  });

  it("builds a gross-to-balance breakdown for direct orders without commission", () => {
    const data = createAnalyticsData();

    data.orders = [
      order({
        id: "direct-order",
        agentId: null,
        status: "processing",
        paymentStatus: "partial",
        createdAt: "2026-07-04T13:00:00.000Z",
        paymentAmounts: [50],
        items: [
          item("product-pork", "Pork Belly", "pork", 2, 100, 0, false),
        ],
      }),
    ];

    const analytics = buildAdminAnalytics(data, new Date("2026-07-04T14:00:00.000Z"));

    expect(analytics.pendingCustomerBalances).toEqual([
      {
        customerId: "customer-one",
        customerName: "Assigned Customer",
        orderCount: 1,
        unpaidBalance: 150,
        grossTotal: 200,
        commissionTotal: 0,
        receivableTotal: 200,
        paidTotal: 50,
        orders: [
          {
            orderId: "direct-order",
            orderCode: "Order-DIRECT",
            createdAt: "2026-07-04T13:00:00.000Z",
            grossTotal: 200,
            commissionTotal: 0,
            receivableTotal: 200,
            paidTotal: 50,
            unpaidBalance: 150,
            hasCommissionAdjustment: false,
          },
        ],
      },
    ]);
  });

  it("compares receivable totals against the balance 30 days ago", () => {
    const data = createAnalyticsData();
    const receivableOrder = order({
      id: "receivable-order",
      agentId: "agent-id",
      status: "processing",
      paymentStatus: "partial",
      createdAt: "2026-06-01T10:00:00.000Z",
      updatedAt: "2026-07-04T10:00:00.000Z",
      paymentAmounts: [40, 70],
      items: [
        item("product-pork", "Pork Belly", "pork", 2, 100, 20, false),
      ],
    });
    receivableOrder.customer_order_status_history = [
      {
        id: "history-processing",
        from_status: "pending",
        to_status: "processing",
        changed_at: "2026-06-02T10:00:00.000Z",
        notes: null,
      },
    ];
    receivableOrder.payment = receivableOrder.payment.map((payment, index) => ({
      ...payment,
      created_at: index === 0 ? "2026-05-20T10:00:00.000Z" : "2026-07-01T10:00:00.000Z",
    }));
    data.orders = [receivableOrder];

    const analytics = buildAdminAnalytics(data, new Date("2026-07-04T12:00:00.000Z"));

    expect(analytics.summary.pendingOrderPayments).toBe(70);
    expect(analytics.summary.pendingOrderPaymentsTrend).toEqual({
      previousValue: 140,
      difference: -70,
      direction: "down",
      tooltip: "-₱70 compared to the previous 30 days. Current receivable: ₱70; 30 days ago: ₱140. Based on processing orders with unpaid balance.",
    });
    expect(buildMetricTrend(120, 120)).toEqual({
      previousValue: 120,
      difference: 0,
      direction: "flat",
      tooltip: "",
    });
  });

  it("does not attribute direct customer orders to the customer's assigned agent in commission analytics", () => {
    const data = createAnalyticsData();

    data.orders = [
      order({
        id: "admin-order-for-assigned-agent",
        agentId: null,
        customerId: "customer-two",
        customerAssignedAgentId: "agent-id",
        customerAssignedAgentName: "JEHMARP Agent",
        status: "processing",
        paymentStatus: "partial",
        createdAt: "2026-07-04T13:00:00.000Z",
        paymentAmounts: [50],
        items: [
          item("product-pork", "Pork Belly", "pork", 2, 100, 20, false),
        ],
      }),
    ];

    const analytics = buildAdminAnalytics(data, new Date("2026-07-04T14:00:00.000Z"));

    expect(analytics.salesByAgent).toEqual([]);
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
      employee_id: null,
      first_name: "JEHMARP",
      last_name: "Agent",
      display_name: "JEHMARP Agent",
      status: "active",
      email: null,
      contact: null,
      address: "",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    }],
    customers: [
      customer("customer-one", "Ada", "Buyer", "agent-id"),
      customer("customer-two", "Ben", "Buyer", "agent-id"),
      customer("customer-three", "Cat", "Buyer", null),
    ],
    agentOrders: [],
    orders: [
      order({
        id: "order-1",
        agentId: "agent-id",
        status: "processing",
        paymentStatus: "partial",
        createdAt: "2026-07-04T09:00:00.000Z",
        updatedAt: "2026-07-04T11:30:00.000Z",
        paymentAmounts: [110],
        items: [
          item("product-chicken", "Chicken Thigh", "chicken", 2, 90, 60, false),
          item("product-pork", "Pork Belly", "pork", 1, 20, 10, false),
        ],
      }),
      order({
        id: "order-2",
        agentId: "agent-id",
        status: "closed",
        paymentStatus: "paid",
        createdAt: "2026-07-03T10:00:00.000Z",
        updatedAt: "2026-07-04T10:00:00.000Z",
        paymentAmounts: [120],
        items: [
          item("product-chicken", "Chicken Thigh", "chicken", 1, 90, 50, true),
          item("product-pork", "Pork Belly", "pork", 1, 30, 0, false),
        ],
      }),
      order({
        id: "order-3",
        agentId: null,
        customerId: "customer-three",
        customerAssignedAgentId: null,
        status: "processing",
        paymentStatus: "paid",
        createdAt: "2026-06-28T11:00:00.000Z",
        updatedAt: "2026-07-03T08:00:00.000Z",
        paymentAmounts: [80],
        items: [
          item("product-pork", "Pork Belly", "pork", 1, 80, 0, false),
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
      message: null,
      application_status: "submitted",
      email_delivery_status: "sent",
      price_list_sent_at: "2026-07-04T08:30:00.000Z",
      email_error: null,
      created_at: "2026-07-04T08:30:00.000Z",
      updated_at: "2026-07-04T08:30:00.000Z",
    }],
    readAdminNotificationIds: [],
    summary: {
      totalOrders: 3,
      pendingOrders: 1,
      processingOrders: 1,
      pendingOrder: 1,
      pendingCustomer: 0,
      processing: 1,
      closed: 1,
      agents: 0,
      inquiries: 1,
      customers: 3,
      products: 2,
      resellerApplications: 1,
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
    reseller_deduction_type: "value" as const,
    reseller_deduction_value: 10,
    agent_commission_type: "value" as const,
    agent_commission_value: 0,
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
    tracking_number: `JHM-${id.slice(-8).toUpperCase().padStart(8, "0")}`,
    first_name: firstName,
    last_name: lastName,
    phone_number: "09170000000",
    email: `${firstName.toLowerCase()}@example.com`,
    address: "123 Road",
    assigned_agent_id: assignedAgentId,
    is_reseller: false,
    credit_limit: 1000,
    credit_limit_exceeded: false,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
}

function order(params: {
  id: string;
  agentId: string | null;
  customerId?: string;
  customerAssignedAgentId?: string | null;
  customerAssignedAgentName?: string | null;
  status: "pending" | "processing" | "closed";
  paymentStatus: "unpaid" | "partial" | "paid";
  createdAt: string;
  updatedAt?: string;
  paymentAmounts: number[];
  items: AdminOrderItem[];
}): AdminOrder {
  const source: AdminOrder["source"] = params.agentId ? "agent_submitted" : "admin_manual";

  return {
    id: params.id,
    customer_id: params.customerId ?? "customer-one",
    agent_id: params.agentId,
    source,
    order_status: params.status,
    payment_status: params.paymentStatus,
    notes: null,
    approved_at: params.createdAt,
    created_at: params.createdAt,
    updated_at: params.updatedAt ?? params.createdAt,
    agent: params.agentId
      ? {
          id: params.agentId,
          display_name: "JEHMARP Agent",
          email: null,
          contact: null,
        }
      : null,
    customer: {
      id: params.customerId ?? "customer-one",
      first_name: "Assigned",
      last_name: "Customer",
      phone_number: "09170000000",
      email: "assigned@example.com",
      address: "123 Road",
      is_reseller: false,
      assigned_agent_id: params.customerAssignedAgentId ?? params.agentId,
      assigned_agent:
        (params.customerAssignedAgentId ?? params.agentId)
          ? {
              id: params.customerAssignedAgentId ?? params.agentId ?? "",
              display_name: params.customerAssignedAgentName ?? "JEHMARP Agent",
              email: null,
              contact: null,
            }
          : null,
    },
    customer_order_item: params.items,
    payment: params.paymentAmounts.map((amount, index) => ({
      id: `${params.id}-payment-${index}`,
      amount,
      payment_method: "cash",
      payment_terms: "Cash on Delivery (COD)",
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
  commissionPaid: boolean,
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
    agent_commission_paid: commissionPaid,
    product: {
      id: productId,
      name: productName,
      unit_label: "kg",
      default_price: unitPrice,
      agent_commission_type: "value",
      agent_commission_value: 0,
    },
  };
}
