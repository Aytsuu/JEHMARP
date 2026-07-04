import { describe, expect, it, vi } from "vitest";

import {
  checkRedisContactInquiryRateLimit,
  validateContactInquiryInput,
  verifyTurnstileToken,
} from "../../../../supabase/functions/contact-inquiry/workflow";

describe("contact inquiry edge workflow helpers", () => {
  it("validates and normalizes edge function payloads", () => {
    const result = validateContactInquiryInput({
      name: " Customer Name ",
      email: " CUSTOMER@EXAMPLE.COM ",
      phoneNumber: " 09170000000 ",
      message: " Delivery question ",
      turnstileToken: "token",
    });

    expect(result).toEqual({
      success: true,
      data: {
        name: "Customer Name",
        email: "customer@example.com",
        phoneNumber: "09170000000",
        message: "Delivery question",
        turnstileToken: "token",
      },
    });
  });

  it("verifies Turnstile with the provider endpoint", async () => {
    const fetcher = vi.fn(() => Promise.resolve(Response.json({ success: true })));

    await expect(
      verifyTurnstileToken(fetcher as typeof fetch, {
        secret: "secret",
        token: "token",
        remoteIp: "203.0.113.10",
      }),
    ).resolves.toEqual({ success: true });

    expect(fetcher).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );
  });

  it("increments Redis rate-limit counters without storing raw email or IP in keys", async () => {
    const fetcher = vi.fn((url: string) => {
      if (url.includes("/incr/")) return Promise.resolve(Response.json({ result: 1 }));

      return Promise.resolve(Response.json({ result: 1 }));
    });

    const result = await checkRedisContactInquiryRateLimit(
      fetcher as typeof fetch,
      {
        restUrl: "https://redis.example.upstash.io/",
        restToken: "redis_token",
      },
      {
        email: "customer@example.com",
        clientIp: "203.0.113.10",
      },
    );

    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];

    expect(result).toEqual({
      configured: true,
      allowed: true,
    });
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/incr/"))).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/expire/"))).toHaveLength(2);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer redis_token");
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("customer%40example.com");
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("203.0.113.10");
  });

  it("blocks when the email rate-limit counter exceeds the hourly limit", async () => {
    const fetcher = vi.fn((url: string) => {
      if (url.includes("/incr/")) return Promise.resolve(Response.json({ result: 4 }));

      return Promise.resolve(Response.json({ result: 1 }));
    });

    await expect(
      checkRedisContactInquiryRateLimit(
        fetcher as typeof fetch,
        {
          restUrl: "https://redis.example.upstash.io",
          restToken: "redis_token",
        },
        {
          email: "customer@example.com",
          clientIp: "203.0.113.10",
        },
      ),
    ).resolves.toEqual({
      configured: true,
      allowed: false,
      status: 429,
      error: "Too many inquiries were submitted from this email. Please try again later.",
    });
  });
});
