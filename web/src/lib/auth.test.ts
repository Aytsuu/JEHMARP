import { describe, expect, it } from "vitest";

import { getDashboardHeading, getDashboardPath, getLoginErrorMessage } from "./auth";

describe("getDashboardHeading", () => {
  it("returns the admin dashboard heading for admins", () => {
    expect(getDashboardHeading("admin")).toBe("Admin Dashboard");
  });

  it("returns the agent dashboard heading for agents", () => {
    expect(getDashboardHeading("agent")).toBe("Agent Dashboard");
  });
});

describe("getDashboardPath", () => {
  it("routes admins and agents to their own dashboard surfaces", () => {
    expect(getDashboardPath("admin")).toBe("/admin");
    expect(getDashboardPath("agent")).toBe("/agent");
  });
});

describe("getLoginErrorMessage", () => {
  it("returns trimmed error text", () => {
    expect(getLoginErrorMessage(" Invalid credentials. ")).toBe("Invalid credentials.");
  });

  it("ignores empty values", () => {
    expect(getLoginErrorMessage("   ")).toBeUndefined();
    expect(getLoginErrorMessage(null)).toBeUndefined();
  });
});
