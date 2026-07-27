import type { APIRoute } from "astro";

import { resolveFormReturnPath } from "@/lib/public-website/admin-content-preview";
import {
  parseResellerApplicationFormData,
  submitResellerApplication,
} from "@/lib/public-website/reseller-applications";
import { EdgeFunctionRequestError } from "@/lib/public-website/edge-function-response";
import { getClientIp } from "@/lib/security/client-ip";
import { logDevelopmentFormSubmitError } from "@/lib/request-logger";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const parsed = parseResellerApplicationFormData(formData);
  const returnPath = resolveFormReturnPath(formData, "/business");

  if (!parsed.success) {
    return redirectWithError(
      redirect,
      parsed.errors[0] ?? "Please check your application details.",
      returnPath,
    );
  }

  try {
    await submitResellerApplication(parsed.data, {
      clientIp: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    const params = new URLSearchParams({
      application: "submitted",
    });

    return redirect(`${returnPath}?${params.toString()}`, 303);
  } catch (error) {
    if (error instanceof EdgeFunctionRequestError) {
      logDevelopmentFormSubmitError({
        enabled: import.meta.env.DEV,
        scope: "reseller-application",
        status: error.status,
        body: error.body,
        error,
        url: request.url,
      });
    }

    return redirectWithError(
      redirect,
      error instanceof Error ? error.message : "The application could not be submitted. Please try again.",
      returnPath,
    );
  }
};

function redirectWithError(
  redirect: Parameters<APIRoute>[0]["redirect"],
  message: string,
  returnPath: string,
): Response {
  const params = new URLSearchParams({
    application: "error",
    message,
  });

  return redirect(`${returnPath}?${params.toString()}`, 303);
}
