import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminOrder } from "./data";

const loadAdminOrder = vi.fn();
const loadAdminAgentOrder = vi.fn();

vi.mock("./data", () => ({
  loadAdminOrder,
  loadAdminAgentOrder,
}));

describe("bulk-order-documents", () => {
  beforeEach(() => {
    loadAdminOrder.mockReset();
    loadAdminAgentOrder.mockReset();
  });

  it("parses and deduplicates bulk order selections", async () => {
    const { parseBulkOrderSelections } = await import("./bulk-order-documents");

    expect(parseBulkOrderSelections([
      "customer:49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      "agent:7c66f907-8324-473c-b0b5-d017a4728121",
      "customer:49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      "invalid",
    ])).toEqual([
      { rowType: "customer", id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb" },
      { rowType: "agent", id: "7c66f907-8324-473c-b0b5-d017a4728121" },
    ]);
  });

  it("resolves agent orders into their linked customer orders", async () => {
    const customerOrderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const agentOrderId = "7c66f907-8324-473c-b0b5-d017a4728121";

    loadAdminAgentOrder.mockResolvedValue({
      id: agentOrderId,
      customer_order: [{ id: customerOrderId }],
    });
    loadAdminOrder.mockResolvedValue({
      id: customerOrderId,
      invoice: [],
      customer_order_item: [],
    } as unknown as AdminOrder);

    const { resolveCustomerOrdersForBulkDocuments } = await import("./bulk-order-documents");
    const orders = await resolveCustomerOrdersForBulkDocuments([
      { rowType: "agent", id: agentOrderId },
    ]);

    expect(loadAdminAgentOrder).toHaveBeenCalledWith(agentOrderId);
    expect(loadAdminOrder).toHaveBeenCalledWith(customerOrderId);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.id).toBe(customerOrderId);
  });

  it("skips orders without sales invoices when building bulk sales invoice PDFs", async () => {
    const withInvoice = {
      id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      created_at: "2026-07-03T00:00:00.000Z",
      customer: {
        first_name: "Maria",
        last_name: "Santos",
        address: "Cebu",
      },
      customer_order_item: [
        {
          partial_quantity: 1,
          final_quantity: 1,
          unit_price: 100,
          add_details: null,
          product: { name: "Pork" },
        },
      ],
      invoice: [
        {
          invoice_number: "INV-00000042",
          issued_at: "2026-07-03T00:00:00.000Z",
          created_at: "2026-07-03T00:00:00.000Z",
        },
      ],
    } as unknown as AdminOrder;
    const withoutInvoice = {
      id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      created_at: "2026-07-03T00:00:00.000Z",
      customer: {
        first_name: "Ana",
        last_name: "Lopez",
        address: "Manila",
      },
      customer_order_item: [],
      invoice: [],
    } as unknown as AdminOrder;

    loadAdminOrder
      .mockResolvedValueOnce(withInvoice)
      .mockResolvedValueOnce(withoutInvoice);

    const { buildBulkSalesInvoiceDocument } = await import("./bulk-order-documents");
    const pdf = await buildBulkSalesInvoiceDocument([
      { rowType: "customer", id: withInvoice.id },
      { rowType: "customer", id: withoutInvoice.id },
    ]);

    expect(pdf).not.toBeNull();
    expect(new TextDecoder().decode(pdf!)).toContain("SALES INVOICE");
  });

  it("returns null when no selected orders have sales invoices", async () => {
    loadAdminOrder.mockResolvedValue({
      id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      invoice: [],
      customer_order_item: [],
    } as unknown as AdminOrder);

    const { buildBulkSalesInvoiceDocument } = await import("./bulk-order-documents");
    const pdf = await buildBulkSalesInvoiceDocument([
      { rowType: "customer", id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb" },
    ]);

    expect(pdf).toBeNull();
  });
});
