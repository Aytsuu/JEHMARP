import { afterEach, describe, expect, it, vi } from "vitest";

import { getPublicEnv, parsePublicEnv } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
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
