import { beforeEach, describe, expect, it } from "vitest";

import { initAdminSettingsTabs } from "./admin-settings-tabs";

function renderSettingsTabs() {
  document.body.innerHTML = `
    <div data-admin-settings-page>
      <nav role="tablist">
        <button
          type="button"
          class="admin-settings-page__tab is-active"
          data-admin-settings-tab-trigger
          data-tab-target="general"
          role="tab"
          aria-selected="true"
        >
          General
        </button>
        <button
          type="button"
          class="admin-settings-page__tab"
          data-admin-settings-tab-trigger
          data-tab-target="accounts"
          role="tab"
          aria-selected="false"
        >
          Account & security
        </button>
      </nav>
      <div
        class="admin-settings-page__tab-panel is-active"
        data-admin-settings-tab-panel="general"
        role="tabpanel"
      ></div>
      <div
        class="admin-settings-page__tab-panel"
        data-admin-settings-tab-panel="accounts"
        role="tabpanel"
        hidden
      ></div>
    </div>
  `;
}

function getTrigger(tab: string) {
  return document.querySelector<HTMLElement>(
    `[data-admin-settings-tab-trigger][data-tab-target="${tab}"]`,
  )!;
}

function getPanel(tab: string) {
  return document.querySelector<HTMLElement>(
    `[data-admin-settings-tab-panel="${tab}"]`,
  )!;
}

describe("initAdminSettingsTabs", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin/settings");
    document.body.innerHTML = "";
  });

  it("activates the tab from the URL on initialization", () => {
    window.history.replaceState(null, "", "/admin/settings?tab=accounts");
    renderSettingsTabs();

    initAdminSettingsTabs();

    expect(getTrigger("accounts").classList.contains("is-active")).toBe(true);
    expect(getTrigger("accounts").getAttribute("aria-selected")).toBe("true");
    expect(getPanel("accounts").hidden).toBe(false);
    expect(getPanel("general").hidden).toBe(true);
  });

  it("updates the active tab and URL when a tab is clicked", () => {
    renderSettingsTabs();

    initAdminSettingsTabs();
    getTrigger("accounts").click();

    expect(getTrigger("accounts").classList.contains("is-active")).toBe(true);
    expect(getPanel("accounts").hidden).toBe(false);
    expect(getPanel("general").hidden).toBe(true);
    expect(window.location.search).toBe("?tab=accounts");
  });

  it("removes the tab query parameter when switching back to general", () => {
    window.history.replaceState(null, "", "/admin/settings?tab=accounts");
    renderSettingsTabs();

    initAdminSettingsTabs();
    getTrigger("general").click();

    expect(getTrigger("general").classList.contains("is-active")).toBe(true);
    expect(getPanel("general").hidden).toBe(false);
    expect(window.location.search).toBe("");
  });
});
