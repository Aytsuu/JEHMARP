const OPEN_BODY_CLASS = "sheet-open";

let currentFormParent: HTMLElement | null = null;
let currentForm: HTMLFormElement | null = null;

function portalSheetToBody(sheet: HTMLElement) {
  const existing = document.getElementById(sheet.id);
  if (existing && existing !== sheet) {
    existing.remove();
  }

  if (sheet.parentElement !== document.body) {
    document.body.appendChild(sheet);
  }
}

function syncScrollLock(isOpen: boolean) {
  document.documentElement.classList.toggle(OPEN_BODY_CLASS, isOpen);
  document.body.classList.toggle(OPEN_BODY_CLASS, isOpen);
}

function getDefaultDrawer() {
  return document.querySelector<HTMLElement>("#drawer-sheet");
}

function getDefaultDrawerBody() {
  return getDefaultDrawer()?.querySelector<HTMLElement>("[data-drawer-body]") ?? null;
}

function closeDrawer(targetDrawer?: HTMLElement | null) {
  const drawerToClose =
    targetDrawer ?? document.querySelector<HTMLElement>(".drawer-sheet--open");
  if (!drawerToClose) return;

  const defaultDrawer = getDefaultDrawer();
  const defaultDrawerBody = getDefaultDrawerBody();

  drawerToClose.classList.remove("drawer-sheet--open");
  drawerToClose.setAttribute("aria-hidden", "true");

  if (defaultDrawer && defaultDrawerBody && drawerToClose === defaultDrawer) {
    if (currentForm && currentFormParent) {
      currentFormParent.appendChild(currentForm);
    }
    currentForm = null;
    currentFormParent = null;
  }

  if (!document.querySelector(".drawer-sheet--open")) {
    syncScrollLock(false);
  }
}

function openDrawer(targetDrawer: HTMLElement) {
  portalSheetToBody(targetDrawer);
  targetDrawer.classList.remove("drawer-sheet--open");
  targetDrawer.setAttribute("aria-hidden", "true");
  syncScrollLock(false);

  // Commit the closed transform after portaling so the first open can animate.
  void targetDrawer.getBoundingClientRect();

  window.requestAnimationFrame(() => {
    targetDrawer.classList.add("drawer-sheet--open");
    targetDrawer.setAttribute("aria-hidden", "false");
    syncScrollLock(true);
  });
}

function openManageSheet(trigger: HTMLElement) {
  const drawer = getDefaultDrawer();
  const drawerBody = getDefaultDrawerBody();
  if (!drawer || !drawerBody) return;

  closeDrawer();

  const parentTd = trigger.closest("td");
  if (!parentTd) return;

  const holder = parentTd.querySelector<HTMLElement>(".hidden-form-holder");
  const form = holder?.querySelector<HTMLFormElement>("form");
  if (!holder || !form) return;

  currentFormParent = holder;
  currentForm = form;
  drawerBody.appendChild(form);

  const row = trigger.closest("tr");
  const rowTitle =
    row?.querySelector("strong")?.textContent ||
    row?.querySelector("td")?.textContent ||
    "Manage";
  const drawerTitle = drawer.querySelector(".drawer-sheet__title");
  if (drawerTitle) {
    drawerTitle.textContent = `Manage: ${rowTitle.trim().split("\n")[0]}`;
  }

  openDrawer(drawer);
}

function openCreateSheet(trigger: HTMLElement) {
  closeDrawer();

  const targetSelector = trigger.getAttribute("data-sheet-target");
  const targetDrawer = targetSelector
    ? document.querySelector<HTMLElement>(targetSelector)
    : null;

  if (targetDrawer) {
    const targetTitle = trigger.getAttribute("data-sheet-title");
    const titleElement = targetDrawer.querySelector<HTMLElement>("[data-sheet-title]");
    if (targetTitle && titleElement) {
      titleElement.textContent = targetTitle;
    }
    openDrawer(targetDrawer);
    return;
  }

  const drawer = getDefaultDrawer();
  const drawerBody = getDefaultDrawerBody();
  const parentPanel = trigger.closest(".admin-panel");
  const holder = parentPanel?.querySelector<HTMLElement>(".hidden-create-form-holder");
  const form = holder?.querySelector<HTMLFormElement>("form");
  if (!holder || !form || !drawer || !drawerBody) return;

  currentFormParent = holder;
  currentForm = form;
  drawerBody.appendChild(form);

  const drawerTitle = drawer.querySelector(".drawer-sheet__title");
  if (drawerTitle) {
    drawerTitle.textContent = trigger.textContent?.trim() || "Create";
  }

  openDrawer(drawer);
}

export function initDashboardSheets() {
  const dashboardWindow = window as Window & {
    dashboardSheetsInitialized?: boolean;
  };

  document.querySelectorAll<HTMLElement>("[data-sheet-root]").forEach((sheet) => {
    portalSheetToBody(sheet);
  });

  if (dashboardWindow.dashboardSheetsInitialized) return;
  dashboardWindow.dashboardSheetsInitialized = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const openManageTrigger = target.closest<HTMLElement>("[data-open-sheet]");
    if (openManageTrigger) {
      openManageSheet(openManageTrigger);
      return;
    }

    const openCreateTrigger = target.closest<HTMLElement>("[data-open-create-sheet]");
    if (openCreateTrigger) {
      openCreateSheet(openCreateTrigger);
      return;
    }

    const closeTrigger = target.closest<HTMLElement>("[data-close-drawer]");
    if (closeTrigger) {
      closeDrawer(closeTrigger.closest<HTMLElement>(".drawer-sheet"));
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!document.querySelector(".drawer-sheet--open")) return;
    closeDrawer();
  });
}
