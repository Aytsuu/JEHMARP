import "@supabase/functions-js/edge-runtime.d.ts";

import {
  type ContactInquiryInput,
  type RedisRateLimitResult,
  checkRedisContactInquiryRateLimit,
  validateContactInquiryInput,
} from "./workflow.ts";

type AppConfig = {
  supabaseUrl: string;
  supabaseServiceKey: string;
  upstashRedisRestUrl?: string;
  upstashRedisRestToken?: string;
};

type ContactInquiryRow = {
  id: string;
  name: string;
  email: string | null;
  phone_number: string | null;
  message: string;
  created_at: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-ip, x-client-user-agent",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const config = getConfig();
  const authError = validateServiceAuthorization(request, config.supabaseServiceKey);

  if (authError) {
    return jsonResponse({ error: authError }, 401);
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  try {
    return await handleCreateInquiry(config, request, payload);
  } catch (error) {
    console.error(error);

    return jsonResponse({ error: "Unable to submit contact inquiry." }, 500);
  }
});

async function handleCreateInquiry(
  config: AppConfig,
  request: Request,
  payload: unknown,
): Promise<Response> {
  const validation = validateContactInquiryInput(payload);

  if (!validation.success) {
    return jsonResponse({ error: validation.errors[0] ?? "Invalid inquiry details." }, 400);
  }

  const clientIp = normalizeClientIp(request.headers.get("x-client-ip"));
  const userAgent = normalizeNullableString(request.headers.get("x-client-user-agent"));
  // Turnstile is verified once in the Astro API before this trusted server-to-server call.

  const redisRateLimit = await checkRedisRateLimits(config, validation.data.email, clientIp);

  if (redisRateLimit.configured && !redisRateLimit.allowed) {
    return jsonResponse({ error: redisRateLimit.error }, redisRateLimit.status);
  }

  const databaseRateLimit = await checkDatabaseRateLimits(config, validation.data.email, clientIp);

  if (!databaseRateLimit.allowed) {
    return jsonResponse({ error: databaseRateLimit.error }, databaseRateLimit.status);
  }

  const [inquiry] = await insertInquiry(config, validation.data, clientIp, userAgent);

  if (!inquiry) {
    throw new Error("Contact inquiry insert did not return a row.");
  }

  return jsonResponse({ id: inquiry.id }, 201);
}

async function checkRedisRateLimits(
  config: AppConfig,
  email: string | undefined,
  clientIp: string | null,
): Promise<RedisRateLimitResult> {
  try {
    return await checkRedisContactInquiryRateLimit(fetch, {
      restUrl: config.upstashRedisRestUrl,
      restToken: config.upstashRedisRestToken,
    }, {
      email,
      clientIp,
    });
  } catch (error) {
    console.warn("Redis contact inquiry rate limit failed; falling back to database checks.", {
      error: error instanceof Error ? error.message : "unknown",
    });

    return { configured: false, error: "Redis rate limit failed." };
  }
}

async function checkDatabaseRateLimits(
  config: AppConfig,
  email: string | undefined,
  clientIp: string | null,
): Promise<
  | { allowed: true }
  | { allowed: false; status: 429; error: string }
> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  if (email) {
    const emailWindow = await getInquiries(
      config,
      `email=eq.${encodeURIComponent(email)}&created_at=gte.${encodeURIComponent(oneHourAgo)}&limit=3`,
    );

    if (emailWindow.length >= 3) {
      return {
        allowed: false,
        status: 429,
        error: "Too many inquiries were submitted from this email. Please try again later.",
      };
    }
  }

  if (clientIp) {
    const ipWindow = await getInquiries(
      config,
      `source_ip=eq.${encodeURIComponent(clientIp)}&created_at=gte.${encodeURIComponent(oneHourAgo)}&limit=10`,
    );

    if (ipWindow.length >= 10) {
      return {
        allowed: false,
        status: 429,
        error: "Too many inquiries were submitted from this network. Please try again later.",
      };
    }
  }

  return { allowed: true };
}

async function insertInquiry(
  config: AppConfig,
  input: ContactInquiryInput,
  clientIp: string | null,
  userAgent: string | null,
): Promise<ContactInquiryRow[]> {
  return restJson<ContactInquiryRow[]>(config, "contact_inquiry", {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      name: input.name,
      email: input.email ?? null,
      phone_number: input.phoneNumber ?? null,
      message: input.message,
      source_ip: clientIp,
      user_agent: userAgent,
      inquiry_status: "new",
      internal_notes: null,
    }),
  });
}

async function getInquiries(
  config: AppConfig,
  query: string,
): Promise<ContactInquiryRow[]> {
  return restJson<ContactInquiryRow[]>(
    config,
    `contact_inquiry?select=id,name,email,phone_number,message,created_at&${query}`,
  );
}

async function restJson<T>(
  config: AppConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("apikey", config.supabaseServiceKey);
  headers.set("Authorization", `Bearer ${config.supabaseServiceKey}`);
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  if (response.status === 204) {
    return [] as T;
  }

  return await response.json() as T;
}

function getConfig(): AppConfig {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase function environment is not configured.");
  }

  return {
    supabaseUrl,
    supabaseServiceKey,
    upstashRedisRestUrl: Deno.env.get("UPSTASH_REDIS_REST_URL") ?? undefined,
    upstashRedisRestToken: Deno.env.get("UPSTASH_REDIS_REST_TOKEN") ?? undefined,
  };
}

function validateServiceAuthorization(request: Request, expectedKey: string): string | null {
  const authorization = request.headers.get("authorization");
  const apiKey = request.headers.get("apikey");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;

  if (bearer !== expectedKey && apiKey !== expectedKey) {
    return "Server authorization is required.";
  }

  return null;
}

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return Response.json(data, {
    status,
    headers: corsHeaders,
  });
}

function normalizeClientIp(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const [firstValue] = value.split(",");
  const candidate = firstValue?.trim();

  if (!candidate || candidate.length > 45) {
    return null;
  }

  return /^[0-9a-f:.]+$/i.test(candidate) ? candidate : null;
}

function normalizeNullableString(value: string | null): string | null {
  const normalized = value?.trim();

  return normalized ? normalized.slice(0, 500) : null;
}
