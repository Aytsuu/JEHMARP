import { describe, expect, it } from "vitest";

import {
  isAgentMobilePrimaryRoute,
  isAgentNavActive,
} from "@/lib/dashboard/agent-navigation";

describe("isAgentMobilePrimaryRoute", () => {
  it("matches only top-level agent mobile destinations", () => {
    expect(isAgentMobilePrimaryRoute("/agent")).toBe(true);
    expect(isAgentMobilePrimaryRoute("/agent/customers")).toBe(true);
    expect(isAgentMobilePrimaryRoute("/agent/orders")).toBe(true);
    expect(isAgentMobilePrimaryRoute("/agent/notifications")).toBe(true);
    expect(isAgentMobilePrimaryRoute("/agent/profile")).toBe(true);
  });

  it("does not match nested agent routes", () => {
    expect(isAgentMobilePrimaryRoute("/agent/customers/abc")).toBe(false);
    expect(isAgentMobilePrimaryRoute("/agent/orders/abc")).toBe(false);
    expect(isAgentMobilePrimaryRoute("/agent/orders/multi-customers/abc")).toBe(false);
    expect(isAgentMobilePrimaryRoute("/agent/earnings")).toBe(false);
    expect(isAgentMobilePrimaryRoute("/agent/activity")).toBe(false);
    expect(isAgentMobilePrimaryRoute("/agent/settings")).toBe(false);
  });
});

describe("isAgentNavActive", () => {
  it("highlights nested routes for section navigation", () => {
    expect(isAgentNavActive("/agent/orders/abc", "/agent/orders")).toBe(true);
    expect(isAgentNavActive("/agent/customers/abc", "/agent/customers")).toBe(true);
  });
});
