import type { APIRoute } from "astro";

import { markViewedResellerApplicationsRead } from "@/lib/admin-dashboard/actions";
import { getDashboardRoleForSignedInUser, getSignedInUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = await getSignedInUser(context);

  if (!user) {
    return Response.json({ error: "Authentication is required." }, { status: 401 });
  }

  const role = await getDashboardRoleForSignedInUser(context, user.id);

  if (role !== "admin") {
    return Response.json({ error: "Admin access is required." }, { status: 403 });
  }

  let body: unknown;

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const applicationIds = extractApplicationIds(body);

  if (applicationIds.length === 0) {
    return Response.json(
      { markedCount: 0 },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const result = await markViewedResellerApplicationsRead(
      createSupabaseServerClient(context),
      applicationIds,
      user.id,
    );

    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to mark reseller applications as read.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
};

function extractApplicationIds(body: unknown): string[] {
  if (!body || typeof body !== "object" || !("applicationIds" in body)) {
    return [];
  }

  const { applicationIds } = body as { applicationIds?: unknown };

  return Array.isArray(applicationIds)
    ? applicationIds.filter((value): value is string => typeof value === "string")
    : [];
}
