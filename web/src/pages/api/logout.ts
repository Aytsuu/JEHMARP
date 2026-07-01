import type { APIRoute } from "astro";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const supabase = createSupabaseServerClient(context);
  const { error } = await supabase.auth.signOut();

  if (error) {
    return context.redirect("/dashboard?error=Unable%20to%20sign%20out.", 303);
  }

  return context.redirect("/", 303);
};
