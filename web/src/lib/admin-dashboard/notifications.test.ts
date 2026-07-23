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
          admin_read_at: null,
          created_at: "2026-07-07T00:00:00.000Z",
        },
      ],
      orders: [
        {
          id: "order-1",
          order_status: "pending",
          source: "guest_shop",
          admin_read_at: null,
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
          admin_read_at: null,
          created_at: "2026-07-07T00:00:00.000Z",
        },
      ],
      customers: [],
      readAdminNotificationIds: [],
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

  it("sorts actionable notifications from recent to old across record types", () => {
    const data = {
      resellerApplications: [
        {
          id: "reseller-old",
          name: "Acme",
          planned_transaction_type: "Wholesale",
          expected_quantity_per_week: "12",
          application_status: "submitted",
          admin_read_at: null,
          created_at: "2026-07-07T00:00:00.000Z",
        },
      ],
      orders: [
        {
          id: "order-middle",
          order_status: "pending",
          source: "guest_shop",
          admin_read_at: null,
          created_at: "2026-07-07T01:00:00.000Z",
          customer: null,
        },
      ],
      contactInquiries: [
        {
          id: "inquiry-new",
          name: "John",
          message: "Need pricing details",
          inquiry_status: "new",
          admin_read_at: null,
          created_at: "2026-07-07T02:00:00.000Z",
        },
      ],
      customers: [],
      readAdminNotificationIds: [],
    } as unknown as Parameters<typeof buildAdminNotifications>[0];

    expect(buildAdminNotifications(data).map((notification) => notification.id)).toEqual([
      "inquiry-new-inquiry-new",
      "order-pending-order-middle",
      "reseller-app-reseller-old",
    ]);
  });

  it("ignores admin-created submitted orders in unread order badges", () => {
    const data = {
      resellerApplications: [],
      orders: [
        {
          id: "order-1",
          order_status: "pending",
          source: "admin_manual",
          admin_read_at: null,
          created_at: "2026-07-07T00:00:00.000Z",
          customer: null,
        },
      ],
      contactInquiries: [],
      customers: [],
      readAdminNotificationIds: [],
    } as unknown as Parameters<typeof getAdminUnreadNotificationIds>[0];

    expect(getUnreadAdminOrderIds(data)).toEqual([]);
    expect(getAdminUnreadNotificationIds(data)).toEqual([]);
  });

  it("includes regular check notifications for aged unpaid orders", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");
    const data = {
      resellerApplications: [],
      orders: [
        {
          id: "order-unpaid",
          customer_id: "customer-1",
          order_status: "processing",
          source: "guest_shop",
          payment_status: "unpaid",
          approved_at: "2026-07-15T12:00:00.000Z",
          created_at: "2026-07-15T12:00:00.000Z",
          updated_at: "2026-07-15T12:00:00.000Z",
          admin_read_at: null,
          customer: {
            first_name: "Ada",
            last_name: "Buyer",
          },
          customer_order_item: [
            {
              id: "item-1",
              quantity: 1,
              final_quantity: 1,
              unit_price: 100,
              agent_commission_amount: 0,
            },
          ],
          payment: [],
          invoice: [],
        },
      ],
      contactInquiries: [],
      customers: [
        {
          id: "customer-1",
          first_name: "Ada",
          last_name: "Buyer",
        },
      ],
      readAdminNotificationIds: [],
    } as unknown as Parameters<typeof buildAdminNotifications>[0];

    const notifications = buildAdminNotifications(data, now);

    expect(notifications).toEqual([
      expect.objectContaining({
        id: "unpaid-check-customer-1-1w",
        type: "Regular Check",
        isUnread: true,
        message: "Ada Buyer has 1 unpaid order at 1 week unpaid.",
      }),
    ]);
    expect(getAdminUnreadNotificationIds(data, now)).toEqual([
      "unpaid-check-customer-1-1w",
    ]);

    const readData = {
      ...data,
      readAdminNotificationIds: ["unpaid-check-customer-1-1w"],
    } as unknown as Parameters<typeof buildAdminNotifications>[0];

    expect(getAdminUnreadNotificationIds(readData, now)).toEqual([]);
    expect(buildAdminNotifications(readData, now)[0]?.isUnread).toBe(false);
  });

  it("excludes records that have been marked read by an admin", () => {
    const data = {
      resellerApplications: [
        {
          id: "reseller-1",
          name: "Acme",
          planned_transaction_type: "Wholesale",
          expected_quantity_per_week: "12",
          application_status: "submitted",
          admin_read_at: "2026-07-07T01:00:00.000Z",
          created_at: "2026-07-07T00:00:00.000Z",
        },
      ],
      orders: [
        {
          id: "order-1",
          order_status: "pending",
          source: "guest_shop",
          admin_read_at: "2026-07-07T01:00:00.000Z",
          created_at: "2026-07-07T00:00:00.000Z",
          customer: null,
        },
      ],
      contactInquiries: [
        {
          id: "inquiry-1",
          name: "John",
          message: "Need pricing details",
          inquiry_status: "new",
          admin_read_at: "2026-07-07T01:00:00.000Z",
          created_at: "2026-07-07T00:00:00.000Z",
        },
      ],
      customers: [],
      readAdminNotificationIds: [],
    } as unknown as Parameters<typeof getAdminUnreadNotificationIds>[0];

    expect(getUnreadAdminResellerApplicationIds(data)).toEqual([]);
    expect(getUnreadAdminOrderIds(data)).toEqual([]);
    expect(getUnreadAdminInquiryIds(data)).toEqual([]);
    expect(getAdminUnreadNotificationIds(data)).toEqual([]);
    expect(buildAdminNotifications(data).map((notification) => notification.isUnread)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("returns a system notification when there are no actionable records", () => {
    const data = {
      resellerApplications: [],
      orders: [],
      contactInquiries: [],
      customers: [],
      readAdminNotificationIds: [],
    } as unknown as Parameters<typeof getAdminUnreadNotificationIds>[0];

    const notifications = buildAdminNotifications(data);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.id).toBe("system-welcome");
    expect(getAdminUnreadNotificationIds(data)).toEqual([]);
  });
});
