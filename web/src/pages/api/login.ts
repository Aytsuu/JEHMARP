import type { APIRoute } from "astro";

import { getDashboardRoleWithClient } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const formData = await context.request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return context.redirect("/login?error=Email%20and%20password%20are%20required.", 303);
  }

  const env = getServerEnv();
  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "").trim();

  if (env.turnstileSecretKey) {
    if (!turnstileToken) {
      return context.redirect("/login?error=Please%20complete%20the%20verification%20challenge.", 303);
    }
    const verifyBody = new FormData();
    verifyBody.set("secret", env.turnstileSecretKey);
    verifyBody.set("response", turnstileToken);
    
    const clientIp = context.clientAddress;
    if (clientIp) {
      verifyBody.set("remoteip", clientIp);
    }

    try {
      const verifyResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: verifyBody,
      });
      const verifyData = await verifyResponse.json();
      if (!verifyData.success) {
        return context.redirect("/login?error=Verification%20failed.%20Please%20try%20again.", 303);
      }
    } catch {
      return context.redirect("/login?error=Verification%20failed.%20Please%20try%20again.", 303);
    }
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
