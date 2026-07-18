import { describe, expect, it } from "vitest";

import { resolveStatusBadgeVariant } from "./status-badge";

describe("resolveStatusBadgeVariant", () => {
  it("maps order and payment statuses to semantic variants", () => {
    expect(resolveStatusBadgeVariant("order", "pending")).toBe("warning");
    expect(resolveStatusBadgeVariant("order", "processing")).toBe("info");
    expect(resolveStatusBadgeVariant("payment", "unpaid")).toBe("danger");
    expect(resolveStatusBadgeVariant("payment", "paid")).toBe("success");
  });

  it("maps inquiry, agent, and stock statuses", () => {
    expect(resolveStatusBadgeVariant("inquiry", "new")).toBe("info");
    expect(resolveStatusBadgeVariant("agent", "suspended")).toBe("danger");
    expect(resolveStatusBadgeVariant("stock", "out_of_stock")).toBe("danger");
  });

  it("falls back to neutral for unknown statuses", () => {
    expect(resolveStatusBadgeVariant("order", "unknown")).toBe("neutral");
  });
});
