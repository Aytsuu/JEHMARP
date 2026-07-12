import type { APIRoute } from "astro";

import { resolveFormReturnPath } from "@/lib/public-website/admin-content-preview";
import {
  parseResellerApplicationFormData,
  submitResellerApplication,
} from "@/lib/public-website/reseller-applications";

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
    const applicationId = await submitResellerApplication(parsed.data, {
      clientIp: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    const params = new URLSearchParams({
      application: "submitted",
      reference: applicationId,
    });

    return redirect(`${returnPath}?${params.toString()}`, 303);
  } catch (error) {
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

function getClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return headers.get("cf-connecting-ip") ?? forwardedFor ?? headers.get("x-real-ip");
}
