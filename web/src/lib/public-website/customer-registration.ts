import { createHash } from "node:crypto";
import { z } from "zod";

import { formatAgentCode } from "@/lib/admin-dashboard/view";
import { parseContactNumber } from "@/lib/formatters";
import {
  assertProfileEmailIsAvailable,
  assertProfilePhoneIsAvailable,
  insertCustomerWithProfile,
  asProfileIdentityClient,
} from "@/lib/profile-identity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  deliverNewCustomerTrackingNotification,
} from "@/lib/public-website/customer-tracking";
import { validatePrivacyNoticeAcknowledgement } from "@/lib/platform-settings/privacy-notice";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

const agentIdentifierSchema = z.string().trim().optional();
const agentCodePattern = /^[0-9a-f]{6}$/i;

const customerRegistrationSchema = z.object({
  agentCode: agentIdentifierSchema,
  firstName: z.string().trim().min(1, "First name is required.").max(100),
  lastName: z.string().trim().min(1, "Last name is required.").max(100),
  phoneNumber: z.string().trim().min(1, "Phone number is required."),
  email: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" ? undefined : value?.toLowerCase()))
    .pipe(z.email("Email must be valid when provided.").optional()),
  address: z.string().trim().min(1, "Address is required.").max(500),
});

export type CustomerRegistrationLinkState =
  | {
      status: "valid";
      linkId: string;
      expiresAt: string;
    }
  | {
      status: "invalid" | "expired";
      message: string;
    };

export type CustomerRegistrationParseResult =
  | {
      success: true;
      data: z.infer<typeof customerRegistrationSchema> & {
        phoneNumber: string;
      };
    }
  | {
      success: false;
      errors: string[];
    };

export function parseCustomerRegistrationFormData(
  formData: FormData,
  options: { requirePrivacyAcknowledgement?: boolean } = {},
): CustomerRegistrationParseResult {
  const result = customerRegistrationSchema.safeParse({
    agentCode: readAgentIdentifier(formData),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phoneNumber: formData.get("phoneNumber"),
    email: formData.get("email"),
    address: formData.get("address"),
  });

  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues.map((issue) => issue.message),
    };
  }

  const privacyAckError = validatePrivacyNoticeAcknowledgement(
    formData,
    options.requirePrivacyAcknowledgement ?? false,
  );
  if (privacyAckError) {
    return { success: false, errors: [privacyAckError] };
  }

  try {
    return {
      success: true,
      data: {
        ...result.data,
        phoneNumber: parseContactNumber(result.data.phoneNumber),
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : "Phone number is invalid."],
    };
  }
}

export async function getCustomerRegistrationLinkState(
  token: string,
  supabase: SupabaseAdminClient = createSupabaseAdminClient(),
): Promise<CustomerRegistrationLinkState> {
  const link = await loadRegistrationLinkByToken(supabase, token);

  if (!link) {
    return {
      status: "invalid",
      message: "This registration link is not valid.",
    };
  }

  if (link.revoked_at) {
    return {
      status: "invalid",
      message: "This registration link has been revoked.",
    };
  }

  if (new Date(link.expires_at).getTime() <= Date.now()) {
    return {
      status: "expired",
      message: "This registration link has expired.",
    };
  }

  return {
    status: "valid",
    linkId: link.id,
    expiresAt: link.expires_at,
  };
}

export async function submitCustomerRegistration(
  token: string,
  payload: CustomerRegistrationParseResult & { success: true },
  options: {
    supabase?: SupabaseAdminClient;
    siteOrigin?: string;
    fetch?: typeof fetch;
  } = {},
) {
  const supabase = options.supabase ?? createSupabaseAdminClient();
  const link = await loadRegistrationLinkByToken(supabase, token);

  if (!link || link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) {
    throw new Error("This registration link is no longer available.");
  }

  const assignedAgentId = await resolveAssignedAgentId(
    supabase,
    link.id,
    payload.data.agentCode,
  );

  await assertProfilePhoneIsAvailable(asProfileIdentityClient(supabase), payload.data.phoneNumber);

  if (payload.data.email) {
    await assertProfileEmailIsAvailable(asProfileIdentityClient(supabase), payload.data.email);
  }

  let customerId: string;
  let trackingNumber: string;

  try {
    ({ customerId, trackingNumber } = await insertCustomerWithProfile(asProfileIdentityClient(supabase), {
      first_name: payload.data.firstName,
      last_name: payload.data.lastName,
      phone_number: payload.data.phoneNumber,
      email: payload.data.email ?? null,
      address: payload.data.address,
      assigned_agent_id: assignedAgentId,
      is_reseller: false,
      updated_at: new Date().toISOString(),
    }));
  } catch (error) {
    if (error instanceof Error && error.message.includes("already exists")) {
      throw new Error("Phone number or email already exists for another customer.", { cause: error });
    }

    throw error;
  }

  if (options.siteOrigin) {
    const emailResult = await deliverNewCustomerTrackingNotification({
      trackingNumber,
      recipientName: `${payload.data.firstName} ${payload.data.lastName}`.trim(),
      email: payload.data.email,
      siteOrigin: options.siteOrigin,
      fetch: options.fetch,
    });

    if (emailResult === "failed") {
      console.error("Unable to deliver registration tracking email.");
    }
  }

  await supabase
    .from("customer_registration_link")
    .update({
      use_count: Number(link.use_count ?? 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", link.id);

  return {
    customerId,
    trackingNumber,
  };
}

async function loadRegistrationLinkByToken(
  supabase: SupabaseAdminClient,
  token: string,
) {
  const { data, error } = await supabase
    .from("customer_registration_link")
    .select("id, expires_at, revoked_at, use_count")
    .eq("token_hash", hashRegistrationToken(token))
    .maybeSingle();

  if (error) {
    throw new Error("Unable to validate registration link.");
  }

  return data as {
    id: string;
    expires_at: string;
    revoked_at: string | null;
    use_count: number;
  } | null;
}

type RegistrationLinkAgent = {
  id: string;
  employee_id: string | null;
  status: "active" | "inactive" | "suspended";
};

async function resolveAssignedAgentId(
  supabase: SupabaseAdminClient,
  linkId: string,
  identifier: string | undefined,
) {
  const normalizedIdentifier = identifier?.trim();

  if (!normalizedIdentifier) {
    return null;
  }

  const { data, error } = await supabase
    .from("customer_registration_link_agent")
    .select("agent_id, agent:agent_id ( id, employee_id, status )")
    .eq("link_id", linkId);

  if (error) {
    throw new Error("Unable to validate registration link agents.");
  }

  const candidates = (data ?? [])
    .map((row) => normalizeRegistrationLinkAgent(row.agent))
    .filter((agent): agent is RegistrationLinkAgent => agent !== null && agent.status === "active");

  const matchedAgent = findRegistrationAgentMatch(candidates, normalizedIdentifier);

  if (!matchedAgent) {
    throw new Error("Agent code or employee ID is not valid for this registration link.");
  }

  return matchedAgent.id;
}

function readAgentIdentifier(formData: FormData) {
  const agentCode = formData.get("agentCode");
  const legacyEmployeeId = formData.get("agentEmployeeId");

  if (typeof agentCode === "string" && agentCode.trim()) {
    return agentCode;
  }

  if (typeof legacyEmployeeId === "string" && legacyEmployeeId.trim()) {
    return legacyEmployeeId;
  }

  return undefined;
}

function normalizeRegistrationLinkAgent(value: unknown): RegistrationLinkAgent | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const agent = value as Partial<RegistrationLinkAgent>;

  if (!agent.id || !agent.status) {
    return null;
  }

  return {
    id: String(agent.id),
    employee_id: agent.employee_id ? String(agent.employee_id) : null,
    status: agent.status,
  };
}

function findRegistrationAgentMatch(
  candidates: RegistrationLinkAgent[],
  identifier: string,
) {
  const normalizedIdentifier = identifier.trim();
  const normalizedCode = normalizedIdentifier.replace(/^agent-/i, "");

  const uuidMatch = candidates.find((agent) => agent.id.toLowerCase() === normalizedIdentifier.toLowerCase());

  if (uuidMatch) {
    return uuidMatch;
  }

  const employeeMatch = candidates.find(
    (agent) => agent.employee_id?.toLowerCase() === normalizedIdentifier.toLowerCase(),
  );

  if (employeeMatch) {
    return employeeMatch;
  }

  if (!agentCodePattern.test(normalizedCode)) {
    return null;
  }

  const codeMatches = candidates.filter(
    (agent) => agent.id.slice(0, 6).toLowerCase() === normalizedCode.toLowerCase(),
  );

  if (codeMatches.length === 1) {
    return codeMatches[0];
  }

  if (codeMatches.length > 1) {
    throw new Error(`Agent code ${formatAgentCode(codeMatches[0].id)} is ambiguous. Use the full agent ID instead.`);
  }

  return null;
}

function hashRegistrationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
