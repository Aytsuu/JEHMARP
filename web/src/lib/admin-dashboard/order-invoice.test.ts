import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import {
  ensureSalesInvoiceBeforeAgentPaymentConfirmation,
  ensureSalesInvoiceWhenOrderFullyPaid,
} from "./order-invoice";

describe("order invoice helpers", () => {
  beforeEach(() => {
    mocks.createSupabaseAdminClient.mockReset();
  });

  it("creates a sales invoice when the commission-adjusted receivable is fully paid", async () => {
    const invoiceInsert = vi.fn().mockResolvedValue({ error: null });
    const orderUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const orderUpdate = vi.fn(() => ({ eq: orderUpdateEq }));
    const rpc = vi.fn();
    const supabase = {
      from(table: string) {
        if (table === "invoice") {
          return {
            select: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
            insert: invoiceInsert,
          };
        }

        if (table === "customer_order") {
          return {
            update: orderUpdate,
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: paidAgentOrder(),
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
      rpc,
    };
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    await ensureSalesInvoiceWhenOrderFullyPaid(supabase as never, "order-id");

    expect(rpc).not.toHaveBeenCalled();
    expect(invoiceInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: "order-id",
        status: "issued",
      }),
    );
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      order_status: "closed",
      updated_at: expect.any(String),
    }));
    expect(orderUpdateEq).toHaveBeenCalledWith("id", "order-id");
  });

  it("does not create a sales invoice while the order receivable remains unpaid", async () => {
    const invoiceInsert = vi.fn();
    const orderUpdate = vi.fn();
    const supabase = {
      from(table: string) {
        if (table === "invoice") {
          return {
            select: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
            insert: invoiceInsert,
          };
        }

        if (table === "customer_order") {
          return {
            update: orderUpdate,
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    ...paidAgentOrder(),
                    payment: [{ amount: 800 }],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    await ensureSalesInvoiceWhenOrderFullyPaid(supabase as never, "order-id");

    expect(invoiceInsert).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("uses gross receivable for direct customer orders without an order agent link", async () => {
    const invoiceInsert = vi.fn().mockResolvedValue({ error: null });
    const orderUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const orderUpdate = vi.fn(() => ({ eq: orderUpdateEq }));
    const supabase = {
      from(table: string) {
        if (table === "invoice") {
          return {
            select: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
            insert: invoiceInsert,
          };
        }

        if (table === "customer_order") {
          return {
            update: orderUpdate,
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    ...paidAgentOrder(),
                    agent_id: null,
                    agent_order_id: null,
                    converted_to_agent_order_id: null,
                    payment: [{ amount: 900 }],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    await ensureSalesInvoiceWhenOrderFullyPaid(supabase as never, "order-id");

    expect(invoiceInsert).toHaveBeenCalledWith(expect.objectContaining({
      order_id: "order-id",
      status: "issued",
    }));
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      order_status: "closed",
    }));
  });

  it("closes a processing order when a sales invoice already exists and the receivable is fully paid", async () => {
    const invoiceInsert = vi.fn();
    const orderUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const orderUpdate = vi.fn(() => ({ eq: orderUpdateEq }));
    const supabase = {
      from(table: string) {
        if (table === "invoice") {
          return {
            select: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: { id: "invoice-id" }, error: null }),
                }),
              }),
            }),
            insert: invoiceInsert,
          };
        }

        if (table === "customer_order") {
          return {
            update: orderUpdate,
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: paidAgentOrder(),
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    await ensureSalesInvoiceWhenOrderFullyPaid(supabase as never, "order-id");

    expect(invoiceInsert).not.toHaveBeenCalled();
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      order_status: "closed",
      updated_at: expect.any(String),
    }));
    expect(orderUpdateEq).toHaveBeenCalledWith("id", "order-id");
  });

  it("creates a sales invoice before confirming a full agent payment", async () => {
    const invoiceInsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from(table: string) {
        if (table === "agent_received_payment") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { order_id: "order-id", amount: 840 },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "invoice") {
          return {
            select: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
            insert: invoiceInsert,
          };
        }

        if (table === "customer_order") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    ...paidAgentOrder(),
                    payment: [],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    await ensureSalesInvoiceBeforeAgentPaymentConfirmation(supabase as never, "agent-payment-id");

    expect(invoiceInsert).toHaveBeenCalled();
  });
});

function paidAgentOrder() {
  return {
    order_status: "processing",
    agent_id: "agent-id",
    agent_order_id: null,
    converted_to_agent_order_id: null,
    payment: [{ amount: 840 }],
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
  };
}
