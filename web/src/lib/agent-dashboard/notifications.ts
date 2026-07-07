import type { AgentDashboardData } from "./data";
import { formatCurrency, fullName } from "./view";

export type AgentNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  date: string;
  link: string;
  severity: "warning" | "info" | "success";
};

type AgentNotificationSource = Pick<AgentDashboardData, "orders" | "summary">;

function buildAgentActionNotifications(
  data: AgentNotificationSource,
): AgentNotification[] {
  const notifications: AgentNotification[] = [];

  data.orders.forEach((order) => {
    if (order.order_status === "submitted") {
      notifications.push({
        id: `agent-order-pending-${order.id}`,
        type: "Order Status",
        title: "Order submitted for review",
        message: `Order #${order.id.slice(0, 8)} for customer ${order.customer ? fullName(order.customer) : "Guest"} is pending admin approval.`,
        date: order.created_at,
        link: `/agent/orders/${order.id}`,
        severity: "warning",
      });
    } else if (order.order_status === "approved" && order.payment_status === "unpaid") {
      notifications.push({
        id: `agent-order-unpaid-${order.id}`,
        type: "Payment Alert",
        title: "Order approved, payment pending",
        message: `Order #${order.id.slice(0, 8)} for customer ${order.customer ? fullName(order.customer) : "Guest"} is approved. Please follow up on payment.`,
        date: order.created_at,
        link: `/agent/orders/${order.id}`,
        severity: "info",
      });
    }
  });

  if (data.summary.monthlyEarnings > 0) {
    notifications.push({
      id: "earnings-summary",
      type: "Commission Alert",
      title: "Monthly Earnings Summary",
      message: `Your total monthly commission earnings stand at ${formatCurrency(data.summary.monthlyEarnings)}. Check Earnings tab for details.`,
      date: new Date().toISOString(),
      link: "/agent/earnings",
      severity: "success",
    });
  }

  return notifications;
}

export function buildAgentNotifications(
  data: AgentNotificationSource,
): AgentNotification[] {
  const notifications = buildAgentActionNotifications(data);

  if (notifications.length > 0) {
    return notifications;
  }

  return [
    {
      id: "agent-welcome",
      type: "System",
      title: "Welcome to your Agent Portal",
      message:
        "No current alerts. Go to Orders to submit a new sales workflow or Earnings to view commission summaries.",
      date: new Date().toISOString(),
      link: "/agent",
      severity: "success",
    },
  ];
}

export function getAgentUnreadNotificationIds(
  data: AgentNotificationSource,
): string[] {
  return buildAgentActionNotifications(data).map((notification) => notification.id);
}
