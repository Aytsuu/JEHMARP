export function isDashboardShellRoute(pathname: string): boolean {
  if (pathname.startsWith("/admin/login")) {
    return false;
  }

  return pathname.startsWith("/admin") || pathname.startsWith("/agent");
}

export function isSameDashboardLocation(from: URL, to: URL): boolean {
  return from.pathname === to.pathname && from.search === to.search;
}
