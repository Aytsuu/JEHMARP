import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getContactInquiryFeedback,
  parseContactInquiryFormData,
  submitContactInquiry,
} from "./contact-inquiries";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseContactInquiryFormData", () => {
  it("normalizes valid contact inquiry form data", () => {
    const formData = validFormData();

    formData.set("email", " CUSTOMER@EXAMPLE.COM ");
    formData.set("message", "  Do you deliver frozen pork belly?  ");

    const result = parseContactInquiryFormData(formData);

    expect(result).toEqual({
      success: true,
      data: {
        name: "Customer Name",
        email: "customer@example.com",
        phoneNumber: "09170000000",
        message: "Do you deliver frozen pork belly?",
        turnstileToken: "turnstile-token",
      },
    });
  });

  it("accepts a phone-only contact path but still requires Turnstile", () => {
    const formData = validFormData();

    formData.set("email", "");
    formData.delete("cf-turnstile-response");

    const result = parseContactInquiryFormData(formData);

    expect(result).toMatchObject({
      success: false,
      errors: expect.arrayContaining(["Please complete the verification challenge."]),
    });
  });

  it("requires either email or phone number", () => {
    const formData = validFormData();

    formData.set("email", "");
    formData.set("phoneNumber", "");

    const result = parseContactInquiryFormData(formData);

    expect(result).toMatchObject({
      success: false,
      errors: expect.arrayContaining(["Email or phone number is required."]),
    });
  });
});

describe("submitContactInquiry", () => {
  it("invokes the protected contact inquiry function with server credentials and client metadata", async () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");

    const fetcher = vi.fn(() =>
      Promise.resolve(Response.json({ id: "contact-inquiry-id" }, { status: 201 })),
    );

    const id = await submitContactInquiry(validPayload(), {
      fetch: fetcher as typeof fetch,
      clientIp: "203.0.113.10",
      userAgent: "vitest",
    });

    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init?.headers);

    expect(id).toBe("contact-inquiry-id");
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/contact-inquiry",
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
      submitContactInquiry(validPayload(), {
        fetch: (() => Promise.resolve(Response.json({ error: "Too many inquiries." }, { status: 429 }))) as typeof fetch,
      }),
    ).rejects.toThrow("Too many inquiries.");
  });
});

describe("getContactInquiryFeedback", () => {
  it("parses submitted and error feedback from the contact page URL", () => {
    expect(
      getContactInquiryFeedback(
        new URL("https://example.test/contact?inquiry=submitted&reference=abc"),
      ),
    ).toEqual({
      status: "submitted",
      reference: "abc",
    });

    expect(
      getContactInquiryFeedback(
        new URL("https://example.test/contact?inquiry=error&message=Retry"),
      ),
    ).toEqual({
      status: "error",
      message: "Retry",
    });
  });
});

function validFormData(): FormData {
  const formData = new FormData();

  formData.set("name", "Customer Name");
  formData.set("email", "customer@example.com");
  formData.set("phoneNumber", "09170000000");
  formData.set("message", "Do you deliver frozen pork belly?");
  formData.set("cf-turnstile-response", "turnstile-token");

  return formData;
}

function validPayload() {
  return {
    name: "Customer Name",
    email: "customer@example.com",
    phoneNumber: "09170000000",
    message: "Do you deliver frozen pork belly?",
    turnstileToken: "turnstile-token",
  };
}
