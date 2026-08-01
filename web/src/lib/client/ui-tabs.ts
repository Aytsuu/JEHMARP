type UiTabsOptions = {
  onTabChange?: (tab: string) => void;
};

const tabsInitializedPathKey = "uiTabsInitPath";
const tabParamName = "tab";

function getTabTriggers(container: ParentNode) {
  return Array.from(
    container.querySelectorAll<HTMLElement>("[data-ui-tab-trigger]"),
  );
}

function getTabPanels(container: ParentNode) {
  return Array.from(
    container.querySelectorAll<HTMLElement>("[data-ui-tab-panel]"),
  );
}

function getAvailableTabs(triggers: HTMLElement[]) {
  return triggers.flatMap((trigger) =>
    trigger.dataset.tabTarget ? [trigger.dataset.tabTarget] : [],
  );
}

function getDefaultTab(container: HTMLElement, availableTabs: string[]) {
  const configuredDefault = container.dataset.uiTabsDefault;
  if (configuredDefault && availableTabs.includes(configuredDefault)) {
    return configuredDefault;
  }

  return availableTabs[0] ?? "";
}

function getInitialTab(
  container: HTMLElement,
  triggers: HTMLElement[],
  availableTabs: string[],
) {
  const requestedTabRaw = new URL(window.location.href).searchParams.get(tabParamName);
  const requestedTab = requestedTabRaw === "agent-orders" ? "orders" : requestedTabRaw;
  if (requestedTab && availableTabs.includes(requestedTab)) {
    return requestedTab;
  }

  const activeTab = triggers.find((trigger) =>
    trigger.classList.contains("is-active"),
  )?.dataset.tabTarget;
  if (activeTab && availableTabs.includes(activeTab)) {
    return activeTab;
  }

  return getDefaultTab(container, availableTabs);
}

function shouldOmitDefaultTabParam(container: HTMLElement) {
  return container.dataset.uiTabsOmitDefaultTab === "true";
}

function shouldClearPageOnChange(container: HTMLElement) {
  return container.dataset.uiTabsClearPage === "true";
}

function writeTabToUrl(container: HTMLElement, tab: string) {
  const nextUrl = new URL(window.location.href);
  const defaultTab = getDefaultTab(
    container,
    getAvailableTabs(getTabTriggers(container)),
  );

  if (shouldOmitDefaultTabParam(container) && tab === defaultTab) {
    nextUrl.searchParams.delete(tabParamName);
  } else {
    nextUrl.searchParams.set(tabParamName, tab);
  }

  if (shouldClearPageOnChange(container)) {
    nextUrl.searchParams.delete("page");
  }

  window.history.replaceState(
    window.history.state,
    "",
    `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
  );
}

function setActiveTab(
  container: HTMLElement,
  triggers: HTMLElement[],
  panels: HTMLElement[],
  target: string,
  options: { updateUrl: boolean; onTabChange?: (tab: string) => void },
) {
  triggers.forEach((trigger) => {
    const isActive = trigger.dataset.tabTarget === target;
    trigger.classList.toggle("is-active", isActive);
    trigger.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  panels.forEach((panel) => {
    const isActive = panel.dataset.uiTabPanel === target;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });

  if (options.updateUrl) {
    writeTabToUrl(container, target);
  }

  options.onTabChange?.(target);
}

export function initUiTabs(root: ParentNode = document, options: UiTabsOptions = {}) {
  const currentPath = window.location.pathname;

  root.querySelectorAll<HTMLElement>("[data-ui-tabs]").forEach((container) => {
    const triggers = getTabTriggers(container);
    const panels = getTabPanels(container);
    const availableTabs = getAvailableTabs(triggers);
    const initialTab = getInitialTab(container, triggers, availableTabs);

    if (!initialTab) {
      return;
    }

    setActiveTab(container, triggers, panels, initialTab, {
      updateUrl: false,
      onTabChange: options.onTabChange,
    });

    if (container.dataset[tabsInitializedPathKey] === currentPath) {
      return;
    }
    container.dataset[tabsInitializedPathKey] = currentPath;

    triggers.forEach((trigger) => {
      trigger.addEventListener("click", () => {
        const target = trigger.dataset.tabTarget;
        if (!target || trigger.classList.contains("is-active")) {
          return;
        }

        setActiveTab(container, triggers, panels, target, {
          updateUrl: true,
          onTabChange: options.onTabChange,
        });
        document.dispatchEvent(new Event("dashboard:interactive-table-updated"));
      });
    });
  });
}
