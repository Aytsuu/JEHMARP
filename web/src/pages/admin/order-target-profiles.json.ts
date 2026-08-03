import type { APIRoute } from "astro";

import {
  buildAttachOrderTargetPickerSummary,
  buildOrderTargetPickerSummary,
  loadAttachOrderTargetProfiles,
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
    const result = query.agentOrderId.length > 0 && query.scope === "customer"
      ? await loadAttachOrderTargetProfiles({
          page: query.page,
          search: query.search,
          agentOrderId: query.agentOrderId,
        })
      : await loadOrderTargetProfiles(query);
    const summary = query.agentOrderId.length > 0 && query.scope === "customer"
      ? buildAttachOrderTargetPickerSummary(result)
      : buildOrderTargetPickerSummary(result);

    return Response.json(
      {
        ...result,
        summary,
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
