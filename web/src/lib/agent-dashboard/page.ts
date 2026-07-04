import type { APIContext } from "astro";

import { getDashboardRoleForSignedInUser, getSignedInUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { isTrustedFormOrigin } from "@/lib/security/form-origin";
import { enforceFixedWindowRateLimit } from "@/lib/security/rate-limit";
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
    if (!isTrustedFormOrigin(context.request.headers, context.url)) {
      return {
        ready: false,
        response: redirectWithActionError(context, "Invalid request origin."),
      };
    }

    try {
      const env = getServerEnv();

      await enforceFixedWindowRateLimit({
        redisUrl: env.upstashRedisRestUrl,
        redisToken: env.upstashRedisRestToken,
        keyPrefix: "agent-action:user-minute",
        identifier: user.id,
        limit: 30,
        windowSeconds: 60,
        exceededMessage: "Too many dashboard actions. Please try again later.",
        unavailableMessage: "Dashboard action rate limiting is not configured.",
      });
    } catch (error) {
      return {
        ready: false,
        response: redirectWithActionError(
          context,
          error instanceof Error ? error.message : "Dashboard action was blocked.",
        ),
      };
    }

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

function redirectWithActionError(context: AgentRouteContext, message: string): Response {
  return context.redirect(`${context.url.pathname}?error=${encodeURIComponent(message)}`, 303);
}
