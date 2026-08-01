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
    vi.stubEnv("DEV", false);
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile_secret");

    const fetcher = vi.fn((url: string) => {
      if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        return Promise.resolve(Response.json({ success: true }));
      }

      return Promise.resolve(Response.json({
        id: "reseller-application-id",
        emailDeliveryStatus: "sent",
      }, { status: 201 }));
    });

    const id = await submitResellerApplication(validPayload(), {
      fetch: fetcher as typeof fetch,
      clientIp: "203.0.113.10",
      userAgent: "vitest",
    });

    const edgeCall = fetcher.mock.calls.find(
      ([url]) => url === "https://example.supabase.co/functions/v1/reseller-application",
    ) as unknown as [string, RequestInit];
    const headers = new Headers(edgeCall?.[1]?.headers);

    expect(id).toBe("reseller-application-id");
    expect(fetcher).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );
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
    vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile_secret");

    await expect(
      submitResellerApplication(validPayload(), {
        fetch: ((url: string) => {
          if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
            return Promise.resolve(Response.json({ success: true }));
          }

          return Promise.resolve(Response.json({ error: "Too many applications." }, { status: 429 }));
        }) as typeof fetch,
      }),
    ).rejects.toThrow("Too many applications.");
  });

  it("retries reseller price list delivery from the web app when the edge function did not send email", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile_secret");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESELLER_PRICE_LIST_FROM", "JEHMARP <sales@example.com>");

    const applicationId = "b10bb955-d8b1-4a26-a6e2-928fd33949e1";
    const applicationSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({
          data: {
            id: applicationId,
            name: "Market Owner",
            email: "owner@example.com",
            address: "123 Market Road",
            planned_transaction_type: "retail_resale",
            expected_quantity_per_week: "40 kg",
            contact_number: "09170000000",
            message: null,
          },
          error: null,
        })),
      })),
    }));
    const productSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({
            data: [],
            error: null,
          })),
        })),
      })),
    }));
    const updateEq = vi.fn(() => Promise.resolve({ error: null }));
    const update = vi.fn(() => ({ eq: updateEq }));
    const from = vi.fn((table: string) => {
      if (table === "reseller_application") {
        return {
          select: applicationSelect,
          update,
        };
      }

      if (table === "product") {
        return { select: productSelect };
      }

      if (table === "platform_settings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const fetcher = vi.fn((url: string) => {
      if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        return Promise.resolve(Response.json({ success: true }));
      }

      if (url === "https://example.supabase.co/functions/v1/reseller-application") {
        return Promise.resolve(Response.json({
          id: applicationId,
          emailDeliveryStatus: "failed",
        }, { status: 201 }));
      }

      if (url === "https://api.resend.com/emails") {
        return Promise.resolve(Response.json({ id: "email-id" }));
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    await expect(
      submitResellerApplication(validPayload(), {
        fetch: fetcher as typeof fetch,
        supabase: { from } as never,
      }),
    ).resolves.toBe(applicationId);

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(update).toHaveBeenCalledWith({
      email_delivery_status: "sent",
      price_list_sent_at: expect.any(String),
      email_error: null,
    });
  });
});

describe("getResellerApplicationFeedback", () => {
  it("parses submitted and error feedback from the business page URL", () => {
    expect(
      getResellerApplicationFeedback(
        new URL("https://example.test/business?application=submitted"),
      ),
    ).toEqual({
      status: "submitted",
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
