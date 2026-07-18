import { defineMiddleware } from "astro:middleware";

import { isLoadError } from "@/lib/load-error";
import { buildSystemIssueUrl, SYSTEM_ISSUE_PATH } from "@/lib/system-issue";

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.url.pathname === SYSTEM_ISSUE_PATH) {
    return next();
  }

  try {
    return await next();
  } catch (error) {
    if (!isLoadError(error)) {
      throw error;
    }

    const returnTo = `${context.url.pathname}${context.url.search}`;
    const redirectUrl = buildSystemIssueUrl(returnTo);
    const acceptsJson = context.request.headers
      .get("Accept")
      ?.includes("application/json");
    const isFetch = context.request.headers.get("X-Requested-With") === "fetch";

    if (acceptsJson) {
      return Response.json(
        {
          error: "system_unavailable",
          redirectUrl,
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    if (isFetch) {
      return new Response(null, {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-System-Issue-Redirect": redirectUrl,
        },
      });
    }

    return context.redirect(redirectUrl, 303);
  }
});
