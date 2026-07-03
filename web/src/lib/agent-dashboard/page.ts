import type { APIContext } from "astro";

import { getDashboardRoleForSignedInUser, getSignedInUser } from "@/lib/auth";
import { handleAgentDashboardAction } from "./actions";

type AgentRouteContext = Pick<APIContext, "cookies" | "request" | "redirect" | "url">;

type AgentRouteReady = {
  ready: true;
  userId: string;
};

type AgentRouteResponse = {
  ready: false;
  response: Response;
};

export async function requireAgentRoute(
  context: AgentRouteContext,
): Promise<AgentRouteReady | AgentRouteResponse> {
  const user = await getSignedInUser(context);

  if (!user) {
    return {
      ready: false,
      response: context.redirect("/login", 302),
    };
  }

  const role = await getDashboardRoleForSignedInUser(context, user.id);

  if (role !== "agent") {
    return {
      ready: false,
      response: context.redirect("/admin", 302),
    };
  }

  if (context.request.method === "POST") {
    return {
      ready: false,
      response: await handleAgentDashboardAction(context, user.id, context.url.pathname),
    };
  }

  return {
    ready: true,
    userId: user.id,
  };
}
