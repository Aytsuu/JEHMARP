export type OrderCreditLimitWarningInput = {
  currentBalance: number;
  creditLimit: number;
  orderTotal: number;
  downpaymentAmount: number;
  isAgentOrder: boolean;
};

export type OrderCreditLimitWarning = {
  currentBalance: number;
  creditLimit: number;
  addedBalance: number;
  projectedBalance: number;
};

export function getOrderCreditLimitWarning(
  input: OrderCreditLimitWarningInput,
): OrderCreditLimitWarning | null {
  if (input.isAgentOrder) return null;

  const downpaymentAmount = Number.isFinite(input.downpaymentAmount)
    ? input.downpaymentAmount
    : 0;
  const addedBalance = Math.max(input.orderTotal - downpaymentAmount, 0);
  const projectedBalance = input.currentBalance + addedBalance;

  if (
    !Number.isFinite(input.currentBalance) ||
    !Number.isFinite(input.creditLimit) ||
    !Number.isFinite(input.orderTotal) ||
    projectedBalance <= 0 ||
    projectedBalance <= input.creditLimit
  ) {
    return null;
  }

  return {
    currentBalance: input.currentBalance,
    creditLimit: input.creditLimit,
    addedBalance,
    projectedBalance,
  };
}
