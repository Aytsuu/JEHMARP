export function getDashboardPageTransitionName(pathname: string) {
  return `dashboard-page-${pathname.replace(/[^a-zA-Z0-9-]/g, "-")}`;
}
