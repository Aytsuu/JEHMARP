import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getPublicEnv,
  getRuntimeServerEnv,
  getServerEnv,
  parsePublicEnv,
  parseServerEnv,
} from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseServerEnv", () => {
  it("returns validated Supabase server env values with a secret key", () => {
    const env = parseServerEnv({
      PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      SUPABASE_SECRET_KEY: "sb_secret_test_key",
    });

    expect(env).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_test_key",
      supabaseServerKey: "sb_secret_test_key",
    });
  });

  it("accepts the legacy service role key name for server env values", () => {
    const env = parseServerEnv({
      PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      SUPABASE_SERVICE_ROLE_KEY: "service_role_test_key",
    });

    expect(env.supabaseServerKey).toBe("service_role_test_key");
  });

  it("returns configured reseller workflow env values and ignores empty optional placeholders", () => {
    const env = parseServerEnv({
      PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      SUPABASE_SECRET_KEY: "sb_secret_test_key",
      PUBLIC_TURNSTILE_SITE_KEY: "site_key",
      TURNSTILE_SECRET_KEY: "secret_key",
      RESEND_API_KEY: "",
      RESELLER_PRICE_LIST_FROM: "JEHMARP <sales@example.com>",
      RESELLER_ADMIN_EMAIL: "",
      UPSTASH_REDIS_REST_URL: "https://redis.example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "redis_token",
    });

    expect(env).toMatchObject({
      turnstileSiteKey: "site_key",
      turnstileSecretKey: "secret_key",
      resellerPriceListFrom: "JEHMARP <sales@example.com>",
      upstashRedisRestUrl: "https://redis.example.upstash.io",
      upstashRedisRestToken: "redis_token",
    });
    expect(env.resendApiKey).toBeUndefined();
    expect(env.resellerAdminEmail).toBeUndefined();
  });

  it("rejects server env values without a server-only key", () => {
    expect(() =>
      parseServerEnv({
        PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      }),
    ).toThrow("Invalid server environment configuration");
  });

  it("reads server values from import.meta.env", () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");

    expect(getServerEnv()).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_test_key",
      supabaseServerKey: "sb_secret_test_key",
    });
  });

  it("includes process env values for SSR adapter runtime secrets", () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_runtime_key");

    expect(getRuntimeServerEnv().SUPABASE_SECRET_KEY).toBe("sb_secret_runtime_key");
  });
});

describe("parsePublicEnv", () => {
  it("returns validated Supabase public env values", () => {
    const env = parsePublicEnv({
      PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
    });

    expect(env).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_test_key",
    });
  });

  it("rejects invalid public env values", () => {
    expect(() =>
      parsePublicEnv({
        PUBLIC_SUPABASE_URL: "not-a-url",
        PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toThrow("Invalid public environment configuration");
  });

  it("reads validated values from import.meta.env", () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");

    expect(getPublicEnv()).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_test_key",
    });
  });

  it("returns the Turnstile site key when configured", () => {
    const env = parsePublicEnv({
      PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      PUBLIC_TURNSTILE_SITE_KEY: "site_key",
    });

    expect(env.turnstileSiteKey).toBe("site_key");
  });
});
