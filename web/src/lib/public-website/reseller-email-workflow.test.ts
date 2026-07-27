import { describe, expect, it, vi } from "vitest";

import {
  buildPriceListHtml,
  buildPriceListText,
  checkRedisResellerApplicationRateLimit,
  formatResellerEmailDeliveryErrorMessage,
  isResellerEmailValidationError,
  releaseRedisRateLimitReservation,
  RESELLER_EMAIL_DELIVERY_ERROR_MESSAGE,
  RESELLER_EMAIL_VALIDATION_ERROR_MESSAGE,
  sendResellerPriceList,
  validateResellerApplicationInput,
  verifyTurnstileToken,
} from "../../../../supabase/functions/reseller-application/workflow";

const application = {
  id: "application-id",
  name: "Market Owner",
  email: "owner@example.com",
  address: "123 Market Road",
  plannedTransactionType: "retail_resale" as const,
  expectedQuantityPerWeek: "40 kg",
  contactNumber: "09170000000",
};

const products = [
  {
    name: "Pork Belly",
    category: "pork",
    unit_label: "kg",
    default_price: 320,
    reseller_price: 295,
  },
];

describe("reseller application edge workflow helpers", () => {
  it("validates and normalizes edge function payloads", () => {
    const result = validateResellerApplicationInput({
      ...application,
      email: " OWNER@EXAMPLE.COM ",
      turnstileToken: "token",
    });

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        email: "owner@example.com",
        turnstileToken: "token",
      }),
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

  it("sends the reseller price list through Resend with the provider mocked", async () => {
    const fetcher = vi.fn(() => Promise.resolve(Response.json({ id: "email-id" })));

    await expect(
      sendResellerPriceList(
        fetcher as typeof fetch,
        {
          apiKey: "re_test_key",
          from: "JEHMARP <sales@example.com>",
          adminEmail: "admin@example.com",
        },
        application,
        products,
      ),
    ).resolves.toEqual({ status: "sent" });

    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(String(init?.body));

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer re_test_key");
    expect(payload).toMatchObject({
      from: "JEHMARP <sales@example.com>",
      to: ["owner@example.com"],
      bcc: ["admin@example.com"],
      subject: "Your JEHMARP reseller price list",
    });
    expect(payload.html).toContain("Pork Belly");
    expect(payload.html).toContain("PHP 295.00");
    expect(payload.html).toContain("#661818");
    expect(payload.html).toContain("Application summary");
    expect(payload.html).toContain("application-id");
    expect(payload.text).toContain("Pork Belly | Pork | kg | PHP 320.00 | PHP 295.00");
  });

  it("marks delivery failed when Resend is not configured", async () => {
    const fetcher = vi.fn();

    await expect(
      sendResellerPriceList(fetcher as typeof fetch, {}, application, products),
    ).resolves.toEqual({
      status: "failed",
      error: RESELLER_EMAIL_DELIVERY_ERROR_MESSAGE,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps Resend validation failures to a user-facing email error", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            statusCode: 422,
            name: "validation_error",
            message: "Invalid `to` field",
          }),
          { status: 422 },
        ),
      ),
    );

    await expect(
      sendResellerPriceList(
        fetcher as typeof fetch,
        {
          apiKey: "re_test_key",
          from: "JEHMARP <sales@example.com>",
        },
        application,
        products,
      ),
    ).resolves.toEqual({
      status: "failed",
      error: RESELLER_EMAIL_VALIDATION_ERROR_MESSAGE,
    });
  });

  it("maps unexpected provider failures to a generic delivery error", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        new Response("Internal Server Error", { status: 500 }),
      ),
    );

    await expect(
      sendResellerPriceList(
        fetcher as typeof fetch,
        {
          apiKey: "re_test_key",
          from: "JEHMARP <sales@example.com>",
        },
        application,
        products,
      ),
    ).resolves.toEqual({
      status: "failed",
      error: RESELLER_EMAIL_DELIVERY_ERROR_MESSAGE,
    });
  });

  it("formats stored provider errors for admin display", () => {
    expect(
      formatResellerEmailDeliveryErrorMessage(
        JSON.stringify({
          statusCode: 422,
          name: "validation_error",
          message: "Invalid `to` field",
        }),
      ),
    ).toBe(RESELLER_EMAIL_VALIDATION_ERROR_MESSAGE);

    expect(
      formatResellerEmailDeliveryErrorMessage(
        "Error: Something went wrong\n    at sendEmail (file.ts:10:5)",
      ),
    ).toBe(RESELLER_EMAIL_DELIVERY_ERROR_MESSAGE);

    expect(isResellerEmailValidationError("mailbox not found for recipient")).toBe(true);
  });

  it("reserves Redis duplicate and rate-limit counters before expensive reseller work", async () => {
    const fetcher = vi.fn((url: string) => {
      if (url.includes("/set/")) return Promise.resolve(Response.json({ result: "OK" }));
      if (url.includes("/incr/")) return Promise.resolve(Response.json({ result: 1 }));

      return Promise.resolve(Response.json({ result: 1 }));
    });

    const result = await checkRedisResellerApplicationRateLimit(
      fetcher as typeof fetch,
      {
        restUrl: "https://redis.example.upstash.io",
        restToken: "redis_token",
      },
      {
        email: "owner@example.com",
        clientIp: "203.0.113.10",
      },
    );

    expect(result).toMatchObject({
      configured: true,
      allowed: true,
    });
    expect(fetcher.mock.calls[0]?.[0]).toContain("https://redis.example.upstash.io/set/");
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("/ex/86400/nx");
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/incr/"))).toHaveLength(2);
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];

    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer redis_token",
    );
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("owner%40example.com");
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("203.0.113.10");
  });

  it("blocks duplicate reseller applications when Redis reservation already exists", async () => {
    const fetcher = vi.fn(() => Promise.resolve(Response.json({ result: null })));

    await expect(
      checkRedisResellerApplicationRateLimit(
        fetcher as typeof fetch,
        {
          restUrl: "https://redis.example.upstash.io",
          restToken: "redis_token",
        },
        {
          email: "owner@example.com",
          clientIp: "203.0.113.10",
        },
      ),
    ).resolves.toEqual({
      configured: true,
      allowed: false,
      status: 409,
      error: "An application from this email was already submitted recently.",
    });
  });

  it("releases a Redis duplicate reservation when a secondary guard blocks the request", async () => {
    const fetcher = vi.fn(() => Promise.resolve(Response.json({ result: 1 })));

    await releaseRedisRateLimitReservation(
      fetcher as typeof fetch,
      {
        restUrl: "https://redis.example.upstash.io/",
        restToken: "redis_token",
      },
      "reseller-application:email-day:hash",
    );

    expect(fetcher).toHaveBeenCalledWith(
      "https://redis.example.upstash.io/del/reseller-application%3Aemail-day%3Ahash",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("escapes product and applicant values in the HTML email", () => {
    const html = buildPriceListHtml(
      {
        ...application,
        name: "<Owner>",
      },
      [
        {
          ...products[0],
          name: "<script>",
        },
      ],
    );

    expect(html).toContain("&lt;Owner&gt;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("What happens next");
    expect(buildPriceListText(application, products)).toContain("JEHMARP WHOLESALE");
  });
});
