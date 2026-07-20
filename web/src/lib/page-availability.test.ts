import { describe, expect, it } from "vitest";

import {
  getDashboardPageAvailability,
  getDashboardRouteStatuses,
  normalizePageStatus,
} from "./page-availability";

describe("normalizePageStatus", () => {
  it("defaults missing page status values to ready", () => {
    expect(normalizePageStatus(undefined)).toBe("ready");
    expect(normalizePageStatus("")).toBe("ready");
  });

  it("normalizes supported page status values", () => {
    expect(normalizePageStatus("ready")).toBe("ready");
    expect(normalizePageStatus("maintenance")).toBe("maintenance");
    expect(normalizePageStatus("not ready")).toBe("not_ready");
    expect(normalizePageStatus("not-ready")).toBe("not_ready");
    expect(normalizePageStatus("not_ready")).toBe("not_ready");
  });

  it("fails closed for unsupported page status values", () => {
    expect(normalizePageStatus("beta")).toBe("not_ready");
  });
});

describe("getDashboardPageAvailability", () => {
  it("marks exact dashboard pages from env values", () => {
    expect(
      getDashboardPageAvailability("/admin/orders", {
        PAGE_STATUS_ADMIN_ORDERS: "maintenance",
      }),
    ).toMatchObject({
      href: "/admin/orders",
      label: "Orders",
      status: "maintenance",
    });
  });

  it("inherits status for child detail pages from the nearest sidebar route", () => {
    expect(
      getDashboardPageAvailability("/admin/orders/customer/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb", {
        PAGE_STATUS_ADMIN_ORDERS: "not ready",
      }),
    ).toMatchObject({
      href: "/admin/orders",
      label: "Orders",
      status: "not_ready",
    });
  });

  it("keeps unmatched and unset pages ready", () => {
    expect(getDashboardPageAvailability("/admin/products", {})).toMatchObject({
      href: "/admin/products",
      status: "ready",
    });
    expect(getDashboardPageAvailability("/admin/unknown", {})).toMatchObject({
      href: "/admin/unknown",
      status: "ready",
    });
  });
});

describe("getDashboardRouteStatuses", () => {
  it("returns status records keyed by sidebar href", () => {
    expect(
      getDashboardRouteStatuses({
        PAGE_STATUS_ADMIN_DASHBOARD: "ready",
        PAGE_STATUS_ADMIN_ORDERS: "maintenance",
        PAGE_STATUS_AGENT_PROFILE: "not_ready",
      }),
    ).toMatchObject({
      "/admin": {
        status: "ready",
        envKey: "PAGE_STATUS_ADMIN_DASHBOARD",
      },
      "/admin/orders": {
        status: "maintenance",
        envKey: "PAGE_STATUS_ADMIN_ORDERS",
      },
      "/agent/profile": {
        status: "not_ready",
        envKey: "PAGE_STATUS_AGENT_PROFILE",
      },
    });
  });
});
