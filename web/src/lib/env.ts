import { z } from "zod";

const optionalStringEnv = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalEmailEnv = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.email().optional(),
);

const publicEnvSchema = z.object({
  PUBLIC_SUPABASE_URL: z.url(),
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  PUBLIC_TURNSTILE_SITE_KEY: optionalStringEnv,
});

const serverEnvSchema = publicEnvSchema
  .extend({
    SUPABASE_SECRET_KEY: optionalStringEnv,
    SUPABASE_SERVICE_ROLE_KEY: optionalStringEnv,
    TURNSTILE_SECRET_KEY: optionalStringEnv,
    RESEND_API_KEY: optionalStringEnv,
    RESELLER_PRICE_LIST_FROM: optionalStringEnv,
    RESELLER_ADMIN_EMAIL: optionalEmailEnv,
    UPSTASH_REDIS_REST_URL: optionalStringEnv,
    UPSTASH_REDIS_REST_TOKEN: optionalStringEnv,
  })
  .refine((value) => value.SUPABASE_SECRET_KEY ?? value.SUPABASE_SERVICE_ROLE_KEY, {
    message: "A Supabase server secret key is required",
  });

export type PublicEnv = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  turnstileSiteKey?: string;
};

export type ServerEnv = PublicEnv & {
  supabaseServerKey: string;
  turnstileSecretKey?: string;
  resendApiKey?: string;
  resellerPriceListFrom?: string;
  resellerAdminEmail?: string;
  upstashRedisRestUrl?: string;
  upstashRedisRestToken?: string;
};

export function parsePublicEnv(input: Record<string, unknown>): PublicEnv {
  const result = publicEnvSchema.safeParse(input);

  if (!result.success) {
    throw new Error("Invalid public environment configuration");
  }

  return {
    supabaseUrl: result.data.PUBLIC_SUPABASE_URL,
    supabasePublishableKey: result.data.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ...(result.data.PUBLIC_TURNSTILE_SITE_KEY
      ? { turnstileSiteKey: result.data.PUBLIC_TURNSTILE_SITE_KEY }
      : {}),
  };
}

export function getPublicEnv(): PublicEnv {
  return parsePublicEnv(import.meta.env);
}

export function parseServerEnv(input: Record<string, unknown>): ServerEnv {
  const result = serverEnvSchema.safeParse(input);

  if (!result.success) {
    throw new Error("Invalid server environment configuration");
  }

  return {
    supabaseUrl: result.data.PUBLIC_SUPABASE_URL,
    supabasePublishableKey: result.data.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    supabaseServerKey:
      result.data.SUPABASE_SECRET_KEY ?? result.data.SUPABASE_SERVICE_ROLE_KEY ?? "",
    ...(result.data.PUBLIC_TURNSTILE_SITE_KEY
      ? { turnstileSiteKey: result.data.PUBLIC_TURNSTILE_SITE_KEY }
      : {}),
    ...(result.data.TURNSTILE_SECRET_KEY
      ? { turnstileSecretKey: result.data.TURNSTILE_SECRET_KEY }
      : {}),
    ...(result.data.RESEND_API_KEY ? { resendApiKey: result.data.RESEND_API_KEY } : {}),
    ...(result.data.RESELLER_PRICE_LIST_FROM
      ? { resellerPriceListFrom: result.data.RESELLER_PRICE_LIST_FROM }
      : {}),
    ...(result.data.RESELLER_ADMIN_EMAIL
      ? { resellerAdminEmail: result.data.RESELLER_ADMIN_EMAIL }
      : {}),
    ...(result.data.UPSTASH_REDIS_REST_URL
      ? { upstashRedisRestUrl: result.data.UPSTASH_REDIS_REST_URL }
      : {}),
    ...(result.data.UPSTASH_REDIS_REST_TOKEN
      ? { upstashRedisRestToken: result.data.UPSTASH_REDIS_REST_TOKEN }
      : {}),
  };
}

export function getServerEnv(): ServerEnv {
  return parseServerEnv(getRuntimeServerEnv());
}

export function getRuntimeServerEnv(): Record<string, unknown> {
  return {
    ...import.meta.env,
    ...getProcessEnv(),
  };
}

function getProcessEnv(): Record<string, unknown> {
  if (typeof process === "undefined") {
    return {};
  }

  return process.env;
}
