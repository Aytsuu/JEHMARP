import { createClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env";

export function createSupabasePublicClient() {
  const env = getPublicEnv();

  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
