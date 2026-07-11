import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseAdminClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient,
}));

type MockResponse = {
  data: unknown[];
  error: null;
};

const emptyResponse: MockResponse = {
  data: [],
  error: null,
};

function createQueryBuilder(response: MockResponse = emptyResponse) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    or: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve({
      data: response.data[0] ?? null,
      error: response.error,
    })),
    order: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(response)),
    then: (resolve: (value: MockResponse) => unknown) => resolve(response),
  };

  return builder;
}

function createMockOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
    customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
    agent_id: null,
    source: "guest_shop",
    order_status: "pending",
    payment_status: "partial",
    approved_at: null,
    created_at: "2026-07-03T00:00:00.000Z",
    updated_at: "2026-07-03T00:00:00.000Z",
    customer: {
      id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      first_name: "Maria",
      last_name: "Cruz",
      phone_number: "09170000000",
      email: "maria@example.test",
      address: "Quezon City",
      is_reseller: false,
    },
    agent: null,
    customer_order_item: [
      {
        id: "a10bb955-d8b1-4a26-a6e2-928fd33949e1",
        product_id: "p10bb955-d8b1-4a26-a6e2-928fd33949e1",
        partial_quantity: 2,
        final_quantity: 3,
        unit_price: 600,
        price_type: "retail",
        add_details: null,
        agent_commission_amount: 0,
        agent_commission_paid: false,
        agent_commission_notes: null,
        product: null,
      },
    ],
    payment: [],
    invoice: [],
    customer_order_status_history: [],
    ...overrides,
  };
}

describe("loadAdminDashboardData", () => {
  beforeEach(() => {
    vi.resetModules();
    createSupabaseAdminClient.mockReset();
  });

  it("uses the server-only admin client so protected admin columns can be read without broadening public grants", async () => {
    const from = vi.fn(() => createQueryBuilder());
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminDashboardData } = await import("./data");

    const result = await loadAdminDashboardData();

    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("product");
    expect(result.products).toEqual([]);
  });

  it("applies admin product filters to the database query", async () => {
    const productBuilder = createQueryBuilder();
    const from = vi.fn((table: string) => (
      table === "product" ? productBuilder : createQueryBuilder()
    ));
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminDashboardData } = await import("./data");

    await loadAdminDashboardData({
      productFilters: {
        search: "belly",
        category: "pork",
        stockStatus: "limited",
        minPrice: 100,
        maxPrice: 250,
      },
    });

    expect(productBuilder.or).toHaveBeenCalledWith("name.ilike.%belly%,description.ilike.%belly%");
    expect(productBuilder.eq).toHaveBeenCalledWith("category", "pork");
    expect(productBuilder.eq).toHaveBeenCalledWith("stock_status", "limited");
    expect(productBuilder.gte).toHaveBeenCalledWith("default_price", 100);
    expect(productBuilder.lte).toHaveBeenCalledWith("default_price", 250);
  });

  it("loads product management data without loading the rest of the dashboard", async () => {
    const productBuilder = createQueryBuilder();
    const from = vi.fn(() => productBuilder);
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminProductManagementData } = await import("./data");

    const result = await loadAdminProductManagementData({
      search: "belly",
    });

    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledTimes(2);
    expect(from).toHaveBeenNthCalledWith(1, "product");
    expect(from).toHaveBeenNthCalledWith(2, "product");
    expect(productBuilder.or).toHaveBeenCalledWith("name.ilike.%belly%,description.ilike.%belly%");
    expect(result).toEqual({
      products: [],
      productPriceRange: {
        min: 0,
        max: 0,
      },
    });
  });

  it("applies direct admin order filters to the database query", async () => {
    const orderBuilder = createQueryBuilder();
    const from = vi.fn((table: string) => (
      table === "customer_order" ? orderBuilder : createQueryBuilder()
    ));
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminDashboardData } = await import("./data");

    await loadAdminDashboardData({
      orderFilters: {
        source: "guest_shop",
        orderStatus: "pending",
        paymentStatus: "partial",
      },
    });

    expect(orderBuilder.eq).toHaveBeenCalledWith("source", "guest_shop");
    expect(orderBuilder.eq).toHaveBeenCalledWith("order_status", "pending");
    expect(orderBuilder.eq).toHaveBeenCalledWith("payment_status", "partial");
  });

  it("filters admin orders by search and total on the server", async () => {
    const matchingOrder = createMockOrder();
    const lowTotalOrder = createMockOrder({
      id: "59d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      customer: {
        id: "c10bb955-d8b1-4a26-a6e2-928fd33949e1",
        first_name: "Maria",
        last_name: "Santos",
        phone_number: "09171111111",
        email: "santos@example.test",
        address: "Makati",
        is_reseller: false,
      },
      customer_order_item: [
        {
          id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
          product_id: "p10bb955-d8b1-4a26-a6e2-928fd33949e1",
          partial_quantity: 1,
          final_quantity: 1,
          unit_price: 200,
          price_type: "retail",
          add_details: null,
          agent_commission_amount: 0,
          agent_commission_paid: false,
          agent_commission_notes: null,
          product: null,
        },
      ],
    });
    const unrelatedOrder = createMockOrder({
      id: "69d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      customer: {
        id: "d10bb955-d8b1-4a26-a6e2-928fd33949e1",
        first_name: "Juan",
        last_name: "Reyes",
        phone_number: "09172222222",
        email: "juan@example.test",
        address: "Pasig",
        is_reseller: false,
      },
    });
    const orderBuilder = createQueryBuilder({
      data: [matchingOrder, lowTotalOrder, unrelatedOrder],
      error: null,
    });
    const from = vi.fn((table: string) => (
      table === "customer_order" ? orderBuilder : createQueryBuilder()
    ));
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminOrderManagementData } = await import("./data");

    const result = await loadAdminOrderManagementData({
      search: "maria",
      minTotal: 1000,
      maxTotal: 1500,
    });

    expect(result.orders.map((order) => order.id)).toEqual([matchingOrder.id]);
  });

  it("filters admin invoices by invoice number, customer name, balance status, and total", async () => {
    const matchingOrder = createMockOrder({
      payment_status: "partial",
      invoice: {
        id: "7c66f907-8324-473c-b0b5-d017a4728121",
        order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        invoice_number: "INV-00000042",
        status: "issued",
        issued_at: "2026-07-03T00:00:00.000Z",
        due_at: null,
        created_at: "2026-07-03T00:00:00.000Z",
        updated_at: "2026-07-03T00:00:00.000Z",
      },
    });
    const wrongBalanceOrder = createMockOrder({
      id: "59d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      payment_status: "paid",
      invoice: {
        id: "8c66f907-8324-473c-b0b5-d017a4728121",
        order_id: "59d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        invoice_number: "INV-00000043",
        status: "issued",
        issued_at: "2026-07-03T00:00:00.000Z",
        due_at: null,
        created_at: "2026-07-03T00:00:00.000Z",
        updated_at: "2026-07-03T00:00:00.000Z",
      },
    });
    const noInvoiceOrder = createMockOrder({
      id: "69d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      customer: {
        id: "d10bb955-d8b1-4a26-a6e2-928fd33949e1",
        first_name: "Juan",
        last_name: "Reyes",
        phone_number: "09172222222",
        email: "juan@example.test",
        address: "Pasig",
        is_reseller: false,
      },
      invoice: [],
    });
    const orderBuilder = createQueryBuilder({
      data: [matchingOrder, wrongBalanceOrder, noInvoiceOrder],
      error: null,
    });
    const from = vi.fn((table: string) => (
      table === "customer_order" ? orderBuilder : createQueryBuilder()
    ));
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminInvoiceManagementData } = await import("./data");

    const result = await loadAdminInvoiceManagementData({
      search: "inv-00000042 maria",
      balanceStatus: "partial",
      minTotal: 1500,
      maxTotal: 2000,
    });

    expect(result.orders.map((order) => order.id)).toEqual([matchingOrder.id]);
    expect(result.invoiceTotalRange).toEqual({
      min: 1800,
      max: 1800,
    });
  });

  it("filters admin customers by name, email, contact, assigned agent, and type", async () => {
    const customerBuilder = createQueryBuilder({
      data: [
        {
          id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
          first_name: "Maria",
          last_name: "Cruz",
          phone_number: "09170000000",
          email: "maria@example.test",
          address: "Quezon City",
          assigned_agent_id: "agent-1",
          is_reseller: true,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "c10bb955-d8b1-4a26-a6e2-928fd33949e1",
          first_name: "Ana",
          last_name: "Reyes",
          phone_number: "09171111111",
          email: "ana@example.test",
          address: "Makati",
          assigned_agent_id: null,
          is_reseller: false,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const agentBuilder = createQueryBuilder({
      data: [
        {
          id: "agent-1",
          display_name: "Carlos Dela Cruz",
        },
      ],
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === "customer") return customerBuilder;
      if (table === "agent_profile") return agentBuilder;
      return createQueryBuilder();
    });
    createSupabaseAdminClient.mockReturnValue({
      from,
      auth: {
        admin: {
          listUsers: vi.fn(() => Promise.resolve({
            data: {
              users: [{
                id: "user-1",
                email: "carlos@example.test",
              }],
            },
            error: null,
          })),
        },
      },
    });
    const { loadAdminCustomerManagementData } = await import("./data");

    const result = await loadAdminCustomerManagementData({
      search: "maria carlos 0917",
      customerType: "reseller",
    });

    expect(result.customers.map((customer) => customer.id)).toEqual([
      "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
    ]);
    expect(result.agents).toEqual([
      {
        id: "agent-1",
        display_name: "Carlos Dela Cruz",
        email: null,
        contact: null,
      },
    ]);
  });

  it("filters admin agents by display name, email, contact, and status", async () => {
    const agentBuilder = createQueryBuilder({
      data: [
        {
          id: "agent-1",
          user_id: "user-1",
          display_name: "Carlos Dela Cruz",
          status: "active",
          email: "carlos@example.test",
          contact: "09170000000",
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "agent-2",
          user_id: "user-2",
          display_name: "Ana Reyes",
          status: "inactive",
          email: "ana@example.test",
          contact: "09171111111",
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const from = vi.fn((table: string) => (
      table === "agent_profile" ? agentBuilder : createQueryBuilder()
    ));
    createSupabaseAdminClient.mockReturnValue({
      from,
      auth: {
        admin: {
          listUsers: vi.fn(() => Promise.resolve({
            data: {
              users: [
                {
                  id: "user-1",
                  email: "carlos@example.test",
                },
                {
                  id: "user-2",
                  email: "ana@example.test",
                },
              ],
            },
            error: null,
          })),
        },
      },
    });
    const { loadAdminAgentManagementData } = await import("./data");

    const result = await loadAdminAgentManagementData({
      search: "carlos",
      status: "active",
    });

    expect(result.agents.map((agent) => agent.id)).toEqual(["agent-1"]);
  });

  it("filters admin reseller applications by applicant, email, contact, and status", async () => {
    const resellerBuilder = createQueryBuilder({
      data: [
        {
          id: "application-1",
          name: "Maria Cruz",
          email: "maria@example.test",
          contact_number: "09170000000",
          planned_transaction_type: "Retail",
          expected_quantity_per_week: "50kg",
          message: "Interested",
          application_status: "submitted",
          email_delivery_status: "pending",
          price_list_sent_at: null,
          email_error: null,
          admin_read_at: null,
          admin_read_by: null,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "application-2",
          name: "Ana Reyes",
          email: "ana@example.test",
          contact_number: "09171111111",
          planned_transaction_type: "Wholesale",
          expected_quantity_per_week: "20kg",
          message: null,
          application_status: "contacted",
          email_delivery_status: "sent",
          price_list_sent_at: null,
          email_error: null,
          admin_read_at: null,
          admin_read_by: null,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const from = vi.fn((table: string) => (
      table === "reseller_application" ? resellerBuilder : createQueryBuilder()
    ));
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminResellerApplicationManagementData } = await import("./data");

    const result = await loadAdminResellerApplicationManagementData({
      search: "maria 0917",
      status: "submitted",
    });

    expect(result.resellerApplications.map((application) => application.id)).toEqual(["application-1"]);
  });

  it("filters admin inquiries by name, email, contact, and status", async () => {
    const inquiryBuilder = createQueryBuilder({
      data: [
        {
          id: "inquiry-1",
          name: "Maria Cruz",
          email: "maria@example.test",
          phone_number: "09170000000",
          message: "Need pricing",
          inquiry_status: "reviewing",
          internal_notes: null,
          admin_read_at: null,
          admin_read_by: null,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "inquiry-2",
          name: "Ana Reyes",
          email: "ana@example.test",
          phone_number: "09171111111",
          message: "Hello",
          inquiry_status: "closed",
          internal_notes: null,
          admin_read_at: null,
          admin_read_by: null,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const from = vi.fn((table: string) => (
      table === "contact_inquiry" ? inquiryBuilder : createQueryBuilder()
    ));
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminInquiryManagementData } = await import("./data");

    const result = await loadAdminInquiryManagementData({
      search: "maria 0917",
      status: "reviewing",
    });

    expect(result.contactInquiries.map((inquiry) => inquiry.id)).toEqual(["inquiry-1"]);
  });

  it("normalizes nullable order child relations to empty arrays", async () => {
    const order = {
      id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      agent_id: null,
      source: "admin_manual",
      order_status: "processing",
      payment_status: "unpaid",
      approved_at: null,
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
      customer: null,
      agent: null,
      customer_order_item: null,
      payment: null,
      invoice: null,
      customer_order_status_history: null,
    };
    const from = vi.fn((table: string) => createQueryBuilder(
      table === "customer_order"
        ? {
            data: [order],
            error: null,
          }
        : emptyResponse,
    ));
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminDashboardData } = await import("./data");

    const result = await loadAdminDashboardData();

    expect(result.orders[0]).toMatchObject({
      customer_order_item: [],
      payment: [],
      invoice: [],
      customer_order_status_history: [],
    });
  });

  it("loads and normalizes one admin order for document rendering", async () => {
    const order = {
      id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      agent_id: null,
      source: "admin_manual",
      order_status: "processing",
      payment_status: "unpaid",
      approved_at: null,
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
      customer: null,
      agent: null,
      customer_order_item: null,
      payment: null,
      invoice: null,
      customer_order_status_history: null,
    };
    const builder = createQueryBuilder({
      data: [order],
      error: null,
    });
    const from = vi.fn(() => builder);
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminOrder } = await import("./data");

    const result = await loadAdminOrder(order.id);

    expect(from).toHaveBeenCalledWith("customer_order");
    expect(builder.eq).toHaveBeenCalledWith("id", order.id);
    expect(result).toMatchObject({
      id: order.id,
      invoice: [],
      customer_order_item: [],
    });
  });

  it("preserves a single nested invoice object on an admin order", async () => {
    const invoice = {
      id: "7c66f907-8324-473c-b0b5-d017a4728121",
      order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      invoice_number: "INV-00000042",
      status: "issued",
      issued_at: "2026-07-03T00:00:00.000Z",
      due_at: null,
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
    };
    const order = {
      id: "49d07a2e-a8bb-4dc9-8ee5464286fb",
      customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      agent_id: null,
      source: "admin_manual",
      order_status: "processing",
      payment_status: "unpaid",
      approved_at: null,
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
      customer: null,
      agent: null,
      customer_order_item: [],
      payment: [],
      invoice,
      customer_order_status_history: [],
    };
    const builder = createQueryBuilder({
      data: [order],
      error: null,
    });
    const from = vi.fn(() => builder);
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminOrder } = await import("./data");

    const result = await loadAdminOrder(order.id);

    expect(result?.invoice).toEqual([invoice]);
  });

  it("builds dashboard summary totals from all matching records", async () => {
    const orderBuilder = createQueryBuilder({
      data: [
        createMockOrder({ order_status: "pending" }),
        createMockOrder({
          id: "59d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
          order_status: "closed",
        }),
      ],
      error: null,
    });
    const customerBuilder = createQueryBuilder({
      data: [
        {
          id: "customer-1",
          first_name: "Maria",
          last_name: "Cruz",
          phone_number: "09170000000",
          email: "maria@example.test",
          address: "Quezon City",
          assigned_agent_id: null,
          is_reseller: false,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const inquiryBuilder = createQueryBuilder({
      data: [
        {
          id: "inquiry-1",
          name: "Maria Cruz",
          email: "maria@example.test",
          phone_number: "09170000000",
          message: "Need pricing",
          inquiry_status: "reviewing",
          internal_notes: null,
          admin_read_at: null,
          admin_read_by: null,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "inquiry-2",
          name: "Ana Reyes",
          email: "ana@example.test",
          phone_number: "09171111111",
          message: "Hello",
          inquiry_status: "closed",
          internal_notes: null,
          admin_read_at: null,
          admin_read_by: null,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const productBuilder = createQueryBuilder({
      data: [
        {
          id: "product-1",
          name: "Pork Belly",
          category: "pork",
          description: null,
          unit_label: "kg",
          default_price: 250,
          reseller_price: 230,
          stock_status: "in_stock",
          image_path: null,
          is_active: true,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "product-2",
          name: "Chicken Breast",
          category: "chicken",
          description: null,
          unit_label: "kg",
          default_price: 200,
          reseller_price: 180,
          stock_status: "limited",
          image_path: null,
          is_active: false,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const resellerBuilder = createQueryBuilder({
      data: [
        {
          id: "application-1",
          name: "Maria Cruz",
          email: "maria@example.test",
          contact_number: "09170000000",
          planned_transaction_type: "Retail",
          expected_quantity_per_week: "50kg",
          message: "Interested",
          application_status: "submitted",
          email_delivery_status: "pending",
          price_list_sent_at: null,
          email_error: null,
          admin_read_at: null,
          admin_read_by: null,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "application-2",
          name: "Ana Reyes",
          email: "ana@example.test",
          contact_number: "09171111111",
          planned_transaction_type: "Wholesale",
          expected_quantity_per_week: "20kg",
          message: null,
          application_status: "closed",
          email_delivery_status: "sent",
          price_list_sent_at: null,
          email_error: null,
          admin_read_at: null,
          admin_read_by: null,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === "customer_order") return orderBuilder;
      if (table === "customer") return customerBuilder;
      if (table === "contact_inquiry") return inquiryBuilder;
      if (table === "product") return productBuilder;
      if (table === "reseller_application") return resellerBuilder;
      return createQueryBuilder();
    });
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminDashboardSummaryData } = await import("./data");

    const result = await loadAdminDashboardSummaryData();

    expect(result).toEqual({
      orders: 2,
      inquiries: 2,
      customers: 1,
      products: 2,
      resellerApplications: 2,
    });
  });
});
