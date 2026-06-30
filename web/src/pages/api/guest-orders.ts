import type { APIRoute } from "astro";

import { parseGuestOrderFormData, submitGuestOrder } from "@/lib/public-website/guest-orders";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const parsed = parseGuestOrderFormData(formData);

  if (!parsed.success) {
    const params = new URLSearchParams({
      order: "error",
      message: parsed.errors[0] ?? "Please check your order details.",
    });

    return redirect(`/shop?${params.toString()}`, 303);
  }

  try {
    const orderId = await submitGuestOrder(parsed.data);
    const params = new URLSearchParams({
      order: "submitted",
      reference: orderId,
    });

    return redirect(`/shop?${params.toString()}`, 303);
  } catch {
    const params = new URLSearchParams({
      order: "error",
      message: "The order could not be submitted. Please try again.",
    });

    return redirect(`/shop?${params.toString()}`, 303);
  }
};
