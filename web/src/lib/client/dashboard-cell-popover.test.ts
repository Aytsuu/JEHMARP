import { beforeEach, describe, expect, it } from "vitest";
import { initDashboardCellPopovers } from "./dashboard-cell-popover";

function buildPopoverDom() {
  document.body.innerHTML = `
    <div class="dashboard-frame">
      <button type="button" data-open-cell-popover data-popover-title="Edit Product">
        Pork belly
      </button>
      <div class="hidden-popover-form-holder">
        <form class="admin-table-form">
          <input name="name" value="Pork belly" />
          <button type="submit">Save</button>
        </form>
      </div>
    </div>
    <div class="cell-popover" id="cell-popover" aria-hidden="true">
      <div class="cell-popover__card">
        <header class="cell-popover__header">
          <h3 class="cell-popover__title">Edit</h3>
          <button type="button" class="dashboard-modal__close" data-close-cell-popover aria-label="Close popover">
            Close
          </button>
        </header>
        <div class="cell-popover__body" data-cell-popover-body></div>
      </div>
    </div>
  `;
}

describe("initDashboardCellPopovers", () => {
  beforeEach(() => {
    document.body.className = "";
    document.documentElement.className = "";
    (window as Window & { dashboardCellPopoversInitialized?: boolean }).dashboardCellPopoversInitialized =
      false;
    buildPopoverDom();
  });

  it("portals the popover to body and locks dashboard interaction when opened", () => {
    initDashboardCellPopovers();

    const trigger = document.querySelector<HTMLButtonElement>("[data-open-cell-popover]");
    trigger?.click();

    const popover = document.getElementById("cell-popover");
    expect(popover?.parentElement).toBe(document.body);
    expect(popover?.classList.contains("cell-popover--open")).toBe(true);
    expect(document.body.classList.contains("cell-popover-open")).toBe(true);
    expect(
      document.querySelector<HTMLElement>("[data-cell-popover-body] form"),
    ).toBeTruthy();
  });

  it("restores the form holder and unlocks the dashboard when closed", () => {
    initDashboardCellPopovers();

    const trigger = document.querySelector<HTMLButtonElement>("[data-open-cell-popover]");
    trigger?.click();

    document.querySelector<HTMLElement>("[data-close-cell-popover]")?.click();

    const holder = document.querySelector(".hidden-popover-form-holder");
    expect(holder?.querySelector("form")).toBeTruthy();
    expect(document.getElementById("cell-popover")?.classList.contains("cell-popover--open")).toBe(
      false,
    );
    expect(document.body.classList.contains("cell-popover-open")).toBe(false);
  });

  it("disables the popover save button until a field changes", () => {
    initDashboardCellPopovers();

    document.querySelector<HTMLButtonElement>("[data-open-cell-popover]")?.click();

    const saveButton = document.querySelector<HTMLButtonElement>(
      '[data-cell-popover-body] button[type="submit"]',
    );
    const nameInput = document.querySelector<HTMLInputElement>(
      '[data-cell-popover-body] input[name="name"]',
    );

    expect(saveButton?.disabled).toBe(true);

    if (nameInput) {
      nameInput.value = "Updated name";
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    expect(saveButton?.disabled).toBe(false);
  });
});
