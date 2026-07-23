export type OrderDetailNavEntry = {
  id: string;
  code: string;
  createdAt: string;
  href: string;
  isCurrent: boolean;
};

export function formatOrderCode(orderId: string): string {
  return `Order-${orderId.slice(0, 6).toUpperCase()}`;
}

export function buildOrderDetailNavEntries<T extends { id: string; created_at: string }>(
  options: {
    orders: readonly T[];
    currentOrderId: string;
    buildHref: (order: T) => string;
  },
): OrderDetailNavEntry[] {
  return [...options.orders]
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    )
    .map((order) => ({
      id: order.id,
      code: formatOrderCode(order.id),
      createdAt: order.created_at,
      href: options.buildHref(order),
      isCurrent: order.id === options.currentOrderId,
    }));
}
