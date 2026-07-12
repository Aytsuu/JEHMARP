import type { APIRoute } from "astro";

import { loadAdminDashboardSummaryData } from "@/lib/admin-dashboard/data";
import { requireAdminRoute } from "@/lib/admin-dashboard/page";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const adminRoute = await requireAdminRoute(context);

  if (!adminRoute.ready) {
    return adminRoute.response;
  }

  try {
    const summary = await loadAdminDashboardSummaryData();

    return Response.json(summary, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to load dashboard summary.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
};
