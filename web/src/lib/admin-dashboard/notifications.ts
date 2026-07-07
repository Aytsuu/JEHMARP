import type { AdminDashboardData } from "./data";
import { fullName } from "./view";

export type AdminNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  date: string;
  link: string;
  severity: "warning" | "info" | "success";
};

type AdminNotificationSource = Pick<
  AdminDashboardData,
  "resellerApplications" | "orders" | "contactInquiries"
>;

export function getUnreadAdminResellerApplicationIds(
  data: AdminNotificationSource,
): string[] {
  return data.resellerApplications
    .filter((application) => application.application_status === "submitted")
    .map((application) => application.id);
}

export function getUnreadAdminOrderIds(
  data: AdminNotificationSource,
): string[] {
  return data.orders
    .filter(
      (order) =>
        order.order_status === "submitted" && order.source !== "admin_manual",
    )
    .map((order) => order.id);
}

export function getUnreadAdminInquiryIds(
  data: AdminNotificationSource,
): string[] {
  return data.contactInquiries
    .filter((inquiry) => inquiry.inquiry_status === "new")
    .map((inquiry) => inquiry.id);
}

function buildAdminActionNotifications(
  data: AdminNotificationSource,
): AdminNotification[] {
  const notifications: AdminNotification[] = [];

  data.resellerApplications
    .filter((application) => application.application_status === "submitted")
    .forEach((application) => {
      notifications.push({
        id: `reseller-app-${application.id}`,
        type: "Reseller Application",
        title: "New reseller application submitted",
        message: `${application.name} (${application.planned_transaction_type}) is waiting for approval. Expected weekly volume: ${application.expected_quantity_per_week} boxes.`,
        date: application.created_at,
        link: "/admin/reseller-applications",
        severity: "warning",
      });
    });

  data.orders
    .filter(
      (order) =>
        order.order_status === "submitted" && order.source !== "admin_manual",
    )
    .forEach((order) => {
      notifications.push({
        id: `order-pending-${order.id}`,
        type: "Order Review",
        title: "Order pending review",
        message: `Order #${order.id.slice(0, 8)} for ${order.customer ? fullName(order.customer) : "Guest"} is awaiting status updates or payment verification.`,
        date: order.created_at,
        link: `/admin/orders/${order.id}`,
        severity: "warning",
      });
    });

  data.contactInquiries
    .filter((inquiry) => inquiry.inquiry_status === "new")
    .forEach((inquiry) => {
      notifications.push({
        id: `inquiry-new-${inquiry.id}`,
        type: "Customer Inquiry",
        title: "New inquiry received",
        message: `Inquiry from ${inquiry.name}: "${inquiry.message.slice(0, 60)}${inquiry.message.length > 60 ? "..." : ""}"`,
        date: inquiry.created_at,
        link: "/admin/inquiries",
        severity: "info",
      });
    });

  return notifications;
}

export function buildAdminNotifications(
  data: AdminNotificationSource,
): AdminNotification[] {
  const notifications = buildAdminActionNotifications(data);

  if (notifications.length > 0) {
    return notifications;
  }

  return [
    {
      id: "system-welcome",
      type: "System",
      title: "All systems functional",
      message:
        "No urgent actions required. Database status, rate limit logs, and email microservices are fully synchronized.",
      date: new Date().toISOString(),
      link: "/admin",
      severity: "success",
    },
  ];
}

export function getAdminUnreadNotificationIds(
  data: AdminNotificationSource,
): string[] {
  return buildAdminActionNotifications(data).map((notification) => notification.id);
}
