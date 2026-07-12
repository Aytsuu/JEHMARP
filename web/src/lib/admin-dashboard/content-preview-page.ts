import type { APIContext } from "astro";

import { formatAdminActionFeedback } from "@/lib/admin-dashboard/actions";
import { loadAdminDashboardData } from "@/lib/admin-dashboard/data";
import { requireAdminRoute } from "@/lib/admin-dashboard/page";

export async function loadAdminContentPreviewPage(context: APIContext) {
  const adminRoute = await requireAdminRoute(context);

  if (!adminRoute.ready) {
    return { ready: false as const, response: adminRoute.response };
  }

  const [dashboardData, feedback] = await Promise.all([
    loadAdminDashboardData(),
    Promise.resolve(formatAdminActionFeedback(context.url)),
  ]);

  return {
    ready: true as const,
    dashboardData,
    feedback,
  };
}
