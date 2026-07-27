import type { APIRoute } from "astro";

import { handleAdminJsonAction } from "@/lib/admin-dashboard/json-action-route";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  return handleAdminJsonAction(context);
};
