import { describe, expect, it } from "vitest";

import { getOrderCreditLimitWarning } from "./order-credit-limit";

describe("getOrderCreditLimitWarning", () => {
  it("warns for new customer orders that exceed the default credit limit", () => {
    expect(getOrderCreditLimitWarning({
      currentBalance: 0,
      creditLimit: 1000,
      orderTotal: 1200,
      downpaymentAmount: 0,
      isAgentOrder: false,
    })).toEqual({
      currentBalance: 0,
      creditLimit: 1000,
      addedBalance: 1200,
      projectedBalance: 1200,
    });
  });

  it("does not warn when downpayment keeps the projected balance within the credit limit", () => {
    expect(getOrderCreditLimitWarning({
      currentBalance: 0,
      creditLimit: 1000,
      orderTotal: 1200,
      downpaymentAmount: 300,
      isAgentOrder: false,
    })).toBeNull();
  });

  it("warns for existing customers when the new unpaid amount exceeds their credit limit", () => {
    expect(getOrderCreditLimitWarning({
      currentBalance: 700,
      creditLimit: 1000,
      orderTotal: 400,
      downpaymentAmount: 0,
      isAgentOrder: false,
    })).toMatchObject({
      addedBalance: 400,
      projectedBalance: 1100,
    });
  });

  it("does not warn for agent orders", () => {
    expect(getOrderCreditLimitWarning({
      currentBalance: 0,
      creditLimit: 1000,
      orderTotal: 2000,
      downpaymentAmount: 0,
      isAgentOrder: true,
    })).toBeNull();
  });
});
