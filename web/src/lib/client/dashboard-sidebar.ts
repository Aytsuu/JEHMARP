import { hideDashboardTooltip } from "@/lib/client/dashboard-tooltip";

const STORAGE_KEY = "dashboard-sidebar-collapsed";
const COLLAPSED_CLASS = "dashboard-sidebar-collapsed";
const ANIMATING_CLASS = "dashboard-sidebar-animating";
const SIDEBAR_TRANSITION_END_EVENT = "dashboard:sidebar-transition-end";

let sidebarAnimationTimeout: number | undefined;

function readCollapsedPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCollapsedPreference(collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "true" : "false");
  } catch {
    // localStorage can be unavailable in strict browser privacy modes.
  }
}

function isSidebarCollapsed() {
  return document.documentElement.classList.contains(COLLAPSED_CLASS);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function finishSidebarAnimation() {
  const root = document.documentElement;
  if (!root.classList.contains(ANIMATING_CLASS)) return;

  root.classList.remove(ANIMATING_CLASS);
  if (sidebarAnimationTimeout) {
    window.clearTimeout(sidebarAnimationTimeout);
    sidebarAnimationTimeout = undefined;
  }
  window.dispatchEvent(new CustomEvent(SIDEBAR_TRANSITION_END_EVENT));
}

function beginSidebarAnimation() {
  if (prefersReducedMotion()) return;

  const root = document.documentElement;
  const shell = document.querySelector<HTMLElement>(".dashboard-sidebar-shell");
  root.classList.add(ANIMATING_CLASS);

  if (sidebarAnimationTimeout) {
    window.clearTimeout(sidebarAnimationTimeout);
  }

  if (!shell) {
    finishSidebarAnimation();
    return;
  }

  const onTransitionEnd = (event: TransitionEvent) => {
    if (event.target !== shell || event.propertyName !== "width") return;
    shell.removeEventListener("transitionend", onTransitionEnd);
    finishSidebarAnimation();
  };

  shell.addEventListener("transitionend", onTransitionEnd);
  sidebarAnimationTimeout = window.setTimeout(() => {
    shell.removeEventListener("transitionend", onTransitionEnd);
    finishSidebarAnimation();
  }, 240);
}

function syncSidebarToggleTooltip(collapsed: boolean) {
  document
    .querySelectorAll<HTMLElement>(".dashboard-sidebar__toggle-tooltip-trigger[data-tooltip]")
    .forEach((trigger) => {
      trigger.dataset.tooltip = collapsed ? "Expand sidebar" : "Collapse sidebar";
    });
}

function bindSidebarScrollTooltipDismissal() {
  const dashboardWindow = window as Window & {
    dashboardSidebarScrollTooltipDismissalInitialized?: boolean;
  };
  if (dashboardWindow.dashboardSidebarScrollTooltipDismissalInitialized) return;
  dashboardWindow.dashboardSidebarScrollTooltipDismissalInitialized = true;

  document.addEventListener(
    "scroll",
    (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".dashboard-sidebar__scroll")) {
        hideDashboardTooltip();
      }
    },
    true,
  );
}

function syncSidebarToggleState(
  collapsed: boolean,
  options?: { animate?: boolean },
) {
  if (options?.animate) {
    beginSidebarAnimation();
  }

  document.documentElement.classList.toggle(COLLAPSED_CLASS, collapsed);
  hideDashboardTooltip();
  syncSidebarToggleTooltip(collapsed);

  document.querySelectorAll<HTMLButtonElement>("[data-dashboard-sidebar-toggle]").forEach(
    (button) => {
      button.setAttribute("aria-expanded", collapsed ? "false" : "true");
      button.setAttribute(
        "aria-label",
        collapsed ? "Expand sidebar" : "Collapse sidebar",
      );
    },
  );
}

export function applyDashboardSidebarPreference() {
  syncSidebarToggleState(readCollapsedPreference());
}

export function initDashboardSidebarCollapse() {
  const dashboardWindow = window as Window & {
    dashboardSidebarCollapseInitialized?: boolean;
  };
  if (dashboardWindow.dashboardSidebarCollapseInitialized) {
    applyDashboardSidebarPreference();
    return;
  }
  dashboardWindow.dashboardSidebarCollapseInitialized = true;

  applyDashboardSidebarPreference();
  bindSidebarScrollTooltipDismissal();

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const toggle = target.closest<HTMLButtonElement>("[data-dashboard-sidebar-toggle]");
    if (!toggle) return;

    event.preventDefault();
    const collapsed = !isSidebarCollapsed();
    writeCollapsedPreference(collapsed);
    syncSidebarToggleState(collapsed, { animate: true });
  });
}
