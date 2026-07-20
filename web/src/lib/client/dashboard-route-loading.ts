import {
  shouldHandleDashboardNavClick,
} from "@/lib/client/dashboard-nav";
import { isAgentMobileRoute } from "@/lib/client/agent-mobile-route";

const SKELETON_DELAY_MS = 200;

let skeletonTimer: number | undefined;

function getRouteSkeleton() {
  return document.querySelector<HTMLElement>("[data-dashboard-route-skeleton]");
}

function getDashboardMain() {
  return document.querySelector<HTMLElement>(".dashboard-main");
}

function showRouteSkeleton() {
  if (isAgentMobileRoute()) return;

  const skeleton = getRouteSkeleton();
  const main = getDashboardMain();
  if (!skeleton || !main) return;

  skeleton.hidden = false;
  skeleton.setAttribute("aria-hidden", "false");
  main.classList.add("dashboard-main--loading");
  document.body.classList.add("dashboard-route-loading");
}

function hideRouteSkeleton() {
  if (skeletonTimer) {
    window.clearTimeout(skeletonTimer);
    skeletonTimer = undefined;
  }

  const skeleton = getRouteSkeleton();
  const main = getDashboardMain();
  if (!skeleton || !main) return;

  skeleton.hidden = true;
  skeleton.setAttribute("aria-hidden", "true");
  main.classList.remove("dashboard-main--loading");
  document.body.classList.remove("dashboard-route-loading");
}

function scheduleRouteSkeleton() {
  if (isAgentMobileRoute()) return;

  hideRouteSkeleton();
  skeletonTimer = window.setTimeout(() => {
    skeletonTimer = undefined;
    showRouteSkeleton();
  }, SKELETON_DELAY_MS);
}

function isPrimaryNavigationClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function initDashboardRouteLoading() {
  const dashboardWindow = window as Window & {
    dashboardRouteLoadingInitialized?: boolean;
  };
  if (dashboardWindow.dashboardRouteLoadingInitialized) return;
  dashboardWindow.dashboardRouteLoadingInitialized = true;

  document.addEventListener("click", (event) => {
    if (!isPrimaryNavigationClick(event)) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    const link = target.closest<HTMLAnchorElement>("[data-dashboard-nav-link]");
    if (!link || !shouldHandleDashboardNavClick(link)) return;

    scheduleRouteSkeleton();
  });

  document.addEventListener("astro:after-swap", hideRouteSkeleton);
  document.addEventListener("astro:page-load", hideRouteSkeleton);
  window.addEventListener("pageshow", hideRouteSkeleton);
}
