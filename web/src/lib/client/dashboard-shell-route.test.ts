import { describe, expect, it } from "vitest";
import {
  isDashboardShellRoute,
  isSameDashboardLocation,
} from "@/lib/client/dashboard-shell-route";

describe("dashboard shell route helpers", () => {
  it("detects admin and agent dashboard routes", () => {
    expect(isDashboardShellRoute("/admin")).toBe(true);
    expect(isDashboardShellRoute("/admin/orders")).toBe(true);
    expect(isDashboardShellRoute("/agent")).toBe(true);
    expect(isDashboardShellRoute("/agent/orders")).toBe(true);
    expect(isDashboardShellRoute("/admin/login")).toBe(false);
    expect(isDashboardShellRoute("/shop")).toBe(false);
  });

  it("detects unchanged dashboard locations", () => {
    const current = new URL("https://example.com/admin/orders?page=2");
    const same = new URL("https://example.com/admin/orders?page=2");
    const different = new URL("https://example.com/admin/orders?page=3");

    expect(isSameDashboardLocation(current, same)).toBe(true);
    expect(isSameDashboardLocation(current, different)).toBe(false);
  });
});
