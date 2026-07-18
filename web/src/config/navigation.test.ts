import { describe, expect, it } from "vitest";

import { adminDashboardRoutes, agentDashboardRoutes, primaryNavigation } from "./navigation";

describe("primaryNavigation", () => {
  it("defines the public routes and a single shared login route", () => {
    expect(primaryNavigation).toEqual([
      { label: "Home", href: "/" },
      { label: "Our Story", href: "/our-story" },
      { label: "Shop", href: "/shop" },
      { label: "Business", href: "/business" },
      { label: "Contact", href: "/contact" },
      { label: "Login", href: "/login" },
    ]);
  });

  it("does not define duplicate route hrefs", () => {
    const hrefs = primaryNavigation.map((item) => item.href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("dashboard routes", () => {
  it("defines admin operations separately from public navigation", () => {
    expect(adminDashboardRoutes).toEqual([
      { label: "Dashboard", href: "/admin" },
      { label: "Products", href: "/admin/products" },
      { label: "Customers", href: "/admin/customers" },
      { label: "Agents", href: "/admin/agents" },
      { label: "Orders", href: "/admin/orders" },
      { label: "Sales", href: "/admin/sales" },
      { label: "Invoices", href: "/admin/invoices" },
      { label: "Inquiries", href: "/admin/inquiries" },
      { label: "Reseller Applications", href: "/admin/reseller-applications" },
      { label: "Activity", href: "/admin/activity" },
      { label: "Notifications", href: "/admin/notifications" },
      { label: "Content", href: "/admin/content" },
    ]);
  });

  it("uses a dedicated reseller application admin surface", () => {
    expect(adminDashboardRoutes.map((item) => item.href)).toContain("/admin/reseller-applications");
    expect(adminDashboardRoutes.map((item) => item.label)).toContain("Reseller Applications");
    expect(adminDashboardRoutes.map((item) => item.href)).not.toContain("/admin/resellers");
    expect(adminDashboardRoutes.map((item) => item.label)).not.toContain("Resellers");
  });

  it("defines agent operations separately from public navigation", () => {
    expect(agentDashboardRoutes).toEqual([
      { label: "Dashboard", href: "/agent" },
      { label: "My Earnings", href: "/agent/earnings" },
      { label: "Customers", href: "/agent/customers" },
      { label: "My Orders", href: "/agent/orders" },
      { label: "Payments", href: "/agent/payments" },
      { label: "Notifications", href: "/agent/notifications" },
    ]);
  });

  it("uses separate agent page routes instead of single-page hash anchors", () => {
    expect(agentDashboardRoutes.every((item) => !item.href.includes("#"))).toBe(true);
  });

  it("does not include public routes in dashboard sidebars", () => {
    const publicLabels = primaryNavigation.map((item) => item.label);
    const dashboardLabels = [...adminDashboardRoutes, ...agentDashboardRoutes].map(
      (item) => item.label,
    );

    expect(dashboardLabels).not.toContain("Shop");
    expect(dashboardLabels).not.toContain("Business");
    expect(dashboardLabels).not.toContain("Login");
    expect(publicLabels).toContain("Shop");
  });
});
