const OPEN_BODY_CLASS = "dashboard-modal-is-open";

function getModalId(modal: HTMLElement) {
  return modal.dataset.uiModal ?? modal.id;
}

function portalModalToBody(modal: HTMLElement) {
  const existing = document.getElementById(modal.id);
  if (existing && existing !== modal) {
    existing.remove();
  }

  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }
}

export function openUiModal(modal: HTMLElement) {
  const panel = modal.querySelector<HTMLElement>("[data-ui-modal-panel]");
  if (!panel) return;

  const modalWindow = window as Window & {
    uiModalPreviousFocus?: HTMLElement | null;
  };

  modalWindow.uiModalPreviousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  portalModalToBody(modal);
  modal.classList.add("dashboard-modal--open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add(OPEN_BODY_CLASS);
  panel.focus();
}

export function closeUiModal(modal: HTMLElement) {
  const modalWindow = window as Window & {
    uiModalPreviousFocus?: HTMLElement | null;
  };

  modal.classList.remove("dashboard-modal--open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove(OPEN_BODY_CLASS);
  modalWindow.uiModalPreviousFocus?.focus();
  modalWindow.uiModalPreviousFocus = null;
}

function closeOpenUiModals() {
  document
    .querySelectorAll<HTMLElement>(".dashboard-modal.dashboard-modal--open[data-ui-modal]")
    .forEach((modal) => {
      closeUiModal(modal);
    });
}

export function bindUiModal(modal: HTMLElement) {
  if (modal.dataset.uiModalInitialized === "true") return;
  modal.dataset.uiModalInitialized = "true";

  portalModalToBody(modal);

  const modalId = getModalId(modal);
  if (!modalId) return;

  modal.querySelectorAll<HTMLElement>("[data-ui-modal-close]").forEach((button) => {
    button.addEventListener("click", () => {
      closeUiModal(modal);
    });
  });
}

export function initUiModals() {
  const modalWindow = window as Window & {
    uiModalsInitialized?: boolean;
  };

  document.querySelectorAll<HTMLElement>("[data-ui-modal]").forEach(bindUiModal);

  if (modalWindow.uiModalsInitialized) return;
  modalWindow.uiModalsInitialized = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const openTrigger = target.closest<HTMLElement>("[data-open-ui-modal]");
    if (!openTrigger) return;

    const modalId = openTrigger.dataset.openUiModal;
    if (!modalId) return;

    const modal = document.getElementById(modalId);
    if (!(modal instanceof HTMLElement) || !modal.matches("[data-ui-modal]")) return;

    bindUiModal(modal);
    openUiModal(modal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeOpenUiModals();
  });
}
