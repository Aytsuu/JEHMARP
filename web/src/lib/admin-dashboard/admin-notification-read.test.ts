import { describe, expect, it, vi } from "vitest";

import {
  getRegularCheckNotificationIdsForCustomer,
  upsertAdminNotificationReads,
} from "./admin-notification-read";

describe("admin notification read", () => {
  it("upserts unique notification ids", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: () => ({ upsert }),
    };

    await upsertAdminNotificationReads(
      supabase,
      [
        "unpaid-check-customer-1-1w",
        "unpaid-check-customer-1-1w",
        "unpaid-check-customer-2-2w",
      ],
      "admin-user-id",
    );

    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          notification_id: "unpaid-check-customer-1-1w",
          admin_read_by: "admin-user-id",
        }),
        expect.objectContaining({
          notification_id: "unpaid-check-customer-2-2w",
          admin_read_by: "admin-user-id",
        }),
      ],
      { onConflict: "notification_id" },
    );
  });

  it("returns regular-check ids for a single customer", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");

    expect(
      getRegularCheckNotificationIdsForCustomer(
        "customer-1",
        [
          {
            id: "order-1",
            customer_id: "customer-1",
            payment_status: "unpaid",
            approved_at: "2026-07-15T12:00:00.000Z",
            created_at: "2026-07-15T12:00:00.000Z",
            customer: { first_name: "Ada", last_name: "Buyer" },
            customer_order_item: [
              {
                partial_quantity: 1,
                final_quantity: 1,
                unit_price: 100,
                agent_commission_amount: 0,
              },
            ],
            payment: [],
            invoice: [],
          } as never,
          {
            id: "order-2",
            customer_id: "customer-2",
            payment_status: "unpaid",
            approved_at: "2026-07-15T12:00:00.000Z",
            created_at: "2026-07-15T12:00:00.000Z",
            customer: null,
            customer_order_item: [
              {
                partial_quantity: 1,
                final_quantity: 1,
                unit_price: 100,
                agent_commission_amount: 0,
              },
            ],
            payment: [],
            invoice: [],
          } as never,
        ],
        [{ id: "customer-1", first_name: "Ada", last_name: "Buyer" } as never],
        now,
      ),
    ).toEqual(["unpaid-check-customer-1-1w"]);
  });
});
