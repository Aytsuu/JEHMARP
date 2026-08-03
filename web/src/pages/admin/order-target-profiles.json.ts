import type { APIRoute } from "astro";

import {
  buildOrderTargetPickerSummary,
  loadOrderTargetProfiles,
  parseOrderTargetProfileQuery,
} from "@/lib/admin-dashboard/order-target-profiles";
import { requireAdminRoute } from "@/lib/admin-dashboard/page";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const adminRoute = await requireAdminRoute(context);

  if (!adminRoute.ready) {
    return adminRoute.response;
  }

  try {
    const query = parseOrderTargetProfileQuery(context.url);
    const result = await loadOrderTargetProfiles(query);

    return Response.json(
      {
        ...result,
        summary: buildOrderTargetPickerSummary(result),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to load order target profiles.",
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
