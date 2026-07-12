import { describe, expect, it, vi } from "vitest";

import { verifyTurnstileToken } from "./turnstile";

describe("verifyTurnstileToken", () => {
  it("rejects submissions when the secret key is missing", async () => {
    await expect(
      verifyTurnstileToken(undefined, "token"),
    ).rejects.toThrow("Verification is not configured.");
  });

  it("verifies tokens with Cloudflare", async () => {
    const fetcher = vi.fn(() => Promise.resolve(Response.json({ success: true })));

    await expect(
      verifyTurnstileToken("turnstile_secret", "token", {
        fetch: fetcher as typeof fetch,
        clientIp: "203.0.113.10",
      }),
    ).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );
  });
});
