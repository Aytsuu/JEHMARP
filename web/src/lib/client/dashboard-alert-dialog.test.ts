import { beforeEach, describe, expect, it } from "vitest";

import { initDashboardAlertDialogs } from "./dashboard-alert-dialog";

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
});
