import { describe, expect, it } from "vitest";

import { buildAdminActivityItems } from "./activity";

import type { AdminDashboardData } from "./data";

describe("buildAdminActivityItems", () => {
  it("builds a sorted operational activity feed including new inquiries and reseller applications", () => {
    const data = createAdminDashboardData();

    const activity = buildAdminActivityItems(data);

    expect(activity.map((item) => item.title)).toEqual([
      "New contact inquiry",
      "New reseller application",
      "Updated content page",
      "Created invoice",
      "Updated order status",
      "Added product",
      "Added new customer",
      "Created order",
      "Created content page",
    ]);
    expect(activity[0]).toMatchObject({
      category: "inquiry",
      detail: "Contact Customer - new",
    });
    expect(activity[1]).toMatchObject({
      category: "reseller",
      detail: "Reseller Applicant - retail_resale, price list sent",
    });
  });

  it("limits activity items after sorting by newest first", () => {
    const activity = buildAdminActivityItems(createAdminDashboardData(), 2);

    expect(activity).toHaveLength(2);
    expect(activity[0]?.title).toBe("New contact inquiry");
    expect(activity[1]?.title).toBe("New reseller application");
  });
});

function createAdminDashboardData(): AdminDashboardData {
  return {
    pages: [{
      id: "page-home",
      slug: "home",
      title: "Home",
      status: "published",
      published_at: "2026-07-04T08:00:00.000Z",
      created_at: "2026-07-04T08:00:00.000Z",
      updated_at: "2026-07-04T13:00:00.000Z",
    }],
    pageSections: [],
    products: [{
      id: "product-pork",
      name: "Pork Belly",
      category: "pork",
      description: null,
      unit_label: "kg",
      default_price: 320,
      reseller_price: 295,
      stock_status: "in_stock",
      image_path: null,
      is_active: true,
      created_at: "2026-07-04T10:00:00.000Z",
      updated_at: "2026-07-04T10:00:00.000Z",
    }],
    agents: [],
    customers: [{
      id: "customer-id",
      first_name: "Ada",
      last_name: "Buyer",
      phone_number: "09170000000",
      email: "ada@example.com",
      address: "123 Road",
      assigned_agent_id: null,
      is_reseller: false,
      created_at: "2026-07-04T09:00:00.000Z",
      updated_at: "2026-07-04T09:00:00.000Z",
    }],
    orders: [{
      id: "12345678-1111-4111-8111-111111111111",
      customer_id: "customer-id",
      agent_id: null,
      source: "admin_manual",
      order_status: "processing",
      payment_status: "unpaid",
      notes: null,
      approved_at: "2026-07-04T11:00:00.000Z",
      created_at: "2026-07-04T08:30:00.000Z",
      updated_at: "2026-07-04T08:30:00.000Z",
      customer: {
        id: "customer-id",
        first_name: "Ada",
        last_name: "Buyer",
        phone_number: "09170000000",
        email: "ada@example.com",
        address: "123 Road",
        assigned_agent_id: null,
        assigned_agent: null,
        is_reseller: false,
      },
      agent: null,
      customer_order_item: [],
      payment: [],
      invoice: [{
        id: "invoice-id",
        order_id: "12345678-1111-4111-8111-111111111111",
        invoice_number: "INV-0001",
        status: "issued",
        issued_at: "2026-07-04T12:00:00.000Z",
        due_at: null,
        created_at: "2026-07-04T12:00:00.000Z",
        updated_at: "2026-07-04T12:00:00.000Z",
      }],
      customer_order_status_history: [{
        id: "history-id",
        from_status: "pending",
        to_status: "processing",
        changed_at: "2026-07-04T11:00:00.000Z",
        notes: null,
      }],
    }],
    contactInquiries: [{
      id: "inquiry-id",
      name: "Contact Customer",
      email: "contact@example.com",
      phone_number: "09172222222",
      message: "Do you deliver?",
      inquiry_status: "new",
      internal_notes: null,
      created_at: "2026-07-04T15:00:00.000Z",
      updated_at: "2026-07-04T15:00:00.000Z",
    }],
    resellerApplications: [{
      id: "reseller-id",
      name: "Reseller Applicant",
      email: "reseller@example.com",
      contact_number: "09171111111",
      planned_transaction_type: "retail_resale",
      expected_quantity_per_week: "40 kg",
      message: null,
      application_status: "submitted",
      email_delivery_status: "sent",
      price_list_sent_at: "2026-07-04T14:00:00.000Z",
      email_error: null,
      created_at: "2026-07-04T14:00:00.000Z",
      updated_at: "2026-07-04T14:00:00.000Z",
    }],
    summary: {
      orders: 1,
      inquiries: 1,
      customers: 1,
      products: 1,
      resellerApplications: 1,
    },
  };
}
