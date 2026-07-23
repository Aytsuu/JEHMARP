import type { AdminCustomer, AdminOrder } from "./data";
import { fullName, orderBalance } from "./view";

import type { AdminNotification } from "./notifications";

export const UNPAID_ORDER_CHECK_THRESHOLDS = [
  { key: "3d", days: 3, label: "3 days unpaid" },
  { key: "1w", days: 7, label: "1 week unpaid" },
  { key: "2w", days: 14, label: "2 weeks unpaid" },
  { key: "1m", days: 30, label: "1 month unpaid" },
] as const;

export type UnpaidOrderCheckThresholdKey =
  (typeof UNPAID_ORDER_CHECK_THRESHOLDS)[number]["key"];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type UnpaidOrderCheckGroup = {
  customerId: string;
  customerName: string;
  thresholdKey: UnpaidOrderCheckThresholdKey;
  thresholdLabel: string;
  thresholdDays: number;
  orderCount: number;
  latestUnpaidAt: string;
};

export function buildUnpaidOrderCheckNotifications(
  orders: readonly AdminOrder[],
  customers: readonly AdminCustomer[],
  readNotificationIds: ReadonlySet<string> = new Set(),
  now = new Date(),
): AdminNotification[] {
  const groups = groupUnpaidOrdersByCustomerThreshold(orders, customers, now);

  return groups.map((group) => {
    const id = `unpaid-check-${group.customerId}-${group.thresholdKey}`;

    return {
      id,
      type: "Regular Check",
      title: "Unpaid order follow-up",
      message: formatUnpaidOrderCheckMessage(group),
      date: group.latestUnpaidAt,
      link: `/admin/customers/${group.customerId}`,
      severity: group.thresholdDays >= 30 ? "warning" : group.thresholdDays >= 14 ? "warning" : "info",
      isUnread: !readNotificationIds.has(id),
    };
  });
}

export function getUnpaidOrderCheckNotificationIds(
  orders: readonly AdminOrder[],
  customers: readonly AdminCustomer[],
  now = new Date(),
): string[] {
  return buildUnpaidOrderCheckNotifications(orders, customers, new Set(), now).map(
    (notification) => notification.id,
  );
}

function groupUnpaidOrdersByCustomerThreshold(
  orders: readonly AdminOrder[],
  customers: readonly AdminCustomer[],
  now: Date,
): UnpaidOrderCheckGroup[] {
  const groups = new Map<string, UnpaidOrderCheckGroup>();

  for (const order of orders) {
    if (!isUnpaidOrderCandidate(order)) {
      continue;
    }

    const threshold = resolveUnpaidOrderThreshold(order, now);
    if (!threshold) {
      continue;
    }

    const customerId = order.customer_id;
    const groupKey = `${customerId}:${threshold.key}`;
    const customerName = fullName(
      order.customer ?? customers.find((customer) => customer.id === customerId) ?? null,
    );
    const unpaidSince = getUnpaidSinceDate(order);
    const current = groups.get(groupKey);

    if (!current) {
      groups.set(groupKey, {
        customerId,
        customerName,
        thresholdKey: threshold.key,
        thresholdLabel: threshold.label,
        thresholdDays: threshold.days,
        orderCount: 1,
        latestUnpaidAt: unpaidSince,
      });
      continue;
    }

    groups.set(groupKey, {
      ...current,
      orderCount: current.orderCount + 1,
      latestUnpaidAt:
        Date.parse(unpaidSince) > Date.parse(current.latestUnpaidAt)
          ? unpaidSince
          : current.latestUnpaidAt,
    });
  }

  return [...groups.values()].sort(
    (left, right) =>
      right.thresholdDays - left.thresholdDays ||
      right.orderCount - left.orderCount ||
      left.customerName.localeCompare(right.customerName),
  );
}

function isUnpaidOrderCandidate(order: AdminOrder): boolean {
  return (
    (order.payment_status === "unpaid" || order.payment_status === "partial") &&
    orderBalance(order) > 0
  );
}

function getUnpaidSinceDate(order: AdminOrder): string {
  return order.approved_at ?? order.created_at;
}

function resolveUnpaidOrderThreshold(
  order: AdminOrder,
  now: Date,
): (typeof UNPAID_ORDER_CHECK_THRESHOLDS)[number] | null {
  const daysUnpaid = Math.floor(
    (now.getTime() - new Date(getUnpaidSinceDate(order)).getTime()) / MS_PER_DAY,
  );

  if (daysUnpaid < UNPAID_ORDER_CHECK_THRESHOLDS[0].days) {
    return null;
  }

  let matchedThreshold: (typeof UNPAID_ORDER_CHECK_THRESHOLDS)[number] | null = null;

  for (const threshold of UNPAID_ORDER_CHECK_THRESHOLDS) {
    if (daysUnpaid >= threshold.days) {
      matchedThreshold = threshold;
    }
  }

  return matchedThreshold;
}

function formatUnpaidOrderCheckMessage(group: UnpaidOrderCheckGroup): string {
  const orderLabel = group.orderCount === 1 ? "unpaid order" : "unpaid orders";

  return `${group.customerName} has ${group.orderCount} ${orderLabel} at ${group.thresholdLabel}.`;
}
