import type { APIRoute } from "astro";

import { getDashboardRoleWithClient } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const formData = await context.request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return context.redirect("/login?error=Email%20and%20password%20are%20required.", 303);
  }

  const supabase = createSupabaseServerClient(context);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return context.redirect("/login?error=Invalid%20email%20or%20password.", 303);
  }

  try {
    await getDashboardRoleWithClient(supabase, data.user.id);
  } catch {
    await supabase.auth.signOut();
    return context.redirect("/login?error=This%20account%20has%20no%20dashboard%20access.", 303);
  }

  return context.redirect("/dashboard", 303);
};
