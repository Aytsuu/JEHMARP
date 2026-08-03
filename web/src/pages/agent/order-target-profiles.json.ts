import type { APIRoute } from "astro";

import {
  assertAgentOrderOwnedByAgent,
  buildAttachOrderTargetPickerSummary,
  loadAttachOrderTargetProfiles,
  parseAttachOrderTargetProfileQuery,
  resolveActiveAgentIdForUser,
} from "@/lib/attach-order-target-profiles";
import { requireAgentRoute } from "@/lib/agent-dashboard/page";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const agentRoute = await requireAgentRoute(context);

  if (!agentRoute.ready) {
    return agentRoute.response;
  }

  try {
    const query = parseAttachOrderTargetProfileQuery(context.url);

    if (!query.agentOrderId) {
      return Response.json(
        { error: "Agent order id is required." },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const supabase = createSupabaseAdminClient();
    const agentId = await resolveActiveAgentIdForUser(supabase, agentRoute.userId);

    if (!agentId) {
      return Response.json(
        { error: "Active agent profile was not found." },
        {
          status: 403,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    await assertAgentOrderOwnedByAgent(supabase, query.agentOrderId, agentId);

    const result = await loadAttachOrderTargetProfiles({
      page: query.page,
      search: query.search,
      agentOrderId: query.agentOrderId,
      assignedAgentId: agentId,
    });

    return Response.json(
      {
        ...result,
        summary: buildAttachOrderTargetPickerSummary(result),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load customer profiles.";
    const status = message === "Agent order was not found." ? 404 : 500;

    return Response.json(
      { error: message },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
};
