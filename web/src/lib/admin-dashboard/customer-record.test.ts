import { describe, expect, it } from "vitest";

import type { AdminOrder } from "./data";
import {
  buildCustomerPaymentRows,
  buildCustomerReceivableSegments,
  filterCustomerPaymentRows,
  parseCustomerRecordTab,
} from "./customer-record";

function createOrder(
  id: string,
  payments: AdminOrder["payment"],
): AdminOrder {
  return {
    id,
    customer_id: "customer-1",
    payment: payments,
  } as AdminOrder;
}

describe("parseCustomerRecordTab", () => {
  it("recognizes the payments tab", () => {
    expect(parseCustomerRecordTab("payments")).toBe("payments");
  });
});

describe("buildCustomerReceivableSegments", () => {
  it("adds source breakdown tooltips for each receivable segment", () => {
    const segments = buildCustomerReceivableSegments([
      {
        id: "order-pending",
        source: "guest_shop",
        order_status: "pending",
        payment_status: "unpaid",
        customer_order_item: [
          {
            final_quantity: 2,
            unit_price: 100,
          },
        ],
        payment: [],
      } as unknown as AdminOrder,
      {
        id: "order-unpaid",
        source: "admin_manual",
        order_status: "processing",
        payment_status: "unpaid",
        customer_order_item: [
          {
            final_quantity: 1,
            unit_price: 250,
          },
        ],
        payment: [],
      } as unknown as AdminOrder,
    ]);

    expect(segments).toHaveLength(2);
    expect(segments.find((segment) => segment.bucket === "pending")).toEqual(
      expect.objectContaining({
        receivable: 200,
        tooltip: expect.stringContaining("Shop:"),
      }),
    );
    expect(segments.find((segment) => segment.bucket === "unpaid")).toEqual(
      expect.objectContaining({
        receivable: 250,
        tooltip: expect.stringContaining("Manual:"),
      }),
    );
    expect(segments.find((segment) => segment.bucket === "pending")?.tooltip).toContain(
      "Pending",
    );
    expect(segments.find((segment) => segment.bucket === "unpaid")?.tooltip).toContain(
      "Unpaid",
    );
  });
});

describe("buildCustomerPaymentRows", () => {
  it("flattens payments across orders and sorts newest first", () => {
    const rows = buildCustomerPaymentRows(
      [
        createOrder("order-a", [
          {
            id: "payment-1",
            amount: 100,
            payment_method: "cash",
            payment_terms: "full",
            payment_date: "2026-01-01",
            reference_number: "REF-1",
            notes: "First payment",
            created_at: "2026-01-01T08:00:00.000Z",
          },
        ]),
        createOrder("order-b", [
          {
            id: "payment-2",
            amount: 250,
            payment_method: "bank_transfer",
            payment_terms: "partial",
            payment_date: "2026-02-01",
            reference_number: null,
            notes: null,
            created_at: "2026-02-01T08:00:00.000Z",
          },
        ]),
      ],
      encodeURIComponent("/admin/customers/customer-1"),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe("payment-2");
    expect(rows[1]?.order_id).toBe("order-a");
    expect(rows[0]?.href).toContain("tab=payment-record");
  });
});

describe("filterCustomerPaymentRows", () => {
  const rows = buildCustomerPaymentRows(
    [
      createOrder("order-a", [
        {
          id: "payment-1",
          amount: 100,
          payment_method: "cash",
          payment_terms: "full",
          payment_date: "2026-01-01",
          reference_number: "REF-ALPHA",
          notes: "Paid in store",
          created_at: "2026-01-01T08:00:00.000Z",
        },
      ]),
    ],
    encodeURIComponent("/admin/customers/customer-1"),
  );

  it("filters by reference number and order id", () => {
    expect(filterCustomerPaymentRows(rows, "ref-alpha")).toHaveLength(1);
    expect(filterCustomerPaymentRows(rows, "order-a")).toHaveLength(1);
    expect(filterCustomerPaymentRows(rows, "missing")).toHaveLength(0);
  });
});
