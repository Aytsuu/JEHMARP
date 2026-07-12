import { describe, expect, it } from "vitest";

import {
  buildSystemIssueUrl,
  getSafeReturnTo,
  getSystemIssueHomePath,
} from "./system-issue";

describe("system issue helpers", () => {
  it("builds a return path for the system issue page", () => {
    expect(buildSystemIssueUrl("/admin/orders?status=pending")).toBe(
      "/system-issue?returnTo=%2Fadmin%2Forders%3Fstatus%3Dpending",
    );
  });

  it("rejects unsafe return targets", () => {
    expect(getSafeReturnTo("//evil.example")).toBe("/");
    expect(getSafeReturnTo("https://evil.example")).toBe("/");
    expect(getSafeReturnTo("/admin/orders")).toBe("/admin/orders");
  });

  it("resolves dashboard home paths from return targets", () => {
    expect(getSystemIssueHomePath("/admin/orders")).toBe("/admin");
    expect(getSystemIssueHomePath("/agent/orders")).toBe("/agent");
    expect(getSystemIssueHomePath("/shop")).toBe("/");
  });
});
