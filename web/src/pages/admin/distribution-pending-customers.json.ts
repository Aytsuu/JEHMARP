import type { APIRoute } from "astro";

import { loadDistributionPendingCustomerOrders } from "@/lib/admin-dashboard/data";
import { requireAdminRoute } from "@/lib/admin-dashboard/page";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const adminRoute = await requireAdminRoute(context);

  if (!adminRoute.ready) {
    return adminRoute.response;
  }

  const orderId = context.url.searchParams.get("orderId")?.trim() ?? "";
  if (!orderId) {
    return Response.json(
      { error: "orderId is required." },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const orders = await loadDistributionPendingCustomerOrders(orderId);

    return Response.json(
      { orders },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to load pending customer orders.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
};
