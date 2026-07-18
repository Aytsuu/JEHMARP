import { describe, expect, it } from "vitest";

import type { DocumentOrder } from "./view";
import { buildSalesInvoiceLayout } from "./layout";

describe("buildSalesInvoiceLayout", () => {
  it("checks the selected payment method and terms from the saved payment record", () => {
    const layout = buildSalesInvoiceLayout({
      id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      created_at: "2026-07-18T00:00:00.000Z",
      customer: {
        first_name: "Maria",
        last_name: "Santos",
        address: "Cebu",
      },
      customer_order_item: [
        {
          partial_quantity: 2,
          final_quantity: 2,
          unit_price: 350,
          add_details: null,
          product: {
            name: "Chicken Legs",
          },
        },
      ],
      payment: [
        {
          payment_method: "Check",
          payment_terms: "Bank Transfer",
        },
      ],
      invoice: [
        {
          invoice_number: "INV-00000042",
          issued_at: "2026-07-18T00:00:00.000Z",
          created_at: "2026-07-18T00:00:00.000Z",
        },
      ],
    } satisfies DocumentOrder);

    expect(layout.paymentLines).toEqual([
      "Mode of Payment (/)",
      "( ) Cash   (✓) Check",
      "( ) Cash on Delivery (COD)  (✓) Bank Transfer   ( ) Gcash",
    ]);
  });
});
