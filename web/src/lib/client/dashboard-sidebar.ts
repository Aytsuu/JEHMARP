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

function positionFloatingTooltip(trigger: HTMLElement, tooltip: HTMLElement) {
  const rect = trigger.getBoundingClientRect();
  tooltip.style.setProperty("--sidebar-tooltip-top", `${rect.top + rect.height / 2}px`);
  tooltip.style.setProperty("--sidebar-tooltip-left", `${rect.right + 8}px`);
}

function showFloatingTooltip(trigger: HTMLElement, tooltip: HTMLElement) {
  positionFloatingTooltip(trigger, tooltip);
  tooltip.classList.add("is-visible");
}

function hideFloatingTooltip(tooltip: HTMLElement) {
  tooltip.classList.remove("is-visible");
  tooltip.style.removeProperty("--sidebar-tooltip-top");
  tooltip.style.removeProperty("--sidebar-tooltip-left");
}

function hideAllFloatingTooltips() {
  document
    .querySelectorAll<HTMLElement>(
      ".dashboard-sidebar__tooltip.is-visible, .dashboard-sidebar__toggle-tooltip.is-visible",
    )
    .forEach((tooltip) => {
      hideFloatingTooltip(tooltip);
    });
}

function getVisibleToggleTooltip(toggle: HTMLElement) {
  return toggle.querySelector<HTMLElement>(
    isSidebarCollapsed()
      ? ".dashboard-sidebar__toggle-tooltip--expand"
      : ".dashboard-sidebar__toggle-tooltip--collapse",
  );
}

function bindSidebarTooltipDelegation() {
  const dashboardWindow = window as Window & {
    dashboardSidebarTooltipDelegationInitialized?: boolean;
  };
  if (dashboardWindow.dashboardSidebarTooltipDelegationInitialized) return;
  dashboardWindow.dashboardSidebarTooltipDelegationInitialized = true;

  document.addEventListener("mouseover", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const navTrigger = target.closest<HTMLElement>(
      ".dashboard-sidebar__nav a, .dashboard-sidebar__logout-form button",
    );
    if (navTrigger && isSidebarCollapsed()) {
      const tooltip = navTrigger.querySelector<HTMLElement>(".dashboard-sidebar__tooltip");
      if (tooltip) {
        showFloatingTooltip(navTrigger, tooltip);
      }
      return;
    }

    const toggle = target.closest<HTMLButtonElement>("[data-dashboard-sidebar-toggle]");
    if (toggle) {
      const tooltip = getVisibleToggleTooltip(toggle);
      if (tooltip) {
        showFloatingTooltip(toggle, tooltip);
      }
    }
  });

  document.addEventListener("mouseout", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const navTrigger = target.closest<HTMLElement>(
      ".dashboard-sidebar__nav a, .dashboard-sidebar__logout-form button",
    );
    if (navTrigger) {
      const related = event.relatedTarget;
      if (related instanceof Node && navTrigger.contains(related)) return;
      const tooltip = navTrigger.querySelector<HTMLElement>(".dashboard-sidebar__tooltip");
      if (tooltip) hideFloatingTooltip(tooltip);
      return;
    }

    const toggle = target.closest<HTMLButtonElement>("[data-dashboard-sidebar-toggle]");
    if (toggle) {
      const related = event.relatedTarget;
      if (related instanceof Node && toggle.contains(related)) return;
      toggle
        .querySelectorAll<HTMLElement>(".dashboard-sidebar__toggle-tooltip")
        .forEach((tooltip) => {
          hideFloatingTooltip(tooltip);
        });
    }
  });

  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const navTrigger = target.closest<HTMLElement>(
      ".dashboard-sidebar__nav a, .dashboard-sidebar__logout-form button",
    );
    if (navTrigger && isSidebarCollapsed()) {
      const tooltip = navTrigger.querySelector<HTMLElement>(".dashboard-sidebar__tooltip");
      if (tooltip) showFloatingTooltip(navTrigger, tooltip);
      return;
    }

    const toggle = target.closest<HTMLButtonElement>("[data-dashboard-sidebar-toggle]");
    if (toggle) {
      const tooltip = getVisibleToggleTooltip(toggle);
      if (tooltip) showFloatingTooltip(toggle, tooltip);
    }
  });

  document.addEventListener("focusout", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const navTrigger = target.closest<HTMLElement>(
      ".dashboard-sidebar__nav a, .dashboard-sidebar__logout-form button",
    );
    if (navTrigger) {
      const related = event.relatedTarget;
      if (related instanceof Node && navTrigger.contains(related)) return;
      const tooltip = navTrigger.querySelector<HTMLElement>(".dashboard-sidebar__tooltip");
      if (tooltip) hideFloatingTooltip(tooltip);
      return;
    }

    const toggle = target.closest<HTMLButtonElement>("[data-dashboard-sidebar-toggle]");
    if (toggle) {
      const related = event.relatedTarget;
      if (related instanceof Node && toggle.contains(related)) return;
      toggle
        .querySelectorAll<HTMLElement>(".dashboard-sidebar__toggle-tooltip")
        .forEach((tooltip) => {
          hideFloatingTooltip(tooltip);
        });
    }
  });

  document.addEventListener(
    "scroll",
    (event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".dashboard-sidebar__scroll")
      ) {
        hideAllFloatingTooltips();
      }
    },
    true,
  );

  window.addEventListener("resize", hideAllFloatingTooltips, { passive: true });
}

function syncSidebarToggleState(
  collapsed: boolean,
  options?: { animate?: boolean },
) {
  if (options?.animate) {
    beginSidebarAnimation();
  }

  document.documentElement.classList.toggle(COLLAPSED_CLASS, collapsed);
  hideAllFloatingTooltips();

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
  bindSidebarTooltipDelegation();

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
