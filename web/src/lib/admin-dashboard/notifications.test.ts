import { describe, expect, it } from "vitest";

import {
  buildAdminNotifications,
  getAdminUnreadNotificationIds,
  getUnreadAdminInquiryIds,
  getUnreadAdminOrderIds,
  getUnreadAdminResellerApplicationIds,
} from "./notifications";

describe("admin notifications", () => {
  it("builds actionable unread notification ids from pending records", () => {
    const data = {
      resellerApplications: [
        {
          id: "reseller-1",
          name: "Acme",
          planned_transaction_type: "Wholesale",
          expected_quantity_per_week: "12",
          application_status: "submitted",
          created_at: "2026-07-07T00:00:00.000Z",
        },
      ],
      orders: [
        {
          id: "order-1",
          order_status: "submitted",
          created_at: "2026-07-07T00:00:00.000Z",
          customer: {
            first_name: "Jane",
            last_name: "Doe",
          },
        },
      ],
      contactInquiries: [
        {
          id: "inquiry-1",
          name: "John",
          message: "Need pricing details",
          inquiry_status: "new",
          created_at: "2026-07-07T00:00:00.000Z",
        },
      ],
    } as unknown as Parameters<typeof getAdminUnreadNotificationIds>[0];

    expect(getAdminUnreadNotificationIds(data)).toEqual([
      "reseller-app-reseller-1",
      "order-pending-order-1",
      "inquiry-new-inquiry-1",
    ]);
    expect(getUnreadAdminResellerApplicationIds(data)).toEqual(["reseller-1"]);
    expect(getUnreadAdminOrderIds(data)).toEqual(["order-1"]);
    expect(getUnreadAdminInquiryIds(data)).toEqual(["inquiry-1"]);
  });

  it("ignores admin-created submitted orders in unread order badges", () => {
    const data = {
      resellerApplications: [],
      orders: [
        {
          id: "order-1",
          order_status: "submitted",
          source: "admin_manual",
          created_at: "2026-07-07T00:00:00.000Z",
          customer: null,
        },
      ],
      contactInquiries: [],
    } as unknown as Parameters<typeof getAdminUnreadNotificationIds>[0];

    expect(getUnreadAdminOrderIds(data)).toEqual([]);
    expect(getAdminUnreadNotificationIds(data)).toEqual([]);
  });

  it("returns a system notification when there are no actionable records", () => {
    const data = {
      resellerApplications: [],
      orders: [],
      contactInquiries: [],
    } as unknown as Parameters<typeof getAdminUnreadNotificationIds>[0];

    const notifications = buildAdminNotifications(data);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.id).toBe("system-welcome");
    expect(getAdminUnreadNotificationIds(data)).toEqual([]);
  });
});
