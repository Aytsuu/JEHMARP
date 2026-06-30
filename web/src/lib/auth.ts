import type { APIContext } from "astro";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DashboardRole = "admin" | "agent";

type RequestContext = Pick<APIContext, "cookies" | "request">;

export async function getSignedInUser(context: RequestContext) {
  const supabase = createSupabaseServerClient(context);
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    if (isMissingSessionError(error)) {
      return null;
    }

    throw new Error("Unable to load the signed-in user.");
  }

  return data.user;
}

export async function getDashboardRoleForUserId(userId: string): Promise<DashboardRole> {
  const supabase = createSupabaseAdminClient();
  const { data: adminRole, error: adminError } = await supabase
    .from("admin_role")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (adminError) {
    throw new Error("Unable to load admin role.");
  }

  if (adminRole) {
    return "admin";
  }

  const { data: agentProfile, error: agentError } = await supabase
    .from("agent_profile")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (agentError) {
    throw new Error("Unable to load agent profile.");
  }

  if (!agentProfile) {
    throw new Error("This account is not assigned to a dashboard role.");
  }

  return "agent";
}

export function getDashboardHeading(role: DashboardRole) {
  return role === "admin" ? "Admin Dashboard" : "Agent Dashboard";
}

export function getLoginErrorMessage(value: string | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isMissingSessionError(error: { name?: string; message?: string; status?: number }) {
  return (
    error.name === "AuthSessionMissingError"
    || error.status === 400
    || (typeof error.message === "string" && error.message.toLowerCase().includes("session"))
  );
}
