export type OrderPaymentSortable = {
  created_at?: string | null;
  payment_date?: string | null;
};

export function sortOrderPaymentsDescending<T extends OrderPaymentSortable>(
  payments: readonly T[],
): T[] {
  return [...payments].sort((left, right) => {
    const leftValue = left.created_at ?? left.payment_date ?? "";
    const rightValue = right.created_at ?? right.payment_date ?? "";

    return rightValue.localeCompare(leftValue);
  });
}
