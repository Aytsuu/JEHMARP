import { isAgentNavActive } from "@/lib/dashboard/agent-navigation";

const AGENT_MOBILE_QUERY = "(max-width: 47.99rem)";

export function isAgentRoute(pathname = window.location.pathname) {
  return pathname.startsWith("/agent");
}

export function isAgentMobileViewport() {
  return window.matchMedia(AGENT_MOBILE_QUERY).matches;
}

export function isAgentMobileRoute(pathname = window.location.pathname) {
  return isAgentRoute(pathname) && isAgentMobileViewport();
}

export function syncAgentBodyClass(pathname = window.location.pathname) {
  document.body.classList.toggle("dashboard-body--agent", isAgentRoute(pathname));
}

export function syncAgentMobileChrome(pathname = window.location.pathname) {
  syncAgentBodyClass(pathname);

  document.querySelectorAll<HTMLAnchorElement>("[data-agent-nav-link]").forEach((link) => {
    const href = link.getAttribute("href") ?? "";
    const isActive = isAgentNavActive(pathname, href);
    link.classList.toggle("agent-mobile-nav__link--active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function lockAgentMobileScroll() {
  document.documentElement.classList.add("agent-mobile-nav-lock");
}

function unlockAgentMobileScroll() {
  document.documentElement.classList.remove("agent-mobile-nav-lock");
}

function resetAgentMobileScroll() {
  window.scrollTo(0, 0);
  document.querySelector<HTMLElement>(".dashboard-main")?.scrollTo(0, 0);
}

export function initAgentMobileNavigation() {
  const dashboardWindow = window as Window & {
    agentMobileNavigationInitialized?: boolean;
  };
  if (dashboardWindow.agentMobileNavigationInitialized) return;
  dashboardWindow.agentMobileNavigationInitialized = true;

  document.addEventListener(
    "click",
    (event) => {
      if (!isAgentMobileViewport()) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest<HTMLAnchorElement>("[data-agent-nav-link]");
      if (!link) return;

      const href = link.getAttribute("href") ?? "";
      if (!href.startsWith("/agent")) return;

      document.body.classList.add("dashboard-body--agent");
      lockAgentMobileScroll();
    },
    true,
  );

  document.addEventListener("astro:before-preparation", () => {
    if (!isAgentMobileRoute()) return;
    lockAgentMobileScroll();
    document.body.classList.add("dashboard-body--agent");
  });

  document.addEventListener("astro:after-swap", () => {
    if (!isAgentRoute()) {
      unlockAgentMobileScroll();
      return;
    }

    syncAgentBodyClass();
    resetAgentMobileScroll();
    unlockAgentMobileScroll();
  });

  document.addEventListener("astro:page-load", () => {
    if (!isAgentRoute()) {
      unlockAgentMobileScroll();
      return;
    }

    syncAgentBodyClass();
    resetAgentMobileScroll();
    unlockAgentMobileScroll();
  });
}
