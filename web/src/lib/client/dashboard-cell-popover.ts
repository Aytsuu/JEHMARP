import { bindPopoverFormSaveState } from "@/lib/client/dashboard-cell-popover-form-state";

const OPEN_BODY_CLASS = "cell-popover-open";

let currentHolder: HTMLElement | null = null;
let currentContent: HTMLElement | null = null;
let currentTrigger: HTMLElement | null = null;
let currentFormStateCleanup: (() => void) | null = null;

function getPopover() {
  return document.getElementById("cell-popover");
}

function getPopoverParts(popover: HTMLElement) {
  return {
    popoverCard: popover.querySelector<HTMLElement>(".cell-popover__card"),
    popoverBody: popover.querySelector<HTMLElement>("[data-cell-popover-body]"),
    popoverTitle: popover.querySelector<HTMLElement>(".cell-popover__title"),
  };
}

function portalPopoverToBody(popover: HTMLElement) {
  const existing = document.getElementById(popover.id);
  if (existing && existing !== popover) {
    existing.remove();
  }

  if (popover.parentElement !== document.body) {
    document.body.appendChild(popover);
  }
}

function syncScrollLock(isOpen: boolean) {
  document.documentElement.classList.toggle(OPEN_BODY_CLASS, isOpen);
  document.body.classList.toggle(OPEN_BODY_CLASS, isOpen);
}

function positionPopover(popoverCard: HTMLElement, trigger: HTMLElement) {
  const rect = trigger.getBoundingClientRect();
  const margin = 12;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const cardRect = popoverCard.getBoundingClientRect();

  let left = rect.left;
  let top = rect.bottom + 8;

  if (left + cardRect.width + margin > viewportWidth) {
    left = viewportWidth - cardRect.width - margin;
  }

  if (left < margin) {
    left = margin;
  }

  if (top + cardRect.height + margin > viewportHeight) {
    top = rect.top - cardRect.height - 8;
  }

  if (top < margin) {
    top = margin;
  }

  popoverCard.style.left = `${left}px`;
  popoverCard.style.top = `${top}px`;
}

function closeCellPopover() {
  const popover = getPopover();
  if (!popover) return;

  currentFormStateCleanup?.();
  currentFormStateCleanup = null;

  const { popoverBody } = getPopoverParts(popover);

  if (currentContent && currentHolder) {
    currentHolder.appendChild(currentContent);
  }

  popover.classList.remove("cell-popover--open");
  popover.setAttribute("aria-hidden", "true");

  if (popoverBody) {
    popoverBody.innerHTML = "";
  }

  currentHolder = null;
  currentContent = null;
  currentTrigger = null;
  syncScrollLock(false);
}

function openCellPopover(trigger: HTMLElement) {
  const popover = getPopover();
  if (!popover) return;

  portalPopoverToBody(popover);

  const { popoverCard, popoverBody, popoverTitle } = getPopoverParts(popover);
  if (!popoverCard || !popoverBody || !popoverTitle) return;

  const holder = trigger.parentElement?.querySelector<HTMLElement>(
    ".hidden-popover-form-holder",
  );
  const content = holder?.firstElementChild;
  if (!holder || !(content instanceof HTMLElement)) return;

  if (currentContent) {
    closeCellPopover();
  }

  currentHolder = holder;
  currentContent = content;
  currentTrigger = trigger;

  popoverTitle.textContent = trigger.dataset.popoverTitle || "Edit";
  popoverBody.appendChild(content);

  if (content instanceof HTMLFormElement) {
    currentFormStateCleanup = bindPopoverFormSaveState(content);
  } else {
    const form = content.querySelector("form");
    if (form instanceof HTMLFormElement) {
      currentFormStateCleanup = bindPopoverFormSaveState(form);
    }
  }

  popover.classList.add("cell-popover--open");
  popover.setAttribute("aria-hidden", "false");
  syncScrollLock(true);

  window.requestAnimationFrame(() => {
    positionPopover(popoverCard, trigger);
  });
}

export function initDashboardCellPopovers() {
  const popover = getPopover();
  if (popover instanceof HTMLElement) {
    portalPopoverToBody(popover);
  }

  const dashboardWindow = window as Window & {
    dashboardCellPopoversInitialized?: boolean;
  };

  if (dashboardWindow.dashboardCellPopoversInitialized) return;
  dashboardWindow.dashboardCellPopoversInitialized = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const popover = getPopover();
    const isOpen = popover?.classList.contains("cell-popover--open") ?? false;

    const closeTrigger = target.closest<HTMLElement>("[data-close-cell-popover]");
    if (closeTrigger && isOpen) {
      event.preventDefault();
      closeCellPopover();
      return;
    }

    const openTrigger = target.closest<HTMLElement>("[data-open-cell-popover]");
    if (openTrigger) {
      event.preventDefault();
      event.stopPropagation();
      openCellPopover(openTrigger);
      return;
    }

    if (!isOpen || !popover) return;

    const popoverCard = popover.querySelector(".cell-popover__card");
    if (popoverCard?.contains(target)) return;
    if (currentTrigger?.contains(target)) return;

    closeCellPopover();
  });

  window.addEventListener("resize", () => {
    const popover = getPopover();
    const popoverCard = popover?.querySelector<HTMLElement>(".cell-popover__card");
    if (
      currentTrigger &&
      popover?.classList.contains("cell-popover--open") &&
      popoverCard
    ) {
      positionPopover(popoverCard, currentTrigger);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && getPopover()?.classList.contains("cell-popover--open")) {
      closeCellPopover();
    }
  });
}
