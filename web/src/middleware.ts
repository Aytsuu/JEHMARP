import { defineMiddleware } from "astro:middleware";

import { isLoadError } from "@/lib/load-error";
import { logDevelopmentLoadError, logDevelopmentRequest } from "@/lib/request-logger";
import { buildSystemIssueUrl, SYSTEM_ISSUE_PATH } from "@/lib/system-issue";

export const onRequest = defineMiddleware(async (context, next) => {
  const startedAt = performance.now();
  let status = 500;

  try {
    if (context.url.pathname === SYSTEM_ISSUE_PATH) {
      const response = await next();
      status = response.status;
      return response;
    }

    try {
      const response = await next();
      status = response.status;
      return response;
    } catch (error) {
      if (!isLoadError(error)) {
        throw error;
      }

      logDevelopmentLoadError({
        enabled: import.meta.env.DEV,
        error,
        url: context.url,
      });

      const returnTo = `${context.url.pathname}${context.url.search}`;
      const redirectUrl = buildSystemIssueUrl(returnTo);
      const acceptsJson = context.request.headers
        .get("Accept")
        ?.includes("application/json");
      const isFetch =
        context.request.headers.get("X-Requested-With") === "fetch";

      if (acceptsJson) {
        const response = Response.json(
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
        status = response.status;
        return response;
      }

      if (isFetch) {
        const response = new Response(null, {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "X-System-Issue-Redirect": redirectUrl,
          },
        });
        status = response.status;
        return response;
      }

      const response = context.redirect(redirectUrl, 303);
      status = response.status;
      return response;
    }
  } finally {
    logDevelopmentRequest({
      durationMs: performance.now() - startedAt,
      enabled: import.meta.env.DEV,
      method: context.request.method,
      status,
      url: context.url,
    });
  }
});
