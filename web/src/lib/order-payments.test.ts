import { describe, expect, it } from "vitest";

import { sortOrderPaymentsDescending } from "./order-payments";

describe("sortOrderPaymentsDescending", () => {
  it("sorts payments with the latest record first", () => {
    const payments = [
      { id: "old", created_at: "2026-01-01T08:00:00.000Z", payment_date: "2026-01-01" },
      { id: "new", created_at: "2026-03-01T08:00:00.000Z", payment_date: "2026-03-01" },
      { id: "middle", created_at: "2026-02-01T08:00:00.000Z", payment_date: "2026-02-01" },
    ];

    expect(sortOrderPaymentsDescending(payments).map((payment) => payment.id)).toEqual([
      "new",
      "middle",
      "old",
    ]);
  });

  it("falls back to payment_date when created_at is missing", () => {
    const payments = [
      { id: "older", payment_date: "2026-01-15" },
      { id: "latest", payment_date: "2026-04-15" },
    ];

    expect(sortOrderPaymentsDescending(payments).map((payment) => payment.id)).toEqual([
      "latest",
      "older",
    ]);
  });
});
