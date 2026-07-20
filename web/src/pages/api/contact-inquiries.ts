import type { APIRoute } from "astro";

import { resolveFormReturnPath } from "@/lib/public-website/admin-content-preview";
import {
  parseContactInquiryFormData,
  submitContactInquiry,
} from "@/lib/public-website/contact-inquiries";
import { getClientIp } from "@/lib/security/client-ip";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const parsed = parseContactInquiryFormData(formData);
  const returnPath = resolveFormReturnPath(formData, "/contact");

  if (!parsed.success) {
    return redirectWithError(
      redirect,
      parsed.errors[0] ?? "Please check your inquiry details.",
      returnPath,
    );
  }

  try {
    const inquiryId = await submitContactInquiry(parsed.data, {
      clientIp: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    const params = new URLSearchParams({
      inquiry: "submitted",
      reference: inquiryId,
    });

    return redirect(`${returnPath}?${params.toString()}`, 303);
  } catch (error) {
    return redirectWithError(
      redirect,
      error instanceof Error ? error.message : "The inquiry could not be submitted. Please try again.",
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
    inquiry: "error",
    message,
  });

  return redirect(`${returnPath}?${params.toString()}`, 303);
}
