import { describe, expect, it } from "vitest";

import { isDashboardNavItemActive } from "@/lib/client/dashboard-nav";

describe("isDashboardNavItemActive", () => {
  it("matches exact dashboard roots only", () => {
    expect(isDashboardNavItemActive("/admin", "/admin")).toBe(true);
    expect(isDashboardNavItemActive("/admin/orders", "/admin")).toBe(false);
    expect(isDashboardNavItemActive("/agent", "/agent")).toBe(true);
    expect(isDashboardNavItemActive("/agent/orders", "/agent")).toBe(false);
  });

  it("matches nested section routes", () => {
    expect(isDashboardNavItemActive("/admin/orders", "/admin/orders")).toBe(true);
    expect(isDashboardNavItemActive("/admin/orders/agent/123", "/admin/orders")).toBe(
      true,
    );
    expect(isDashboardNavItemActive("/admin/customers", "/admin/orders")).toBe(false);
  });
});
