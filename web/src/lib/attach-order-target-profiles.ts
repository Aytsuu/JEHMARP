import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { throwLoadError } from "@/lib/load-error";

import type { OrderTargetProfilesResult } from "@/lib/admin-dashboard/order-target-profiles";
import {
  buildAttachOrderTargetPickerSummary,
  loadAttachOrderTargetProfiles,
  parseAttachOrderTargetProfileQuery,
} from "@/lib/admin-dashboard/order-target-profiles";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export {
  buildAttachOrderTargetPickerSummary,
  loadAttachOrderTargetProfiles,
  parseAttachOrderTargetProfileQuery,
  type OrderTargetProfilesResult,
};

export async function resolveActiveAgentIdForUser(
  supabase: SupabaseAdminClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("agent")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throwLoadError("Unable to load agent profile.", error);
  }

  return typeof data?.id === "string" ? data.id : null;
}

export async function assertAgentOrderOwnedByAgent(
  supabase: SupabaseAdminClient,
  agentOrderId: string,
  agentId: string,
) {
  const { data, error } = await supabase
    .from("order")
    .select("id, agent_id, order_kind")
    .eq("id", agentOrderId)
    .eq("order_kind", "distribution")
    .maybeSingle();

  if (error) {
    throwLoadError("Unable to load agent order.", error);
  }

  if (!data || data.agent_id !== agentId) {
    throw new Error("Agent order was not found.");
  }
}
