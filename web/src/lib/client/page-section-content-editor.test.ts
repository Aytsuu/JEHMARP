import { describe, expect, it } from "vitest";

import { syncPageSectionTextPreview } from "./page-section-content-editor";
import {
  resetFormSubmissionState,
  setFormSubmittingState,
} from "./form-submission-state";

describe("page section content editor", () => {
  it("updates heading preview text without reloading the page", () => {
    document.body.innerHTML = `
      <div data-page-section-editable>
        <div class="admin-content-editable__surface">
          <h2 class="about-section__title">Old heading</h2>
        </div>
      </div>
    `;

    const wrapper = document.querySelector<HTMLElement>("[data-page-section-editable]");
    expect(wrapper).not.toBeNull();

    syncPageSectionTextPreview(wrapper!, "New heading");

    expect(document.querySelector(".about-section__title")?.textContent).toBe("New heading");
  });

  it("updates mission card preview text", () => {
    document.body.innerHTML = `
      <div data-page-section-editable>
        <div class="admin-content-editable__surface">
          <div data-mission-text-expand>
            <p class="mission-card__text">Old mission</p>
            <button type="button" data-mission-text-toggle hidden>View more</button>
          </div>
        </div>
      </div>
    `;

    const wrapper = document.querySelector<HTMLElement>("[data-page-section-editable]");
    syncPageSectionTextPreview(wrapper!, "New mission");

    expect(document.querySelector(".mission-card__text")?.textContent).toBe("New mission");
  });
});

describe("form submission loader integration", () => {
  it("shows the loading state on the clicked save button", () => {
    document.body.innerHTML = `
      <form method="post" data-page-section-form>
        <button type="submit">Save</button>
      </form>
    `;

    const form = document.querySelector("form")!;
    const button = form.querySelector("button")!;

    setFormSubmittingState(form, button);

    expect(button.disabled).toBe(true);
    expect(button.classList.contains("form-submit-button--loading")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");

    resetFormSubmissionState(form);

    expect(button.disabled).toBe(false);
    expect(button.classList.contains("form-submit-button--loading")).toBe(false);
    expect(button.getAttribute("aria-busy")).toBeNull();
  });
});
