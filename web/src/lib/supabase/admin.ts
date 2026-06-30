import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env";

export function createSupabaseAdminClient() {
  const env = getServerEnv();

  return createClient(env.supabaseUrl, env.supabaseServerKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
