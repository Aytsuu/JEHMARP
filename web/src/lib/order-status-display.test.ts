import { describe, expect, it } from "vitest";

import {
  getOrderStatusBadgeLabel,
  getOrderStatusOptionLabel,
} from "./order-status-display";

describe("order status display labels", () => {
  it("uses status names on badges", () => {
    expect(getOrderStatusBadgeLabel("processing")).toBe("Processing");
    expect(getOrderStatusBadgeLabel("closed")).toBe("Closed");
  });

  it("uses Open only as the reopen action label in the status picker", () => {
    expect(getOrderStatusOptionLabel("closed", "processing")).toBe("Open");
    expect(getOrderStatusBadgeLabel("processing")).toBe("Processing");
    expect(getOrderStatusOptionLabel("pending", "processing")).toBe("Processing");
  });
});
