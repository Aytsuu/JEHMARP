import { describe, expect, it } from "vitest";

import { buildAgentNotifications, getAgentUnreadNotificationIds } from "./notifications";

describe("agent notifications", () => {
  it("builds unread notification ids from agent order and earnings alerts", () => {
    const data = {
      orders: [
        {
          id: "order-1",
          order_status: "submitted",
          payment_status: "unpaid",
          created_at: "2026-07-07T00:00:00.000Z",
          customer: {
            first_name: "Jane",
            last_name: "Doe",
          },
        },
        {
          id: "order-2",
          order_status: "approved",
          payment_status: "unpaid",
          created_at: "2026-07-07T00:00:00.000Z",
          customer: null,
        },
      ],
      summary: {
        monthlyEarnings: 1500,
      },
    } as unknown as Parameters<typeof getAgentUnreadNotificationIds>[0];

    expect(getAgentUnreadNotificationIds(data)).toEqual([
      "agent-order-pending-order-1",
      "agent-order-unpaid-order-2",
      "earnings-summary",
    ]);
  });

  it("returns a system notification when there are no actionable records", () => {
    const data = {
      orders: [],
      summary: {
        monthlyEarnings: 0,
      },
    } as unknown as Parameters<typeof getAgentUnreadNotificationIds>[0];

    const notifications = buildAgentNotifications(data);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.id).toBe("agent-welcome");
    expect(getAgentUnreadNotificationIds(data)).toEqual([]);
  });
});
