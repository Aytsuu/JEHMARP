import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatTrackingCurrency,
  formatTrackingLookupDate,
  formatTrackingOrderStatus,
  formatNewCustomerTrackingFeedback,
  lookupCustomerOrdersByTrackingNumber,
  normalizeCustomerTrackingNumber,
  sumTrackingOrderAmountsDue,
} from "./customer-tracking";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("normalizeCustomerTrackingNumber", () => {
  it("normalizes valid tracking numbers", () => {
    expect(normalizeCustomerTrackingNumber(" jhm-abcd2345 ")).toBe("JHM-ABCD2345");
  });

  it("rejects invalid tracking numbers", () => {
    expect(normalizeCustomerTrackingNumber("JHM-ABC")).toBeNull();
    expect(normalizeCustomerTrackingNumber("ORDER-12345678")).toBeNull();
    expect(normalizeCustomerTrackingNumber("JHM-ABCD234O")).toBeNull();
  });
});

describe("lookupCustomerOrdersByTrackingNumber", () => {
  it("returns parsed orders from the trusted RPC", async () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");

    const rpc = vi.fn(() => Promise.resolve({
      data: {
        trackingNumber: "JHM-ABCD2345",
        totalAmountDue: 300,
        orders: [
          {
            id: "order-1",
            orderStatus: "pending",
            paymentStatus: "unpaid",
            source: "guest_shop",
            createdAt: "2026-07-23T04:00:00.000Z",
            orderTotal: 300,
            amountDue: 300,
            items: [
              {
                productName: "Pork Belly",
                quantity: 2,
                unitLabel: "kg",
                addDetails: "Cut small",
              },
            ],
          },
        ],
      },
      error: null,
    }));

    await expect(
      lookupCustomerOrdersByTrackingNumber("jhm-abcd2345", {
        supabase: { rpc } as never,
      }),
    ).resolves.toEqual({
      trackingNumber: "JHM-ABCD2345",
      totalAmountDue: 300,
      orders: [
        {
          id: "order-1",
          orderStatus: "pending",
          paymentStatus: "unpaid",
          source: "guest_shop",
          createdAt: "2026-07-23T04:00:00.000Z",
          orderTotal: 300,
          amountDue: 300,
          items: [
            {
              productName: "Pork Belly",
              quantity: 2,
              unitLabel: "kg",
              addDetails: "Cut small",
            },
          ],
        },
      ],
    });

    expect(rpc).toHaveBeenCalledWith("get_customer_orders_by_tracking_number", {
      p_tracking_number: "JHM-ABCD2345",
    });
  });

  it("returns null for invalid tracking numbers without calling the RPC", async () => {
    const rpc = vi.fn();

    await expect(
      lookupCustomerOrdersByTrackingNumber("invalid", {
        supabase: { rpc } as never,
      }),
    ).resolves.toBeNull();

    expect(rpc).not.toHaveBeenCalled();
  });

  it("derives total amount due from orders when the RPC omits it", async () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");

    const rpc = vi.fn(() => Promise.resolve({
      data: {
        trackingNumber: "JHM-ABCD2345",
        orders: [
          {
            id: "order-1",
            orderStatus: "processing",
            paymentStatus: "partial",
            source: "guest_shop",
            createdAt: "2026-07-23T04:00:00.000Z",
            orderTotal: 500,
            amountDue: 200,
            items: [],
          },
          {
            id: "order-2",
            orderStatus: "closed",
            paymentStatus: "paid",
            source: "guest_shop",
            createdAt: "2026-07-22T04:00:00.000Z",
            orderTotal: 150,
            amountDue: 0,
            items: [],
          },
        ],
      },
      error: null,
    }));

    await expect(
      lookupCustomerOrdersByTrackingNumber("JHM-ABCD2345", {
        supabase: { rpc } as never,
      }),
    ).resolves.toMatchObject({
      totalAmountDue: 200,
    });
  });
});

describe("new customer tracking feedback", () => {
  it("formats feedback when tracking email was sent", () => {
    expect(formatNewCustomerTrackingFeedback({
      baseMessage: "Customer created.",
      trackingNumber: "JHM-ABCD2345",
      emailStatus: "sent",
    })).toBe(
      "Customer created. Customer tracking number JHM-ABCD2345 was emailed to the customer.",
    );
  });

  it("formats feedback when email is not available", () => {
    expect(formatNewCustomerTrackingFeedback({
      baseMessage: "Order created.",
      trackingNumber: "JHM-ABCD2345",
      emailStatus: "skipped",
    })).toContain("Customer tracking number: JHM-ABCD2345");
  });
});

describe("tracking display helpers", () => {
  it("formats order statuses for public display", () => {
    expect(formatTrackingOrderStatus("in_transit")).toBe("In Transit");
  });

  it("formats lookup dates in Manila time", () => {
    expect(formatTrackingLookupDate("2026-07-23T04:00:00.000Z")).toMatch(/Jul 23, 2026/);
  });

  it("formats currency amounts in PHP", () => {
    expect(formatTrackingCurrency(300)).toContain("300");
  });

  it("sums remaining balances across orders", () => {
    expect(sumTrackingOrderAmountsDue([
      { amountDue: 200 } as never,
      { amountDue: 50.5 } as never,
    ])).toBe(250.5);
  });
});
