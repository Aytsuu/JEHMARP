import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getResellerApplicationFeedback,
  parseResellerApplicationFormData,
  submitResellerApplication,
} from "./reseller-applications";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseResellerApplicationFormData", () => {
  it("normalizes valid reseller application form data", () => {
    const formData = validFormData();

    formData.set("email", " OWNER@EXAMPLE.COM ");
    formData.set("message", "  Please send delivery terms.  ");

    const result = parseResellerApplicationFormData(formData);

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        email: "owner@example.com",
        message: "Please send delivery terms.",
        plannedTransactionType: "retail_resale",
        turnstileToken: "turnstile-token",
      }),
    });
  });

  it("returns validation errors for missing email and Turnstile token", () => {
    const formData = validFormData();

    formData.set("email", "");
    formData.delete("cf-turnstile-response");

    const result = parseResellerApplicationFormData(formData);

    expect(result).toMatchObject({
      success: false,
      errors: expect.arrayContaining([
        "A valid email address is required.",
        "Please complete the verification challenge.",
      ]),
    });
  });
});

describe("submitResellerApplication", () => {
  it("invokes the protected reseller application function with server credentials and client metadata", async () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");

    const fetcher = vi.fn(() =>
      Promise.resolve(Response.json({ id: "reseller-application-id" }, { status: 201 })),
    );

    const id = await submitResellerApplication(validPayload(), {
      fetch: fetcher as typeof fetch,
      clientIp: "203.0.113.10",
      userAgent: "vitest",
    });

    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init?.headers);

    expect(id).toBe("reseller-application-id");
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/reseller-application",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(validPayload()),
      }),
    );
    expect(headers.get("authorization")).toBe("Bearer sb_secret_test_key");
    expect(headers.get("apikey")).toBe("sb_secret_test_key");
    expect(headers.get("x-client-ip")).toBe("203.0.113.10");
    expect(headers.get("x-client-user-agent")).toBe("vitest");
  });

  it("surfaces the edge function error message", async () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");

    await expect(
      submitResellerApplication(validPayload(), {
        fetch: (() => Promise.resolve(Response.json({ error: "Too many applications." }, { status: 429 }))) as typeof fetch,
      }),
    ).rejects.toThrow("Too many applications.");
  });
});

describe("getResellerApplicationFeedback", () => {
  it("parses submitted and error feedback from the business page URL", () => {
    expect(
      getResellerApplicationFeedback(
        new URL("https://example.test/business?application=submitted&reference=abc"),
      ),
    ).toEqual({
      status: "submitted",
      reference: "abc",
    });

    expect(
      getResellerApplicationFeedback(
        new URL("https://example.test/business?application=error&message=Retry"),
      ),
    ).toEqual({
      status: "error",
      message: "Retry",
    });
  });
});

function validFormData(): FormData {
  const formData = new FormData();

  formData.set("name", "Market Owner");
  formData.set("email", "owner@example.com");
  formData.set("address", "123 Market Road");
  formData.set("plannedTransactionType", "retail_resale");
  formData.set("expectedQuantityPerWeek", "40 kg");
  formData.set("contactNumber", "09170000000");
  formData.set("message", "");
  formData.set("cf-turnstile-response", "turnstile-token");

  return formData;
}

function validPayload() {
  return {
    name: "Market Owner",
    email: "owner@example.com",
    address: "123 Market Road",
    plannedTransactionType: "retail_resale" as const,
    expectedQuantityPerWeek: "40 kg",
    contactNumber: "09170000000",
    turnstileToken: "turnstile-token",
  };
}
