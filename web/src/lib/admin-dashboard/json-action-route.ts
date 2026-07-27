import type { APIContext } from "astro";

import { handleAdminDashboardAction } from "@/lib/admin-dashboard/actions";
import { getDashboardRoleForSignedInUser, getSignedInUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { resolveFormReturnPath } from "@/lib/public-website/admin-content-preview";
import { isTrustedFormOrigin } from "@/lib/security/form-origin";
import { enforceFixedWindowRateLimit } from "@/lib/security/rate-limit";

export async function handleAdminJsonAction(context: APIContext): Promise<Response> {
  const user = await getSignedInUser(context);

  if (!user) {
    return Response.json({ success: false, error: "Sign in required." }, { status: 401 });
  }

  const role = await getDashboardRoleForSignedInUser(context, user.id);

  if (role !== "admin") {
    return Response.json({ success: false, error: "Admin access required." }, { status: 403 });
  }

  if (!isTrustedFormOrigin(context.request.headers, context.url)) {
    return Response.json({ success: false, error: "Invalid request origin." }, { status: 403 });
  }

  const env = getServerEnv();

  if (env.upstashRedisRestUrl && env.upstashRedisRestToken) {
    try {
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
      return Response.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Dashboard action was blocked.",
        },
        { status: 429 },
      );
    }
  }

  const formData = await context.request.formData();
  const returnPath = resolveFormReturnPath(formData, context.url.pathname);
  const request = new Request(context.url, {
    method: "POST",
    headers: new Headers({
      Accept: "application/json",
    }),
    body: formData,
  });

  return handleAdminDashboardAction(
    {
      cookies: context.cookies,
      request,
      redirect: context.redirect,
      url: context.url,
    },
    user.id,
    returnPath,
  );
}
