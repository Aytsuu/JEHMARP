import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  initDashboardDetailLinkPrefetchOptOut,
  isDashboardAppPath,
  shouldDisableDashboardPrefetch,
} from "./dashboard-prefetch";

describe("dashboard prefetch helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("location", {
      ...window.location,
      origin: "https://jehmarp.example",
    });
    document.body.innerHTML = "";
  });

  it("detects dashboard app paths", () => {
    expect(isDashboardAppPath("/admin/orders")).toBe(true);
    expect(isDashboardAppPath("/agent/orders")).toBe(true);
    expect(isDashboardAppPath("/shop")).toBe(false);
  });

  it("disables prefetch for dashboard detail links but not PDFs", () => {
    expect(shouldDisableDashboardPrefetch("/admin/customers/123")).toBe(true);
    expect(
      shouldDisableDashboardPrefetch("/admin/orders/customer/123/order-slip.pdf"),
    ).toBe(false);
  });

  it("marks dashboard links without an explicit prefetch policy", () => {
    document.body.innerHTML = `
      <a href="/admin/customers/123">Customer</a>
      <a href="/admin/orders/customer/123/order-slip.pdf" target="_blank">PDF</a>
      <a href="/admin/orders" data-astro-prefetch="viewport">Orders</a>
    `;

    initDashboardDetailLinkPrefetchOptOut();

    expect(
      document.querySelector('a[href="/admin/customers/123"]')?.getAttribute(
        "data-astro-prefetch",
      ),
    ).toBe("false");
    expect(
      document
        .querySelector('a[href="/admin/orders/customer/123/order-slip.pdf"]')
        ?.hasAttribute("data-astro-prefetch"),
    ).toBe(false);
    expect(
      document.querySelector('a[href="/admin/orders"]')?.getAttribute(
        "data-astro-prefetch",
      ),
    ).toBe("viewport");
  });
});
