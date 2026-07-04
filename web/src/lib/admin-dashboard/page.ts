import type { APIContext } from "astro";

import { handleAdminDashboardAction } from "./actions";
import {
  getDashboardRoleForSignedInUser,
  getSignedInUser,
} from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { isTrustedFormOrigin } from "@/lib/security/form-origin";
import { enforceFixedWindowRateLimit } from "@/lib/security/rate-limit";

type AdminRouteContext = Pick<APIContext, "cookies" | "request" | "redirect" | "url">;

type AdminRouteReady = {
  ready: true;
};

type AdminRouteResponse = {
  ready: false;
  response: Response;
};

export async function requireAdminRoute(
  context: AdminRouteContext,
): Promise<AdminRouteReady | AdminRouteResponse> {
  const user = await getSignedInUser(context);

  if (!user) {
    return {
      ready: false,
      response: context.redirect("/login", 302),
    };
  }

  const role = await getDashboardRoleForSignedInUser(context, user.id);

  if (role !== "admin") {
    return {
      ready: false,
      response: context.redirect("/agent", 302),
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
        keyPrefix: "admin-action:user-minute",
        identifier: user.id,
        limit: 60,
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
      response: await handleAdminDashboardAction(context, user.id, context.url.pathname),
    };
  }

  return {
    ready: true,
  };
}

function redirectWithActionError(context: AdminRouteContext, message: string): Response {
  return context.redirect(`${context.url.pathname}?error=${encodeURIComponent(message)}`, 303);
}
