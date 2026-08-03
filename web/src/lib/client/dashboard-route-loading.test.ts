import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initDashboardRouteLoading } from "./dashboard-route-loading";

describe("initDashboardRouteLoading", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main class="admin-content-dashboard-main">
        <div
          class="dashboard-route-skeleton"
          data-dashboard-route-skeleton
          hidden
          aria-hidden="true"
        ></div>
        <div class="admin-content-dashboard-main__content">Preview</div>
      </main>
      <a href="/admin/orders" data-dashboard-nav-link>Orders</a>
    `;
    initDashboardRouteLoading();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.body.className = "";
  });

  it("shows the route skeleton immediately on admin content shell navigation", () => {
    const link = document.querySelector<HTMLAnchorElement>(
      "[data-dashboard-nav-link]",
    )!;
    link.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );

    const skeleton = document.querySelector<HTMLElement>(
      "[data-dashboard-route-skeleton]",
    )!;
    const main = document.querySelector<HTMLElement>(
      ".admin-content-dashboard-main",
    )!;

    expect(skeleton.hidden).toBe(false);
    expect(main.classList.contains("admin-content-dashboard-main--loading")).toBe(
      true,
    );
    expect(document.body.classList.contains("dashboard-route-loading")).toBe(true);
  });
});
