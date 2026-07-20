import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeActiveTableActionMenu,
  initTableActionMenus,
} from "./table-action-menu";

function renderActionMenu() {
  document.body.innerHTML = `
    <div class="table-action-menu" data-table-action-menu>
      <button type="button" data-table-action-menu-trigger aria-expanded="false">Actions</button>
      <div class="table-action-menu__content" data-table-action-menu-content hidden>
        <a href="/details" class="table-action-menu__item">Details</a>
      </div>
    </div>
  `;
}

describe("initTableActionMenus", () => {
  beforeEach(() => {
    renderActionMenu();
    initTableActionMenus();
  });

  afterEach(() => {
    closeActiveTableActionMenu();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("opens the menu when the trigger is clicked", () => {
    const trigger = document.querySelector<HTMLButtonElement>(
      "[data-table-action-menu-trigger]",
    )!;
    const content = document.querySelector<HTMLElement>(
      "[data-table-action-menu-content]",
    )!;

    trigger.click();

    expect(content.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("only registers listeners once per document", () => {
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");

    initTableActionMenus();

    expect(
      addEventListenerSpy.mock.calls.filter(([eventName]) => eventName === "click"),
    ).toHaveLength(0);
  });
});
