import type { APIRoute } from "astro";

import { parseGuestOrderFormData, submitGuestOrder } from "@/lib/public-website/guest-orders";
import { resolveFormReturnPath } from "@/lib/public-website/admin-content-preview";
import { getClientIp } from "@/lib/security/client-ip";
import { isTrustedFormOrigin } from "@/lib/security/form-origin";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect, url }) => {
  if (!isTrustedFormOrigin(request.headers, url)) {
    return redirectWithError(redirect, "Invalid form submission.", "/shop");
  }

  const formData = await request.formData();
  const parsed = parseGuestOrderFormData(formData);
  const returnPath = resolveFormReturnPath(formData, "/shop");

  if (!parsed.success) {
    return redirectWithError(
      redirect,
      parsed.errors[0] ?? "Please check your order details.",
      returnPath,
    );
  }

  try {
    const result = await submitGuestOrder(parsed.data, {
      clientIp: getClientIp(request.headers),
      siteOrigin: url.origin,
    });
    const params = new URLSearchParams({
      order: "submitted",
    });

    if (parsed.data.customer.email) {
      if (result.trackingEmailStatus === "sent") {
        params.set("email", "1");
      } else if (result.trackingEmailStatus === "failed") {
        params.set("email", "failed");
      } else if (result.trackingEmailStatus === "skipped") {
        params.set("email", "unavailable");
      }
    }

    return redirect(`${returnPath}?${params.toString()}`, 303);
  } catch (error) {
    return redirectWithError(
      redirect,
      error instanceof Error ? error.message : "The order could not be submitted. Please try again.",
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
    order: "error",
    message,
  });

  return redirect(`${returnPath}?${params.toString()}`, 303);
}
