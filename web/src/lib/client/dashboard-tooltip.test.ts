import { describe, expect, it } from "vitest";

import {
  getDashboardTooltipPlacement,
  positionDashboardFloatingTooltip,
} from "./dashboard-tooltip";

describe("dashboard-tooltip", () => {
  it("defaults tooltip placement to above", () => {
    const trigger = document.createElement("button");
    trigger.dataset.tooltip = "Help text";

    expect(getDashboardTooltipPlacement(trigger)).toBe("above");
  });

  it("reads below placement from the trigger dataset", () => {
    const trigger = document.createElement("button");
    trigger.dataset.tooltipPlacement = "below";

    expect(getDashboardTooltipPlacement(trigger)).toBe("below");
  });

  it("positions the floating tooltip with fixed viewport coordinates", () => {
    const trigger = document.createElement("button");
    trigger.getBoundingClientRect = () =>
      ({
        top: 120,
        left: 200,
        right: 240,
        bottom: 150,
        width: 40,
        height: 30,
      }) as DOMRect;

    const layer = document.createElement("div");
    layer.innerHTML = `
      <span class="dashboard-floating-tooltip__content">Price list email sent</span>
      <span class="dashboard-floating-tooltip__arrow" aria-hidden="true"></span>
    `;
    layer.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 160,
        bottom: 40,
        width: 160,
        height: 40,
      }) as DOMRect;

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });

    const placement = positionDashboardFloatingTooltip(trigger, layer, "above");

    expect(placement).toBe("above");
    expect(layer.style.left).toBe("140px");
    expect(layer.style.top).toBe("72px");
    expect(layer.dataset.placement).toBe("above");
  });
});
