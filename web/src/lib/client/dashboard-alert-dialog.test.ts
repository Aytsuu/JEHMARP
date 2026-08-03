import { beforeEach, describe, expect, it } from "vitest";

import { initDashboardAlertDialogs } from "./dashboard-alert-dialog";
import { initFormSubmissionState } from "./form-submission-state";

function buildAlertDialogDom() {
  document.body.innerHTML = `
    <button
      type="button"
      data-open-alert-dialog="logout-dialog"
      data-alert-dialog-form="logout-form"
    >
      Logout
    </button>
    <form id="logout-form" method="post" action="/api/logout"></form>
    <div
      id="logout-dialog"
      class="alert-dialog"
      data-alert-dialog="logout-dialog"
      aria-hidden="true"
    >
      <button type="button" data-alert-dialog-close>Backdrop</button>
      <section data-alert-dialog-panel tabindex="-1">
        <button type="button" data-alert-dialog-cancel>Cancel</button>
        <button type="button" data-alert-dialog-confirm>Confirm</button>
      </section>
    </div>
  `;
}

describe("initDashboardAlertDialogs", () => {
  beforeEach(() => {
    document.body.className = "";
    (window as Window & { dashboardAlertDialogsInitialized?: boolean }).dashboardAlertDialogsInitialized =
      false;
    buildAlertDialogDom();
  });

  it("opens the dialog when a trigger is clicked", () => {
    initDashboardAlertDialogs();

    document.querySelector<HTMLButtonElement>("[data-open-alert-dialog]")?.click();

    const dialog = document.getElementById("logout-dialog");
    expect(dialog?.classList.contains("alert-dialog--open")).toBe(true);
    expect(dialog?.getAttribute("aria-hidden")).toBe("false");
    expect(dialog?.dataset.alertDialogPendingForm).toBe("logout-form");
  });

  it("submits the linked form when confirm is clicked", () => {
    initDashboardAlertDialogs();

    const form = document.getElementById("logout-form") as HTMLFormElement;
    let submitted = false;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitted = true;
    });

    document.querySelector<HTMLButtonElement>("[data-open-alert-dialog]")?.click();
    document.querySelector<HTMLButtonElement>("[data-alert-dialog-confirm]")?.click();

    expect(submitted).toBe(true);
    expect(document.getElementById("logout-dialog")?.classList.contains("alert-dialog--open")).toBe(
      false,
    );
  });

  it("closes the dialog when cancel is clicked", () => {
    initDashboardAlertDialogs();

    document.querySelector<HTMLButtonElement>("[data-open-alert-dialog]")?.click();
    document.querySelector<HTMLButtonElement>("[data-alert-dialog-cancel]")?.click();

    const dialog = document.getElementById("logout-dialog");
    expect(dialog?.classList.contains("alert-dialog--open")).toBe(false);
    expect(dialog?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows a loading state on the sheet trigger after confirm submits the linked form", () => {
    document.body.innerHTML = `
      <button
        type="button"
        data-open-alert-dialog="promote-dialog"
        data-alert-dialog-form="promote-form"
      >
        Promote to agent
      </button>
      <form id="promote-form" method="post" action="/admin/customers">
        <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true">
          Submit
        </button>
      </form>
      <div
        id="promote-dialog"
        class="alert-dialog"
        data-alert-dialog="promote-dialog"
        aria-hidden="true"
      >
        <section data-alert-dialog-panel tabindex="-1">
          <button type="button" data-alert-dialog-cancel>Cancel</button>
          <button type="button" data-alert-dialog-confirm>Confirm</button>
        </section>
      </div>
    `;

    initFormSubmissionState();
    initDashboardAlertDialogs();

    const trigger = document.querySelector<HTMLButtonElement>("[data-open-alert-dialog]")!;
    const form = document.getElementById("promote-form") as HTMLFormElement;

    trigger.click();
    document.querySelector<HTMLButtonElement>("[data-alert-dialog-confirm]")?.click();

    expect(form.dataset.isSubmitting).toBe("true");
    expect(trigger.disabled).toBe(true);
    expect(trigger.classList.contains("form-submit-button--loading")).toBe(true);
  });
});
