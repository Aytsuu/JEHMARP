import type { APIRoute } from "astro";

import { parseGuestOrderFormData, submitGuestOrder } from "@/lib/public-website/guest-orders";
import { resolveFormReturnPath } from "@/lib/public-website/admin-content-preview";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const parsed = parseGuestOrderFormData(formData);
  const returnPath = resolveFormReturnPath(formData, "/shop");

  if (!parsed.success) {
    const params = new URLSearchParams({
      order: "error",
      message: parsed.errors[0] ?? "Please check your order details.",
    });

    return redirect(`${returnPath}?${params.toString()}`, 303);
  }

  try {
    const orderId = await submitGuestOrder(parsed.data, {
      clientIp: getClientIp(request.headers),
    });
    const params = new URLSearchParams({
      order: "submitted",
      reference: orderId,
    });

    return redirect(`${returnPath}?${params.toString()}`, 303);
  } catch (error) {
    const params = new URLSearchParams({
      order: "error",
      message: error instanceof Error ? error.message : "The order could not be submitted. Please try again.",
    });

    return redirect(`${returnPath}?${params.toString()}`, 303);
  }
};

function getClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return headers.get("cf-connecting-ip") ?? forwardedFor ?? headers.get("x-real-ip");
}
