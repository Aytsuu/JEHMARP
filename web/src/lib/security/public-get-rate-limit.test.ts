import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  enforcePublicGetRateLimit,
  getPublicGetRateLimitKeyPrefix,
  resetPublicGetRateLimitWarningsForTests,
  shouldApplyPublicGetRateLimit,
} from "./public-get-rate-limit";

const rateLimitMocks = vi.hoisted(() => ({
  enforceFixedWindowRateLimit: vi.fn(),
  getServerEnv: vi.fn(),
  getClientIp: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  enforceFixedWindowRateLimit: rateLimitMocks.enforceFixedWindowRateLimit,
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: rateLimitMocks.getServerEnv,
}));

vi.mock("@/lib/security/client-ip", () => ({
  getClientIp: rateLimitMocks.getClientIp,
}));

describe("public-get-rate-limit", () => {
  beforeEach(() => {
    rateLimitMocks.enforceFixedWindowRateLimit.mockReset();
    rateLimitMocks.getServerEnv.mockReset();
    rateLimitMocks.getClientIp.mockReset();
    resetPublicGetRateLimitWarningsForTests();
  });

  it("only applies to public home and shop GET requests", () => {
    expect(shouldApplyPublicGetRateLimit("GET", "/")).toBe(true);
    expect(shouldApplyPublicGetRateLimit("GET", "/shop")).toBe(true);
    expect(shouldApplyPublicGetRateLimit("GET", "/admin/content/shop")).toBe(false);
    expect(shouldApplyPublicGetRateLimit("POST", "/shop")).toBe(false);
    expect(getPublicGetRateLimitKeyPrefix("/")).toBe("public-get:home");
    expect(getPublicGetRateLimitKeyPrefix("/shop")).toBe("public-get:shop");
  });

  it("allows requests when Redis is not configured", async () => {
    rateLimitMocks.getServerEnv.mockReturnValue({});

    await expect(
      enforcePublicGetRateLimit({
        headers: new Headers(),
        pathname: "/",
      }),
    ).resolves.toBeNull();
    expect(rateLimitMocks.enforceFixedWindowRateLimit).not.toHaveBeenCalled();
  });

  it("allows requests when Redis enforcement succeeds", async () => {
    rateLimitMocks.getServerEnv.mockReturnValue({
      upstashRedisRestUrl: "https://redis.example.upstash.io",
      upstashRedisRestToken: "redis_token",
    });
    rateLimitMocks.getClientIp.mockReturnValue("203.0.113.10");
    rateLimitMocks.enforceFixedWindowRateLimit.mockResolvedValue(undefined);

    await expect(
      enforcePublicGetRateLimit({
        headers: new Headers(),
        pathname: "/shop",
      }),
    ).resolves.toBeNull();
    expect(rateLimitMocks.enforceFixedWindowRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        keyPrefix: "public-get:shop",
        identifier: "203.0.113.10",
        limit: 120,
        windowSeconds: 60,
      }),
    );
  });

  it("returns 429 when the limit is exceeded", async () => {
    rateLimitMocks.getServerEnv.mockReturnValue({
      upstashRedisRestUrl: "https://redis.example.upstash.io",
      upstashRedisRestToken: "redis_token",
    });
    rateLimitMocks.getClientIp.mockReturnValue("203.0.113.10");
    rateLimitMocks.enforceFixedWindowRateLimit.mockRejectedValue(
      new Error("Too many requests. Please try again later."),
    );

    const response = await enforcePublicGetRateLimit({
      headers: new Headers(),
      pathname: "/",
    });

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("60");
  });

  it("fails open when Redis is configured but unavailable", async () => {
    rateLimitMocks.getServerEnv.mockReturnValue({
      upstashRedisRestUrl: "https://redis.example.upstash.io",
      upstashRedisRestToken: "redis_token",
    });
    rateLimitMocks.getClientIp.mockReturnValue("203.0.113.10");
    rateLimitMocks.enforceFixedWindowRateLimit.mockRejectedValue(
      new Error("Public GET rate limiting is unavailable."),
    );

    await expect(
      enforcePublicGetRateLimit({
        headers: new Headers(),
        pathname: "/",
      }),
    ).resolves.toBeNull();
  });
});
