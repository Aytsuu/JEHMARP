const tabsInitializedPathKey = "orderDetailTabsInitPath";
const tabParamName = "tab";

function getTabTriggers(container: ParentNode) {
  return Array.from(
    container.querySelectorAll<HTMLElement>("[data-order-detail-tab-trigger]"),
  );
}

function getTabPanels(container: ParentNode) {
  return Array.from(
    container.querySelectorAll<HTMLElement>("[data-order-detail-tab-panel]"),
  );
}

function getAvailableTabs(triggers: HTMLElement[]) {
  return triggers.flatMap((trigger) =>
    trigger.dataset.tabTarget ? [trigger.dataset.tabTarget] : [],
  );
}

function getInitialTab(triggers: HTMLElement[], availableTabs: string[]) {
  const requestedTab = new URL(window.location.href).searchParams.get(tabParamName);
  if (requestedTab && availableTabs.includes(requestedTab)) return requestedTab;

  const activeTab = triggers.find((trigger) =>
    trigger.classList.contains("is-active"),
  )?.dataset.tabTarget;
  if (activeTab && availableTabs.includes(activeTab)) return activeTab;

  return availableTabs[0];
}

function writeTabToUrl(tab: string) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set(tabParamName, tab);
  window.history.replaceState(
    window.history.state,
    "",
    `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
  );
}

function setActiveTab(
  triggers: HTMLElement[],
  panels: HTMLElement[],
  target: string,
  options: { updateUrl: boolean },
) {
  triggers.forEach((trigger) => {
    const isActive = trigger.dataset.tabTarget === target;
    trigger.classList.toggle("is-active", isActive);
    trigger.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  panels.forEach((panel) => {
    const isActive = panel.dataset.orderDetailTabPanel === target;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });

  if (options.updateUrl) {
    writeTabToUrl(target);
  }
}

export function initOrderDetailTabs(root: ParentNode = document) {
  const currentPath = window.location.pathname;

  root.querySelectorAll<HTMLElement>("[data-order-detail-tabs]").forEach(
    (container) => {
      const triggers = getTabTriggers(container);
      const panels = getTabPanels(container);
      const availableTabs = getAvailableTabs(triggers);
      const initialTab = getInitialTab(triggers, availableTabs);

      if (!initialTab) return;

      setActiveTab(triggers, panels, initialTab, { updateUrl: false });

      if (container.dataset[tabsInitializedPathKey] === currentPath) return;
      container.dataset[tabsInitializedPathKey] = currentPath;

      triggers.forEach((trigger) => {
        trigger.addEventListener("click", () => {
          const target = trigger.dataset.tabTarget;
          if (!target) return;

          setActiveTab(triggers, panels, target, { updateUrl: true });
        });
      });
    },
  );
}
