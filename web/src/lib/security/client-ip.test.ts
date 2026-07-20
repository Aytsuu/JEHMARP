import { describe, expect, it } from "vitest";

import { getClientIp } from "./client-ip";

describe("getClientIp", () => {
  it("prefers the Cloudflare connecting IP header", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.4",
      "x-real-ip": "192.0.2.1",
    });

    expect(getClientIp(headers)).toBe("203.0.113.10");
  });

  it("falls back to forwarded and real IP headers", () => {
    expect(
      getClientIp(
        new Headers({
          "x-forwarded-for": "198.51.100.4, 203.0.113.10",
        }),
      ),
    ).toBe("198.51.100.4");

    expect(getClientIp(new Headers({ "x-real-ip": "192.0.2.1" }))).toBe("192.0.2.1");
    expect(getClientIp(new Headers())).toBeNull();
  });
});
