import { beforeEach, describe, expect, it } from "vitest";
import { initDashboardSheets } from "./dashboard-sheet";

function buildSheetDom() {
  document.body.innerHTML = `
    <div class="admin-panel">
      <button type="button" data-open-create-sheet data-sheet-target="#create-sheet">
        Create Product
      </button>
      <div class="hidden-create-form-holder">
        <form><input name="name" /></form>
      </div>
    </div>
    <div id="create-sheet" class="drawer-sheet" data-sheet-root aria-hidden="true">
      <div class="drawer-sheet__backdrop" data-close-drawer></div>
      <div class="drawer-sheet__content">
        <div class="drawer-sheet__body" data-drawer-body></div>
        <h3 class="drawer-sheet__title"></h3>
      </div>
    </div>
  `;
}

describe("initDashboardSheets", () => {
  beforeEach(() => {
    document.body.className = "";
    document.documentElement.className = "";
    (window as Window & { dashboardSheetsInitialized?: boolean }).dashboardSheetsInitialized =
      false;
    buildSheetDom();
  });

  it("portals sheets to the body on init", () => {
    initDashboardSheets();

    const sheet = document.getElementById("create-sheet");
    expect(sheet?.parentElement).toBe(document.body);
  });

  it("defers the open class until the next animation frame", async () => {
    initDashboardSheets();

    const sheet = document.getElementById("create-sheet");
    document.querySelector<HTMLButtonElement>("[data-open-create-sheet]")?.click();

    expect(sheet?.classList.contains("drawer-sheet--open")).toBe(false);

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });

    expect(sheet?.classList.contains("drawer-sheet--open")).toBe(true);
    expect(document.body.classList.contains("sheet-open")).toBe(true);
  });
});
