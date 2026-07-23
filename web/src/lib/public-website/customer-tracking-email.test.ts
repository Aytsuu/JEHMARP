import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

import {
  sendCustomerTrackingNumberEmail,
  type CustomerTrackingEmailContext,
} from "./customer-tracking-email";

const context: CustomerTrackingEmailContext = {
  recipientName: "Maria Santos",
  trackingNumber: "JHM-ABCD2345",
  trackPageUrl: "https://jehmarp.example/track",
  includeOrderSubmittedNote: true,
};

describe("sendCustomerTrackingNumberEmail", () => {
  it("skips delivery when Resend is not configured", async () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESELLER_PRICE_LIST_FROM", "");

    await expect(
      sendCustomerTrackingNumberEmail("maria@example.com", context),
    ).resolves.toEqual({ status: "skipped" });
  });

  it("sends the tracking number email when Resend is configured", async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));

    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");
    vi.stubEnv("RESEND_API_KEY", "resend_test_key");
    vi.stubEnv("RESELLER_PRICE_LIST_FROM", "JEHMARP <orders@jehmarp.example>");

    await expect(
      sendCustomerTrackingNumberEmail("maria@example.com", context, { fetch: fetcher as typeof fetch }),
    ).resolves.toEqual({ status: "sent" });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer resend_test_key",
        }),
        body: expect.stringContaining("JHM-ABCD2345"),
      }),
    );
  });
});
