import { describe, expect, it } from "vitest";

import { isTrustedFormOrigin } from "./form-origin";

describe("isTrustedFormOrigin", () => {
  const url = new URL("https://jehmarp.example/admin/orders");

  it("accepts same-origin form submissions", () => {
    const headers = new Headers({
      origin: "https://jehmarp.example",
    });

    expect(isTrustedFormOrigin(headers, url)).toBe(true);
  });

  it("falls back to a same-origin referer when Origin is unavailable", () => {
    const headers = new Headers({
      referer: "https://jehmarp.example/admin/orders?status=saved",
    });

    expect(isTrustedFormOrigin(headers, url)).toBe(true);
  });

  it("rejects cross-origin form submissions", () => {
    const headers = new Headers({
      origin: "https://attacker.example",
      referer: "https://jehmarp.example/admin/orders",
    });

    expect(isTrustedFormOrigin(headers, url)).toBe(false);
  });

  it("rejects form submissions without browser origin context", () => {
    expect(isTrustedFormOrigin(new Headers(), url)).toBe(false);
  });
});
