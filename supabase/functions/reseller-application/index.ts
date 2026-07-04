import "@supabase/functions-js/edge-runtime.d.ts";

import {
  type ResellerApplicationInput,
  type ResellerProduct,
  type StoredResellerApplication,
  checkRedisResellerApplicationRateLimit,
  releaseRedisRateLimitReservation,
  sendResellerPriceList,
  validateResellerApplicationInput,
  verifyTurnstileToken,
} from "./workflow.ts";

type AppConfig = {
  supabaseUrl: string;
  supabaseServiceKey: string;
  turnstileSecret?: string;
  resendApiKey?: string;
  resellerPriceListFrom?: string;
  resellerAdminEmail?: string;
  upstashRedisRestUrl?: string;
  upstashRedisRestToken?: string;
};

type ResellerApplicationRow = {
  id: string;
  name: string;
  email: string;
  address: string;
  planned_transaction_type: string;
  expected_quantity_per_week: string;
  contact_number: string;
  message: string | null;
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

  const requestMode = isRecord(payload) ? payload.mode : undefined;

  try {
    if (requestMode === "resend") {
      return await handleResendPriceList(config, payload);
    }

    return await handleCreateApplication(config, request, payload);
  } catch (error) {
    console.error(error);

    return jsonResponse({ error: "Unable to process reseller application." }, 500);
  }
});

async function handleCreateApplication(
  config: AppConfig,
  request: Request,
  payload: unknown,
): Promise<Response> {
  const validation = validateResellerApplicationInput(payload);

  if (!validation.success) {
    return jsonResponse({ error: validation.errors[0] ?? "Invalid application details." }, 400);
  }

  const clientIp = normalizeClientIp(request.headers.get("x-client-ip"));
  const userAgent = normalizeNullableString(request.headers.get("x-client-user-agent"));
  const turnstile = await verifyTurnstileToken(fetch, {
    secret: config.turnstileSecret,
    token: validation.data.turnstileToken,
    remoteIp: clientIp,
  });

  if (!turnstile.success) {
    return jsonResponse({ error: turnstile.error }, 400);
  }

  const redisRateLimit = await checkRedisRateLimits(config, validation.data.email, clientIp);

  if (redisRateLimit.configured && !redisRateLimit.allowed) {
    await releaseRedisReservation(config, redisRateLimit.reservationKey);

    return jsonResponse({ error: redisRateLimit.error }, redisRateLimit.status);
  }

  const rateLimit = await checkRateLimits(config, validation.data.email, clientIp);

  if (!rateLimit.allowed) {
    await releaseRedisReservation(
      config,
      redisRateLimit.configured && redisRateLimit.allowed ? redisRateLimit.reservationKey : undefined,
    );

    return jsonResponse({ error: rateLimit.error }, rateLimit.status);
  }

  let application: ResellerApplicationRow | undefined;

  try {
    [application] = await insertApplication(config, validation.data, clientIp, userAgent);
  } catch (error) {
    await releaseRedisReservation(
      config,
      redisRateLimit.configured && redisRateLimit.allowed ? redisRateLimit.reservationKey : undefined,
    );
    throw error;
  }

  if (!application) {
    await releaseRedisReservation(
      config,
      redisRateLimit.configured && redisRateLimit.allowed ? redisRateLimit.reservationKey : undefined,
    );
    throw new Error("Reseller application insert did not return a row.");
  }

  const products = await loadActiveProducts(config);
  const emailResult = await sendResellerPriceList(
    fetch,
    {
      apiKey: config.resendApiKey,
      from: config.resellerPriceListFrom,
      adminEmail: config.resellerAdminEmail,
    },
    toStoredApplication(application),
    products,
  );

  await updateEmailStatus(config, application.id, emailResult);

  return jsonResponse({
    id: application.id,
    emailDeliveryStatus: emailResult.status,
  }, 201);
}

async function checkRedisRateLimits(
  config: AppConfig,
  email: string,
  clientIp: string | null,
) {
  try {
    return await checkRedisResellerApplicationRateLimit(fetch, {
      restUrl: config.upstashRedisRestUrl,
      restToken: config.upstashRedisRestToken,
    }, {
      email,
      clientIp,
    });
  } catch (error) {
    console.warn("Redis reseller application rate limit failed; falling back to database checks.", {
      error: error instanceof Error ? error.message : "unknown",
    });

    return { configured: false as const, error: "Redis rate limit failed." };
  }
}

async function releaseRedisReservation(config: AppConfig, reservationKey: string | undefined) {
  try {
    await releaseRedisRateLimitReservation(fetch, {
      restUrl: config.upstashRedisRestUrl,
      restToken: config.upstashRedisRestToken,
    }, reservationKey);
  } catch (error) {
    console.warn("Redis reseller application reservation release failed.", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

async function handleResendPriceList(config: AppConfig, payload: unknown): Promise<Response> {
  if (!isRecord(payload) || typeof payload.applicationId !== "string") {
    return jsonResponse({ error: "Application id is required." }, 400);
  }

  const [application] = await getApplications(
    config,
    `id=eq.${encodeURIComponent(payload.applicationId)}&limit=1`,
  );

  if (!application) {
    return jsonResponse({ error: "Application was not found." }, 404);
  }

  const products = await loadActiveProducts(config);
  const emailResult = await sendResellerPriceList(
    fetch,
    {
      apiKey: config.resendApiKey,
      from: config.resellerPriceListFrom,
      adminEmail: config.resellerAdminEmail,
    },
    toStoredApplication(application),
    products,
  );

  await updateEmailStatus(config, application.id, emailResult);

  return jsonResponse({
    id: application.id,
    emailDeliveryStatus: emailResult.status,
  });
}

async function checkRateLimits(
  config: AppConfig,
  email: string,
  clientIp: string | null,
): Promise<
  | { allowed: true }
  | { allowed: false; status: 409 | 429; error: string }
> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const emailParam = encodeURIComponent(email);
  const duplicate = await getApplications(
    config,
    `email=eq.${emailParam}&created_at=gte.${encodeURIComponent(oneDayAgo)}&limit=1`,
  );

  if (duplicate.length > 0) {
    return {
      allowed: false,
      status: 409,
      error: "An application from this email was already submitted recently.",
    };
  }

  const emailWindow = await getApplications(
    config,
    `email=eq.${emailParam}&created_at=gte.${encodeURIComponent(oneHourAgo)}&limit=3`,
  );

  if (emailWindow.length >= 3) {
    return {
      allowed: false,
      status: 429,
      error: "Too many applications were submitted from this email. Please try again later.",
    };
  }

  if (clientIp) {
    const ipWindow = await getApplications(
      config,
      `source_ip=eq.${encodeURIComponent(clientIp)}&created_at=gte.${encodeURIComponent(oneHourAgo)}&limit=10`,
    );

    if (ipWindow.length >= 10) {
      return {
        allowed: false,
        status: 429,
        error: "Too many applications were submitted from this network. Please try again later.",
      };
    }
  }

  return { allowed: true };
}

async function insertApplication(
  config: AppConfig,
  input: ResellerApplicationInput,
  clientIp: string | null,
  userAgent: string | null,
): Promise<ResellerApplicationRow[]> {
  return restJson<ResellerApplicationRow[]>(config, "reseller_application", {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      address: input.address,
      planned_transaction_type: input.plannedTransactionType,
      expected_quantity_per_week: input.expectedQuantityPerWeek,
      contact_number: input.contactNumber,
      message: input.message ?? null,
      source_ip: clientIp,
      user_agent: userAgent,
      application_status: "submitted",
      email_delivery_status: "pending",
    }),
  });
}

async function getApplications(
  config: AppConfig,
  query: string,
): Promise<ResellerApplicationRow[]> {
  return restJson<ResellerApplicationRow[]>(
    config,
    `reseller_application?select=id,name,email,address,planned_transaction_type,expected_quantity_per_week,contact_number,message,created_at&${query}`,
  );
}

async function loadActiveProducts(config: AppConfig): Promise<ResellerProduct[]> {
  return restJson<ResellerProduct[]>(
    config,
    "product?select=name,category,unit_label,default_price,reseller_price&is_active=eq.true&order=category.asc,name.asc",
  );
}

async function updateEmailStatus(
  config: AppConfig,
  applicationId: string,
  result: { status: "sent" } | { status: "failed"; error: string },
): Promise<void> {
  const body = result.status === "sent"
    ? {
        email_delivery_status: "sent",
        price_list_sent_at: new Date().toISOString(),
        email_error: null,
      }
    : {
        email_delivery_status: "failed",
        email_error: result.error,
      };

  await restJson<unknown[]>(
    config,
    `reseller_application?id=eq.${encodeURIComponent(applicationId)}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    },
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
    turnstileSecret: Deno.env.get("TURNSTILE_SECRET_KEY") ?? undefined,
    resendApiKey: Deno.env.get("RESEND_API_KEY") ?? undefined,
    resellerPriceListFrom: Deno.env.get("RESELLER_PRICE_LIST_FROM") ?? undefined,
    resellerAdminEmail: Deno.env.get("RESELLER_ADMIN_EMAIL") ?? undefined,
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

function toStoredApplication(row: ResellerApplicationRow): StoredResellerApplication {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    address: row.address,
    plannedTransactionType: row.planned_transaction_type as StoredResellerApplication["plannedTransactionType"],
    expectedQuantityPerWeek: row.expected_quantity_per_week,
    contactNumber: row.contact_number,
    message: row.message ?? undefined,
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
