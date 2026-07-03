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
