/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { initUiTabs } from "./ui-tabs";

describe("initUiTabs", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/admin/customers/demo");
  });

  it("switches panels without navigation and updates the tab query param", () => {
    document.body.innerHTML = `
      <div
        data-ui-tabs
        data-ui-tabs-default="orders"
        data-ui-tabs-clear-page="true"
        data-ui-tabs-omit-default-tab="true"
      >
        <button type="button" data-ui-tab-trigger data-tab-target="orders" class="ui-tab is-active" aria-selected="true">Orders</button>
        <button type="button" data-ui-tab-trigger data-tab-target="sales" aria-selected="false">Sales</button>
        <section data-ui-tab-panel="orders">Orders panel</section>
        <section data-ui-tab-panel="sales" hidden>Sales panel</section>
      </div>
    `;

    initUiTabs();

    document.querySelector<HTMLButtonElement>('[data-tab-target="sales"]')?.click();

    expect(window.location.search).toBe("?tab=sales");
    expect(
      document.querySelector('[data-ui-tab-panel="orders"]')?.hasAttribute("hidden"),
    ).toBe(true);
    expect(
      document.querySelector('[data-ui-tab-panel="sales"]')?.hasAttribute("hidden"),
    ).toBe(false);
  });

  it("removes the tab param when returning to the default tab", () => {
    window.history.replaceState({}, "", "/admin/customers/demo?tab=sales");

    document.body.innerHTML = `
      <div
        data-ui-tabs
        data-ui-tabs-default="orders"
        data-ui-tabs-clear-page="true"
        data-ui-tabs-omit-default-tab="true"
      >
        <button type="button" data-ui-tab-trigger data-tab-target="orders" aria-selected="false">Orders</button>
        <button type="button" data-ui-tab-trigger data-tab-target="sales" class="ui-tab is-active" aria-selected="true">Sales</button>
        <section data-ui-tab-panel="orders" hidden>Orders panel</section>
        <section data-ui-tab-panel="sales">Sales panel</section>
      </div>
    `;

    initUiTabs();

    document.querySelector<HTMLButtonElement>('[data-tab-target="orders"]')?.click();

    expect(window.location.search).toBe("");
  });

  it("dispatches dashboard table update events when switching tabs", () => {
    const handler = vi.fn();
    document.addEventListener("dashboard:interactive-table-updated", handler);

    document.body.innerHTML = `
      <div data-ui-tabs data-ui-tabs-default="orders">
        <button type="button" data-ui-tab-trigger data-tab-target="orders" class="ui-tab is-active" aria-selected="true">Orders</button>
        <button type="button" data-ui-tab-trigger data-tab-target="sales" aria-selected="false">Sales</button>
        <section data-ui-tab-panel="orders">Orders panel</section>
        <section data-ui-tab-panel="sales" hidden>Sales panel</section>
      </div>
    `;

    initUiTabs();

    document.querySelector<HTMLButtonElement>('[data-tab-target="sales"]')?.click();

    expect(handler).toHaveBeenCalledTimes(1);
    document.removeEventListener("dashboard:interactive-table-updated", handler);
  });
});
