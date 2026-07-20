import { describe, expect, it } from "vitest";

import { buildAgentActivityItems, filterAgentActivityItems } from "./activity";
import type { AgentDashboardData } from "./data";

describe("buildAgentActivityItems", () => {
  it("builds a sorted activity feed from agent orders, customers, and links", () => {
    const data = createAgentDashboardData();
    const activity = buildAgentActivityItems(data);

    expect(activity[0]?.title).toBe("Registration link created");
    expect(activity.map((item) => item.title)).toEqual([
      "Registration link created",
      "Submitted payment for confirmation",
      "Updated customer order",
      "Created customer order",
      "Customer added",
      "Submitted distribution order",
    ]);
  });

  it("limits activity items after sorting by newest first", () => {
    const activity = buildAgentActivityItems(createAgentDashboardData(), 2);

    expect(activity).toHaveLength(2);
    expect(activity[0]?.category).toBe("registration");
    expect(activity[1]?.category).toBe("payment");
  });
});

describe("filterAgentActivityItems", () => {
  it("filters activity by title, detail, and category terms", () => {
    const activity = buildAgentActivityItems(createAgentDashboardData());

    expect(filterAgentActivityItems(activity, "registration")).toEqual([
      expect.objectContaining({
        title: "Registration link created",
        category: "registration",
      }),
    ]);
    expect(filterAgentActivityItems(activity, "distribution")).toEqual([
      expect.objectContaining({
        title: "Submitted distribution order",
        category: "order",
      }),
    ]);
  });

  it("returns all items when no search filter is provided", () => {
    const activity = buildAgentActivityItems(createAgentDashboardData(), 3);

    expect(filterAgentActivityItems(activity)).toEqual(activity);
  });
});

function createAgentDashboardData(): AgentDashboardData {
  return {
    agent: {
      id: "agent-1",
      user_id: "user-1",
      employee_id: "EMP-001",
      first_name: "Agent",
      last_name: "One",
      display_name: "Agent One",
      contact: "09171234567",
      email: "agent@example.com",
      status: "active",
    },
    customers: [{
      id: "customer-1",
      first_name: "Jane",
      last_name: "Doe",
      phone_number: "09171234567",
      email: "jane@example.com",
      address: "Manila",
      assigned_agent_id: "agent-1",
      is_reseller: false,
      created_at: "2026-07-10T08:00:00.000Z",
      updated_at: "2026-07-10T08:00:00.000Z",
    }],
    products: [],
    agentOrders: [{
      id: "agent-order-1",
      agent_id: "agent-1",
      order_status: "pending_customers",
      notes: null,
      submitted_by: "user-1",
      created_at: "2026-07-08T08:00:00.000Z",
      updated_at: "2026-07-08T08:00:00.000Z",
      agent_order_item: [{
        id: "agent-order-item-1",
        product_id: "product-1",
        quantity: 10,
        add_details: null,
        agent_commission_amount: 250,
        agent_commission_updated_by: null,
        agent_commission_updated_at: null,
        created_at: "2026-07-08T08:00:00.000Z",
        updated_at: "2026-07-08T08:00:00.000Z",
        product: {
          id: "product-1",
          name: "Pork Belly",
          unit_label: "kg",
          default_price: 320,
        },
      }],
      customer_order: [],
    }],
    registrationLinks: [{
      id: "link-1",
      token: "abc123",
      expires_at: "2026-08-01T08:00:00.000Z",
      created_at: "2026-07-15T08:00:00.000Z",
      use_count: 0,
    }],
    orders: [{
      id: "order-12345678",
      agent_order_id: null,
      customer_id: "customer-1",
      agent_id: "agent-1",
      source: "agent_submitted",
      order_status: "processing",
      payment_status: "partial",
      approved_at: "2026-07-12T08:00:00.000Z",
      created_at: "2026-07-12T08:00:00.000Z",
      updated_at: "2026-07-12T10:00:00.000Z",
      customer: {
        id: "customer-1",
        first_name: "Jane",
        last_name: "Doe",
        phone_number: "09171234567",
        email: "jane@example.com",
        address: "Manila",
        is_reseller: false,
      },
      customer_order_item: [{
        id: "item-1",
        product_id: "product-1",
        partial_quantity: 5,
        final_quantity: 5,
        unit_price: 320,
        price_type: "retail",
        add_details: null,
        agent_commission_amount: 100,
        agent_commission_paid: false,
        product: {
          id: "product-1",
          name: "Pork Belly",
          unit_label: "kg",
          default_price: 320,
        },
      }],
      payment: [],
      agent_received_payment: [{
        id: "received-1",
        order_id: "order-12345678",
        agent_id: "agent-1",
        amount: 500,
        payment_method: "Cash",
        payment_terms: "Cash on Delivery (COD)",
        payment_date: "2026-07-14",
        reference_number: null,
        notes: null,
        status: "pending_admin_confirmation",
        confirmed_at: null,
        created_at: "2026-07-14T08:00:00.000Z",
        updated_at: "2026-07-14T08:00:00.000Z",
      }],
      invoice: [],
      customer_order_status_history: [],
    }],
    summary: {
      assignedCustomers: 1,
      submittedOrders: 1,
      monthlyEarnings: 0,
      earnedToday: 0,
      expectedCommission: 100,
      outstandingBalance: 0,
    },
    paymentSummary: {
      unpaid: 0,
      partial: 1,
      paid: 0,
      refunded: 0,
    },
  };
}
