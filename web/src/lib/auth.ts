import type { APIContext } from "astro";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { throwLoadError } from "@/lib/load-error";

export type DashboardRole = "admin" | "agent";

type RequestContext = Pick<APIContext, "cookies" | "request">;
type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

export async function getSignedInUser(context: RequestContext) {
  const supabase = createSupabaseServerClient(context);
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    if (isRecoverableSessionError(error)) {
      return null;
    }

    throwLoadError("Unable to load the signed-in user.");
  }

  return data.user;
}

export async function getDashboardRoleForSignedInUser(
  context: RequestContext,
  userId: string,
): Promise<DashboardRole> {
  const supabase = createSupabaseServerClient(context);

  return getDashboardRoleWithClient(supabase, userId);
}

export async function getDashboardRoleWithClient(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<DashboardRole> {
  const { data: adminRole, error: adminError } = await supabase
    .from("admin_role")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (adminError) {
    throwLoadError("Unable to load admin role.");
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
    throwLoadError("Unable to load agent profile.");
  }

  if (!agentProfile) {
    throw new Error("This account is not assigned to a dashboard role.");
  }

  return "agent";
}

export function getDashboardHeading(role: DashboardRole) {
  return role === "admin" ? "Admin Dashboard" : "Agent Dashboard";
}

export function getDashboardPath(role: DashboardRole) {
  return role === "admin" ? "/admin" : "/agent";
}

export function getLoginErrorMessage(value: string | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecoverableSessionError(error: {
  code?: string;
  name?: string;
  message?: string;
  status?: number;
}) {
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";

  return (
    error.name === "AuthSessionMissingError"
    || error.status === 400
    || error.status === 401
    || error.code === "session_not_found"
    || message.includes("session")
    || message.includes("jwt")
    || message.includes("token")
    || message.includes("refresh token")
    || message.includes("invalid claim")
  );
}
