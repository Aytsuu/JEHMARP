import type { APIRoute } from "astro";

import {
  parseContactInquiryFormData,
  submitContactInquiry,
} from "@/lib/public-website/contact-inquiries";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const parsed = parseContactInquiryFormData(formData);

  if (!parsed.success) {
    return redirectWithError(redirect, parsed.errors[0] ?? "Please check your inquiry details.");
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

    return redirect(`/contact?${params.toString()}`, 303);
  } catch (error) {
    return redirectWithError(
      redirect,
      error instanceof Error ? error.message : "The inquiry could not be submitted. Please try again.",
    );
  }
};

function redirectWithError(
  redirect: Parameters<APIRoute>[0]["redirect"],
  message: string,
): Response {
  const params = new URLSearchParams({
    inquiry: "error",
    message,
  });

  return redirect(`/contact?${params.toString()}`, 303);
}

function getClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return headers.get("cf-connecting-ip") ?? forwardedFor ?? headers.get("x-real-ip");
}
