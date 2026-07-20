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
  registrationUrl?: string;
  expiresAt?: string;
};

type AgentNotificationSource = Pick<AgentDashboardData, "orders" | "summary" | "registrationLinks">;

function buildAgentActionNotifications(
  data: AgentNotificationSource,
): AgentNotification[] {
  const notifications: AgentNotification[] = [];

  data.orders.forEach((order) => {
    if (order.order_status === "pending") {
      notifications.push({
        id: `agent-order-pending-${order.id}`,
        type: "Order Status",
        title: "Order pending review",
        message: `Order #${order.id.slice(0, 8)} for customer ${order.customer ? fullName(order.customer) : "Guest"} is waiting for admin processing.`,
        date: order.created_at,
        link: `/agent/orders/${order.id}`,
        severity: "warning",
      });
    } else if (order.order_status === "processing" && order.payment_status === "unpaid") {
      notifications.push({
        id: `agent-order-unpaid-${order.id}`,
        type: "Payment Alert",
        title: "Order processing, payment pending",
        message: `Order #${order.id.slice(0, 8)} for customer ${order.customer ? fullName(order.customer) : "Guest"} is processing. Please follow up on payment.`,
        date: order.created_at,
        link: `/agent/orders/${order.id}`,
        severity: "info",
      });
    }
  });

  (data.registrationLinks ?? []).forEach((link) => {
    notifications.push({
      id: `customer-registration-link-${link.id}`,
      type: "Customer Registration",
      title: "Temporary customer registration link",
      message: "Copy this temporary link and share it with customers who need to register under an agent.",
      date: link.created_at,
      link: `/customer-registration/${link.token}`,
      registrationUrl: `/customer-registration/${link.token}`,
      expiresAt: link.expires_at,
      severity: "info",
    });
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
