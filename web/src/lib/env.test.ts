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
});
