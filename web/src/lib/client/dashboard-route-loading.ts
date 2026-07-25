import { isAgentMobileRoute } from "@/lib/client/agent-mobile-route";
import {
  isDashboardShellRoute,
  isSameDashboardLocation,
} from "@/lib/client/dashboard-shell-route";
import { shouldHandleDashboardNavClick } from "@/lib/client/dashboard-nav";

let skeletonTimer: number | undefined;
let pendingRouteTransition: ViewTransition | null = null;

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

function beginRouteLoading() {
  if (isAgentMobileRoute()) return;
  showRouteSkeleton();
}

function completeRouteLoading() {
  if (pendingRouteTransition) {
    const transition = pendingRouteTransition;
    pendingRouteTransition = null;
    void transition.finished.finally(() => {
      requestAnimationFrame(hideRouteSkeleton);
    });
    return;
  }

  requestAnimationFrame(hideRouteSkeleton);
}

function shouldShowRouteSkeleton(from: URL, to: URL) {
  if (isAgentMobileRoute(from.pathname)) return false;
  if (!isDashboardShellRoute(from.pathname)) return false;
  if (!isDashboardShellRoute(to.pathname)) return false;
  if (isSameDashboardLocation(from, to)) return false;
  return true;
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

    beginRouteLoading();
  });

  document.addEventListener("astro:before-preparation", (event) => {
    const transitionEvent = event as Event & {
      from?: URL;
      to?: URL;
    };
    if (!transitionEvent.from || !transitionEvent.to) return;
    if (!shouldShowRouteSkeleton(transitionEvent.from, transitionEvent.to)) return;

    beginRouteLoading();
  });

  document.addEventListener("astro:before-swap", (event) => {
    const transitionEvent = event as Event & {
      viewTransition?: ViewTransition;
    };
    pendingRouteTransition = transitionEvent.viewTransition ?? null;
  });

  document.addEventListener("astro:after-swap", completeRouteLoading);
  window.addEventListener("pageshow", hideRouteSkeleton);
}
