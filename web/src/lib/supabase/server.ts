import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { CookieMethodsServer } from "@supabase/ssr";
import type { APIContext } from "astro";

import { getPublicEnv } from "@/lib/env";

type SupabaseServerContext = Pick<APIContext, "cookies" | "request">;

export function createSupabaseServerClient(context: SupabaseServerContext) {
  const env = getPublicEnv();
  const cookies: CookieMethodsServer = {
    getAll() {
      return parseCookieHeader(context.request.headers.get("Cookie") ?? "").flatMap(
        ({ name, value }) => (value === undefined ? [] : [{ name, value }]),
      );
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value, options }) => {
        context.cookies.set(name, value, options);
      });
    },
  };

  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies,
  });
}
