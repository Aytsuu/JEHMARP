type SupabaseLikeError = {
  code?: string;
  message: string;
};

type SupabaseMaybeSingleResult = PromiseLike<{
  data: { id?: string; profile_id?: string } | null;
  error: SupabaseLikeError | null;
}>;

type SupabaseMutationResult = PromiseLike<{
  error: SupabaseLikeError | null;
}>;

type SupabaseFilterQuery = {
  eq: (column: string, value: string) => SupabaseFilterQuery;
  neq: (column: string, value: string) => SupabaseFilterQuery;
  ilike: (column: string, value: string) => SupabaseFilterQuery;
  limit: (count: number) => {
    maybeSingle: () => SupabaseMaybeSingleResult;
  };
  maybeSingle: () => SupabaseMaybeSingleResult;
};

type SupabaseLikeClient = {
  from: (table: string) => {
    select: (columns: string) => SupabaseFilterQuery;
    insert: (values: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => PromiseLike<{
          data: { id?: string; profile_id?: string } | null;
          error: SupabaseLikeError | null;
        }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => SupabaseMutationResult;
    };
  };
};

// Use a loose client type at module boundaries to avoid Supabase generic recursion in astro check.
export type ProfileIdentitySupabaseClient = any;

export type ProfileIdentityRow = {
  first_name: string;
  last_name: string;
  display_name: string | null;
  email: string | null;
  phone_number: string;
  address: string | null;
};

export type CustomerIdentityInput = {
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string | null;
  address: string;
};

export type AgentIdentityInput = {
  first_name: string;
  last_name: string;
  display_name: string;
  contact: string;
  email?: string | null;
};

export const profileIdentitySelect = `
  first_name,
  last_name,
  display_name,
  email,
  phone_number,
  address
`;

export const customerWithProfileSelect = `
  id,
  profile_id,
  assigned_agent_id,
  is_reseller,
  credit_limit,
  credit_limit_exceeded,
  promoted_to_agent_id,
  promoted_to_agent_at,
  created_at,
  updated_at,
  profile:profile_id (${profileIdentitySelect})
`;

export const agentWithProfileSelect = `
  id,
  user_id,
  customer_id,
  promoted_from_customer_id,
  promoted_from_customer_at,
  employee_id,
  status,
  created_at,
  updated_at,
  profile:profile_id (${profileIdentitySelect})
`;

export const agentSummaryWithProfileSelect = `
  id,
  user_id,
  status,
  created_at,
  updated_at,
  profile:profile_id (
    display_name,
    phone_number,
    email
  )
`;

export const nestedCustomerWithProfileSelect = `
  id,
  assigned_agent_id,
  is_reseller,
  credit_limit,
  credit_limit_exceeded,
  profile:profile_id (${profileIdentitySelect}),
  assigned_agent:assigned_agent_id (
    id,
    user_id,
    status,
    profile:profile_id (
      display_name,
      phone_number,
      email
    )
  )
`;

export const nestedAgentWithProfileSelect = `
  id,
  user_id,
  status,
  profile:profile_id (
    display_name,
    phone_number,
    email
  )
`;

type RelationValue<T> = T | T[] | null | undefined;

export function resolveRelation<T>(value: RelationValue<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function buildDisplayName(profile: ProfileIdentityRow) {
  const displayName = profile.display_name?.trim();
  if (displayName) {
    return displayName;
  }

  return `${profile.first_name} ${profile.last_name}`.trim();
}

export function mapProfileIdentity(profile: ProfileIdentityRow) {
  return {
    first_name: profile.first_name,
    last_name: profile.last_name,
    display_name: buildDisplayName(profile),
    email: profile.email,
    phone_number: profile.phone_number,
    address: profile.address ?? "",
    contact: profile.phone_number,
  };
}

export function mapCustomerWithProfile<
  T extends {
    id: string;
    assigned_agent_id: string | null;
    is_reseller: boolean;
    credit_limit?: number;
    credit_limit_exceeded?: boolean;
    promoted_to_agent_id?: string | null;
    promoted_to_agent_at?: string | null;
    created_at: string;
    updated_at: string;
    profile: RelationValue<ProfileIdentityRow>;
  },
>(row: T) {
  const profile = resolveRelation(row.profile);

  if (!profile) {
    throw new Error("Customer profile was not found.");
  }

  const identity = mapProfileIdentity(profile);

  return {
    id: row.id,
    first_name: identity.first_name,
    last_name: identity.last_name,
    phone_number: identity.phone_number,
    email: identity.email,
    address: identity.address,
    assigned_agent_id: row.assigned_agent_id,
    is_reseller: row.is_reseller,
    credit_limit: Number(row.credit_limit ?? 1000),
    credit_limit_exceeded: Boolean(row.credit_limit_exceeded),
    promoted_to_agent_id: row.promoted_to_agent_id ?? null,
    promoted_to_agent_at: row.promoted_to_agent_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapAgentWithProfile<
  T extends {
    id: string;
    user_id: string | null;
    customer_id?: string | null;
    promoted_from_customer_id?: string | null;
    promoted_from_customer_at?: string | null;
    employee_id?: string | null;
    status: "active" | "inactive" | "suspended";
    created_at: string;
    updated_at: string;
    profile: RelationValue<ProfileIdentityRow>;
  },
>(row: T, email: string | null = null) {
  const profile = resolveRelation(row.profile);

  if (!profile) {
    throw new Error("Agent profile was not found.");
  }

  const identity = mapProfileIdentity(profile);

  return {
    id: row.id,
    user_id: row.user_id,
    customer_id: row.customer_id ?? null,
    promoted_from_customer_id: row.promoted_from_customer_id ?? null,
    promoted_from_customer_at: row.promoted_from_customer_at ?? null,
    employee_id: row.employee_id ?? null,
    first_name: identity.first_name,
    last_name: identity.last_name,
    display_name: identity.display_name,
    status: row.status,
    email: email ?? identity.email,
    contact: identity.contact,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapAgentSummaryWithProfile<
  T extends {
    id: string;
    user_id?: string | null;
    profile: RelationValue<Pick<ProfileIdentityRow, "display_name" | "phone_number" | "email"> & Partial<ProfileIdentityRow>>;
  },
>(row: T, email: string | null = null) {
  const profile = resolveRelation(row.profile);

  return {
    id: row.id,
    user_id: row.user_id,
    display_name: profile ? buildDisplayName(profile as ProfileIdentityRow) : "Agent",
    email: email ?? profile?.email ?? null,
    contact: profile?.phone_number ?? null,
  };
}

export function mapNestedOrderCustomer<
  T extends {
    id: string;
    assigned_agent_id?: string | null;
    is_reseller: boolean;
    credit_limit?: number;
    credit_limit_exceeded?: boolean;
    promoted_to_agent_id?: string | null;
    promoted_to_agent_at?: string | null;
    profile: RelationValue<ProfileIdentityRow>;
    assigned_agent?: RelationValue<{
      id: string;
      user_id?: string | null;
      profile: RelationValue<Pick<ProfileIdentityRow, "display_name" | "phone_number" | "email"> & Partial<ProfileIdentityRow>>;
    }>;
  },
>(row: T) {
  const customer = mapCustomerWithProfile({
    ...row,
    assigned_agent_id: row.assigned_agent_id ?? null,
    created_at: "",
    updated_at: "",
  });

  const assignedAgent = resolveRelation(row.assigned_agent);

  return {
    ...customer,
    assigned_agent: assignedAgent
      ? mapAgentSummaryWithProfile(assignedAgent)
      : null,
  };
}

export async function findProfileIdByPhone(
  supabase: ProfileIdentitySupabaseClient,
  phoneNumber: string,
  excludeProfileId?: string,
) {
  let query = supabase.from("profile").select("id").eq("phone_number", phoneNumber);

  if (excludeProfileId) {
    query = query.neq!("id", excludeProfileId);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    throw new Error("Unable to validate existing phone number.");
  }

  return data?.id ? String(data.id) : null;
}

export async function findProfileIdByEmail(
  supabase: ProfileIdentitySupabaseClient,
  email: string,
  excludeProfileId?: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  let query = supabase.from("profile").select("id").ilike("email", normalizedEmail);

  if (excludeProfileId) {
    query = query.neq!("id", excludeProfileId);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    throw new Error("Unable to validate existing email.");
  }

  return data?.id ? String(data.id) : null;
}

export async function findCustomerIdByPhone(supabase: ProfileIdentitySupabaseClient, phoneNumber: string) {
  const profileId = await findProfileIdByPhone(supabase, phoneNumber);

  if (!profileId) {
    return null;
  }

  const { data, error } = await supabase
    .from("customer")
    .select("id")
    .eq("profile_id", profileId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to validate existing customer phone number.");
  }

  return data?.id ? String(data.id) : null;
}

export async function findCustomerIdByEmail(supabase: ProfileIdentitySupabaseClient, email: string) {
  const profileId = await findProfileIdByEmail(supabase, email);

  if (!profileId) {
    return null;
  }

  const { data, error } = await supabase
    .from("customer")
    .select("id")
    .eq("profile_id", profileId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to validate existing customer email.");
  }

  return data?.id ? String(data.id) : null;
}

export async function assertProfilePhoneIsAvailable(
  supabase: ProfileIdentitySupabaseClient,
  phoneNumber: string,
  excludeProfileId?: string,
) {
  const existingProfileId = await findProfileIdByPhone(supabase, phoneNumber, excludeProfileId);

  if (existingProfileId) {
    throw new Error("Phone number already exists for another customer.");
  }
}

export async function assertProfileEmailIsAvailable(
  supabase: ProfileIdentitySupabaseClient,
  email: string | null,
  excludeProfileId?: string,
) {
  if (!email) {
    return;
  }

  const existingProfileId = await findProfileIdByEmail(supabase, email, excludeProfileId);

  if (existingProfileId) {
    throw new Error("Email already exists for another customer.");
  }
}

export async function assertAgentPhoneIsAvailable(
  supabase: ProfileIdentitySupabaseClient,
  phoneNumber: string,
  excludeAgentId?: string,
  excludeProfileIdOverride?: string,
) {
  let excludeProfileId = excludeProfileIdOverride;

  if (!excludeProfileId && excludeAgentId) {
    const { data, error } = await supabase
      .from("agent")
      .select("profile_id")
      .eq("id", excludeAgentId)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error("Unable to validate existing agent contact number.");
    }

    excludeProfileId = data?.profile_id ? String(data.profile_id) : undefined;
  }

  const existingProfileId = await findProfileIdByPhone(supabase, phoneNumber, excludeProfileId);

  if (existingProfileId) {
    throw new Error("Contact number already exists for another agent.");
  }
}

export async function insertProfile(
  supabase: ProfileIdentitySupabaseClient,
  identity: CustomerIdentityInput | AgentIdentityInput,
  options: { user_id?: string | null; profile_id?: string } = {},
) {
  const displayName =
    "display_name" in identity
      ? identity.display_name
      : `${identity.first_name} ${identity.last_name}`.trim();

  const { data, error } = await supabase
    .from("profile")
    .insert({
      id: options.profile_id,
      user_id: options.user_id ?? null,
      first_name: identity.first_name,
      last_name: identity.last_name,
      display_name: displayName,
      email: "email" in identity ? identity.email ?? null : identity.email,
      phone_number: "contact" in identity ? identity.contact : identity.phone_number,
      address: "address" in identity ? identity.address : null,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    if (error?.code === "23505") {
      throw new Error("Phone number or email already exists for another profile.");
    }

    throw new Error("Unable to create profile.");
  }

  return String(data.id);
}

export async function updateProfileIdentity(
  supabase: ProfileIdentitySupabaseClient,
  profileId: string,
  identity: CustomerIdentityInput | AgentIdentityInput,
) {
  const displayName =
    "display_name" in identity
      ? identity.display_name
      : `${identity.first_name} ${identity.last_name}`.trim();

  const { error } = await supabase
    .from("profile")
    .update({
      first_name: identity.first_name,
      last_name: identity.last_name,
      display_name: displayName,
      email: "email" in identity ? identity.email ?? null : identity.email,
      phone_number: "contact" in identity ? identity.contact : identity.phone_number,
      address: "address" in identity ? identity.address : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (error) {
    if (error.code === "23505") {
      throw new Error("Phone number or email already exists for another profile.");
    }

    throw new Error("Unable to update profile.");
  }
}

export async function insertCustomerWithProfile(
  supabase: ProfileIdentitySupabaseClient,
  payload: CustomerIdentityInput & {
    assigned_agent_id: string | null;
    is_reseller: boolean;
    credit_limit?: number;
    created_by?: string;
    updated_at: string;
    profile_id?: string;
  },
) {
  const profileId = payload.profile_id
    ?? (await insertProfile(supabase, payload));

  const { data, error } = await supabase
    .from("customer")
    .insert({
      profile_id: profileId,
      assigned_agent_id: payload.assigned_agent_id,
      is_reseller: payload.is_reseller,
      credit_limit: payload.credit_limit,
      created_by: payload.created_by,
      updated_at: payload.updated_at,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error("Unable to create customer.");
  }

  return String(data.id);
}

export async function updateCustomerWithProfile(
  supabase: ProfileIdentitySupabaseClient,
  customerId: string,
  profileId: string,
  payload: CustomerIdentityInput & {
    assigned_agent_id: string | null;
    is_reseller: boolean;
    credit_limit: number;
    updated_at: string;
  },
) {
  await updateProfileIdentity(supabase, profileId, payload);

  const { error } = await supabase
    .from("customer")
    .update({
      assigned_agent_id: payload.assigned_agent_id,
      is_reseller: payload.is_reseller,
      credit_limit: payload.credit_limit,
      updated_at: payload.updated_at,
    })
    .eq("id", customerId);

  if (error) {
    throw new Error("Unable to update customer.");
  }
}

export async function insertAgentWithProfile(
  supabase: ProfileIdentitySupabaseClient,
  payload: AgentIdentityInput & {
    user_id: string | null;
    customer_id?: string | null;
    employee_id: string | null;
    status: "active" | "inactive" | "suspended";
    profile_id?: string;
    promoted_from_customer_id?: string | null;
    promoted_from_customer_at?: string | null;
  },
) {
  let profileId = payload.profile_id;

  if (!profileId && payload.customer_id) {
    const { data, error } = await supabase
      .from("customer")
      .select("profile_id")
      .eq("id", payload.customer_id)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error("Unable to load customer profile for agent creation.");
    }

    profileId = data?.profile_id ? String(data.profile_id) : undefined;
  }

  profileId = profileId ?? (await insertProfile(supabase, { ...payload, email: payload.email ?? null }, {
    user_id: payload.user_id,
  }));

  const { data, error } = await supabase
    .from("agent")
    .insert({
      profile_id: profileId,
      user_id: payload.user_id,
      customer_id: payload.customer_id ?? null,
      promoted_from_customer_id: payload.promoted_from_customer_id ?? null,
      promoted_from_customer_at: payload.promoted_from_customer_at ?? null,
      employee_id: payload.employee_id,
      status: payload.status,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    if (error?.code === "23505") {
      throw new Error("Contact number or employee ID already exists for another agent.");
    }

    throw new Error("Unable to create agent profile.");
  }

  return String(data.id);
}

export async function updateAgentWithProfile(
  supabase: ProfileIdentitySupabaseClient,
  agentId: string,
  profileId: string,
  payload: AgentIdentityInput & {
    employee_id: string | null;
    status: "active" | "inactive" | "suspended";
  },
) {
  await updateProfileIdentity(supabase, profileId, payload);

  const { error } = await supabase
    .from("agent")
    .update({
      employee_id: payload.employee_id,
      status: payload.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", agentId);

  if (error) {
    if (error.code === "23505") {
      throw new Error("Contact number or employee ID already exists for another agent.");
    }

    throw new Error("Unable to update agent profile.");
  }
}

export async function loadCustomerProfileId(
  supabase: ProfileIdentitySupabaseClient,
  customerId: string,
) {
  const { data, error } = await supabase
    .from("customer")
    .select("profile_id")
    .eq("id", customerId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load customer profile.");
  }

  if (!data?.profile_id) {
    throw new Error("Customer profile was not found.");
  }

  return String(data.profile_id);
}

export async function loadAgentProfileId(
  supabase: ProfileIdentitySupabaseClient,
  agentId: string,
) {
  const { data, error } = await supabase
    .from("agent")
    .select("profile_id")
    .eq("id", agentId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load agent profile.");
  }

  if (!data?.profile_id) {
    throw new Error("Agent profile was not found.");
  }

  return String(data.profile_id);
}
