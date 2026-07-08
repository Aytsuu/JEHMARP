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
    order_status: "submitted",
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
        agent_commission_status: "unset",
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
        orderStatus: "submitted",
        paymentStatus: "partial",
      },
    });

    expect(orderBuilder.eq).toHaveBeenCalledWith("source", "guest_shop");
    expect(orderBuilder.eq).toHaveBeenCalledWith("order_status", "submitted");
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
          agent_commission_status: "unset",
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

  it("normalizes nullable order child relations to empty arrays", async () => {
    const order = {
      id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      agent_id: null,
      source: "admin_manual",
      order_status: "approved",
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
      order_status: "approved",
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
      order_status: "approved",
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
});
