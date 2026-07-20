import { z } from "zod";

import { parseContactNumber } from "@/lib/formatters";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

const agentStatuses = ["active", "inactive", "suspended"] as const;

export type AgentProfileStatus = (typeof agentStatuses)[number];

export type AgentProfileUpdateFields = {
  employee_id: string | null;
  first_name: string;
  last_name: string;
  display_name: string;
  contact: string;
  status: AgentProfileStatus;
  email: string | null;
};

export function parseAgentProfileUpdateFields(formData: FormData): AgentProfileUpdateFields {
  const firstName = requiredString(formData, "firstName");
  const lastName = requiredString(formData, "lastName");

  return {
    employee_id: optionalString(formData, "employeeId"),
    first_name: firstName,
    last_name: lastName,
    display_name: `${firstName} ${lastName}`.trim(),
    contact: parseContactNumber(requiredString(formData, "contact")),
    status: enumValue(formData, "status", agentStatuses),
    email: optionalEmail(formData, "email"),
  };
}

export async function executeAgentProfileUpdate(
  adminClient: SupabaseAdminClient,
  agentId: string,
  fields: AgentProfileUpdateFields,
) {
  const { data: agent, error: loadError } = await adminClient
    .from("agent_profile")
    .select("id, user_id")
    .eq("id", agentId)
    .maybeSingle();

  if (loadError) {
    throw new Error("Unable to load agent profile.");
  }

  if (!agent) {
    throw new Error("Agent profile was not found.");
  }

  await assertAgentContactIsAvailable(adminClient, fields.contact, agentId);
  await assertAgentEmailIsAvailable(adminClient, fields.email, agent.user_id);

  const { error: profileError } = await adminClient
    .from("agent_profile")
    .update({
      employee_id: fields.employee_id,
      first_name: fields.first_name,
      last_name: fields.last_name,
      display_name: fields.display_name,
      contact: fields.contact,
      status: fields.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", agentId);

  if (profileError) {
    if (profileError.code === "23505") {
      throw new Error("Contact number or employee ID already exists for another agent.");
    }

    throw new Error("Unable to update agent profile.");
  }

  if (!fields.email || !agent.user_id) {
    return;
  }

  const { error: authError } = await adminClient.auth.admin.updateUserById(agent.user_id, {
    email: fields.email,
  });

  if (authError) {
    throw new Error(authError.message || "Unable to update agent email.");
  }
}

export async function assertAgentEmailIsAvailable(
  adminClient: SupabaseAdminClient,
  email: string | null,
  excludeUserId?: string | null,
) {
  if (!email) {
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (error) {
    throw new Error("Unable to validate existing agent email.");
  }

  const hasExistingEmail = (data?.users ?? []).some(
    (user) =>
      user.id !== excludeUserId &&
      (user.email ?? "").trim().toLowerCase() === normalizedEmail,
  );

  if (hasExistingEmail) {
    throw new Error("Email already exists for another account.");
  }
}

export async function assertAgentContactIsAvailable(
  adminClient: SupabaseAdminClient,
  contact: string,
  excludeAgentId?: string,
) {
  const normalizedContact = contact.trim();
  let query = adminClient
    .from("agent_profile")
    .select("id")
    .eq("contact", normalizedContact);

  if (excludeAgentId) {
    query = query.neq("id", excludeAgentId);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    throw new Error("Unable to validate existing agent contact number.");
  }

  if (data?.id) {
    throw new Error("Contact number already exists for another agent.");
  }
}

function requiredString(formData: FormData, key: string) {
  const value = normalizeFormDataEntry(formData.get(key));

  if (!value) {
    throw new Error(`${toSentenceLabel(key)} is required.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = normalizeFormDataEntry(formData.get(key));
  return value || null;
}

function optionalEmail(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  return z.email("Enter a valid email address.").parse(value.toLowerCase());
}

function enumValue<T extends readonly string[]>(
  formData: FormData,
  key: string,
  values: T,
): T[number] {
  const value = requiredString(formData, key);

  if (!values.includes(value)) {
    throw new Error(`${toSentenceLabel(key)} is invalid.`);
  }

  return value as T[number];
}

function normalizeFormDataEntry(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function toSentenceLabel(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function createAgentProfileAdminClient() {
  return createSupabaseAdminClient();
}
