import { describe, expect, it } from "vitest";

import { calculateOrderItemsTotal } from "./order-total";

describe("calculateOrderItemsTotal", () => {
  it("sums quantity and unit price pairs", () => {
    expect(calculateOrderItemsTotal([
      { quantity: 2, unitPrice: 150 },
      { quantity: 1.5, unitPrice: 80 },
    ])).toBe(420);
  });

  it("ignores incomplete item rows while agents are editing the form", () => {
    expect(calculateOrderItemsTotal([
      { quantity: Number.NaN, unitPrice: 150 },
      { quantity: 3, unitPrice: Number.NaN },
      { quantity: 4, unitPrice: 25 },
    ])).toBe(100);
  });
});
