import { adminDashboardRoutes, agentDashboardRoutes } from "@/config/navigation";
import { getRuntimeServerEnv } from "@/lib/env";

export const pageStatuses = ["ready", "maintenance", "not_ready"] as const;

export type PageStatus = (typeof pageStatuses)[number];

export type DashboardPageStatus = {
  href: string;
  label: string;
  envKey: string;
  status: PageStatus;
};

type DashboardRouteStatusConfig = {
  href: string;
  label: string;
  envKey: string;
};

const dashboardRouteStatusConfigs = [
  ...adminDashboardRoutes.map((route) => ({
    ...route,
    envKey: toPageStatusEnvKey(route.href),
  })),
  { label: "Settings", href: "/admin/settings", envKey: "PAGE_STATUS_ADMIN_SETTINGS" },
  ...agentDashboardRoutes.map((route) => ({
    ...route,
    envKey: toPageStatusEnvKey(route.href),
  })),
  { label: "Settings", href: "/agent/settings", envKey: "PAGE_STATUS_AGENT_SETTINGS" },
] as const satisfies readonly DashboardRouteStatusConfig[];

export function normalizePageStatus(value: unknown): PageStatus {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "ready";
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (normalized === "ready" || normalized === "maintenance" || normalized === "not_ready") {
    return normalized;
  }

  return "not_ready";
}

export function getDashboardRouteStatuses(
  env: Record<string, unknown> = getRuntimeServerEnv(),
): Record<string, DashboardPageStatus> {
  return Object.fromEntries(
    dashboardRouteStatusConfigs.map((route) => [
      route.href,
      {
        ...route,
        status: normalizePageStatus(env[route.envKey]),
      },
    ]),
  );
}

export function getDashboardPageAvailability(
  pathname: string,
  env: Record<string, unknown> = getRuntimeServerEnv(),
): DashboardPageStatus {
  const routeStatuses = getDashboardRouteStatuses(env);
  const route = [...dashboardRouteStatusConfigs]
    .sort((first, second) => second.href.length - first.href.length)
    .find((item) => isDashboardRouteMatch(pathname, item.href));

  if (!route) {
    return {
      href: pathname,
      label: "Page",
      envKey: "",
      status: "ready",
    };
  }

  return routeStatuses[route.href] ?? {
    ...route,
    status: "ready",
  };
}

export function getPageStatusLabel(status: PageStatus): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "maintenance":
      return "Maintenance";
    case "not_ready":
      return "Building";
  }
}

function isDashboardRouteMatch(pathname: string, href: string): boolean {
  if (pathname === href) {
    return true;
  }

  if (href === "/admin" || href === "/agent") {
    return false;
  }

  return pathname.startsWith(`${href}/`);
}

export function toPageStatusEnvKey(href: string): string {
  if (href === "/admin") {
    return "PAGE_STATUS_ADMIN_DASHBOARD";
  }

  if (href === "/agent") {
    return "PAGE_STATUS_AGENT_DASHBOARD";
  }

  const routeKey = href
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

  return `PAGE_STATUS_${routeKey}`;
}
