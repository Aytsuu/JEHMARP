import type { AdminDashboardData } from "./data";
import {
  buildAdminPagination,
  type AdminPaginatedResult,
  type AdminPaginationParams,
} from "./pagination";
import { fullName } from "./view";
import { buildUnpaidOrderCheckNotifications } from "./unpaid-order-checks";

export type AdminNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  date: string;
  link: string;
  severity: "warning" | "info" | "success";
  isUnread: boolean;
};

type AdminNotificationSource = Pick<
  AdminDashboardData,
  | "resellerApplications"
  | "orders"
  | "contactInquiries"
  | "customers"
  | "readAdminNotificationIds"
>;

export function getUnreadAdminResellerApplicationIds(
  data: AdminNotificationSource,
): string[] {
  return data.resellerApplications
    .filter(
      (application) =>
        application.application_status === "submitted" &&
        !application.admin_read_at,
    )
    .map((application) => application.id);
}

export function getUnreadAdminOrderIds(
  data: AdminNotificationSource,
): string[] {
  return data.orders
    .filter(
      (order) =>
        order.order_status === "pending" &&
        order.source !== "admin_manual" &&
        !order.admin_read_at,
    )
    .map((order) => order.id);
}

export function getUnreadAdminInquiryIds(
  data: AdminNotificationSource,
): string[] {
  return data.contactInquiries
    .filter(
      (inquiry) =>
        inquiry.inquiry_status === "new" && !inquiry.admin_read_at,
    )
    .map((inquiry) => inquiry.id);
}

function buildAdminActionNotifications(
  data: AdminNotificationSource,
  now = new Date(),
): AdminNotification[] {
  const notifications: AdminNotification[] = [];
  const readNotificationIds = new Set(data.readAdminNotificationIds);

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
        isUnread: !application.admin_read_at,
      });
    });

  data.orders
    .filter(
      (order) =>
        order.order_status === "pending" && order.source !== "admin_manual",
    )
    .forEach((order) => {
      notifications.push({
        id: `order-pending-${order.id}`,
        type: "Order Review",
        title: "Order pending review",
        message: `Order #${order.id.slice(0, 8)} for ${order.customer ? fullName(order.customer) : "Guest"} is awaiting status updates or payment verification.`,
        date: order.created_at,
        link: `/admin/orders/customer/${order.id}`,
        severity: "warning",
        isUnread: !order.admin_read_at,
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
        isUnread: !inquiry.admin_read_at,
      });
    });

  return sortNotificationsByDateDesc([
    ...notifications,
    ...buildUnpaidOrderCheckNotifications(
      data.orders,
      data.customers,
      readNotificationIds,
      now,
    ),
  ]);
}

export function buildAdminNotifications(
  data: AdminNotificationSource,
  now = new Date(),
): AdminNotification[] {
  const notifications = buildAdminActionNotifications(data, now);

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
      isUnread: false,
    },
  ];
}

export function paginateAdminNotifications(
  notifications: AdminNotification[],
  pagination: AdminPaginationParams,
): AdminPaginatedResult<AdminNotification> {
  const builtPagination = buildAdminPagination(notifications.length, pagination);
  const start = (builtPagination.page - 1) * builtPagination.pageSize;

  return {
    records: notifications.slice(start, start + builtPagination.pageSize),
    pagination: builtPagination,
  };
}

export type AdminNotificationsPageData = {
  notifications: AdminNotification[];
  pagination: AdminPaginatedResult<AdminNotification>["pagination"];
  unreadCount: number;
};

export function buildAdminNotificationsPageData(
  data: AdminNotificationSource,
  pagination: AdminPaginationParams,
  now = new Date(),
): AdminNotificationsPageData {
  const allNotifications = buildAdminNotifications(data, now);
  const paginatedNotifications = paginateAdminNotifications(allNotifications, pagination);

  return {
    notifications: paginatedNotifications.records,
    pagination: paginatedNotifications.pagination,
    unreadCount: allNotifications.filter((notification) => notification.isUnread).length,
  };
}

export function getAdminUnreadNotificationIds(
  data: AdminNotificationSource,
  now = new Date(),
): string[] {
  return buildAdminActionNotifications(data, now)
    .filter((notification) => notification.isUnread)
    .map((notification) => notification.id);
}

function sortNotificationsByDateDesc(notifications: AdminNotification[]) {
  return [...notifications].sort(
    (left, right) => Date.parse(right.date) - Date.parse(left.date),
  );
}
