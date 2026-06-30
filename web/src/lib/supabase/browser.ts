import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";

export function createSupabaseBrowserClient() {
  const env = getPublicEnv();

  return createBrowserClient(env.supabaseUrl, env.supabasePublishableKey);
}
