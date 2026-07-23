const dashboardPathPattern = /^\/(admin|agent)(\/|$)/;

export function isDashboardAppPath(pathname: string) {
  return dashboardPathPattern.test(pathname);
}

export function shouldDisableDashboardPrefetch(href: string) {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return false;
    if (url.pathname.endsWith(".pdf")) return false;

    return isDashboardAppPath(url.pathname);
  } catch {
    return false;
  }
}

export function initDashboardDetailLinkPrefetchOptOut(root: ParentNode = document) {
  root
    .querySelectorAll<HTMLAnchorElement>('a[href^="/admin/"], a[href^="/agent/"]')
    .forEach((link) => {
      if (link.target === "_blank") return;
      if (link.hasAttribute("data-astro-prefetch")) return;
      if (!shouldDisableDashboardPrefetch(link.getAttribute("href") ?? "")) return;

      link.setAttribute("data-astro-prefetch", "false");
    });
}
