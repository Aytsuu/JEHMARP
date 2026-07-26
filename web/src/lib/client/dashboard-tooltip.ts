const FLOATING_TOOLTIP_ID = "dashboard-floating-tooltip";
const TRIGGER_SELECTOR = ".dashboard-tooltip[data-tooltip]";

export type DashboardTooltipPlacement = "above" | "below";

type DashboardWindow = Window & {
  dashboardTooltipInitialized?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getDashboardTooltipPlacement(
  trigger: HTMLElement,
): DashboardTooltipPlacement {
  return trigger.dataset.tooltipPlacement === "below" ? "below" : "above";
}

export function positionDashboardFloatingTooltip(
  trigger: HTMLElement,
  layer: HTMLElement,
  placement: DashboardTooltipPlacement,
): DashboardTooltipPlacement {
  const triggerRect = trigger.getBoundingClientRect();
  const viewportMargin = 8;
  const gap = 8;

  layer.hidden = false;
  layer.classList.remove("is-visible");
  layer.style.visibility = "hidden";
  layer.style.left = "0px";
  layer.style.top = "0px";

  let resolvedPlacement = placement;
  const layerRect = layer.getBoundingClientRect();
  const centerX = triggerRect.left + triggerRect.width / 2;
  let left = centerX - layerRect.width / 2;
  left = clamp(left, viewportMargin, window.innerWidth - layerRect.width - viewportMargin);

  let top = resolvedPlacement === "below"
    ? triggerRect.bottom + gap
    : triggerRect.top - layerRect.height - gap;

  if (resolvedPlacement === "above" && top < viewportMargin) {
    resolvedPlacement = "below";
    top = triggerRect.bottom + gap;
  } else if (
    resolvedPlacement === "below"
    && top + layerRect.height > window.innerHeight - viewportMargin
  ) {
    resolvedPlacement = "above";
    top = triggerRect.top - layerRect.height - gap;
  }

  layer.dataset.placement = resolvedPlacement;
  layer.style.left = `${Math.round(left)}px`;
  layer.style.top = `${Math.round(top)}px`;

  const arrow = layer.querySelector<HTMLElement>(".dashboard-floating-tooltip__arrow");
  if (arrow) {
    const arrowLeft = centerX - left;
    arrow.style.left = `${clamp(arrowLeft, 12, layerRect.width - 12)}px`;
  }

  layer.style.visibility = "";
  return resolvedPlacement;
}

function ensureFloatingTooltip() {
  let layer = document.getElementById(FLOATING_TOOLTIP_ID);

  if (!layer) {
    layer = document.createElement("div");
    layer.id = FLOATING_TOOLTIP_ID;
    layer.className = "dashboard-floating-tooltip";
    layer.setAttribute("role", "tooltip");
    layer.hidden = true;
    layer.innerHTML = `
      <span class="dashboard-floating-tooltip__content"></span>
      <span class="dashboard-floating-tooltip__arrow" aria-hidden="true"></span>
    `;
    document.body.appendChild(layer);
  }

  return layer;
}

let activeTrigger: HTMLElement | null = null;

function showTooltip(trigger: HTMLElement) {
  const text = trigger.dataset.tooltip?.trim();
  if (!text) return;

  const layer = ensureFloatingTooltip();
  const content = layer.querySelector<HTMLElement>(".dashboard-floating-tooltip__content");
  if (!content) return;

  activeTrigger = trigger;
  content.textContent = text;
  positionDashboardFloatingTooltip(trigger, layer, getDashboardTooltipPlacement(trigger));
  layer.hidden = false;
  layer.classList.add("is-visible");
}

function hideTooltip() {
  const layer = document.getElementById(FLOATING_TOOLTIP_ID);
  if (!layer) return;

  layer.classList.remove("is-visible");
  layer.hidden = true;
  activeTrigger = null;
}

function repositionActiveTooltip() {
  if (!activeTrigger) return;

  const layer = document.getElementById(FLOATING_TOOLTIP_ID);
  if (!layer || layer.hidden) return;

  positionDashboardFloatingTooltip(
    activeTrigger,
    layer,
    getDashboardTooltipPlacement(activeTrigger),
  );
}

function isTriggerTarget(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest<HTMLElement>(TRIGGER_SELECTOR)
    : null;
}

export function initDashboardTooltips() {
  const dashboardWindow = window as DashboardWindow;
  if (dashboardWindow.dashboardTooltipInitialized) return;
  dashboardWindow.dashboardTooltipInitialized = true;

  ensureFloatingTooltip();

  document.addEventListener("mouseover", (event) => {
    const trigger = isTriggerTarget(event.target);
    if (trigger) {
      showTooltip(trigger);
    }
  });

  document.addEventListener("mouseout", (event) => {
    const trigger = isTriggerTarget(event.target);
    if (!trigger || activeTrigger !== trigger) return;

    const related = event.relatedTarget;
    if (related instanceof Node && trigger.contains(related)) return;

    hideTooltip();
  });

  document.addEventListener("focusin", (event) => {
    const trigger = isTriggerTarget(event.target);
    if (trigger) {
      showTooltip(trigger);
    }
  });

  document.addEventListener("focusout", (event) => {
    const trigger = isTriggerTarget(event.target);
    if (!trigger || activeTrigger !== trigger) return;

    const related = event.relatedTarget;
    if (related instanceof Node && trigger.contains(related)) return;

    hideTooltip();
  });

  window.addEventListener("scroll", repositionActiveTooltip, true);
  window.addEventListener("resize", repositionActiveTooltip);
}
