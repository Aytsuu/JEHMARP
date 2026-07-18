export type OrderTotalItem = {
  quantity: number;
  unitPrice: number;
};

export function calculateOrderItemsTotal(items: Iterable<OrderTotalItem>) {
  return Array.from(items).reduce((total, item) => {
    if (!Number.isFinite(item.quantity) || !Number.isFinite(item.unitPrice)) {
      return total;
    }

    return total + item.quantity * item.unitPrice;
  }, 0);
}
