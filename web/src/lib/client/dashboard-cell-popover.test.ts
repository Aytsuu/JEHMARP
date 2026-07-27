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
          <div class="cell-popover__heading">
            <h3 class="cell-popover__title">Edit</h3>
            <p class="cell-popover__description" hidden></p>
          </div>
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

  it("restores the form holder and unlocks the dashboard when closed", async () => {
    initDashboardCellPopovers();

    const trigger = document.querySelector<HTMLButtonElement>("[data-open-cell-popover]");
    trigger?.click();

    document.querySelector<HTMLElement>("[data-close-cell-popover]")?.click();

    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });

    const holder = document.querySelector(".hidden-popover-form-holder");
    expect(holder?.querySelector("form")).toBeTruthy();
    expect(document.getElementById("cell-popover")?.classList.contains("cell-popover--open")).toBe(
      false,
    );
    expect(document.body.classList.contains("cell-popover-open")).toBe(false);
  });

  it("shows a popover description when provided on the trigger", () => {
    const trigger = document.querySelector<HTMLButtonElement>("[data-open-cell-popover]");
    if (trigger) {
      trigger.dataset.popoverDescription = "Top-to-bottom order matches left-to-right.";
    }

    initDashboardCellPopovers();
    trigger?.click();

    const description = document.querySelector<HTMLElement>(".cell-popover__description");
    expect(description?.hidden).toBe(false);
    expect(description?.textContent).toBe("Top-to-bottom order matches left-to-right.");
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

  it("stays open when a click removes an element inside the popover", () => {
    document.body.innerHTML = `
      <div class="dashboard-frame">
        <button type="button" data-open-cell-popover>Edit</button>
        <div class="hidden-popover-form-holder">
          <div class="ui-popover" data-popover-panel>
            <form>
              <ul>
                <li data-faq-item>
                  <button type="button" data-faq-remove>Remove</button>
                </li>
                <li data-faq-item>
                  <button type="button" data-faq-remove>Remove</button>
                </li>
              </ul>
            </form>
          </div>
        </div>
      </div>
      <div class="cell-popover" id="cell-popover" aria-hidden="true">
        <div class="cell-popover__card" data-cell-popover-mount></div>
      </div>
    `;

    initDashboardCellPopovers();
    document.querySelector<HTMLButtonElement>("[data-open-cell-popover]")?.click();

    const form = document.querySelector<HTMLFormElement>("form");
    form?.addEventListener("click", (event) => {
      const removeButton = (event.target as Element).closest<HTMLButtonElement>("[data-faq-remove]");
      if (!removeButton) {
        return;
      }

      removeButton.closest<HTMLElement>("[data-faq-item]")?.remove();
    });

    document.querySelector<HTMLButtonElement>("[data-faq-remove]")?.click();

    expect(document.getElementById("cell-popover")?.classList.contains("cell-popover--open")).toBe(
      true,
    );
    expect(document.querySelectorAll("[data-faq-item]")).toHaveLength(1);
  });
});
