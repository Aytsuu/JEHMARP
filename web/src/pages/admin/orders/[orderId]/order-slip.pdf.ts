import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const orderId = context.params.orderId;

  if (!orderId) {
    return new Response("Order not found.", { status: 404 });
  }

  const search = context.url.search;

  return context.redirect(
    `/admin/orders/customer/${orderId}/order-slip.pdf${search}`,
    301,
  );
};
