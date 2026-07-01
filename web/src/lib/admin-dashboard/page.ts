import type { APIContext } from "astro";

import { handleAdminDashboardAction } from "./actions";
import {
  getDashboardRoleForSignedInUser,
  getSignedInUser,
} from "@/lib/auth";

type AdminRouteContext = Pick<APIContext, "cookies" | "request" | "redirect" | "url">;

type AdminRouteReady = {
  ready: true;
};

type AdminRouteResponse = {
  ready: false;
  response: Response;
};

export async function requireAdminRoute(
  context: AdminRouteContext,
): Promise<AdminRouteReady | AdminRouteResponse> {
  const user = await getSignedInUser(context);

  if (!user) {
    return {
      ready: false,
      response: context.redirect("/login", 302),
    };
  }

  const role = await getDashboardRoleForSignedInUser(context, user.id);

  if (role !== "admin") {
    return {
      ready: false,
      response: context.redirect("/agent", 302),
    };
  }

  if (context.request.method === "POST") {
    return {
      ready: false,
      response: await handleAdminDashboardAction(context, user.id, context.url.pathname),
    };
  }

  return {
    ready: true,
  };
}
