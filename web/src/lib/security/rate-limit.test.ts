import { describe, expect, it, vi } from "vitest";

import { enforceFixedWindowRateLimit } from "./rate-limit";

describe("enforceFixedWindowRateLimit", () => {
  it("increments a hashed Redis key and sets expiry for a new window", async () => {
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      String(input);

      return Promise.resolve(Response.json({ result: 1 }));
    });

    await enforceFixedWindowRateLimit({
      fetch: fetcher as typeof fetch,
      redisUrl: "https://redis.example.upstash.io",
      redisToken: "redis_token",
      keyPrefix: "admin-action:user-minute",
      identifier: "11111111-1111-1111-1111-111111111111",
      limit: 60,
      windowSeconds: 60,
      exceededMessage: "Too many actions.",
      unavailableMessage: "Rate limiting is unavailable.",
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("/incr/admin-action%3Auser-minute%3A");
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("/expire/admin-action%3Auser-minute%3A");
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("11111111-1111-1111-1111-111111111111");
  });

  it("rejects requests when the window limit is exceeded", async () => {
    const fetcher = vi.fn(() => Promise.resolve(Response.json({ result: 61 })));

    await expect(
      enforceFixedWindowRateLimit({
        fetch: fetcher as typeof fetch,
        redisUrl: "https://redis.example.upstash.io",
        redisToken: "redis_token",
        keyPrefix: "admin-action:user-minute",
        identifier: "11111111-1111-1111-1111-111111111111",
        limit: 60,
        windowSeconds: 60,
        exceededMessage: "Too many actions.",
        unavailableMessage: "Rate limiting is unavailable.",
      }),
    ).rejects.toThrow("Too many actions.");
  });

  it("fails closed when Redis credentials are unavailable", async () => {
    await expect(
      enforceFixedWindowRateLimit({
        fetch: vi.fn() as typeof fetch,
        redisUrl: undefined,
        redisToken: undefined,
        keyPrefix: "admin-action:user-minute",
        identifier: "11111111-1111-1111-1111-111111111111",
        limit: 60,
        windowSeconds: 60,
        exceededMessage: "Too many actions.",
        unavailableMessage: "Rate limiting is unavailable.",
      }),
    ).rejects.toThrow("Rate limiting is unavailable.");
  });
});
