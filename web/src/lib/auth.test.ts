import { describe, expect, it } from "vitest";

import { getDashboardHeading, getLoginErrorMessage } from "./auth";

describe("getDashboardHeading", () => {
  it("returns the admin dashboard heading for admins", () => {
    expect(getDashboardHeading("admin")).toBe("Admin Dashboard");
  });

  it("returns the agent dashboard heading for agents", () => {
    expect(getDashboardHeading("agent")).toBe("Agent Dashboard");
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
