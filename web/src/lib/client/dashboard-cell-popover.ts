import { bindPopoverFormSaveState } from "@/lib/client/dashboard-cell-popover-form-state";
import { initHeroCarouselEditors } from "@/lib/client/hero-carousel-editor";
import { initFaqEditors } from "@/lib/client/faq-editor";
import { initPageSectionContentEditors } from "@/lib/client/page-section-content-editor";
import { initTaglinesEditors } from "@/lib/client/taglines-editor";

const OPEN_BODY_CLASS = "cell-popover-open";
const CLOSE_TRANSITION_MS = 180;

let currentHolder: HTMLElement | null = null;
let currentContent: HTMLElement | null = null;
let currentTrigger: HTMLElement | null = null;
let currentFormStateCleanup: (() => void) | null = null;
let closeFinalizeTimer: ReturnType<typeof setTimeout> | null = null;
let isClosingPopover = false;

function getPopover() {
  return document.getElementById("cell-popover");
}

function getPopoverParts(popover: HTMLElement) {
  return {
    popoverCard: popover.querySelector<HTMLElement>(".cell-popover__card"),
    popoverMount:
      popover.querySelector<HTMLElement>("[data-cell-popover-mount]") ??
      popover.querySelector<HTMLElement>("[data-cell-popover-body]"),
    popoverTitle: popover.querySelector<HTMLElement>(".cell-popover__title"),
    popoverDescription: popover.querySelector<HTMLElement>(
      ".cell-popover__description",
    ),
    legacyHeader: popover.querySelector<HTMLElement>(".cell-popover__header"),
  };
}

function syncPopoverDescription(
  popoverDescription: HTMLElement | null,
  description: string,
) {
  if (!popoverDescription) {
    return;
  }

  popoverDescription.textContent = description;
  popoverDescription.hidden = description.length === 0;
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

function isPopoverPanel(content: HTMLElement) {
  return content.matches("[data-popover-panel]");
}

function findPopoverContent(holder: HTMLElement) {
  const panel = holder.querySelector<HTMLElement>("[data-popover-panel]");
  if (panel) {
    return panel;
  }

  const firstChild = holder.firstElementChild;
  return firstChild instanceof HTMLElement ? firstChild : null;
}

function isEventInsidePopover(event: Event, popoverCard: HTMLElement | null): boolean {
  if (!popoverCard) {
    return false;
  }

  return event.composedPath().includes(popoverCard);
}

function isEventInsideTrigger(event: Event, trigger: HTMLElement | null): boolean {
  if (!trigger) {
    return false;
  }

  return event.composedPath().includes(trigger);
}

function findPopoverForm(content: HTMLElement) {
  if (content instanceof HTMLFormElement) {
    return content;
  }

  return content.querySelector<HTMLFormElement>("form");
}

function clearCloseFinalizeTimer() {
  if (closeFinalizeTimer !== null) {
    clearTimeout(closeFinalizeTimer);
    closeFinalizeTimer = null;
  }
}

function resetPopoverCardPosition(popoverCard: HTMLElement | null) {
  if (!popoverCard) {
    return;
  }

  popoverCard.style.left = "";
  popoverCard.style.top = "";
}

function finalizePopoverClose(popover: HTMLElement) {
  clearCloseFinalizeTimer();
  isClosingPopover = false;

  const { popoverMount, popoverDescription, legacyHeader, popoverCard } =
    getPopoverParts(popover);

  if (currentContent && currentHolder) {
    currentHolder.appendChild(currentContent);
  }

  syncPopoverDescription(popoverDescription, "");
  legacyHeader?.removeAttribute("hidden");

  if (popoverMount) {
    popoverMount.replaceChildren();
  }

  resetPopoverCardPosition(popoverCard);

  currentHolder = null;
  currentContent = null;
  currentTrigger = null;
}

function closeCellPopover(options?: { immediate?: boolean }) {
  const popover = getPopover();
  if (!popover) return;

  if (isClosingPopover && !options?.immediate) {
    return;
  }

  const isOpen = popover.classList.contains("cell-popover--open");
  if (!isOpen && !currentContent) {
    return;
  }

  currentFormStateCleanup?.();
  currentFormStateCleanup = null;

  popover.classList.remove("cell-popover--open");
  popover.setAttribute("aria-hidden", "true");
  syncScrollLock(false);

  if (options?.immediate || !currentContent) {
    finalizePopoverClose(popover);
    return;
  }

  isClosingPopover = true;
  const { popoverCard } = getPopoverParts(popover);
  let finalized = false;

  const finish = () => {
    if (finalized) {
      return;
    }

    finalized = true;
    finalizePopoverClose(popover);
  };

  if (!popoverCard) {
    finish();
    return;
  }

  const handleTransitionEnd = (event: TransitionEvent) => {
    if (event.target !== popoverCard || event.propertyName !== "opacity") {
      return;
    }

    finish();
  };

  popoverCard.addEventListener("transitionend", handleTransitionEnd);
  closeFinalizeTimer = setTimeout(() => {
    popoverCard.removeEventListener("transitionend", handleTransitionEnd);
    finish();
  }, CLOSE_TRANSITION_MS);
}

function openCellPopover(trigger: HTMLElement) {
  const popover = getPopover();
  if (!popover) return;

  portalPopoverToBody(popover);

  const {
    popoverCard,
    popoverMount,
    popoverTitle,
    popoverDescription,
    legacyHeader,
  } = getPopoverParts(popover);
  if (!popoverCard || !popoverMount) return;

  const holder = trigger.parentElement?.querySelector<HTMLElement>(
    ".hidden-popover-form-holder",
  );
  const content = holder ? findPopoverContent(holder) : null;
  if (!holder || !content) return;

  if (currentContent) {
    closeCellPopover({ immediate: true });
  }

  currentHolder = holder;
  currentContent = content;
  currentTrigger = trigger;

  if (isPopoverPanel(content)) {
    legacyHeader?.setAttribute("hidden", "true");
    popoverMount.replaceChildren(content);
  } else {
    legacyHeader?.removeAttribute("hidden");
    if (popoverTitle) {
      popoverTitle.textContent = trigger.dataset.popoverTitle || "Edit";
    }
    syncPopoverDescription(
      popoverDescription,
      trigger.dataset.popoverDescription?.trim() ?? "",
    );
    popoverMount.replaceChildren(content);
  }

  const form = findPopoverForm(content);
  if (form) {
    currentFormStateCleanup = bindPopoverFormSaveState(form);
  }

  initHeroCarouselEditors({ rebind: true });
  initFaqEditors({ rebind: true });
  initTaglinesEditors({ rebind: true });
  initPageSectionContentEditors({ rebind: true });

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

    const popoverCard = popover.querySelector<HTMLElement>(".cell-popover__card");
    if (isEventInsidePopover(event, popoverCard)) return;
    if (isEventInsideTrigger(event, currentTrigger)) return;
    if (target.closest("select")) return;

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

export function closeDashboardCellPopover() {
  closeCellPopover({ immediate: true });
}
