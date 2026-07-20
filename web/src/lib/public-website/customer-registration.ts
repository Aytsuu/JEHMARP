import { createHash } from "node:crypto";
import { z } from "zod";

import { parseContactNumber } from "@/lib/formatters";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

const customerRegistrationSchema = z.object({
  agentEmployeeId: z.string().trim().optional(),
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
): CustomerRegistrationParseResult {
  const result = customerRegistrationSchema.safeParse({
    agentEmployeeId: formData.get("agentEmployeeId"),
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
  supabase: SupabaseAdminClient = createSupabaseAdminClient(),
) {
  const link = await loadRegistrationLinkByToken(supabase, token);

  if (!link || link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) {
    throw new Error("This registration link is no longer available.");
  }

  const assignedAgentId = await resolveAssignedAgentId(
    supabase,
    link.id,
    payload.data.agentEmployeeId,
  );

  await assertCustomerIsUnique(supabase, payload.data.phoneNumber, payload.data.email ?? null);

  const { error: insertError } = await supabase.from("customer").insert({
    first_name: payload.data.firstName,
    last_name: payload.data.lastName,
    phone_number: payload.data.phoneNumber,
    email: payload.data.email ?? null,
    address: payload.data.address,
    assigned_agent_id: assignedAgentId,
    is_reseller: false,
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    if (insertError.code === "23505") {
      throw new Error("Phone number or email already exists for another customer.");
    }

    throw new Error("Unable to register customer.");
  }

  await supabase
    .from("customer_registration_link")
    .update({
      use_count: Number(link.use_count ?? 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", link.id);
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

async function resolveAssignedAgentId(
  supabase: SupabaseAdminClient,
  linkId: string,
  employeeId: string | undefined,
) {
  const normalizedEmployeeId = employeeId?.trim();

  if (!normalizedEmployeeId) {
    return null;
  }

  const { data, error } = await supabase
    .from("agent_profile")
    .select("id")
    .eq("employee_id", normalizedEmployeeId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error("Unable to validate agent employee ID.");
  }

  if (!data?.id) {
    throw new Error("Agent employee ID is not valid for this registration link.");
  }

  const { data: linkAgent, error: linkAgentError } = await supabase
    .from("customer_registration_link_agent")
    .select("agent_id")
    .eq("link_id", linkId)
    .eq("agent_id", String(data.id))
    .limit(1)
    .maybeSingle();

  if (linkAgentError) {
    throw new Error("Unable to validate registration link agent.");
  }

  if (!linkAgent?.agent_id) {
    throw new Error("Agent employee ID is not valid for this registration link.");
  }

  return String(data.id);
}

async function assertCustomerIsUnique(
  supabase: SupabaseAdminClient,
  phoneNumber: string,
  email: string | null,
) {
  const { data: phoneCustomer, error: phoneError } = await supabase
    .from("customer")
    .select("id")
    .eq("phone_number", phoneNumber)
    .limit(1)
    .maybeSingle();

  if (phoneError) {
    throw new Error("Unable to validate customer phone number.");
  }

  if (phoneCustomer?.id) {
    throw new Error("Phone number already exists for another customer.");
  }

  if (!email) {
    return;
  }

  const { data: emailCustomer, error: emailError } = await supabase
    .from("customer")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (emailError) {
    throw new Error("Unable to validate customer email.");
  }

  if (emailCustomer?.id) {
    throw new Error("Email already exists for another customer.");
  }
}

function hashRegistrationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
