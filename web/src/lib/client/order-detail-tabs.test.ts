import { beforeEach, describe, expect, it, vi } from "vitest";

import { initOrderDetailTabs } from "./order-detail-tabs";

function renderTabs() {
  document.body.innerHTML = `
    <section data-ui-tabs>
      <div role="tablist">
        <button
          type="button"
          class="ui-tab is-active"
          data-ui-tab-trigger
          data-tab-target="order-slip"
          role="tab"
          aria-selected="true"
        >
          Order Slip
        </button>
        <button
          type="button"
          class="ui-tab"
          data-ui-tab-trigger
          data-tab-target="sales-invoice"
          role="tab"
          aria-selected="false"
        >
          Sales Invoice
        </button>
        <button
          type="button"
          class="ui-tab"
          data-ui-tab-trigger
          data-tab-target="payment-record"
          role="tab"
          aria-selected="false"
        >
          Payment Record
        </button>
      </div>
      <section
        class="ui-tab-panel is-active"
        data-ui-tab-panel="order-slip"
        role="tabpanel"
      ></section>
      <section
        class="ui-tab-panel"
        data-ui-tab-panel="sales-invoice"
        role="tabpanel"
        hidden
      ></section>
      <section
        class="ui-tab-panel"
        data-ui-tab-panel="payment-record"
        role="tabpanel"
        hidden
      ></section>
    </section>
  `;
}

function getTrigger(tab: string) {
  return document.querySelector<HTMLElement>(
    `[data-ui-tab-trigger][data-tab-target="${tab}"]`,
  )!;
}

function getPanel(tab: string) {
  return document.querySelector<HTMLElement>(`[data-ui-tab-panel="${tab}"]`)!;
}

describe("initOrderDetailTabs", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin/orders/customer/order-1");
    document.body.innerHTML = "";
  });

  it("activates the tab from the URL on initialization", () => {
    window.history.replaceState(
      null,
      "",
      "/admin/orders/customer/order-1?tab=sales-invoice",
    );
    renderTabs();

    initOrderDetailTabs();

    expect(getTrigger("sales-invoice").classList.contains("is-active")).toBe(
      true,
    );
    expect(getTrigger("sales-invoice").getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(getPanel("sales-invoice").hidden).toBe(false);
    expect(getPanel("order-slip").hidden).toBe(true);
  });

  it("updates the active tab and URL when a tab is clicked", () => {
    renderTabs();

    initOrderDetailTabs();
    getTrigger("payment-record").click();

    expect(getTrigger("payment-record").classList.contains("is-active")).toBe(
      true,
    );
    expect(getPanel("payment-record").hidden).toBe(false);
    expect(getPanel("order-slip").hidden).toBe(true);
    expect(window.location.search).toBe("?tab=payment-record");
  });

  it("keeps existing query parameters when writing the active tab", () => {
    window.history.replaceState(
      null,
      "",
      "/admin/orders/customer/order-1?status=Saved",
    );
    renderTabs();

    initOrderDetailTabs();
    getTrigger("sales-invoice").click();

    expect(window.location.search).toBe("?status=Saved&tab=sales-invoice");
  });

  it("does not install duplicate listeners when initialized repeatedly", () => {
    renderTabs();
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

    initOrderDetailTabs();
    initOrderDetailTabs();
    getTrigger("sales-invoice").click();

    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    replaceStateSpy.mockRestore();
  });

  it("rebinds tab listeners when navigating to a different order detail page", () => {
    renderTabs();
    initOrderDetailTabs();

    window.history.replaceState(
      null,
      "",
      "/admin/orders/customer/order-2",
    );
    renderTabs();
    initOrderDetailTabs();
    getTrigger("payment-record").click();

    expect(getPanel("payment-record").hidden).toBe(false);
    expect(window.location.search).toBe("?tab=payment-record");
  });
});
