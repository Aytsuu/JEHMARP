import { afterEach, describe, expect, it, vi } from "vitest";

import { parseGuestOrderFormData, submitGuestOrder } from "./guest-orders";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseGuestOrderFormData", () => {
  it("returns a trusted workflow payload from valid guest order form data", () => {
    const formData = new FormData();
    formData.set("firstName", "Maria");
    formData.set("lastName", "Santos");
    formData.set("phoneNumber", "09170000000");
    formData.set("email", "maria@example.com");
    formData.set("address", "San Pedro");
    formData.set("quantity:product-1", "2");
    formData.set("details:product-1", "Cut small");
    formData.set("quantity:product-2", "0");
    formData.set("cf-turnstile-response", "turnstile-token");

    expect(parseGuestOrderFormData(formData)).toEqual({
      success: true,
      data: {
        customer: {
          firstName: "Maria",
          lastName: "Santos",
          phoneNumber: "09170000000",
          email: "maria@example.com",
          address: "San Pedro",
        },
        items: [
          {
            productId: "product-1",
            quantity: 2,
            addDetails: "Cut small",
          },
        ],
        turnstileToken: "turnstile-token",
      },
    });
  });

  it("rejects missing customer fields and empty item selections", () => {
    const formData = new FormData();
    formData.set("firstName", "");
    formData.set("lastName", "Santos");
    formData.set("phoneNumber", "");
    formData.set("address", "");

    const result = parseGuestOrderFormData(formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          "First name is required.",
          "Phone number is required.",
          "Delivery address is required.",
          "Please complete the verification challenge.",
          "Select at least one product quantity.",
        ]),
      );
    }
  });

  it("rejects invalid email and negative quantities", () => {
    const formData = new FormData();
    formData.set("firstName", "Maria");
    formData.set("lastName", "Santos");
    formData.set("phoneNumber", "09170000000");
    formData.set("email", "not-an-email");
    formData.set("address", "San Pedro");
    formData.set("quantity:product-1", "-2");
    formData.set("cf-turnstile-response", "turnstile-token");

    const result = parseGuestOrderFormData(formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          "Email must be valid when provided.",
          "Product quantity cannot be negative.",
        ]),
      );
    }
  });

  it("rejects guest orders without Turnstile verification", () => {
    const formData = validFormData();

    formData.delete("cf-turnstile-response");

    const result = parseGuestOrderFormData(formData);

    expect(result).toMatchObject({
      success: false,
      errors: expect.arrayContaining(["Please complete the verification challenge."]),
    });
  });
});

describe("submitGuestOrder", () => {
  it("verifies Turnstile, applies Redis rate limits, records a duplicate guard, then submits through the trusted RPC", async () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile_secret");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "redis_token");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESELLER_PRICE_LIST_FROM", "");

    const rpc = vi.fn(() => Promise.resolve({
      data: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      error: null,
    }));
    const maybeSingle = vi.fn(() => Promise.resolve({
      data: {
        customer: {
          tracking_number: "JHM-ABCD2345",
        },
      },
      error: null,
    }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const fetcher = vi.fn((url: string) => {
      if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        return Promise.resolve(Response.json({ success: true }));
      }

      if (url.includes("/set/")) {
        return Promise.resolve(Response.json({ result: "OK" }));
      }

      return Promise.resolve(Response.json({ result: 1 }));
    });

    await expect(
      submitGuestOrder(validPayload(), {
        fetch: fetcher as typeof fetch,
        clientIp: "203.0.113.10",
        siteOrigin: "https://jehmarp.example",
        supabase: { rpc, from } as never,
      }),
    ).resolves.toEqual({
      orderId: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      trackingNumber: "JHM-ABCD2345",
      trackingEmailStatus: "skipped",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/incr/"))).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/set/"))).toHaveLength(1);
    expect(String(fetcher.mock.calls[1]?.[0])).not.toContain("maria%40example.com");
    expect(String(fetcher.mock.calls[1]?.[0])).not.toContain("203.0.113.10");
    expect(String(fetcher.mock.calls[5]?.[0])).not.toContain("San%20Pedro");
    expect(rpc).toHaveBeenCalledWith("submit_guest_order", {
      customer_payload: validPayload().customer,
      item_payload: validPayload().items,
    });
  });

  it("blocks guest orders when Redis rate limits are exceeded", async () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile_secret");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "redis_token");

    const rpc = vi.fn();
    const fetcher = vi.fn((url: string) => {
      if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        return Promise.resolve(Response.json({ success: true }));
      }

      return Promise.resolve(Response.json({ result: 6 }));
    });

    await expect(
      submitGuestOrder(validPayload(), {
        fetch: fetcher as typeof fetch,
        clientIp: "203.0.113.10",
        supabase: { rpc } as never,
      }),
    ).rejects.toThrow("Too many guest orders were submitted from this network. Please try again later.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("blocks duplicate guest order fingerprints before writing the order", async () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile_secret");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "redis_token");

    const rpc = vi.fn();
    const fetcher = vi.fn((url: string) => {
      if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        return Promise.resolve(Response.json({ success: true }));
      }

      if (url.includes("/set/")) {
        return Promise.resolve(Response.json({ result: null }));
      }

      return Promise.resolve(Response.json({ result: 1 }));
    });

    await expect(
      submitGuestOrder(validPayload(), {
        fetch: fetcher as typeof fetch,
        clientIp: "203.0.113.10",
        supabase: { rpc } as never,
      }),
    ).rejects.toThrow("This guest order looks like a duplicate. Please wait before submitting it again.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("clears the duplicate guard when the trusted RPC fails", async () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile_secret");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "redis_token");

    const rpc = vi.fn(() => Promise.resolve({
      data: null,
      error: { message: "database unavailable" },
    }));
    const fetcher = vi.fn((url: string) => {
      if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        return Promise.resolve(Response.json({ success: true }));
      }

      if (url.includes("/set/")) {
        return Promise.resolve(Response.json({ result: "OK" }));
      }

      return Promise.resolve(Response.json({ result: 1 }));
    });

    await expect(
      submitGuestOrder(validPayload(), {
        fetch: fetcher as typeof fetch,
        clientIp: "203.0.113.10",
        supabase: { rpc } as never,
      }),
    ).rejects.toThrow("Unable to submit guest order");
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/del/"))).toHaveLength(1);
  });
});

function validFormData(): FormData {
  const formData = new FormData();

  formData.set("firstName", "Maria");
  formData.set("lastName", "Santos");
  formData.set("phoneNumber", "09170000000");
  formData.set("email", "maria@example.com");
  formData.set("address", "San Pedro");
  formData.set("quantity:product-1", "2");
  formData.set("details:product-1", "Cut small");
  formData.set("cf-turnstile-response", "turnstile-token");

  return formData;
}

function validPayload() {
  return {
    customer: {
      firstName: "Maria",
      lastName: "Santos",
      phoneNumber: "09170000000",
      email: "maria@example.com",
      address: "San Pedro",
    },
    items: [
      {
        productId: "product-1",
        quantity: 2,
        addDetails: "Cut small",
      },
    ],
    turnstileToken: "turnstile-token",
  };
}
