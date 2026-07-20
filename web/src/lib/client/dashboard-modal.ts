const OPEN_BODY_CLASS = "dashboard-modal-is-open";

function getModalId(modal: HTMLElement) {
  return modal.dataset.dashboardModal ?? modal.id;
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

function openDashboardModal(modal: HTMLElement) {
  const panel = modal.querySelector<HTMLElement>("[data-dashboard-modal-panel]");
  if (!panel) return;

  const dashboardWindow = window as Window & {
    dashboardModalPreviousFocus?: HTMLElement | null;
  };

  dashboardWindow.dashboardModalPreviousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  portalModalToBody(modal);
  modal.classList.add("dashboard-modal--open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add(OPEN_BODY_CLASS);
  panel.focus();
}

function closeDashboardModal(modal: HTMLElement) {
  const dashboardWindow = window as Window & {
    dashboardModalPreviousFocus?: HTMLElement | null;
  };

  modal.classList.remove("dashboard-modal--open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove(OPEN_BODY_CLASS);
  dashboardWindow.dashboardModalPreviousFocus?.focus();
  dashboardWindow.dashboardModalPreviousFocus = null;
}

function closeOpenDashboardModals() {
  document
    .querySelectorAll<HTMLElement>(".dashboard-modal.dashboard-modal--open")
    .forEach((modal) => {
      closeDashboardModal(modal);
    });
}

function bindDashboardModal(modal: HTMLElement) {
  if (modal.dataset.dashboardModalInitialized === "true") return;
  modal.dataset.dashboardModalInitialized = "true";

  portalModalToBody(modal);

  const modalId = getModalId(modal);
  if (!modalId) return;

  modal.querySelectorAll<HTMLElement>("[data-dashboard-modal-close]").forEach((button) => {
    button.addEventListener("click", () => {
      closeDashboardModal(modal);
    });
  });
}

export function initDashboardModals() {
  const dashboardWindow = window as Window & {
    dashboardModalsInitialized?: boolean;
  };

  document.querySelectorAll<HTMLElement>("[data-dashboard-modal]").forEach(bindDashboardModal);

  if (dashboardWindow.dashboardModalsInitialized) return;
  dashboardWindow.dashboardModalsInitialized = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const openTrigger = target.closest<HTMLElement>("[data-open-dashboard-modal]");
    if (!openTrigger) return;

    const modalId = openTrigger.dataset.openDashboardModal;
    if (!modalId) return;

    const modal = document.getElementById(modalId);
    if (!(modal instanceof HTMLElement) || !modal.matches("[data-dashboard-modal]")) return;

    bindDashboardModal(modal);
    openDashboardModal(modal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeOpenDashboardModals();
  });
}
