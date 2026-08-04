import {
  getFormAlertDialogTriggerButton,
  setFormSubmittingState,
} from "./form-submission-state";

const OPEN_BODY_CLASS = "alert-dialog-is-open";
const pendingAlertDialogTriggers = new WeakMap<HTMLElement, HTMLButtonElement>();

function getDialogId(dialog: HTMLElement) {
  return dialog.dataset.alertDialog ?? dialog.id;
}

function portalAlertDialogToBody(dialog: HTMLElement) {
  const existing = document.getElementById(dialog.id);
  if (existing && existing !== dialog) {
    existing.remove();
  }

  if (dialog.parentElement !== document.body) {
    document.body.appendChild(dialog);
  }
}

function openAlertDialog(dialog: HTMLElement, trigger: HTMLElement) {
  const panel = dialog.querySelector<HTMLElement>("[data-alert-dialog-panel]");
  if (!panel) {
    return;
  }

  const dashboardWindow = window as Window & {
    alertDialogPreviousFocus?: HTMLElement | null;
  };

  dashboardWindow.alertDialogPreviousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const formId = trigger.dataset.alertDialogForm;
  if (formId) {
    dialog.dataset.alertDialogPendingForm = formId;
  } else {
    delete dialog.dataset.alertDialogPendingForm;
  }

  if (trigger instanceof HTMLButtonElement) {
    pendingAlertDialogTriggers.set(dialog, trigger);
  } else {
    pendingAlertDialogTriggers.delete(dialog);
  }

  portalAlertDialogToBody(dialog);
  dialog.classList.add("alert-dialog--open");
  dialog.setAttribute("aria-hidden", "false");
  document.body.classList.add(OPEN_BODY_CLASS);

  const cancelButton = dialog.querySelector<HTMLElement>("[data-alert-dialog-cancel]");
  const confirmButton = dialog.querySelector<HTMLElement>("[data-alert-dialog-confirm]");
  const initialFocus =
    dialog.dataset.alertDialogVariant === "danger"
      ? cancelButton ?? panel
      : confirmButton ?? cancelButton ?? panel;
  initialFocus?.focus();
}

function closeAlertDialog(dialog: HTMLElement) {
  const dashboardWindow = window as Window & {
    alertDialogPreviousFocus?: HTMLElement | null;
  };

  dialog.classList.remove("alert-dialog--open");
  dialog.setAttribute("aria-hidden", "true");
  delete dialog.dataset.alertDialogPendingForm;
  pendingAlertDialogTriggers.delete(dialog);
  document.body.classList.remove(OPEN_BODY_CLASS);
  dashboardWindow.alertDialogPreviousFocus?.focus();
  dashboardWindow.alertDialogPreviousFocus = null;
}

function closeOpenAlertDialogs() {
  document
    .querySelectorAll<HTMLElement>(".alert-dialog.alert-dialog--open")
    .forEach((dialog) => {
      closeAlertDialog(dialog);
    });
}

function getHiddenFormSubmitButton(form: HTMLFormElement) {
  return form.querySelector<HTMLButtonElement>(
    'button[type="submit"]:not([data-alert-dialog-form])',
  );
}

function submitPendingAlertDialogForm(dialog: HTMLElement) {
  const formId = dialog.dataset.alertDialogPendingForm;
  if (!formId) {
    return false;
  }

  const form = document.getElementById(formId);
  if (!(form instanceof HTMLFormElement)) {
    return false;
  }

  const trigger =
    pendingAlertDialogTriggers.get(dialog) ??
    getFormAlertDialogTriggerButton(form);
  const hiddenSubmitButton = getHiddenFormSubmitButton(form);

  if (hiddenSubmitButton) {
    form.requestSubmit(hiddenSubmitButton);
  } else {
    form.requestSubmit();
  }

  if (form.dataset.isSubmitting !== "true") {
    setFormSubmittingState(form, trigger);
  }

  pendingAlertDialogTriggers.delete(dialog);
  return true;
}

function bindAlertDialog(dialog: HTMLElement) {
  if (dialog.dataset.alertDialogInitialized === "true") {
    return;
  }

  dialog.dataset.alertDialogInitialized = "true";
  portalAlertDialogToBody(dialog);

  const dialogId = getDialogId(dialog);
  if (!dialogId) {
    return;
  }

  dialog.querySelectorAll<HTMLElement>("[data-alert-dialog-close]").forEach((button) => {
    button.addEventListener("click", () => {
      closeAlertDialog(dialog);
    });
  });

  dialog.querySelector<HTMLElement>("[data-alert-dialog-cancel]")?.addEventListener("click", () => {
    closeAlertDialog(dialog);
  });

  dialog.querySelector<HTMLElement>("[data-alert-dialog-confirm]")?.addEventListener("click", () => {
    submitPendingAlertDialogForm(dialog);
    closeAlertDialog(dialog);
  });
}

export function openAlertDialogFromTrigger(trigger: HTMLElement) {
  const dialogId = trigger.dataset.openAlertDialog;
  if (!dialogId) {
    return false;
  }

  if (
    trigger instanceof HTMLButtonElement &&
    trigger.disabled
  ) {
    return false;
  }

  if (trigger.getAttribute("aria-disabled") === "true") {
    return false;
  }

  const dialog = document.getElementById(dialogId);
  if (!(dialog instanceof HTMLElement) || !dialog.matches("[data-alert-dialog]")) {
    return false;
  }

  bindAlertDialog(dialog);
  openAlertDialog(dialog, trigger);
  return true;
}

export function initDashboardAlertDialogs() {
  const dashboardWindow = window as Window & {
    dashboardAlertDialogsInitialized?: boolean;
  };

  document.querySelectorAll<HTMLElement>("[data-alert-dialog]").forEach(bindAlertDialog);

  if (dashboardWindow.dashboardAlertDialogsInitialized) {
    return;
  }

  dashboardWindow.dashboardAlertDialogsInitialized = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const openTrigger = target.closest<HTMLElement>("[data-open-alert-dialog]");
    if (!openTrigger) {
      return;
    }

    event.preventDefault();
    openAlertDialogFromTrigger(openTrigger);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    closeOpenAlertDialogs();
  });
}
